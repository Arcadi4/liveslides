import { TransitionPopover } from "@/components/transition-popover";
import { useHoverDisclosure } from "@/components/use-hover-disclosure";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AvatarCircles } from "@/components/ui/avatar-circles";
import type { Participant } from "@/protocol";

/** Circles rendered before the rest collapse into MagicUI's overflow count. */
const MAX_CIRCLES = 3;

/** Two-letter monogram: rooms carry no avatar images, only names and colours. */
function participantInitials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase() || "?";
}

/**
 * Rooms carry no avatar images, so each circle is an inline SVG of the
 * participant's initials on their colour — the same mark the roster shows.
 */
function monogramUrl(participant: Participant): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="${participant.color}"/><text x="24" y="24" dy="0.36em" text-anchor="middle" font-family="system-ui, sans-serif" font-size="20" font-weight="500" fill="#fff">${participantInitials(participant.name)}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface ParticipantsControlProps {
  participants: Participant[];
}

/**
 * The room roster: MagicUI's avatar circles, which reveal the same participant
 * list on hover and on click. The circles are the control — no button chrome
 * around them.
 */
export function ParticipantsControl({ participants }: ParticipantsControlProps) {
  const disclosure = useHoverDisclosure();
  const visible = participants.slice(0, MAX_CIRCLES);

  return (
    <TransitionPopover
      open={disclosure.open}
      onOpenChange={disclosure.onOpenChange}
      origin="bottom-right"
      align="end"
      className="w-64 p-1"
      contentProps={disclosure.surface}
      trigger={
        <div
          role="button"
          tabIndex={0}
          aria-label={`Participants, ${participants.length} in the room`}
          className="t-avatar rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          {...disclosure.trigger}
        >
          <AvatarCircles
            // Registry defaults are 40px circles stacked 16px apart; the control
            // bar needs a denser row.
            className="-space-x-2 [&>a]:size-6 [&_img]:size-6"
            numPeople={participants.length - visible.length}
            avatarUrls={visible.map((participant) => ({
              imageUrl: monogramUrl(participant),
              profileUrl: "",
            }))}
          />
        </div>
      }
    >
      <p className="px-2 py-1.5 text-xs text-muted-foreground">
        {participants.length === 1
          ? "1 person in the room"
          : `${participants.length} people in the room`}
      </p>
      <ul className="flex flex-col">
        {participants.map((participant) => (
          <li
            key={participant.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm"
          >
            <Avatar className="size-6">
              <AvatarFallback
                className="text-[10px] font-medium text-white"
                style={{ backgroundColor: participant.color }}
              >
                {participantInitials(participant.name)}
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
          </li>
        ))}
      </ul>
    </TransitionPopover>
  );
}
