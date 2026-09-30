import { useEffect, useRef, useState } from "react";
import { LoaderCircleIcon } from "lucide-react";
import { loadDeck, type PreparedDeck } from "@/crypto";
import { readRoomLink, roomUrl } from "@/links";
import type { RoomLink } from "@/protocol";
import { rememberName } from "@/identity";
import { JoinScreen } from "@/components/join-screen";
import { RoomView } from "@/components/room-view";
import { ShareScreen, type SharedDeck } from "@/components/share-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";

const ROOM_PATH = "/r/";

/** A room-looking path that does not parse means the link was truncated. */
function isBrokenRoomPath() {
  return location.pathname.startsWith(ROOM_PATH) && readRoomLink() === null;
}

function HomeLink() {
  return (
    <Button asChild variant="outline" className="w-full">
      <a href="/">Back to start</a>
    </Button>
  );
}

function NoticeScreen({ title, detail }: { title: string; detail: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm gap-4 py-5">
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
        <CardContent>
          <HomeLink />
        </CardContent>
      </Card>
    </main>
  );
}

function LoadingScreen() {
  return (
    <main
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-sm text-muted-foreground"
    >
      <LoaderCircleIcon className="size-5 animate-spin" aria-hidden="true" />
      Decrypting the presentation…
    </main>
  );
}

function LiveSlides() {
  const [link, setLink] = useState<RoomLink | null>(() => readRoomLink());
  const [name, setName] = useState<string | null>(null);
  const [deck, setDeck] = useState<PreparedDeck["presentation"] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const enteredFromShare = useRef(false);

  useEffect(() => {
    const onPopState = () => {
      enteredFromShare.current = false;
      setLink(readRoomLink());
      setName(null);
      setDeck(null);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!link || !name || deck) return;
    const controller = new AbortController();
    setLoadError(null);
    loadDeck(link, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setDeck(loaded);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setLoadError(cause instanceof Error ? cause.message : "Couldn't open this presentation.");
        }
      });
    return () => controller.abort();
  }, [link, name, deck]);

  const onShared = ({ link: shared, presentation, name: hostName }: SharedDeck) => {
    history.pushState(null, "", roomUrl(shared));
    enteredFromShare.current = true;
    setLink(shared);
    setName(hostName);
    setLoadError(null);
    setDeck(presentation);
  };

  const leaveRoom = () => {
    if (enteredFromShare.current) history.back();
    else history.replaceState(null, "", "/");
    enteredFromShare.current = false;
    setLink(null);
    setName(null);
    setDeck(null);
  };

  const join = (chosen: string) => {
    rememberName(chosen);
    setName(chosen);
  };

  if (!link) {
    return isBrokenRoomPath() ? (
      <NoticeScreen
        title="This link is incomplete"
        detail="The room address in this link is truncated. Ask for the full link and open it again."
      />
    ) : (
      <ShareScreen onShared={onShared} />
    );
  }

  if (loadError) {
    return <NoticeScreen title="Couldn't open this presentation" detail={loadError} />;
  }

  if (!name) return <JoinScreen onJoin={join} />;
  if (!deck) return <LoadingScreen />;

  return <RoomView link={link} name={name} presentation={deck} onExit={leaveRoom} />;
}

export function App() {
  return (
    <TooltipProvider>
      <LiveSlides />
    </TooltipProvider>
  );
}
