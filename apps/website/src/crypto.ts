import {
  buildPresentation,
  parseZipLazyMedia,
  RECOMMENDED_ZIP_LIMITS,
  type PresentationData,
} from "@aiden0z/pptx-renderer";
import { MAX_FILE_BYTES, type RoomLink } from "./protocol";

export interface PreparedDeck {
  presentation: PresentationData;
  encrypted: ArrayBuffer;
  secret: string;
  name: string;
}

async function parseDeck(buffer: ArrayBuffer): Promise<PresentationData> {
  const files = await parseZipLazyMedia(buffer, RECOMMENDED_ZIP_LIMITS);
  return buildPresentation(files, { lazySlides: true });
}

export async function prepareDeck(file: File): Promise<PreparedDeck> {
  if (!file.name.toLowerCase().endsWith(".pptx"))
    throw new Error("Choose a PowerPoint .pptx file.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Presentations must be 50 MB or smaller.");
  const presentation = await parseDeck(await file.arrayBuffer());
  if (!presentation.slides.length) throw new Error("This presentation has no slides.");
  if (presentation.slides.length > 10_000)
    throw new Error("Presentations may contain at most 10,000 slides.");
  const compressed = await new Response(
    file.stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  // A fresh AES-128 key per deck: 16 random bytes become 22 unpadded Base64URL characters.
  const rawKey = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, compressed);
  // Version + random nonce + authenticated ciphertext. Neither key nor plaintext leaves this browser.
  const envelope = new Uint8Array(13 + ciphertext.byteLength);
  envelope[0] = 1;
  envelope.set(iv, 1);
  envelope.set(new Uint8Array(ciphertext), 13);
  if (envelope.byteLength > MAX_FILE_BYTES + 65_536)
    throw new Error("The encrypted presentation exceeds the upload limit.");
  const secret = btoa(String.fromCharCode(...rawKey))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return {
    presentation,
    encrypted: envelope.buffer,
    secret,
    name: Array.from(file.name).slice(0, 180).join(""),
  };
}

export async function shareDeck(deck: PreparedDeck): Promise<RoomLink> {
  const response = await fetch("/api/rooms", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent(deck.name),
      "X-Slide-Count": String(deck.presentation.slides.length),
    },
    body: deck.encrypted,
  });
  if (!response.ok) {
    const body = (await response.json()) as { error?: string };
    throw new Error(body.error || "Could not share this presentation. Please try again.");
  }
  const room = (await response.json()) as { roomId: string; hostKey: string };
  return { ...room, secret: deck.secret };
}

export async function loadDeck(link: RoomLink, signal?: AbortSignal): Promise<PresentationData> {
  if (!/^[A-Za-z0-9_-]{22}$/.test(link.secret)) {
    throw new Error(
      "This link is missing its encryption key. Ask for the complete link, including the # part.",
    );
  }
  const rawKey = Uint8Array.from(
    atob(link.secret.replaceAll("-", "+").replaceAll("_", "/") + "=="),
    (char) => char.charCodeAt(0),
  );
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
  const response = await fetch(`/api/rooms/${link.roomId}/file`, { signal });
  if (!response.ok)
    throw new Error(
      response.status === 404
        ? "This presentation could not be found."
        : "Could not download this presentation.",
    );
  const envelope = new Uint8Array(await response.arrayBuffer());
  if (envelope.length < 29 || envelope[0] !== 1)
    throw new Error("This presentation has an unsupported file format.");
  let compressed: ArrayBuffer;
  try {
    compressed = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: envelope.subarray(1, 13) },
      key,
      envelope.subarray(13),
    );
  } catch {
    throw new Error(
      "Could not decrypt this presentation. Ask for the original, complete sharing link.",
    );
  }
  const reader = new Blob([compressed])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"))
    .getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FILE_BYTES) throw new Error("The decompressed presentation exceeds 50 MB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  signal?.throwIfAborted();
  return parseDeck(await new Blob(chunks).arrayBuffer());
}
