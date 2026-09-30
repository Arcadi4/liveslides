import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import type { RoomLink } from "@/protocol";
import { useRoom } from "@/use-room";
import { SlideView } from "@/slide-view";
import { CursorLayer } from "@/components/cursor-layer";
import { RoomControls } from "@/components/room-controls";

type NextSlide = (current: number, last: number) => number;

/** Keys the room pages through, so the deck is navigable without a control. */
const NAVIGATION_KEYS: Record<string, NextSlide> = {
  ArrowRight: (current) => current + 1,
  ArrowDown: (current) => current + 1,
  PageDown: (current) => current + 1,
  " ": (current) => current + 1,
  ArrowLeft: (current) => current - 1,
  ArrowUp: (current) => current - 1,
  PageUp: (current) => current - 1,
  Home: () => 0,
  End: (_current, last) => last,
};

const TYPING_SELECTOR =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='dialog'], [role='menu'], [role='listbox']";

const CONTROL_SELECTOR = "button, a[href], [role='button']";

interface RoomViewProps {
  link: RoomLink;
  name: string;
  presentation: PresentationData;
  onExit: () => void;
}

export function RoomView({ link, name, presentation, onExit }: RoomViewProps) {
  const room = useRoom(link, name);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastSlide = presentation.slides.length - 1;
  const canNavigate = room.status === "connected";
  const { navigate, moveCursor } = room;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (room.status !== "connected") return;
      const origin = event.target;
      if (!(origin instanceof HTMLElement) || origin.closest(TYPING_SELECTOR)) return;

      const next = NAVIGATION_KEYS[event.key];
      if (!next) return;
      // Space already activates a focused control, so it must not also page.
      if (event.key === " " && origin.closest(CONTROL_SELECTOR)) return;

      event.preventDefault();
      navigate(Math.min(lastSlide, Math.max(0, next(room.slide, lastSlide))));
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, room.slide, room.status, lastSlide]);

  const onStagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const bounds = stage.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    moveCursor(
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height,
    );
  };

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-neutral-950">
      <SlideView
        presentation={presentation}
        index={room.slide}
        stageRef={stageRef}
        onStagePointerMove={onStagePointerMove}
        onStagePointerLeave={() => moveCursor(null, null)}
        overlay={
          <CursorLayer
            cursors={room.cursors}
            participants={room.participants}
            selfId={room.self?.id}
            slide={room.slide}
          />
        }
      />

      {room.error && (
        <div
          role="alert"
          className="absolute inset-x-0 top-3 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-full border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-lg"
        >
          {room.error}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center p-3 sm:p-4">
        <RoomControls
          status={room.status}
          participants={room.participants}
          self={room.self}
          slide={room.slide}
          hostSlide={room.hostSlide}
          slideCount={presentation.slides.length}
          link={link}
          canNavigate={canNavigate}
          onNavigate={navigate}
          onDetach={room.detach}
          onFollow={room.follow}
          onExit={onExit}
        />
      </div>
    </main>
  );
}
