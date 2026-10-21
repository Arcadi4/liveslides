import { useLayoutEffect, useRef, useState } from "react";
import { LazyMotion, domAnimation } from "motion/react";
import { SmoothCursor } from "@/components/magicui/smooth-cursor";
import type { Participant } from "@/protocol";

interface CursorLayerProps {
  cursors: Map<string, { x: number | null; y: number | null; slide: number }>;
  participants: Participant[];
  selfId: string | undefined;
  slide: number;
}

/**
 * Draws spring-smoothed cursors in slide-pixel coordinates. A shared resize
 * observer keeps the physics units aligned with the displayed slide.
 * Cursors only appear when the owner is on the same slide. Idle windows keep
 * their last sample; leaving or disconnecting removes the owner's presence.
 */
export function CursorLayer({ cursors, participants, selfId, slide }: CursorLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    setSize({ width: layer.clientWidth, height: layer.clientHeight });
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    });
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  return (
    <div ref={layerRef} className="pointer-events-none absolute inset-0">
      <LazyMotion features={domAnimation}>
        {[...cursors].map(([id, cursor]) => {
          const participant = byId.get(id);
          if (!participant || id === selfId) return null;
          if (participant.slide !== slide || cursor.slide !== slide) return null;
          if (cursor.x === null || cursor.y === null || size.width === 0 || size.height === 0)
            return null;
          return (
            <SmoothCursor
              key={id}
              x={cursor.x}
              y={cursor.y}
              width={size.width}
              height={size.height}
              name={participant.name}
              color={participant.color}
            />
          );
        })}
      </LazyMotion>
    </div>
  );
}
