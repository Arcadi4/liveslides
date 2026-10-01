import { useCallback, useEffect, useRef, useState } from "react";
import { fetchRoomMetadata } from "@/crypto";
import {
  ROOM_EXPIRED_CLOSE_CODE,
  type ClientEvent,
  type Participant,
  type RoomLink,
  type ServerEvent,
} from "./protocol";

/** The largest delay a browser timeout accepts; a 30-day deadline needs several of them. */
const MAX_TIMEOUT_MS = 2_147_483_647;

interface RoomOptions {
  /** Deadline the server already issued at upload, known before the socket connects. */
  expiresAt?: number | null;
  /** Called once when the room is gone for good, so the deck can be released. */
  onExpired?: () => void;
}

export interface CursorPosition {
  x: number | null;
  y: number | null;
  slide: number;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface RoomSession {
  status: ConnectionStatus;
  /** Server-issued deadline in Unix milliseconds, or null until the room reports it. */
  expiresAt: number | null;
  participants: Participant[];
  self: Participant | undefined;
  slide: number;
  hostSlide: number;
  error: string | null;
  cursors: Map<string, CursorPosition>;
  navigate: (slide: number) => void;
  detach: () => void;
  follow: () => void;
  moveCursor: (x: number | null, y: number | null) => void;
}

export function useRoom(
  link: RoomLink | null,
  name: string | null,
  options: RoomOptions = {},
): RoomSession {
  const seedExpiresAt = options.expiresAt ?? null;
  const onExpired = options.onExpired;
  // Deadlines the room reports win; the seed only stands in until the first report.
  const [serverExpiresAt, setServerExpiresAt] = useState<number | null>(null);
  const expiresAtRef = useRef<number | null>(seedExpiresAt);
  // Primitive link fields keep the connect effect's dependencies stable.
  const roomId = link?.roomId ?? null;
  const hostKey = link?.hostKey ?? null;
  const onExpiredRef = useRef(onExpired);
  const [status, setStatus] = useState<ConnectionStatus>("offline");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selfId, setSelfId] = useState<string>();
  const [slide, setSlide] = useState(0);
  const [hostSlide, setHostSlide] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [cursors, setCursors] = useState(new Map<string, CursorPosition>());
  const socketRef = useRef<WebSocket | null>(null);
  const selfRef = useRef<Participant | undefined>(undefined);
  const slideRef = useRef(0);
  const detachedRef = useRef(false);
  const cursorTimer = useRef<number | undefined>(undefined);
  const pendingCursor = useRef<CursorPosition | null>(null);
  const lastCursorSent = useRef(0);

  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  const send = useCallback((event: ClientEvent) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return false;
    socketRef.current.send(JSON.stringify(event));
    return true;
  }, []);

  useEffect(() => {
    setParticipants([]);
    setCursors(new Map());
    setSelfId(undefined);
    setError(null);
    setSlide(0);
    setHostSlide(0);
    setServerExpiresAt(null);
    expiresAtRef.current = seedExpiresAt;
    slideRef.current = 0;
    detachedRef.current = false;
    selfRef.current = undefined;
    if (roomId === null || name === null) {
      setStatus("offline");
      return;
    }
    let stopped = false;
    let retry: number | undefined;
    let heartbeat: number | undefined;
    let attempts = 0;
    let joined = false;
    let deadline: number | undefined;
    const probe = new AbortController();

    /** Terminal: the room is gone, so stop every timer and let the app release the deck. */
    function expire() {
      if (stopped) return;
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearTimeout(deadline);
      clearTimeout(cursorTimer.current);
      cursorTimer.current = undefined;
      pendingCursor.current = null;
      socketRef.current?.close(1000, "Room expired");
      socketRef.current = null;
      setCursors(new Map());
      setParticipants([]);
      setStatus("offline");
      onExpiredRef.current?.();
    }
    function setDeadline(at: number) {
      expiresAtRef.current = at;
      setServerExpiresAt((current) => (current === at ? current : at));
      armDeadline();
    }

    /** Re-arms in chunks, because a 30-day deadline overflows a single browser timeout. */
    function armDeadline() {
      clearTimeout(deadline);
      const at = expiresAtRef.current;
      if (stopped || at === null) return;
      const remaining = at - Date.now();
      if (remaining <= 0) {
        expire();
        return;
      }
      deadline = setTimeout(armDeadline, Math.min(remaining, MAX_TIMEOUT_MS));
    }

    /** A missed close event must not leave us retrying a room that no longer exists. */
    async function roomExists(): Promise<boolean> {
      try {
        const meta = await fetchRoomMetadata(roomId!, probe.signal);
        if (stopped) return false;
        if (meta === null) return false;
        setDeadline(meta.expiresAt);
        return true;
      } catch {
        return true;
      }
    }

    function connect() {
      if (stopped) return;
      setStatus(joined ? "reconnecting" : "connecting");
      void roomExists().then((exists) => {
        if (stopped) return;
        if (exists) openSocket();
        else expire();
      });
    }

    const onVisibility = () => {
      if (stopped || document.visibilityState !== "visible") return;
      const at = expiresAtRef.current;
      if (at !== null && at <= Date.now()) {
        expire();
        return;
      }
      void roomExists().then((exists) => {
        if (!stopped && !exists) expire();
      });
    };

    function openSocket() {
      const url = new URL(`/api/rooms/${roomId}/ws`, location.origin);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("name", name!);
      if (hostKey) url.searchParams.set("host", hostKey);
      const socket = new WebSocket(url);
      socketRef.current = socket;
      let restorePosition: number | null = null;
      socket.onopen = () => {
        if (stopped) return;
        heartbeat = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) socket.send("ping");
        }, 30_000);
      };
      socket.onmessage = ({ data }) => {
        if (stopped || data === "pong") return;
        let event: ServerEvent;
        try {
          event = JSON.parse(data as string) as ServerEvent;
        } catch {
          return;
        }
        switch (event.type) {
          case "state": {
            const current = event.participants.find(
              (participant) => participant.id === event.selfId,
            );
            setDeadline(event.room.expiresAt);
            if (stopped) return;
            const restoreDetached = joined && detachedRef.current;
            setSelfId(event.selfId);
            setParticipants(event.participants);
            selfRef.current = current;
            setHostSlide(event.slide);
            setCursors(new Map());
            if (restoreDetached) {
              restorePosition = slideRef.current;
              send({ type: "detach" });
              send({ type: "navigate", slide: slideRef.current });
            } else {
              detachedRef.current = current?.detached ?? false;
              slideRef.current = current?.detached ? current.slide : event.slide;
              setSlide(slideRef.current);
            }
            joined = true;
            attempts = 0;
            setStatus("connected");
            setError(null);
            break;
          }
          case "presence": {
            setParticipants(event.participants);
            const current = event.participants.find(
              (participant) => participant.id === selfRef.current?.id,
            );
            if (
              current &&
              (restorePosition === null || (current.detached && current.slide === restorePosition))
            ) {
              restorePosition = null;
              selfRef.current = current;
              detachedRef.current = current.detached;
              slideRef.current = current.slide;
              setSlide(current.slide);
            }
            setCursors(
              (previous) =>
                new Map(
                  [...previous].filter(([id]) =>
                    event.participants.some((participant) => participant.id === id),
                  ),
                ),
            );
            break;
          }
          case "slide":
            setHostSlide(event.slide);
            setParticipants((previous) =>
              previous.map((participant) =>
                participant.detached ? participant : { ...participant, slide: event.slide },
              ),
            );
            if (!detachedRef.current) {
              slideRef.current = event.slide;
              setSlide(event.slide);
              if (selfRef.current) selfRef.current = { ...selfRef.current, slide: event.slide };
            }
            break;
          case "cursor":
            setCursors((previous) => {
              const next = new Map(previous);
              if (event.x === null || event.y === null) next.delete(event.id);
              else next.set(event.id, { x: event.x, y: event.y, slide: event.slide });
              return next;
            });
            break;
          case "error":
            setError(event.message);
            break;
        }
      };
      socket.onclose = (event) => {
        clearInterval(heartbeat);
        if (stopped) return;
        if (event.code === ROOM_EXPIRED_CLOSE_CODE) {
          expire();
          return;
        }
        setCursors(new Map());
        setParticipants([]);
        setStatus("reconnecting");
        // A rejected upgrade has no useful browser error body. Avoid an endless join spinner.
        if (!joined && ++attempts >= 3) {
          setStatus("offline");
          setError(
            "Could not join this room. Check the complete link and your connection, then reload.",
          );
          return;
        }
        retry = setTimeout(connect, Math.min(1000 * 2 ** attempts, 10_000));
        if (joined) attempts += 1;
      };
      socket.onerror = () => socket.close();
    }
    document.addEventListener("visibilitychange", onVisibility);
    armDeadline();
    connect();
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      probe.abort();
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearTimeout(deadline);
      clearTimeout(cursorTimer.current);
      cursorTimer.current = undefined;
      pendingCursor.current = null;
      socketRef.current?.close(1000, "Leaving room");
      socketRef.current = null;
    };
  }, [roomId, hostKey, name, seedExpiresAt, send]);

  const moveCursor = useCallback(
    (x: number | null, y: number | null) => {
      pendingCursor.current = { x, y, slide: slideRef.current };
      if (x === null || y === null) {
        clearTimeout(cursorTimer.current);
        cursorTimer.current = undefined;
        send({ type: "cursor", ...pendingCursor.current });
        pendingCursor.current = null;
        return;
      }
      if (cursorTimer.current !== undefined) return;
      cursorTimer.current = setTimeout(
        () => {
          cursorTimer.current = undefined;
          if (pendingCursor.current) {
            send({ type: "cursor", ...pendingCursor.current });
            pendingCursor.current = null;
            lastCursorSent.current = performance.now();
          }
        },
        Math.max(0, 34 - (performance.now() - lastCursorSent.current)),
      );
    },
    [send],
  );

  const navigate = useCallback(
    (next: number) => {
      if (next === slideRef.current || !send({ type: "navigate", slide: next })) return;
      if (selfRef.current?.role === "audience") detachedRef.current = true;
      slideRef.current = next;
      setSlide(next);
      moveCursor(null, null);
    },
    [send, moveCursor],
  );

  const detach = useCallback(() => {
    if (send({ type: "detach" })) detachedRef.current = true;
  }, [send]);

  const follow = useCallback(() => {
    if (send({ type: "follow" })) {
      detachedRef.current = false;
      moveCursor(null, null);
    }
  }, [send, moveCursor]);

  return {
    status,
    expiresAt: serverExpiresAt ?? seedExpiresAt,
    participants,
    self: participants.find((participant) => participant.id === selfId),
    slide,
    hostSlide,
    error,
    cursors,
    navigate,
    detach,
    follow,
    moveCursor,
  };
}
