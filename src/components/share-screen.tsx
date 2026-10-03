import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RecentPresentations } from "@/components/recent-presentations";
import type { RecentRoom } from "@/recent-rooms";
import { prepareDeck, shareDeck, type PreparedDeck } from "@/crypto";
import { rememberName, suggestName } from "@/identity";
import { cn } from "@/lib/utils";
import { MAX_FILE_BYTES, MAX_TTL_SECONDS, type RoomLink } from "@/protocol";
import { SlideView } from "@/slide-view";
import { FileUpIcon, LoaderCircleIcon, PresentationIcon } from "lucide-react";
import { useRef, useState, type DragEvent } from "react";

const TTL_CHOICES = [
  { label: "8 hours", seconds: 8 * 60 * 60 },
  { label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { label: "30 days", seconds: MAX_TTL_SECONDS },
] as const;

const DEFAULT_TTL_SECONDS = 8 * 60 * 60;

export interface SharedDeck {
  link: RoomLink;
  /** Deadline the server fixed when it accepted the upload. */
  expiresAt: number;
  presentation: PreparedDeck["presentation"];
  name: string;
}

type Phase = "idle" | "preparing" | "uploading";

interface ShareScreenProps {
  onShared: (shared: SharedDeck) => void;
  onSelectRecentRoom?: (room: RecentRoom) => void;
  fadeOut?: boolean;
  entering?: boolean;
}

function ShareActions({
  phase,
  disabled,
  slideCount,
  onShare,
}: {
  phase: Phase;
  disabled: boolean;
  slideCount?: number;
  onShare: () => void;
}) {
  const uploading = phase === "uploading";

  return (
    <div className="flex items-center gap-3">
      <Button className="flex-1" disabled={disabled} onClick={onShare}>
        {uploading ? (
          <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
        ) : (
          <PresentationIcon aria-hidden="true" />
        )}
        {uploading ? "Uploading…" : "Share"}
      </Button>
      <span aria-live="polite" className="text-xs text-muted-foreground">
        {phase === "preparing"
          ? "Preparing and encrypting…"
          : uploading
            ? "Uploading…"
            : slideCount !== undefined
              ? `${slideCount} slides ready`
              : ""}
      </span>
    </div>
  );
}

export function ShareScreen({
  onShared,
  onSelectRecentRoom,
  fadeOut = false,
  entering = false,
}: ShareScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [deck, setDeck] = useState<PreparedDeck | null>(null);
  const [name, setName] = useState(suggestName);
  const [ttlSeconds, setTtlSeconds] = useState<number>(DEFAULT_TTL_SECONDS);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const select = async (file: File) => {
    setError(null);
    setFileLabel(`${file.name} · ${(file.size / (1024 * 1024)).toFixed(1)} MB`);
    setPhase("preparing");
    try {
      setDeck(await prepareDeck(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn't read that deck.");
    } finally {
      setPhase("idle");
    }
  };

  const share = async () => {
    if (!deck || !name.trim()) return;
    setError(null);
    setPhase("uploading");
    try {
      const room = await shareDeck(deck, ttlSeconds);
      rememberName(name.trim());
      onShared({
        link: room,
        expiresAt: room.expiresAt,
        presentation: deck.presentation,
        name: name.trim(),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? `Couldn't upload the slide: ${cause.message}`
          : "Couldn't upload the slide. Check your connection and try again.",
      );
      setPhase("idle");
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void select(file);
  };

  const busy = phase !== "idle";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 sm:p-8 lg:flex-row">
      <Card
        className="t-home-card w-full max-w-md gap-4 py-5 lg:shrink-0"
        data-fading-out={fadeOut ? "true" : undefined}
        data-entering={entering ? "true" : undefined}
      >
        <CardHeader>
          <CardTitle className="text-base">Share presentation</CardTitle>
          <CardDescription>
            The slide is encrypted end-to-end. No one aside from the people you share the link with
            can view it, even the server.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className="rounded-lg"
          >
            <button
              type="button"
              className={cn(
                "flex w-full flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground transition-colors hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50",
                dragging ? "border-primary bg-accent" : "border-input",
              )}
              aria-label="Choose a .pptx file"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {phase === "preparing" ? (
                <LoaderCircleIcon className="size-5 animate-spin" aria-hidden="true" />
              ) : (
                <FileUpIcon className="size-5" aria-hidden="true" />
              )}
              <span className="font-medium text-foreground">Choose a .pptx</span>
              <span>
                {fileLabel ?? `or drop it here · up to ${MAX_FILE_BYTES / 1024 / 1024} MB`}
              </span>
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".pptx"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void select(file);
                event.target.value = "";
              }}
            />
          </div>

          {deck && (
            <div className="h-48 overflow-hidden rounded-lg border sm:h-60">
              <SlideView presentation={deck.presentation} index={0} stageRef={stageRef} />
            </div>
          )}
          {phase === "preparing" && !deck && <Skeleton className="h-40 w-full rounded-lg" />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="display-name">Your name</Label>
            <Input
              id="display-name"
              value={name}
              maxLength={40}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Shown to everyone in the room"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="keep-available">Keep this presentation available for</Label>
            <select
              id="keep-available"
              value={ttlSeconds}
              disabled={busy}
              onChange={(event) => setTtlSeconds(Number(event.target.value))}
              className="h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
            >
              {TTL_CHOICES.map((choice) => (
                <option key={choice.seconds} value={choice.seconds}>
                  {choice.label}
                </option>
              ))}
            </select>{" "}
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          <ShareActions
            phase={phase}
            disabled={!deck || !name.trim() || busy}
            slideCount={deck?.presentation.slides.length}
            onShare={() => void share()}
          />
        </CardContent>
      </Card>
      <RecentPresentations
        onSelectRoom={onSelectRecentRoom}
        fadeOut={fadeOut}
        entering={entering}
      />
    </main>
  );
}
