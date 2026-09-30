import { useState } from "react";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { suggestName } from "@/identity";

interface JoinScreenProps {
  onJoin: (name: string) => void;
}

export function JoinScreen({ onJoin }: JoinScreenProps) {
  const [name, setName] = useState(suggestName);

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <Card className="w-full max-w-sm gap-4 py-5">
        <CardHeader>
          <CardTitle className="text-base">Join presentation</CardTitle>
          <CardDescription>
            The deck is encrypted in your browser and the decryption key travels inside this link.
            Pick a name so others can see your cursor.
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
    </main>
  );
}
