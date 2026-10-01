import { ShareDialog } from "@/components/share-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Participant, RoomLink } from "@/protocol";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  Link2Icon,
  LogOutIcon,
  Maximize2Icon,
  Minimize2Icon,
  TimerIcon,
  UnlinkIcon,
  UsersIcon,
} from "lucide-react";
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
  slideCount: number;
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
  slideCount,
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
  const position = `${slide + 1} / ${slideCount}`;
  const deadline =
    expiresAt === null
      ? null
      : new Date(expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Card className="pointer-events-auto flex w-fit max-w-[calc(100vw-1rem)] flex-row flex-wrap items-center gap-1 rounded-full p-1 shadow-lg">
      <IconControl
        label="Previous slide"
        onClick={() => onNavigate(slide - 1)}
        disabled={!canNavigate || slide === 0}
      >
        <ChevronLeftIcon aria-hidden="true" />
      </IconControl>
      <Badge variant="secondary" className="min-w-14 justify-center font-mono text-xs tabular-nums">
        {position}
      </Badge>
      <IconControl
        label="Next slide"
        onClick={() => onNavigate(slide + 1)}
        disabled={!canNavigate || slide >= slideCount - 1}
      >
        <ChevronRightIcon aria-hidden="true" />
      </IconControl>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <Button
        type="button"
        variant={detached ? "secondary" : "ghost"}
        size="sm"
        className="gap-1.5"
        aria-pressed={detached}
        onClick={detached ? onFollow : onDetach}
      >
        {detached ? <UnlinkIcon aria-hidden="true" /> : <Link2Icon aria-hidden="true" />}
        <span className="hidden sm:inline">{detached ? "Detached" : "Following"}</span>
      </Button>
      {detached && (
        <span className="pr-1 text-xs text-muted-foreground tabular-nums">
          shared: {hostSlide + 1}
        </span>
      )}

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

      {deadline && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} className="rounded-full">
              <Badge variant="outline" className="h-7 gap-1.5 px-2 text-muted-foreground">
                <TimerIcon className="size-3" aria-hidden="true" />
                <span className="max-w-36 truncate text-xs font-normal tabular-nums">
                  {deadline}
                </span>
              </Badge>
            </span>
          </TooltipTrigger>
          <TooltipContent>The room expires at this time</TooltipContent>
        </Tooltip>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Participants, ${participants.length} in room`}
          >
            <span className="relative">
              <UsersIcon aria-hidden="true" />
              <span className="absolute -end-1.5 -top-1.5 rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">
                {participants.length}
              </span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            {participants.length === 1
              ? "1 person in the room"
              : `${participants.length} people in the room`}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {participants.map((participant) => (
            <DropdownMenuItem
              key={participant.id}
              onSelect={(event) => event.preventDefault()}
              className="gap-2"
            >
              <Avatar className="size-6">
                <AvatarFallback
                  className="text-[10px] font-medium text-white"
                  style={{ backgroundColor: participant.color }}
                >
                  {participant.name.trim().slice(0, 2).toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate">{participant.name}</span>
              {participant.role === "host" && (
                <Badge variant="secondary" className="px-1.5 text-[10px]">
                  Host
                </Badge>
              )}
              <Badge variant="outline" className="px-1.5 text-[10px]">
                {participant.detached ? "Detached" : "Following"}
              </Badge>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

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
