export const MAX_FILE_BYTES = 50 * 1024 * 1024;

export interface RoomMetadata {
  name: string;
  slideCount: number;
}

export interface Participant {
  id: string;
  name: string;
  color: string;
  role: "host" | "audience";
  detached: boolean;
  slide: number;
}

export type ClientEvent =
  | { type: "navigate"; slide: number }
  | { type: "detach" }
  | { type: "follow" }
  | { type: "cursor"; x: number | null; y: number | null; slide: number };

export type ServerEvent =
  | {
      type: "state";
      selfId: string;
      slide: number;
      participants: Participant[];
      room: RoomMetadata;
    }
  | { type: "presence"; participants: Participant[] }
  | { type: "slide"; slide: number; by: string }
  | { type: "cursor"; id: string; x: number | null; y: number | null; slide: number }
  | { type: "error"; message: string };

export interface RoomLink {
  roomId: string;
  hostKey?: string;
  secret: string;
}
