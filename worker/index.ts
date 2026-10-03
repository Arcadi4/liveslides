/**
 * LiveSlides room worker.
 *
 * One Durable Object per room. The object owns the room's immutable metadata, its
 * position in the deck, and the participant set; each room exclusively owns an
 * encrypted deck in R2, so nothing in this file ever sees the deck key or plaintext.
 *
 * Public room IDs encode 64 random bits as 11 Base64URL characters and name their
 * Durable Objects directly. Creation uploads ciphertext once, then tries at most
 * five IDs; atomic initialization rejects collisions without overwriting a room.
 *
 * Uploads choose a fixed TTL of at most 30 days. The server-generated deadline
 * gates every room operation; an alarm deletes ciphertext before room storage,
 * retaining the object key and rescheduling on failure. Physical deletion can
 * lag access expiry, and previously downloaded copies cannot be revoked.
 */
import { DurableObject } from "cloudflare:workers";
import type { ClientEvent, Participant, RoomMetadata, ServerEvent } from "../src/protocol.ts";
import { MAX_FILE_BYTES, MAX_TTL_SECONDS, ROOM_EXPIRED_CLOSE_CODE } from "../src/protocol.ts";

export interface Env {
  ROOMS: DurableObjectNamespace<SlideRoom>;
  SLIDES: R2Bucket;
  ASSETS: Fetcher;
}

/** The 29 byte AES-GCM envelope plus the headroom the client keeps for gzip expansion. */
const ENVELOPE_OVERHEAD_BYTES = 64 * 1024;
const MAX_UPLOAD_BYTES = MAX_FILE_BYTES + ENVELOPE_OVERHEAD_BYTES;
const MAX_SLIDES = 10_000;
const MAX_ROOM_NAME_CHARS = 180;
/** Room names are capped at 180 characters, which is at most ~3.2KB percent-encoded. */
const MAX_ROOM_NAME_HEADER = 4_096;
const MAX_PARTICIPANT_NAME_CHARS = 64;
const MAX_PARTICIPANT_NAME_INPUT = 256;
const MAX_PARTICIPANTS = 200;
const MAX_MESSAGE_BYTES = 4_096;
/** Keeps cursors near 30Hz while staying below a 34ms client interval. */
const CURSOR_MIN_INTERVAL_MS = 30;
const ROOM_ID_BYTES = 8;
const MAX_ROOM_CANDIDATES = 5;
const HOST_TOKEN_BYTES = 16;
const PARTICIPANT_ID_BYTES = 12;
const ROOM_STATE_KEY = "room";
const DECK_PREFIX = "decks/";
const CLEANUP_RETRY_MS = 5 * 60 * 1000;
const ROOMS_PATH = "/api/rooms";
/** Reachable only through the object stub, never through the public router. */
const INIT_PATH = "/internal/rooms/init";
const ROOM_ROUTE = /^\/api\/rooms\/([A-Za-z0-9_-]{11})\/(meta|file|ws)$/;

const SECURITY_HEADERS = {
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
} as const;

const PALETTE = [
  "#f43f5e",
  "#f97316",
  "#facc15",
  "#4ade80",
  "#22d3ee",
  "#38bdf8",
  "#818cf8",
  "#c084fc",
  "#f472b6",
  "#a3e635",
  "#2dd4bf",
  "#fb7185",
];

/** Everything the room owns. Immutable once written, except `slide`. */
interface RoomState {
  meta: RoomMetadata;
  hostKey: string;
  blobKey: string;
  slide: number;
}

/** Serialized with the socket, so it survives hibernation intact. */
interface Attachment {
  id: string;
  name: string;
  color: string;
  role: "host" | "audience";
  detached: boolean;
  slide: number;
  lastCursorAt: number;
  joinedAt: number;
}

