"use client";

import { cloneElement, useLayoutEffect, useState, type ReactElement, type ReactNode } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Popover surface animated with transitions.dev's menu dropdown: it grows out
 * of the trigger along the anchored corner, then shrinks back on close.
 *
 * The surface is force-mounted so it exists in its rest state before opening —
 * that is what lets the open scale transition away from
 * `--dropdown-pre-scale` — and it keeps the element alive for
 * `--dropdown-close-dur` so the closing scale plays before children unmount.
 *
 * The caller owns the open state and the trigger is an anchor rather than a
 * Radix `Trigger`: hover preview, click-to-pin and Radix's own click toggle are
 * three different notions of "open", and only one of them can win.
 */
type Origin =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

/** Disclosure attributes the popover stamps onto its trigger element. */
interface TriggerAria {
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "dialog";
  "data-state"?: "open" | "closed";
}

interface TransitionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Single element the surface anchors to and opens from. */
  trigger: ReactElement<TriggerAria>;
  children: ReactNode;
  /** Corner the surface grows out of, relative to the trigger. */
  origin?: Origin;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  sideOffset?: number;
  className?: string;
  motion?: "dropdown" | "panel";
  /** Kept outside the animated surface so backdrop filters can sample the page. */
  backdrop?: ReactNode;
  contentProps?: React.ComponentProps<typeof PopoverContent>;
}

export function TransitionPopover({
  open,
  onOpenChange,
  trigger,
  children,
  origin = "bottom-center",
  align = "center",
  side = "top",
  sideOffset = 8,
  className,
  motion = "dropdown",
  backdrop,
  contentProps,
}: TransitionPopoverProps) {
  const [phase, setPhase] = useState<"closed" | "opening" | "open" | "closing">("closed");
  const shown = open && phase === "open";
  const mounted = open || phase !== "closed";

  useLayoutEffect(() => {
    if (open) {
      setPhase("opening");
      // Paint the visible rest state before applying the open state. Removing
      // `hidden` and applying the open class together skips the CSS transition.
      let frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => setPhase("open"));
      });
      return () => cancelAnimationFrame(frame);
    }
    setPhase((current) => (current === "closed" ? current : "closing"));
    const declared = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        motion === "panel" ? "--panel-close-dur" : "--dropdown-close-dur",
      ),
    );
    const timeout = setTimeout(() => setPhase("closed"), declared);
    return () => clearTimeout(timeout);
  }, [open, motion]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        {cloneElement(trigger, {
          "aria-expanded": open,
          "aria-haspopup": "dialog",
          "data-state": open ? "open" : "closed",
        })}
      </PopoverAnchor>
      <PopoverContent
        forceMount
        side={side}
        align={align}
        sideOffset={sideOffset}
        data-origin={origin}
        data-motion-open={shown}
        // A force-mounted surface that is neither open nor closing would
        // otherwise stay visible to hit-testing and assistive tech.
        hidden={!mounted}
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "z-50 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-hidden",
          motion === "dropdown" && "t-dropdown",
          motion === "dropdown" && (shown ? "is-open" : !open && mounted ? "is-closing" : null),
          !shown && "pointer-events-none",
          className,
        )}
        {...contentProps}
      >
        {mounted && backdrop}
        {mounted &&
          (motion === "panel" ? (
            <div className="t-panel-slide relative z-20" data-open={shown}>
              {children}
            </div>
          ) : (
            children
          ))}
      </PopoverContent>
    </Popover>
  );
}
