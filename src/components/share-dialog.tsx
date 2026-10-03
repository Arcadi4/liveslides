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
import { QrCode } from "@/components/ui/qr-code";
import { roomUrl } from "@/links";
import type { RoomLink } from "@/protocol";
import { CheckIcon, CopyIcon, Share2Icon } from "lucide-react";
import { useEffect, useState } from "react";

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
  const audienceUrl = roomUrl({ roomId: link.roomId, secret: link.secret });
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Share presentation">
          <Share2Icon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Share this presentation</DialogTitle>
          <DialogDescription>
            The decryption key is part of each link and never reaches the server. Anyone with a link
            can view the deck.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <LinkRow
              id="share-audience-link"
              label="Audience link"
              hint="Viewers follow the shared slide until they detach."
              url={audienceUrl}
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
                Both links will stop working at {deadline}.
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <QrCode
              value={audienceUrl}
              className="size-40 rounded-md border p-1.5"
              aria-label={`QR code for the audience link ${audienceUrl}`}
            />
            <p className="text-xs text-muted-foreground">Scan to join as a viewer</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
