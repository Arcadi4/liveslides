"use client";

import { cloneElement, useEffect, useState, type ReactElement, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
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
  contentProps?: React.ComponentProps<typeof PopoverPrimitive.Content>;
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
  contentProps,
}: TransitionPopoverProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setClosing(false);
      return;
    }
    setClosing(true);
    const declared = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue("--dropdown-close-dur"),
    );
    const timeout = setTimeout(() => setClosing(false), Number.isFinite(declared) ? declared : 150);
    return () => clearTimeout(timeout);
  }, [open]);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor asChild>
        {cloneElement(trigger, {
          "aria-expanded": open,
          "aria-haspopup": "dialog",
          "data-state": open ? "open" : "closed",
        })}
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal forceMount>
        <PopoverPrimitive.Content
          forceMount
          side={side}
          align={align}
          sideOffset={sideOffset}
          data-origin={origin}
          // A force-mounted surface that is neither open nor closing would
          // otherwise stay visible to hit-testing and assistive tech.
          hidden={!open && !closing}
          className={cn(
            "t-dropdown z-50 w-64 rounded-lg border bg-popover p-2 text-popover-foreground shadow-lg outline-hidden",
            open ? "is-open" : closing ? "is-closing" : null,
            className,
          )}
          {...contentProps}
        >
          {open || closing ? children : null}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
