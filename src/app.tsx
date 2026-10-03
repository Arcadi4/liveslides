import { JoinScreen } from "@/components/join-screen";
import { RoomView } from "@/components/room-view";
import { ShareScreen, type SharedDeck } from "@/components/share-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadDeck, type PreparedDeck } from "@/crypto";
import { rememberName } from "@/identity";
import { readRoomLink, roomUrl } from "@/links";
import type { RecentRoom } from "@/recent-rooms";
import type { RoomLink } from "@/protocol";
import { LoaderCircleIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ROOM_PATH = "/r/";

/**
 * Swap duration for the Home ↔ Join page transition, in ms. Kept in lockstep
 * with --home-transition-dur in style.css: the JS timer unmounts one surface
 * exactly as its animation ends, so the two must agree.
 */
const HOME_TRANSITION_MS = 250;

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
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [expired, setExpired] = useState(false);
  const [isNavigatingToRoom, setIsNavigatingToRoom] = useState(false);
  const [navigatingFromHome, setNavigatingFromHome] = useState(false);
  const [leavingToHome, setLeavingToHome] = useState(false);
  const [enteringHome, setEnteringHome] = useState(false);
  const [initialMeta, setInitialMeta] = useState<{ name?: string; expiresAt?: number } | null>(
    null,
  );
  const enteredFromShare = useRef(false);
  const transitionTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      clearTimeout(transitionTimerRef.current ?? undefined);
    };
  }, []);

  useEffect(() => {
    const onPopState = () => {
      enteredFromShare.current = false;
      setLink(readRoomLink());
      setName(null);
      setExpiresAt(null);
      setExpired(false);
      setDeck(null);
      setInitialMeta(null);
      setIsNavigatingToRoom(false);
      setNavigatingFromHome(false);
      setLeavingToHome(false);
      setEnteringHome(false);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!link || !name || deck || expired) return;
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
  }, [link, name, deck, expired]);

  const onShared = ({
    link: shared,
    expiresAt: deadline,
    presentation,
    name: hostName,
  }: SharedDeck) => {
    history.pushState(null, "", roomUrl(shared));
    enteredFromShare.current = true;
    setLink(shared);
    setName(hostName);
    setLoadError(null);
    setDeck(presentation);
    setExpiresAt(deadline);
    setExpired(false);
  };

  /** Terminal expiry: drop the decrypted deck so nothing keeps rendering or reconnecting. */
  const onExpired = () => {
    setDeck(null);
    setExpired(true);
  };

  const leaveRoom = () => {
    if (enteredFromShare.current) history.back();
    else history.replaceState(null, "", "/");
    enteredFromShare.current = false;
    setLink(null);
    setName(null);
    setDeck(null);
    setExpiresAt(null);
    setExpired(false);
    setInitialMeta(null);
    setIsNavigatingToRoom(false);
    setNavigatingFromHome(false);
    setLeavingToHome(false);
  };

  /**
   * Join → Home. The join form animates out, then the home surfaces animate in
   * from the pose they left on. Mirrors handleSelectRecentRoom, which fades the
   * home out before swapping to the join page.
   */
  const backToHome = () => {
    if (leavingToHome) return;
    setLeavingToHome(true);
    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : HOME_TRANSITION_MS;
    transitionTimerRef.current = setTimeout(() => {
      setEnteringHome(true);
      leaveRoom();
      transitionTimerRef.current = setTimeout(() => setEnteringHome(false), duration);
    }, duration);
  };

  const handleSelectRecentRoom = (room: RecentRoom) => {
    if (isNavigatingToRoom) return;
    setIsNavigatingToRoom(true);
    setInitialMeta({ name: room.name, expiresAt: room.expiresAt });
    setExpiresAt(room.expiresAt);

    // Preload the deck immediately during the fade out transition
    const controller = new AbortController();
    loadDeck(room, controller.signal)
      .then((loaded) => setDeck(loaded))
      .catch(() => {});

    const duration = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : HOME_TRANSITION_MS;

    transitionTimerRef.current = setTimeout(() => {
      history.pushState(null, "", roomUrl(room));
      setLink(room);
      setIsNavigatingToRoom(false);
      setNavigatingFromHome(true);

      transitionTimerRef.current = setTimeout(() => {
        setNavigatingFromHome(false);
      }, duration);
    }, duration);
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
      <ShareScreen
        onShared={onShared}
        onSelectRecentRoom={handleSelectRecentRoom}
        fadeOut={isNavigatingToRoom}
        entering={enteringHome}
      />
    );
  }

  if (loadError) {
    return <NoticeScreen title="Couldn't open this presentation" detail={loadError} />;
  }

  if (expired) {
    return (
      <NoticeScreen
        title="This presentation has expired or is unavailable"
        detail="This room is no longer available. Ask the host to share the presentation again."
      />
    );
  }

  if (!name) {
    return (
      <JoinScreen
        link={link}
        initialRoomName={initialMeta?.name}
        initialExpiresAt={initialMeta?.expiresAt}
        deck={deck}
        onDeckLoaded={setDeck}
        onJoin={join}
        onBack={backToHome}
        isEntering={navigatingFromHome}
        isLeaving={leavingToHome}
      />
    );
  }
  if (!deck) return <LoadingScreen />;

  return (
    <RoomView
      link={link}
      name={name}
      presentation={deck}
      expiresAt={expiresAt}
      onExpired={onExpired}
      onExit={leaveRoom}
    />
  );
}

export function App() {
  return (
    <TooltipProvider>
      <LiveSlides />
    </TooltipProvider>
  );
}
