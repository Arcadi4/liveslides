import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestName } from "@/identity";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import { PresentationPreview } from "@/components/presentation-preview";
import type { RoomLink } from "@/protocol";
import { cn } from "@/lib/utils";

export interface JoinScreenProps {
  link: RoomLink;
  initialRoomName?: string | null;
  initialExpiresAt?: number | null;
  deck?: PresentationData | null;
  onDeckLoaded?: (deck: PresentationData) => void;
  onJoin: (name: string) => void;
  onBack?: () => void;
  isEntering?: boolean;
}

export function JoinScreen({
  link,
  initialRoomName,
  initialExpiresAt,
  deck,
  onDeckLoaded,
  onJoin,
  onBack,
  isEntering = false,
}: JoinScreenProps) {
  const [name, setName] = useState(suggestName);
  return (
    <main
      className={cn(
        "flex min-h-dvh flex-col items-center justify-center p-4 sm:p-8",
        isEntering && "t-join-page-enter",
      )}
    >
      <Card className="w-full max-w-md gap-4 py-5">
        <CardHeader>
          <CardTitle className="text-base">Join presentation</CardTitle>
          <CardDescription>
            The slides are encrypted end-to-end. Only the people in the room have access to their
            content. Not even the server can read them. Pick a name so other audience members know
            who you are!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = name.trim();
              if (trimmed) onJoin(trimmed);
            }}
          >
            <div className="flex flex-col gap-2">
              <Label>Presentation</Label>
              <PresentationPreview
                roomId={link.roomId}
                secret={link.secret}
                name={initialRoomName}
                expiresAt={initialExpiresAt}
                deck={deck}
                onDeckLoaded={onDeckLoaded}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="join-name">Your name</Label>
              <Input
                id="join-name"
                value={name}
                maxLength={40}
                autoComplete="off"
                autoFocus
                onChange={(event) => setName(event.target.value)}
                placeholder="Shown to everyone in the room"
              />
            </div>
            <div className="flex items-center gap-2">
              {onBack && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Back to home"
                  title="Back to home"
                  onClick={onBack}
                >
                  <ArrowLeftIcon className="size-4" aria-hidden="true" />
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={!name.trim()}>
                Join
                <ArrowRightIcon aria-hidden="true" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
