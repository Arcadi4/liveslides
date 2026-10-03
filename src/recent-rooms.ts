import type { RoomLink } from "@/protocol";

const COOKIE_PREFIX = "liveslides_recent_v1_";
const KEY_STORAGE = "liveslides:history-key:v1";
const HISTORY_LIMIT = 3;
// History outlives the room so expired presentations remain recognizable.
const HISTORY_MAX_AGE = 180 * 24 * 60 * 60;

export interface RecentRoom extends RoomLink {
  name: string;
  expiresAt: number;
  joinedAt: number;
}

function encode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function decode(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

async function encrypt(value: string, key: CryptoKey): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)),
  );
  const bytes = new Uint8Array(iv.length + ciphertext.length);
  bytes.set(iv);
  bytes.set(ciphertext, iv.length);
  return encode(bytes);
}

async function decrypt(value: string, key: CryptoKey): Promise<string> {
  const bytes = decode(value);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.subarray(0, 12) },
    key,
    bytes.subarray(12),
  );
  return new TextDecoder().decode(plaintext);
}

/** Only ciphertext travels in cookies; the wrapping key never leaves browser storage. */
async function historyKey(create: boolean): Promise<CryptoKey | null> {
  let stored = localStorage.getItem(KEY_STORAGE);
  if (!stored && create) {
    stored = encode(crypto.getRandomValues(new Uint8Array(16)));
    localStorage.setItem(KEY_STORAGE, stored);
  }
  return stored
    ? crypto.subtle.importKey("raw", decode(stored), "AES-GCM", false, ["encrypt", "decrypt"])
    : null;
}

async function readRooms(key: CryptoKey): Promise<RecentRoom[]> {
  const cookies = new Map(
    document.cookie.split("; ").map((cookie) => {
      const separator = cookie.indexOf("=");
      return [cookie.slice(0, separator), cookie.slice(separator + 1)];
    }),
  );
  const rooms = await Promise.all(
    Array.from({ length: HISTORY_LIMIT }, async (_, index) => {
      try {
        const value = cookies.get(`${COOKIE_PREFIX}${index}`);
        if (!value) return null;
        return JSON.parse(await decrypt(value, key)) as RecentRoom;
      } catch {
        // One removed or damaged cookie must not hide the remaining history.
        return null;
      }
    }),
  );
  return rooms
    .filter((room): room is RecentRoom => room !== null)
    .sort((a, b) => b.joinedAt - a.joinedAt);
}

export async function readRecentRooms(): Promise<RecentRoom[]> {
  try {
    const key = await historyKey(false);
    return key ? await readRooms(key) : [];
  } catch {
    return [];
  }
}

let pendingWrite = Promise.resolve();

export function rememberRoom(
  room: Omit<RecentRoom, "joinedAt">,
  joinedAt = Date.now(),
): Promise<void> {
  pendingWrite = pendingWrite.then(async () => {
    try {
      const key = await historyKey(true);
      if (!key) return;
      const previous = await readRooms(key);
      const rooms = [
        { ...room, joinedAt },
        ...previous.filter((entry) => entry.roomId !== room.roomId),
      ]
        .sort((a, b) => b.joinedAt - a.joinedAt)
        .slice(0, HISTORY_LIMIT);
      const values = await Promise.all(
        rooms.map(async (entry) => {
          const value = await encrypt(JSON.stringify(entry), key);
          if (value.length > 3800) throw new Error("History cookie exceeds its size limit.");
          return value;
        }),
      );
      values.forEach((value, index) => {
        document.cookie = `${COOKIE_PREFIX}${index}=${value}; Path=/; Max-Age=${HISTORY_MAX_AGE}; SameSite=Strict${location.protocol === "https:" ? "; Secure" : ""}`;
      });
      window.dispatchEvent(new Event("recent-rooms-change"));
    } catch {
      // Saving history is optional when browser storage is unavailable.
    }
  });
  return pendingWrite;
}
