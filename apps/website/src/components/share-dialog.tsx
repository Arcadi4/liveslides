import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { roomUrl } from "@/links";
import type { RoomLink } from "@/protocol";

interface LinkRowProps {
  id: string;
  label: string;
  hint: string;
  url: string;
}

function LinkRow({ id, label, hint, url }: LinkRowProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          readOnly
          value={url}
          onFocus={(event) => event.target.select()}
          className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2.5 py-1.5 font-mono text-xs text-muted-foreground"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

interface ShareDialogProps {
  link: RoomLink;
  /** Formatted deadline of the room this link opens, or null while it is unknown. */
  deadline: string | null;
}

export function ShareDialog({ link, deadline }: ShareDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Share presentation">
          <Share2Icon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share this presentation</DialogTitle>
          <DialogDescription>
            The decryption key is part of each link and never reaches the server. Anyone with a link
            can view the deck.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <LinkRow
            id="share-audience-link"
            label="Audience link"
            hint="Viewers follow the shared slide until they detach."
            url={roomUrl({ roomId: link.roomId, secret: link.secret })}
          />
          {link.hostKey && (
            <LinkRow
              id="share-host-link"
              label="Host link"
              hint="Hosts start out attached and can advance the shared slide."
              url={roomUrl(link)}
            />
          )}

          {deadline && (
            <p className="text-xs text-muted-foreground">
              Both links stop working on {deadline}, and reopening either one then shows the
              presentation as expired. The stored file is queued for deletion right after, which can
              take a little longer if the deletion service fails — anyone who already downloaded the
              deck keeps their own copy.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