export class SlideRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Answered by the runtime, which keeps pings flowing while the object sleeps
    // and costs no event handler.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    const route = ROOM_ROUTE.exec(url.pathname);
    if (route !== null) {
      if (route[2] === "meta") return this.#meta();
      if (route[2] === "file") return this.#file();
      if (route[2] === "ws") return this.#socket(request, url);
    }

    if (url.pathname === INIT_PATH && request.method === "POST") return this.#initialize(request);

    return json({ error: "not found" }, 404);
  }

  /** Atomically claims a room name; upload I/O happens before this private call. */
  async #initialize(request: Request): Promise<Response> {
    const { meta, blobKey } = (await request.json()) as {
      meta: RoomMetadata;
      blobKey: string;
    };
    const hostKey = randomToken(HOST_TOKEN_BYTES);
    const claimed = await this.ctx.storage.transaction(async (txn) => {
      if ((await txn.get<RoomState>(ROOM_STATE_KEY)) !== undefined) return false;
      await txn.put<RoomState>(ROOM_STATE_KEY, { meta, hostKey, blobKey, slide: 0 });
      await this.ctx.storage.setAlarm(meta.expiresAt);
      return true;
    });
    return claimed ? json({ hostKey }, 201) : json({ error: "room already initialized" }, 409);
  }

  async #activeState(): Promise<RoomState | undefined> {
    const state = await this.ctx.storage.get<RoomState>(ROOM_STATE_KEY);
    if (state === undefined || Date.now() >= state.meta.expiresAt) {
      this.#closeExpiredSockets();
      return undefined;
    }
    return state;
  }

  #closeExpiredSockets(): void {
    for (const socket of this.ctx.getWebSockets()) {
      if (isLive(socket)) socket.close(ROOM_EXPIRED_CLOSE_CODE, "room expired");
    }
  }

  async alarm(): Promise<void> {
    try {
      const state = await this.ctx.storage.get<RoomState>(ROOM_STATE_KEY);
      if (state === undefined) return;
      if (Date.now() < state.meta.expiresAt) {
        await this.ctx.storage.setAlarm(state.meta.expiresAt);
        return;
      }
      this.#closeExpiredSockets();
      // Retain the object key until R2 deletion succeeds, so failures are retryable.
      await this.env.SLIDES.delete(state.blobKey);
      await this.ctx.storage.deleteAll();
    } catch (error) {
      console.error("Room cleanup failed; scheduling another attempt", error);
      await this.ctx.storage.setAlarm(Date.now() + CLEANUP_RETRY_MS);
    }
  }

  async #meta(): Promise<Response> {
    const state = await this.#activeState();
    return state === undefined
      ? json({ error: "room expired or not found" }, 404)
      : json(state.meta);
  }

  async #file(): Promise<Response> {
    const state = await this.#activeState();
    if (state === undefined) return json({ error: "room expired or not found" }, 404);

    const object = await this.env.SLIDES.get(state.blobKey);
    // R2 I/O can straddle the deadline; never admit a download afterward.
    if (Date.now() >= state.meta.expiresAt) {
      await object?.body.cancel();
      this.#closeExpiredSockets();
      return json({ error: "room expired or not found" }, 404);
    }
    if (object === null) return json({ error: "deck not found" }, 404);

    return new Response(object.body, {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(object.size),
        "x-content-type-options": "nosniff",
        ...SECURITY_HEADERS,
      },
    });
  }

  async #socket(request: Request, url: URL): Promise<Response> {
    if ((request.headers.get("upgrade") ?? "").toLowerCase() !== "websocket") {
      return json({ error: "expected a websocket upgrade" }, 426);
    }
    // A missing Origin means a non-browser client; a present one must match.
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== url.origin)
      return json({ error: "cross-origin socket rejected" }, 403);

    const state = await this.#activeState();
    if (state === undefined) return json({ error: "room expired or not found" }, 404);

    const params = url.searchParams;
    let role: Attachment["role"] = "audience";
    if (params.has("host")) {
      // A presented host token is either right or wrong; it is never downgraded.
      if (!sameSecret(params.get("host") ?? "", state.hostKey)) {
        return json({ error: "invalid host key" }, 403);
      }
      role = "host";
    }

    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PARTICIPANTS) return json({ error: "room is full" }, 503);

    const pair = new WebSocketPair();
    const attachment: Attachment = {
      id: randomToken(PARTICIPANT_ID_BYTES),
      name: participantName(params.get("name")),
      color: pickColor(sockets),
      role,
      detached: false,
      slide: state.slide,
      lastCursorAt: 0,
      joinedAt: Date.now(),
    };

    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment(attachment);

    const participants = this.#participants();
    this.#send(pair[1], {
      type: "state",
      selfId: attachment.id,
      slide: state.slide,
      participants,
      room: state.meta,
    });
    this.#broadcast({ type: "presence", participants });

    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const state = await this.#activeState();
    if (state === undefined) return;
    const attachment = ws.deserializeAttachment() as Attachment | null;
    if (attachment === null) {
      ws.close(1008, "unregistered socket");
      return;
    }

    const size = typeof message === "string" ? message.length : message.byteLength;
    if (size > MAX_MESSAGE_BYTES) {
      ws.close(1009, "message too large");
      return;
    }

    const text = typeof message === "string" ? message : new TextDecoder().decode(message);
    let event: ClientEvent | null = null;
    try {
      event = parseClientEvent(JSON.parse(text));
    } catch {
      // Not JSON; reported below like any other malformed event.
    }
    if (event === null) {
      this.#send(ws, { type: "error", message: "invalid message" });
      return;
    }

    switch (event.type) {
      case "navigate": {
        const slide = Math.min(event.slide, state.meta.slideCount - 1);
        // Moving is local unless an attached host drives the room, and an audience
        // member that leaves the global slide is detached by definition.
        const detached = attachment.role === "audience" || attachment.detached;
        ws.serializeAttachment({ ...attachment, slide, detached });
        if (attachment.role === "host" && !attachment.detached) {
          await this.ctx.storage.put<RoomState>(ROOM_STATE_KEY, { ...state, slide });
          for (const peer of this.ctx.getWebSockets()) {
            if (!isLive(peer)) continue;
            const participant = peer.deserializeAttachment() as Attachment | null;
            if (participant && !participant.detached) {
              peer.serializeAttachment({ ...participant, slide });
            }
          }
          this.#broadcast({ type: "slide", slide, by: attachment.id });
        }
        this.#broadcastPresence();
        return;
      }
      case "detach": {
        ws.serializeAttachment({ ...attachment, detached: true });
        this.#broadcastPresence();
        return;
      }
      case "follow": {
        ws.serializeAttachment({ ...attachment, detached: false, slide: state.slide });
        this.#send(ws, {
          type: "state",
          selfId: attachment.id,
          slide: state.slide,
          participants: this.#participants(),
          room: state.meta,
        });
        this.#broadcastPresence();
        return;
      }
      case "cursor": {
        const now = Date.now();
        // A null coordinate hides the cursor, so it is never throttled away.
        if (event.x !== null && now - attachment.lastCursorAt < CURSOR_MIN_INTERVAL_MS) return;
        ws.serializeAttachment({ ...attachment, lastCursorAt: now });
        this.#broadcast(
          { type: "cursor", id: attachment.id, x: event.x, y: event.y, slide: event.slide },
          ws,
        );
        return;
      }
    }
  }

  async webSocketClose(): Promise<void> {
    if ((await this.#activeState()) !== undefined) this.#broadcastPresence();
  }

  async webSocketError(): Promise<void> {
    if ((await this.#activeState()) !== undefined) this.#broadcastPresence();
  }

  #participants(sockets = this.ctx.getWebSockets()): Participant[] {
    const attachments: Attachment[] = [];
    for (const socket of sockets) {
      if (!isLive(socket)) continue;
      const attachment = socket.deserializeAttachment() as Attachment | null;
      if (attachment !== null) attachments.push(attachment);
    }
    attachments.sort((a, b) => a.joinedAt - b.joinedAt);
    return attachments.map(({ id, name, color, role, detached, slide }) => ({
      id,
      name,
      color,
      role,
      detached,
      slide,
    }));
  }

  #broadcastPresence(): void {
    this.#broadcast({ type: "presence", participants: this.#participants() });
  }

  #broadcast(event: ServerEvent, except?: WebSocket): void {
    const payload = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      if (socket === except || !isLive(socket)) continue;
      try {
        socket.send(payload);
      } catch {
        // The socket died mid-broadcast; the close event drops it from presence.
      }
    }
  }

  #send(ws: WebSocket, event: ServerEvent): void {
    if (!isLive(ws)) return;
    try {
      ws.send(JSON.stringify(event));
    } catch {
      // Same as above: a failed send is indistinguishable from a disconnect.
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === ROOMS_PATH) return createRoom(request, url, env);

    const route = ROOM_ROUTE.exec(url.pathname);
    if (route !== null) {
      const stub = env.ROOMS.getByName(route[1]!);
      try {
        // Returned untouched: rebuilding it would drop the upgrade's WebSocket.
        return await stub.fetch(request);
      } catch {
        return json({ error: "room is unavailable" }, 502);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "not found" }, 404);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

