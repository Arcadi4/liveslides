import { ShareDialog } from "@/components/share-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ExpiryControl } from "@/components/expiry-control";
import { ParticipantsControl } from "@/components/participants-control";
import { SlidePreviewControl } from "@/components/slide-preview-control";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import { cn } from "@/lib/utils";
import type { Participant, RoomLink } from "@/protocol";
import { Link2Icon, LogOutIcon, Maximize2Icon, Minimize2Icon, UnlinkIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type Status = "connecting" | "connected" | "reconnecting" | "offline";

const STATUS_LABEL: Record<Status, string> = {
  connected: "Live",
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  offline: "Offline",
};

const STATUS_DOT: Record<Status, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500",
  reconnecting: "bg-amber-500",
  offline: "bg-destructive",
};

const STATUS_HINT: Record<Status, string> = {
  connected: "Connected to the room",
  connecting: "Opening the room connection",
  reconnecting: "Lost the connection, retrying",
  offline: "No connection to the room. Slide changes are paused.",
};

interface IconControlProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

function IconControl({ label, onClick, disabled, children }: IconControlProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

interface RoomControlsProps {
  status: Status;
  participants: Participant[];
  self: Participant | undefined;
  slide: number;
  hostSlide: number;
  presentation: PresentationData;
  link: RoomLink;
  expiresAt: number | null;
  canNavigate: boolean;
  onNavigate: (slide: number) => void;
  onDetach: () => void;
  onFollow: () => void;
  onExit: () => void;
}

export function RoomControls({
  status,
  participants,
  self,
  slide,
  hostSlide,
  presentation,
  link,
  expiresAt,
  canNavigate,
  onNavigate,
  onDetach,
  onFollow,
  onExit,
}: RoomControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => {});
  };

  const detached = self?.detached ?? false;
  const deadline =
    expiresAt === null
      ? null
      : new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card className="pointer-events-auto relative z-60 flex w-fit max-w-[calc(100vw-1rem)] flex-row flex-wrap items-center gap-1 rounded-full p-1 shadow-lg">
      <SlidePreviewControl
        presentation={presentation}
        slide={slide}
        hostSlide={hostSlide}
        detached={detached}
        canNavigate={canNavigate}
        onNavigate={onNavigate}
      />

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={detached ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label={detached ? "Follow host's slide" : "Detach to browse slides"}
            aria-pressed={detached}
            disabled={!canNavigate}
            onClick={detached ? onFollow : onDetach}
          >
            {detached ? <UnlinkIcon aria-hidden="true" /> : <Link2Icon aria-hidden="true" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {detached ? "Follow host's slide" : "Detach to browse slides"}
        </TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="rounded-full">
            <Badge variant="outline" className="h-7 gap-1.5 px-2">
              <span
                className={cn("size-1.5 rounded-full", STATUS_DOT[status])}
                aria-hidden="true"
              />
              <span className="text-xs font-normal">{STATUS_LABEL[status]}</span>
            </Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>{STATUS_HINT[status]}</TooltipContent>
      </Tooltip>

      {expiresAt !== null && <ExpiryControl expiresAt={expiresAt} />}

      <ParticipantsControl participants={participants} />

      <ShareDialog link={link} deadline={deadline} />

      <IconControl
        label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        onClick={toggleFullscreen}
      >
        {isFullscreen ? <Minimize2Icon aria-hidden="true" /> : <Maximize2Icon aria-hidden="true" />}
      </IconControl>
      <IconControl label="Leave presentation" onClick={onExit}>
        <LogOutIcon aria-hidden="true" />
      </IconControl>
    </Card>
  );
}
