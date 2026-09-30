import type { RoomLink } from "./protocol";

export function readRoomLink(): RoomLink | null {
  const match = /^\/r\/([a-f0-9]{64})(?:\/([A-Za-z0-9_-]{22}))?\/?$/.exec(location.pathname);
  if (!match) return null;
  return { roomId: match[1]!, hostKey: match[2], secret: location.hash.slice(1) };
}

export function roomUrl(link: RoomLink): string {
  return `${location.origin}/r/${link.roomId}${link.hostKey ? `/${link.hostKey}` : ""}#${link.secret}`;
}
