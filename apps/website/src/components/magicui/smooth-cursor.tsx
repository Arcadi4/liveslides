"use client";

import { useEffect, useRef, useState, type FC } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";

/**
 * MagicUI SmoothCursor adapted to collaboration: the pointer arrives from the
 * room over the wire instead of a local `pointermove` listener, so the local
 * cursor is never hidden and positions already arrive throttled (~30Hz). The
 * spring physics, movement squash and inert overlay are kept from the original
 * implementation. The original's direction-based rotation is dropped: with
 * sparse remote samples it settles at an arbitrary angle and a collaborator's
 * pointer has to read as an upright arrow.
 */
export interface SmoothCursorProps {
  /** Normalized slide coordinates in [0, 1], or null when the pointer left. */
  x: number | null;
  y: number | null;
  name: string;
  color: string;
  springConfig?: {
    damping: number;
    stiffness: number;
    mass: number;
    restDelta: number;
  };
}

type TimerHandle = ReturnType<typeof setTimeout>;

const CursorArrow: FC<{ color: string }> = ({ color }) => (
  <svg width="24" height="28" viewBox="0 0 24 28" fill="none" aria-hidden="true">
    <path
      d="M4.6 2.4 19.9 17.7 11.6 18.3 8.2 25.1a.9.9 0 0 1-1.7-.2L4.6 2.4Z"
      fill={color}
      stroke="white"
      strokeWidth="1.4"
      strokeLinejoin="round"
    />
  </svg>
);

export function SmoothCursor({
  x,
  y,
  name,
  color,
  springConfig = {
    damping: 45,
    stiffness: 400,
    mass: 1,
    restDelta: 0.001,
  },
}: SmoothCursorProps) {
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const lastUpdateTime = useRef(0);
  const settled = useRef(false);
  const squashTimeout = useRef<TimerHandle | undefined>(undefined);
  const [isVisible, setIsVisible] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Positions stay normalized and are applied as percentages of the stage, so a
  // resize of the rendered slide never leaves the cursor stranded.
  const cursorX = useSpring(0, springConfig);
  const cursorY = useSpring(0, springConfig);
  const scale = useSpring(1, { ...springConfig, stiffness: 500, damping: 35 });
  const left = useTransform(cursorX, (value) => `${value * 100}%`);
  const top = useTransform(cursorY, (value) => `${value * 100}%`);

  useEffect(() => {
    return () => clearTimeout(squashTimeout.current);
  }, []);

  useEffect(() => {
    if (x === null || y === null) {
      setIsVisible(false);
      return;
    }

    const now = Date.now();
    const elapsed = now - lastUpdateTime.current;

    if (elapsed > 0 && lastPos.current) {
      const speed = Math.hypot(
        (x - lastPos.current.x) / elapsed,
        (y - lastPos.current.y) / elapsed,
      );
      if (!prefersReducedMotion && speed > 0.00005) {
        scale.set(0.92);
        clearTimeout(squashTimeout.current);
        squashTimeout.current = setTimeout(() => scale.set(1), 150);
      }
    }

    lastPos.current = { x, y };
    lastUpdateTime.current = now;

    if (prefersReducedMotion || !settled.current) {
      cursorX.jump(x);
      cursorY.jump(y);
      settled.current = true;
    } else {
      cursorX.set(x);
      cursorY.set(y);
    }

    setIsVisible(true);
  }, [x, y, prefersReducedMotion, cursorX, cursorY, scale]);

  return (
    <motion.div
      style={{
        position: "absolute",
        inset: 0,
        // The percentage offsets resolve against this box, so it spans the
        // whole slide and the arrow tip lands on the exact normalized point.
        x: left,
        y: top,
        scale,
        transformOrigin: "0 0",
        pointerEvents: "none",
        willChange: "transform",
        opacity: isVisible ? 1 : 0,
      }}
      initial={false}
      animate={{ opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.15 }}
    >
      <span className="flex items-start gap-2.5">
        <CursorArrow color={color} />
        <span
          className="mt-3.5 w-max max-w-40 truncate rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
          style={{ backgroundColor: color }}
        >
          {name}
        </span>
      </span>
    </motion.div>
  );
}
