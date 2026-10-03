import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PresentationData } from "@aiden0z/pptx-renderer";
import { PresentationIcon } from "lucide-react";
import { fetchRoomMetadata, loadDeck } from "@/crypto";
import { cn } from "@/lib/utils";
import type { RoomMetadata } from "@/protocol";
import { SlideView } from "@/slide-view";

export function SlidePlaceholder({ loading }: { loading?: boolean }) {
  return (
    <div
      className={cn(
        "flex size-full items-center justify-center text-muted-foreground",
        loading && "animate-pulse",
      )}
    >
      <PresentationIcon className="size-8" aria-hidden="true" />
    </div>
  );
}

export interface PresentationPreviewProps {
  roomId: string;
  secret: string;
  name?: string | null;
  expiresAt?: number | null;
  deck?: PresentationData | null;
  lazy?: boolean;
  className?: string;
  onDeckLoaded?: (deck: PresentationData) => void;
  onMetaLoaded?: (meta: RoomMetadata) => void;
}

function PresentationDetails({
  name,
  expiresAt,
  slideCount,
  expired,
}: Pick<PresentationPreviewProps, "name" | "expiresAt"> & {
  slideCount?: number;
  expired: boolean;
}) {
  const expiration = expiresAt ? new Date(expiresAt) : null;

  return (
    <>
      {name ? (
        <p className="mt-1.5 truncate text-sm font-medium" title={name}>
          {name}
        </p>
      ) : (
        <div className="mt-1.5 h-5 w-3/4 animate-pulse rounded bg-muted" />
      )}
      {expiration ? (
        <p className="text-xs text-muted-foreground">
          {slideCount ? `${slideCount} ${slideCount === 1 ? "slide" : "slides"} · ` : ""}
          {expired ? "Expired" : "Expires"}{" "}
          <time dateTime={expiration.toISOString()}>
            {expiration.toLocaleString(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </time>
        </p>
      ) : (
        <div className="mt-1 h-3.5 w-1/2 animate-pulse rounded bg-muted" />
      )}
    </>
  );
}

export function PresentationPreview({
  roomId,
  secret,
  name,
  expiresAt,
  deck,
  lazy = false,
  className,
  onDeckLoaded,
  onMetaLoaded,
}: PresentationPreviewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const onDeckLoadedRef = useRef(onDeckLoaded);
  const onMetaLoadedRef = useRef(onMetaLoaded);

  useLayoutEffect(() => {
    onDeckLoadedRef.current = onDeckLoaded;
    onMetaLoadedRef.current = onMetaLoaded;
  }, [onDeckLoaded, onMetaLoaded]);

  const [internalDeck, setInternalDeck] = useState<PresentationData | null>(null);
  const [loadingDeck, setLoadingDeck] = useState(false);
  const [meta, setMeta] = useState<RoomMetadata | null>(null);
  const [now, setNow] = useState(Date.now);

  const activeDeck = deck ?? internalDeck;
  const displayName = name ?? meta?.name;
  const displayExpiresAt = expiresAt ?? meta?.expiresAt;
  const expired =
    displayExpiresAt !== undefined && displayExpiresAt !== null && displayExpiresAt <= now;
  const slideCount = meta?.slideCount ?? activeDeck?.slides.length;

  useEffect(() => {
    if (!displayExpiresAt || expired) return;
    const delay = Math.min(Math.max(0, displayExpiresAt - Date.now()), 2_147_483_647);
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [displayExpiresAt, expired]);

  // Fetch metadata if not provided upfront.
  useEffect(() => {
    if (name && expiresAt) return;
    const controller = new AbortController();
    fetchRoomMetadata(roomId, controller.signal)
      .then((m) => {
        if (!controller.signal.aborted && m) {
          setMeta(m);
          onMetaLoadedRef.current?.(m);
        }
      })
      .catch(() => {
        // Unavailable metadata leaves placeholders in place.
      });
    return () => controller.abort();
  }, [roomId, name, expiresAt]);

  // Load deck if not already provided and not expired.
  useEffect(() => {
    if (deck || expired) return;
    const frame = frameRef.current;
    if (!frame) return;

    const controller = new AbortController();

    const fetchDeck = () => {
      setLoadingDeck(true);
      loadDeck({ roomId, secret }, controller.signal)
        .then((loaded) => {
          if (!controller.signal.aborted) {
            setInternalDeck(loaded);
            setLoadingDeck(false);
            onDeckLoadedRef.current?.(loaded);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setLoadingDeck(false);
          }
        });
    };

    if (lazy) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          observer.disconnect();
          fetchDeck();
        },
        { rootMargin: "200px" },
      );
      observer.observe(frame);
      return () => {
        observer.disconnect();
        controller.abort();
      };
    }

    fetchDeck();
    return () => controller.abort();
  }, [roomId, secret, deck, expired, lazy]);

  return (
    <div ref={frameRef} className={cn("w-full", className)}>
      <div className="relative aspect-video overflow-hidden rounded-lg border bg-muted">
        {expired ? (
          <SlidePlaceholder />
        ) : activeDeck ? (
          <SlideView presentation={activeDeck} index={0} stageRef={stageRef} />
        ) : (
          <SlidePlaceholder loading={loadingDeck || !deck} />
        )}
        {expired && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30 px-3 text-center text-sm font-medium text-white">
            Presentation Expired
          </div>
        )}
      </div>
      <PresentationDetails
        name={displayName}
        expiresAt={displayExpiresAt}
        slideCount={slideCount}
        expired={expired}
      />
    </div>
  );
}
