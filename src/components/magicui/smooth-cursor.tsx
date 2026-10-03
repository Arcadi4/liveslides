"use client";

import { useEffect, useId, useRef, type FC } from "react";
import { m, useReducedMotion, useSpring } from "motion/react";

/**
 * Magic UI's sprite and spring physics, driven by remote slide coordinates.
 * Convert normalized samples to slide pixels before measuring velocity or
 * animating: speed and rest thresholds then retain the upstream units.
 * Translation uses compositor transforms; only the sprite rotates and squashes,
 * so the collaborator's colored name stays readable. The native cursor is kept.
 * @see https://magicui.design/docs/components/smooth-cursor
 */
export interface SmoothCursorProps {
  /** Normalized coordinates on the slide; the layer owns cursor presence. */
  x: number;
  y: number;
  width: number;
  height: number;
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

const CursorArrow: FC = () => {
  const filterId = useId();

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={50}
      height={54}
      viewBox="0 0 50 54"
      fill="none"
      style={{ scale: 0.5 }}
      aria-hidden="true"
    >
      <g filter={`url(#${filterId})`}>
        <path
          d="M42.6817 41.1495L27.5103 6.79925C26.7269 5.02557 24.2082 5.02558 23.3927 6.79925L7.59814 41.1495C6.75833 42.9759 8.52712 44.8902 10.4125 44.1954L24.3757 39.0496C24.8829 38.8627 25.4385 38.8627 25.9422 39.0496L39.8121 44.1954C41.6849 44.8902 43.4884 42.9759 42.6817 41.1495Z"
          fill="black"
        />
        <path
          d="M43.7146 40.6933L28.5431 6.34306C27.3556 3.65428 23.5772 3.69516 22.3668 6.32755L6.57226 40.6778C5.3134 43.4156 7.97238 46.298 10.803 45.2549L24.7662 40.109C25.0221 40.0147 25.2999 40.0156 25.5494 40.1082L39.4193 45.254C42.2261 46.2953 44.9254 43.4347 43.7146 40.6933Z"
          stroke="white"
          strokeWidth={2.25825}
        />
      </g>
      <defs>
        <filter
          id={filterId}
          x={0.602397}
          y={0.952444}
          width={49.0584}
          height={52.428}
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity={0} result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy={2.25825} />
          <feGaussianBlur stdDeviation={2.25825} />
          <feComposite in2="hardAlpha" operator="out" />
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.08 0" />
          <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow_91_7928" />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_91_7928"
            result="shape"
          />
        </filter>
      </defs>
    </svg>
  );
};

export function SmoothCursor({
  x,
  y,
  width,
  height,
  name,
  color,
  springConfig = {
    damping: 45,
    stiffness: 400,
    mass: 1,
    restDelta: 0.001,
  },
}: SmoothCursorProps) {
  const lastSample = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    time: number;
  } | null>(null);
  const previousAngle = useRef(0);
  const accumulatedRotation = useRef(0);
  const squashTimeout = useRef<TimerHandle | undefined>(undefined);
  const prefersReducedMotion = useReducedMotion();
  const cursorX = useSpring(x * width, springConfig);
  const cursorY = useSpring(y * height, springConfig);
  const rotation = useSpring(0, { ...springConfig, damping: 60, stiffness: 300 });
  const scale = useSpring(1, { ...springConfig, stiffness: 500, damping: 35 });

  useEffect(() => {
    return () => clearTimeout(squashTimeout.current);
  }, []);

  useEffect(() => {
    const now = performance.now();
    const previous = lastSample.current;
    const resized = previous && (previous.width !== width || previous.height !== height);

    if (prefersReducedMotion || !previous || resized) {
      // Enter and resize in place, rather than flying in from an obsolete origin.
      cursorX.jump(x * width);
      cursorY.jump(y * height);
      clearTimeout(squashTimeout.current);
      scale.jump(1);
      if (prefersReducedMotion) {
        rotation.jump(0);
        previousAngle.current = 0;
        accumulatedRotation.current = 0;
      }
    } else {
      cursorX.set(x * width);
      cursorY.set(y * height);
      const elapsed = now - previous.time;
      const dx = (x - previous.x) * width;
      const dy = (y - previous.y) * height;

      if (elapsed > 0 && Math.hypot(dx, dy) / elapsed > 0.1) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        let angleDiff = angle - previousAngle.current;
        if (angleDiff > 180) angleDiff -= 360;
        if (angleDiff < -180) angleDiff += 360;
        accumulatedRotation.current += angleDiff;
        previousAngle.current = angle;
        rotation.set(accumulatedRotation.current);
        scale.set(0.95);
        clearTimeout(squashTimeout.current);
        squashTimeout.current = setTimeout(() => scale.set(1), 150);
      }
    }

    lastSample.current = { x, y, width, height, time: now };
  }, [x, y, width, height, prefersReducedMotion, cursorX, cursorY, rotation, scale]);

  return (
    <m.div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        x: cursorX,
        y: cursorY,
        pointerEvents: "none",
        willChange: "transform",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
    >
      <m.div
        style={{
          width: 50,
          height: 54,
          translateX: "-50%",
          translateY: "-50%",
          rotate: rotation,
          scale,
        }}
      >
        <CursorArrow />
      </m.div>
      <span
        className="absolute left-4 top-3.5 w-max max-w-40 truncate rounded-full px-1.5 py-0.5 text-xs font-medium text-white"
        style={{ backgroundColor: color }}
      >
        {name}
      </span>
    </m.div>
  );
}
