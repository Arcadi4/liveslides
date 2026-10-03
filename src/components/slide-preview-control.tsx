import { useEffect, useRef, useState, type FocusEvent } from "react";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { ProgressiveBlur } from "@/components/magicui/progressive-blur";
import { ShineBorder } from "@/components/magicui/shine-border";
import { TransitionPopover } from "@/components/transition-popover";
import { useHoverDisclosure } from "@/components/use-hover-disclosure";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { WheelGesturesPlugin } from "embla-carousel-wheel-gestures";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SlideView } from "@/slide-view";

interface SlidePreviewControlProps {
  presentation: PresentationData;
  slide: number;
  hostSlide: number;
  detached: boolean;
  canNavigate: boolean;
  onNavigate: (slide: number) => void;
}

/** Render only the slides near the viewport; SlideView disposes each renderer on exit. */
function SlideThumbnail({
  presentation,
  index,
}: {
  presentation: PresentationData;
  index: number;
}) {
  const frameRef = useRef<HTMLSpanElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      root: frame.closest("[data-slide-carousel]"),
      rootMargin: "200px",
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={frameRef} aria-hidden="true" inert className="pointer-events-none block size-full">
      {visible ? (
        <SlideView presentation={presentation} index={index} stageRef={stageRef} />
      ) : (
        <Skeleton className="size-full rounded-none" />
      )}
    </span>
  );
}

function PreviewStrip({
  presentation,
  slide,
  hostSlide,
  detached,
  canNavigate,
  onNavigate,
}: SlidePreviewControlProps) {
  const [api, setApi] = useState<CarouselApi>();
  const initialSlide = useRef(slide);
  const [plugins] = useState(() => [
    WheelGesturesPlugin(),
    { ...WheelGesturesPlugin({ forceWheelAxis: "y" }), name: "verticalWheelGestures" },
  ]);

  useEffect(() => {
    api?.scrollTo(slide, matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, [api, slide]);

  return (
    <Carousel
      data-slide-carousel
      aria-label="Slide thumbnails"
      className="dark relative z-20 w-full text-foreground"
      setApi={setApi}
      opts={{ align: "center", dragFree: true, startIndex: initialSlide.current }}
      plugins={plugins}
    >
      <CarouselContent className="ml-0 py-4">
        {presentation.slides.map((_, index) => {
          const host = index === hostSlide;
          const current = index === slide;
          return (
            <CarouselItem key={index} className="basis-auto pl-2 sm:pl-3">
              <Button
                variant="ghost"
                className="h-auto w-36 flex-col gap-2 rounded-xl p-2 hover:bg-white/10 sm:w-48"
                data-slide-index={index}
                aria-label={`Slide ${index + 1}${host ? ", host's slide" : ""}${current ? ", your current slide" : ""}`}
                aria-current={current ? "page" : undefined}
                disabled={!canNavigate}
                onClick={() => onNavigate(index)}
              >
                <span
                  className={cn(
                    "relative block w-full overflow-hidden rounded-md bg-white p-1 shadow-lg ring-1 ring-white/20",
                    detached && current && "outline-2 outline-offset-2 outline-primary",
                  )}
                  style={{ aspectRatio: presentation.width / presentation.height }}
                >
                  <SlideThumbnail presentation={presentation} index={index} />
                  {host && (
                    <ShineBorder borderWidth={2} shineColor={["#A07CFE", "#FE8FB5", "#FFBE7B"]} />
                  )}
                </span>
                <span className="flex h-5 items-center justify-center gap-1.5 text-xs tabular-nums">
                  <span>{index + 1}</span>
                  {host && (
                    <Badge variant="secondary" className="px-1.5 text-[10px]">
                      Host
                    </Badge>
                  )}
                  {detached && current && <Badge className="px-1.5 text-[10px]">You</Badge>}
                </span>
              </Button>
            </CarouselItem>
          );
        })}
      </CarouselContent>
    </Carousel>
  );
}

export function SlidePreviewControl(props: SlidePreviewControlProps) {
  const disclosure = useHoverDisclosure();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { slide, presentation, canNavigate, onNavigate } = props;
  const blur = (event: FocusEvent) => {
    if (
      event.relatedTarget instanceof Element &&
      event.relatedTarget.closest("[data-slide-preview]")
    )
      return;
    disclosure.trigger.onBlur();
  };

  return (
    <TransitionPopover
      open={disclosure.open}
      onOpenChange={disclosure.onOpenChange}
      sideOffset={12}
      motion="panel"
      backdrop={
        <div
          aria-hidden="true"
          className="slide-preview-backdrop pointer-events-none absolute -inset-x-4 -top-16 -bottom-24 z-0"
        >
          <ProgressiveBlur height="100%" />
          <div className="slide-preview-dim absolute inset-0 z-10 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
        </div>
      }
      className="slide-preview-surface w-[calc(100vw-2rem)] border-0 bg-transparent p-0 shadow-none"
      contentProps={{
        ...disclosure.surface,
        ref: surfaceRef,
        collisionPadding: 16,
        "aria-label": "Slide previews",
        // Hover must leave focus on the dock; keyboard users enter with ArrowUp or Tab.
        onOpenAutoFocus: (event) => event.preventDefault(),
        onCloseAutoFocus: (event) => event.preventDefault(),
        onFocus: disclosure.trigger.onFocus,
        onBlur: blur,
      }}
      trigger={
        <div
          data-slide-preview
          role="group"
          aria-label="Slide navigation"
          className="flex items-center gap-1"
          onMouseEnter={disclosure.trigger.onMouseEnter}
          onMouseLeave={disclosure.trigger.onMouseLeave}
          onFocus={disclosure.trigger.onFocus}
          onBlur={blur}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Previous slide"
            disabled={!canNavigate || slide === 0}
            onClick={() => onNavigate(slide - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" />
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 min-w-14 rounded-full px-2 font-mono text-xs tabular-nums"
            aria-label={`Browse slides, ${slide + 1} of ${presentation.slides.length}`}
            aria-expanded={disclosure.open}
            aria-haspopup="dialog"
            onClick={disclosure.trigger.onClick}
            onKeyDown={(event) => {
              if (event.key !== "ArrowUp") return;
              event.preventDefault();
              disclosure.onOpenChange(true);
              requestAnimationFrame(() =>
                surfaceRef.current
                  ?.querySelector<HTMLButtonElement>('[aria-current="page"]')
                  ?.focus(),
              );
            }}
          >
            {slide + 1} / {presentation.slides.length}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Next slide"
            disabled={!canNavigate || slide >= presentation.slides.length - 1}
            onClick={() => onNavigate(slide + 1)}
          >
            <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      }
    >
      <div data-slide-preview>
        <PreviewStrip {...props} />
      </div>
    </TransitionPopover>
  );
}
