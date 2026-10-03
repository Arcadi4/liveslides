import { TransitionPopover } from "@/components/transition-popover";
import { useHoverDisclosure } from "@/components/use-hover-disclosure";
import { TimerIcon } from "lucide-react";
import { useEffect, useState } from "react";

/** Milliseconds in each unit a countdown is reported in, coarsest first. */
const UNITS: [label: string, ms: number][] = [
  ["d", 86_400_000],
  ["h", 3_600_000],
  ["m", 60_000],
  ["s", 1_000],
];

/**
 * The leading unit plus the two below it — "3d 5h 42m", then "5h 42m 13s" —
 * so the finest shown unit always counts down rather than sitting frozen.
 */
function formatRemaining(remainingMs: number): string {
  if (remainingMs <= 0) return "Expired";
  const start = UNITS.findIndex(([, ms]) => remainingMs >= ms);
  if (start === -1) return "<1s";
  let rest = remainingMs;
  const parts: string[] = [];
  for (const [label, ms] of UNITS.slice(start)) {
    const value = Math.floor(rest / ms);
    if (value > 0) parts.push(`${value}${label}`);
    rest -= value * ms;
    if (parts.length === 3) break;
  }
  return parts.join(" ");
}

interface ExpiryControlProps {
  /** Room deadline in Unix milliseconds. */
  expiresAt: number;
}

/**
 * The room's deadline, collapsed to a single button. Opening it reveals how
 * long the presentation has left, counting down live, plus the absolute
 * moment the room stops answering.
 */
export function ExpiryControl({ expiresAt }: ExpiryControlProps) {
  const disclosure = useHoverDisclosure();
  // The countdown only needs to advance while it is on screen.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!disclosure.open) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [disclosure.open]);

  const remaining = expiresAt - now;
  const expired = remaining <= 0;
  const deadline = new Date(expiresAt).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <TransitionPopover
      open={disclosure.open}
      onOpenChange={disclosure.onOpenChange}
      origin="bottom-center"
      className="w-56"
      contentProps={disclosure.surface}
      trigger={
        <button
          type="button"
          aria-label={`Time left: ${expired ? "expired" : formatRemaining(remaining)}`}
          className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          {...disclosure.trigger}
        >
          <TimerIcon className="size-4" aria-hidden="true" />
        </button>
      }
    >
      <div className="flex flex-col gap-1 px-1 py-1">
        <span className="text-xs text-muted-foreground">Time left</span>
        <span
          className={`font-mono text-2xl tabular-nums ${expired ? "text-destructive" : ""}`}
          aria-live="off"
        >
          {formatRemaining(remaining)}
        </span>
        <span className="mt-1 text-xs text-muted-foreground">Room closes {deadline}</span>
      </div>
    </TransitionPopover>
  );
}
