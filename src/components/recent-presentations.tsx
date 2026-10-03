import { useEffect, useRef, useState } from "react";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import { PresentationIcon } from "lucide-react";
import { loadDeck } from "@/crypto";
import { readRecentRooms, type RecentRoom } from "@/recent-rooms";
import { roomUrl } from "@/links";
import { SlideView } from "@/slide-view";

function SlidePlaceholder() {
  return (
    <div className="flex size-full items-center justify-center text-muted-foreground">
      <PresentationIcon className="size-8" aria-hidden="true" />
    </div>
  );
}

/**
 * Draws the room's first slide with the renderer the carousel uses, so the
 * history keeps a real preview without storing one. The deck loads only once
 * the card is on screen; a room the server has dropped keeps the placeholder.
 */
function RoomPreview({ roomId, secret }: { roomId: string; secret: string }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [deck, setDeck] = useState<PresentationData | null>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const controller = new AbortController();
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        loadDeck({ roomId, secret }, controller.signal).then(setDeck, () => {
          // Unavailable decks leave the placeholder in place.
        });
      },
      { rootMargin: "200px" },
    );
    observer.observe(frame);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [roomId, secret]);

  return (
    <div ref={frameRef} className="size-full">
      {deck ? (
        <SlideView presentation={deck} index={0} stageRef={stageRef} />
      ) : (
        <SlidePlaceholder />
      )}
    </div>
  );
}

export function RecentPresentations() {
  const [rooms, setRooms] = useState<RecentRoom[]>([]);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      setNow(Date.now());
      void readRecentRooms().then((recent) => {
        if (active) setRooms(recent);
      });
    };
    refresh();
    window.addEventListener("recent-rooms-change", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("recent-rooms-change", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    const next = Math.min(
      ...rooms.filter((room) => room.expiresAt > now).map((room) => room.expiresAt),
    );
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(0, next - Date.now()), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [rooms, now]);

  if (!rooms.length) return null;

  return (
    <aside aria-label="Recent presentations" className="w-full max-w-md lg:w-72 lg:shrink-0">
      <h2 className="mb-3 text-sm font-medium">Recent presentations</h2>
      <ul className="flex flex-col gap-4">
        {rooms.map((room) => {
          const expired = room.expiresAt <= now;
          const content = (
            <>
              <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
                {expired ? (
                  <SlidePlaceholder />
                ) : (
                  <RoomPreview roomId={room.roomId} secret={room.secret} />
                )}
                {expired && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 px-3 text-center text-sm font-medium text-white">
                    Presentation Expired
                  </div>
                )}
              </div>
              <p className="mt-1.5 truncate text-sm font-medium" title={room.name}>
                {room.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {expired ? "Expired" : "Expires"}{" "}
                <time dateTime={new Date(room.expiresAt).toISOString()}>
                  {new Date(room.expiresAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </p>
            </>
          );
          return (
            <li key={room.roomId}>
              {expired ? (
                <div>{content}</div>
              ) : (
                <a
                  href={roomUrl(room)}
                  className="block rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label={`Rejoin ${room.name}`}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
