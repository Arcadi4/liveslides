import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientEvent, Participant, RoomLink, ServerEvent } from "./protocol";

export interface CursorPosition {
  x: number | null;
  y: number | null;
  slide: number;
}

type ConnectionStatus = "connecting" | "connected" | "reconnecting" | "offline";

export interface RoomSession {
  status: ConnectionStatus;
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

export function useRoom(link: RoomLink | null, name: string | null): RoomSession {
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
    slideRef.current = 0;
    detachedRef.current = false;
    selfRef.current = undefined;
    if (!link || name === null) {
      setStatus("offline");
      return;
    }
    let stopped = false;
    let retry: number | undefined;
    let heartbeat: number | undefined;
    let attempts = 0;
    let joined = false;

    function connect() {
      if (stopped) return;
      setStatus(joined ? "reconnecting" : "connecting");
      const url = new URL(`/api/rooms/${link!.roomId}/ws`, location.origin);
      url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("name", name!);
      if (link!.hostKey) url.searchParams.set("host", link!.hostKey);
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
      socket.onclose = () => {
        clearInterval(heartbeat);
        if (stopped) return;
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
    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      clearInterval(heartbeat);
      clearTimeout(cursorTimer.current);
      cursorTimer.current = undefined;
      pendingCursor.current = null;
      socketRef.current?.close(1000, "Leaving room");
      socketRef.current = null;
    };
  }, [link?.roomId, link?.hostKey, name, send]);

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
