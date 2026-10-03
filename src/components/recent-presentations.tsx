import { useEffect, useState } from "react";
import { roomUrl } from "@/links";
import { readRecentRooms, type RecentRoom } from "@/recent-rooms";
import { PresentationPreview } from "@/components/presentation-preview";
import { cn } from "@/lib/utils";

interface RecentPresentationsProps {
  className?: string;
  onSelectRoom?: (room: RecentRoom) => void;
  fadeOut?: boolean;
}

export function RecentPresentations({
  className,
  onSelectRoom,
  fadeOut = false,
}: RecentPresentationsProps = {}) {
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
    <aside
      aria-label="Recent presentations"
      className={cn("t-history-panel w-full max-w-md lg:w-72 lg:shrink-0", className)}
      data-fading-out={fadeOut ? "true" : undefined}
    >
      <h2 className="mb-3 text-sm font-medium">Recent presentations</h2>
      <ul className="flex flex-col gap-4">
        {rooms.map((room) => {
          const expired = room.expiresAt <= now;
          const preview = (
            <PresentationPreview
              roomId={room.roomId}
              secret={room.secret}
              name={room.name}
              expiresAt={room.expiresAt}
              lazy
            />
          );
          return (
            <li key={room.roomId}>
              {expired ? (
                <div>{preview}</div>
              ) : (
                <a
                  href={roomUrl(room)}
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.altKey ||
                      event.shiftKey
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onSelectRoom?.(room);
                  }}
                  className="block rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
                  aria-label={`Rejoin ${room.name}`}
                >
                  {preview}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
