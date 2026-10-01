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
 * Draws one spring-smoothed cursor per remote participant, restricted to the
 * slide they are actually pointing at.
 */
export function CursorLayer({ cursors, participants, selfId, slide }: CursorLayerProps) {
  const byId = new Map(participants.map((participant) => [participant.id, participant]));

  return (
    <LazyMotion features={domAnimation}>
      {[...cursors].map(([id, cursor]) => {
        const participant = byId.get(id);
        if (!participant || id === selfId) return null;
        if (cursor.slide !== slide) return null;
        if (cursor.x === null || cursor.y === null) return null;
        return (
          <SmoothCursor
            key={id}
            x={cursor.x}
            y={cursor.y}
            name={participant.name}
            color={participant.color}
          />
        );
      })}
    </LazyMotion>
  );
}
