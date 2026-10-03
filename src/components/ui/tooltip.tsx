"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

const TooltipOpenContext = React.createContext(false);

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  );
}

function Tooltip({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <TooltipOpenContext value={controlledOpen ?? open}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={controlledOpen ?? open}
        onOpenChange={(next) => {
          setOpen(next);
          onOpenChange?.(next);
        }}
        {...props}
      />
    </TooltipOpenContext>
  );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  const open = React.useContext(TooltipOpenContext);
  return (
    <TooltipPrimitive.Portal forceMount>
      <TooltipPrimitive.Content
        forceMount
        data-slot="tooltip-content"
        data-show={open}
        aria-hidden={!open}
        sideOffset={sideOffset}
        className={cn("t-tt z-50 text-xs text-balance", className)}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
