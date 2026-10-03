import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestName } from "@/identity";
import { ArrowRightIcon } from "lucide-react";
import { useState } from "react";
import { RecentPresentations } from "@/components/recent-presentations";

interface JoinScreenProps {
  onJoin: (name: string) => void;
}

export function JoinScreen({ onJoin }: JoinScreenProps) {
  const [name, setName] = useState(suggestName);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-4 sm:p-8 lg:flex-row">
      <Card className="w-full max-w-sm gap-4 py-5 lg:shrink-0">
        <CardHeader>
          <CardTitle className="text-base">Join presentation</CardTitle>
          <CardDescription>
            The slide in encrypted end-to-end. Only the people in the room have access to its
            content. Not even the server can read it. Pick a name so othre audiences know who you
            are!
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
            <Button type="submit" disabled={!name.trim()}>
              Join
              <ArrowRightIcon aria-hidden="true" />
            </Button>
          </form>
        </CardContent>
      </Card>
      <RecentPresentations />
    </main>
  );
}