/** Stores the upload once, then claims a random room name without overwriting another room. */
async function createRoom(request: Request, url: URL, env: Env): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "method not allowed" }, 405, { allow: "POST" });
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== url.origin)
    return json({ error: "cross-origin upload rejected" }, 403);

  const mediaType = (request.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (mediaType !== "application/octet-stream") {
    return json({ error: "expected application/octet-stream" }, 415);
  }
  const declared = declaredLength(request.headers.get("content-length"));
  if (declared > MAX_UPLOAD_BYTES) return json({ error: "deck is too large" }, 413);
  const name = roomName(request.headers.get("x-file-name"));
  if (name === null) return json({ error: "invalid file name" }, 400);
  const slideCount = slideCountOf(request.headers.get("x-slide-count"));
  if (slideCount === null) return json({ error: "invalid slide count" }, 400);
  const ttlHeader = request.headers.get("x-ttl-seconds");
  const ttlSeconds = ttlHeader !== null && /^[1-9]\d{0,6}$/.test(ttlHeader) ? Number(ttlHeader) : 0;
  if (ttlSeconds < 1 || ttlSeconds > MAX_TTL_SECONDS) {
    return json({ error: "TTL must be an integer between 1 second and 30 days" }, 400);
  }
  if (request.body === null) return json({ error: "missing deck" }, 400);

  try {
    const envelope = await readBounded(request.body, MAX_UPLOAD_BYTES, declared);
    if (envelope === null) return json({ error: "deck is too large" }, 413);
    if (envelope.byteLength === 0) return json({ error: "missing deck" }, 400);

    const expiresAt = Date.now() + ttlSeconds * 1000;
    const blobKey = DECK_PREFIX + crypto.randomUUID();
    const stored = await env.SLIDES.put(blobKey, envelope, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType: "application/octet-stream" },
    });
    if (stored === null) return json({ error: "could not store the slide; please try again" }, 503);
    const body = JSON.stringify({ meta: { name, slideCount, expiresAt }, blobKey });
    for (let attempt = 0; attempt < MAX_ROOM_CANDIDATES; attempt += 1) {
      const roomId = randomToken(ROOM_ID_BYTES);
      const response = await env.ROOMS.getByName(roomId).fetch(
        new Request(new URL(INIT_PATH, url), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        }),
      );
      if (response.status === 409) continue;
      if (response.status !== 201) return response;
      const { hostKey } = (await response.json()) as { hostKey: string };
      return json({ roomId, hostKey, expiresAt }, 201);
    }
    // All candidates rejected initialization, so no room can own this upload.
    await env.SLIDES.delete(blobKey);
    return json({ error: "could not allocate a room; please try again" }, 503);
  } catch {
    return json({ error: "room is unavailable" }, 502);
  }
}

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

