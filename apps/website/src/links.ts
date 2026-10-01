import type { RoomLink } from "./protocol";

export function readRoomLink(): RoomLink | null {
  const match = /^\/r\/([A-Za-z0-9_-]{11})(?:\/([A-Za-z0-9_-]{22}))?\/?$/.exec(location.pathname);
  if (!match) return null;
  return { roomId: match[1]!, hostKey: match[2], secret: location.hash.slice(1) };
}

/** Audience links carry an 11-character room ID and a 22-character AES-128 key in the fragment. */
export function roomUrl(link: RoomLink): string {
  return `${location.origin}/r/${link.roomId}${link.hostKey ? `/${link.hostKey}` : ""}#${link.secret}`;
}
