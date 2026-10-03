"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

/** Hover is a preview, so it waits for intent and closes with a small grace. */
const HOVER_OPEN_MS = 120;
const HOVER_CLOSE_MS = 200;

interface HoverSurfaceHandlers {
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

interface HoverTriggerHandlers extends HoverSurfaceHandlers {
  onFocus: () => void;
  onBlur: () => void;
  /** Pins the surface open, or unpins and closes it when already pinned. */
  onClick: (event: MouseEvent) => void;
  /** Keyboard equivalent of the click, for triggers that are not buttons. */
  onKeyDown: (event: KeyboardEvent) => void;
}

export interface HoverDisclosure {
  open: boolean;
  /** Spread onto the trigger; drives preview on hover and focus, pin on click. */
  trigger: HoverTriggerHandlers;
  /** Spread onto the surface, so moving onto it does not read as leaving. */
  surface: HoverSurfaceHandlers;
  /** Wire to the surface component's open-state callback. */
  onOpenChange: (open: boolean) => void;
}

/**
 * Disclosure shared by the floating controls: hovering (or focusing) the
 * trigger previews the surface, leaving closes it again, and a click pins it
 * open so a deliberate read survives the pointer moving away.
 */
export function useHoverDisclosure(): HoverDisclosure {
  const [open, setOpen] = useState(false);
  const pinned = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const cancelPendingClose = () => clearTimeout(timer.current);

  const pin = () => {
    cancelPendingClose();
    if (open && pinned.current) {
      pinned.current = false;
      setOpen(false);
    } else {
      pinned.current = true;
      setOpen(true);
    }
  };

  return {
    open,
    trigger: {
      onMouseEnter: () => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          pinned.current = false;
          setOpen(true);
        }, HOVER_OPEN_MS);
      },
      onMouseLeave: () => {
        cancelPendingClose();
        if (pinned.current) return;
        timer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
      },
      onFocus: () => {
        cancelPendingClose();
        setOpen(true);
      },
      onBlur: () => {
        if (pinned.current) return;
        setOpen(false);
      },
      onClick: (event) => {
        // AvatarCircles wraps each circle in a profile link; the room has no
        // profile pages, so the click is only the disclosure.
        event.preventDefault();
        pin();
      },
      onKeyDown: (event) => {
        // Native controls turn Enter/Space into a click of their own, so
        // acting on the key as well would toggle twice.
        if ((event.target as HTMLElement).closest("button, a[href]")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        pin();
      },
    },
    surface: {
      onMouseEnter: cancelPendingClose,
      onMouseLeave: () => {
        cancelPendingClose();
        if (pinned.current) return;
        timer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_MS);
      },
    },
    onOpenChange: (next) => {
      if (!next) pinned.current = false;
      setOpen(next);
    },
  };
}
