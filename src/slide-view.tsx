import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { renderSlide, type PresentationData } from "@aiden0z/pptx-renderer";

interface SlideViewProps {
  presentation: PresentationData;
  index: number;
  /** Receives the element whose box is the rendered slide, for hit testing. */
  stageRef: RefObject<HTMLDivElement | null>;
  /** Overlay drawn on top of the rendered slide, e.g. remote cursors. */
  overlay?: ReactNode;
  /** Pointer tracking, normalized by the caller against the stage box. */
  onStagePointerMove?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onStagePointerLeave?: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * Fits one rendered slide into the available box while preserving its aspect
 * ratio, and hands the exact stage rectangle to the caller so pointer
 * coordinates can be normalized against the slide rather than the viewport.
 */
export function SlideView({
  presentation,
  index,
  stageRef,
  overlay,
  onStagePointerMove,
  onStagePointerLeave,
}: SlideViewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  const { width: slideWidth, height: slideHeight } = presentation;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    setBox(null);
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      const scale = Math.min(width / slideWidth, height / slideHeight);
      setBox({
        width: Math.max(1, Math.floor(slideWidth * scale)),
        height: Math.max(1, Math.floor(slideHeight * scale)),
      });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [presentation, slideWidth, slideHeight]);

  // Dispose the old slide before mounting the next, including charts and blob URLs.
  useLayoutEffect(() => {
    const target = targetRef.current;
    const slide = presentation.slides[index];
    if (!target || !box || !slide) return;
    const handle = renderSlide(presentation, slide);
    handle.element.style.transform = `scale(${box.width / slideWidth})`;
    handle.element.style.transformOrigin = "top left";
    target.replaceChildren(handle.element);
    return () => {
      handle.dispose();
      handle.element.remove();
    };
  }, [presentation, index, box, slideWidth]);

  return (
    <div ref={frameRef} className="flex size-full items-center justify-center overflow-hidden">
      {box && (
        <div
          onPointerMove={onStagePointerMove}
          onPointerLeave={onStagePointerLeave}
          ref={stageRef}
          style={{ width: box.width, height: box.height }}
          className="relative shrink-0 bg-white shadow-lg ring-1 ring-black/10 dark:ring-white/10"
        >
          <div ref={targetRef} className="size-full overflow-hidden" />
          {overlay && <div className="absolute inset-0">{overlay}</div>}
        </div>
      )}
    </div>
  );
}