const EMPTY = new Uint8Array(0);

/**
 * Buffers the request body under a hard ceiling. A declared content-length sizes
 * a single buffer; otherwise chunks are joined once the total is known. Returns
 * null when the ceiling is passed.
 */
async function readBounded(
  body: ReadableStream<Uint8Array>,
  limit: number,
  declared: number,
): Promise<Uint8Array | null> {
  const reader = body.getReader();

  if (declared > 0 && declared <= limit) {
    const buffer = new Uint8Array(declared);
    let filled = 0;
    while (filled < declared) {
      const { done, value } = await reader.read();
      if (done) return buffer.subarray(0, filled);
      if (filled + value.length > declared) {
        await reader.cancel();
        return null;
      }
      buffer.set(value, filled);
      filled += value.length;
    }
    await reader.cancel();
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i]!;
    joined.set(chunk, offset);
    offset += chunk.length;
    // Released as it is copied so the peak stays near the payload size.
    chunks[i] = EMPTY;
  }
  return joined;
}

/**
 * A socket stays in the room until it tears down. An accepted socket may still be
 * finishing its handshake, so only the closing states count as gone.
 */
function isLive(socket: WebSocket): boolean {
  return socket.readyState !== WebSocket.CLOSED && socket.readyState !== WebSocket.CLOSING;
}

function randomToken(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pickColor(sockets: WebSocket[]): string {
  const taken = new Set<string>();
  for (const socket of sockets) {
    if (!isLive(socket)) continue;
    const attachment = socket.deserializeAttachment() as Attachment | null;
    if (attachment !== null) taken.add(attachment.color);
  }
  for (const color of PALETTE) if (!taken.has(color)) return color;
  // The room cap is below the hue space; choose the first unused hue, never a duplicate.
  for (let hue = 0; hue < 360; hue += 1) {
    const color = `hsl(${(hue * 137) % 360} 75% 45%)`;
    if (!taken.has(color)) return color;
  }
  throw new Error("No participant colors available");
}

const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/gu;

/** Drops control and bidi-masking characters, then caps the length in code points. */
function clean(value: string, maxChars: number): string {
  const stripped = value.replace(CONTROL_CHARACTERS, "").trim();
  const points = Array.from(stripped);
  return points.length <= maxChars ? stripped : points.slice(0, maxChars).join("");
}

function roomName(header: string | null): string | null {
  if (header === null) return "Presentation";
  if (header.length > MAX_ROOM_NAME_HEADER) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(header);
  } catch {
    return null;
  }
  return clean(decoded, MAX_ROOM_NAME_CHARS) || "Presentation";
}

function participantName(raw: string | null): string {
  if (raw === null) return "Guest";
  return clean(raw.slice(0, MAX_PARTICIPANT_NAME_INPUT), MAX_PARTICIPANT_NAME_CHARS) || "Guest";
}

function slideCountOf(header: string | null): number | null {
  if (header === null || !/^\d{1,5}$/.test(header)) return null;
  const count = Number(header);
  return count >= 1 && count <= MAX_SLIDES ? count : null;
}

/** Declared upload size, or 0 when the client streamed without one. */
function declaredLength(header: string | null): number {
  if (header === null || !/^\d{1,12}$/.test(header)) return 0;
  return Number(header);
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function isSlideIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_SLIDES;
}

function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function parseClientEvent(value: unknown): ClientEvent | null {
  if (typeof value !== "object" || value === null) return null;
  const event = value as Record<string, unknown>;

  switch (event.type) {
    case "navigate":
      return isSlideIndex(event.slide) ? { type: "navigate", slide: event.slide } : null;
    case "detach":
      return { type: "detach" };
    case "follow":
      return { type: "follow" };
    case "cursor": {
      if (!isSlideIndex(event.slide)) return null;
      if (event.x === null && event.y === null)
        return { type: "cursor", x: null, y: null, slide: event.slide };
      return isCoordinate(event.x) && isCoordinate(event.y)
        ? { type: "cursor", x: event.x, y: event.y, slide: event.slide }
        : null;
    }
    default:
      return null;
  }
}
