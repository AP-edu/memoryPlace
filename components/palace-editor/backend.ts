import type { Level, Opening, OpeningKind, Palace, Room, WallFace } from "@/types/database";

// Persistence boundary for the grid editor. The real app uses httpBackend
// (the /api routes); the dev demo route uses an in-memory backend so the
// editor can run without a database.

export type RoomPatch = Partial<
  Pick<Room, "title" | "pos_x" | "pos_z" | "width" | "depth" | "height" | "level_id" | "background">
>;
export type OpeningPatch = Partial<Pick<Opening, "wall_offset" | "kind" | "target_room_id">> & { width_m?: number };
export type LevelPatch = Partial<Pick<Level, "name" | "idx" | "elevation" | "default_height">>;

export interface NewRoom {
  palace_id: string;
  level_id: string;
  title: string;
  pos_x: number;
  pos_z: number;
  width: number;
  depth: number;
  height: number;
}

export interface NewOpening {
  room_id: string;
  wall: WallFace;
  wall_offset: number;
  width_m: number;
  kind: OpeningKind;
  target_room_id: string | null;
}

export interface NewLevel {
  palace_id: string;
  name: string;
  idx: number;
  elevation: number;
  default_height: number;
}

export interface EditorBackend {
  updatePalace(id: string, patch: { grid_snap?: number }): Promise<Palace>;
  createLevel(input: NewLevel): Promise<Level>;
  updateLevel(id: string, patch: LevelPatch): Promise<Level>;
  deleteLevel(id: string): Promise<void>;
  createRoom(input: NewRoom): Promise<Room>;
  updateRoom(id: string, patch: RoomPatch): Promise<Room>;
  deleteRoom(id: string): Promise<void>;
  createOpening(input: NewOpening): Promise<Opening>;
  updateOpening(id: string, patch: OpeningPatch): Promise<Opening>;
  deleteOpening(id: string): Promise<void>;
}

async function call<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = "Request failed";
    try {
      const json = (await res.json()) as { error?: string };
      if (json?.error) message = json.error;
    } catch {
      // keep generic message
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export const httpBackend: EditorBackend = {
  updatePalace: (id, patch) => call(`/api/palaces/${id}`, "PUT", patch),
  createLevel: (input) => call("/api/levels", "POST", input),
  updateLevel: (id, patch) => call(`/api/levels/${id}`, "PUT", patch),
  deleteLevel: async (id) => {
    await call(`/api/levels/${id}`, "DELETE");
  },
  createRoom: (input) => call("/api/rooms", "POST", input),
  updateRoom: (id, patch) => call(`/api/rooms/${id}`, "PUT", patch),
  deleteRoom: async (id) => {
    await call(`/api/rooms/${id}`, "DELETE");
  },
  createOpening: (input) => call("/api/openings", "POST", input),
  updateOpening: (id, patch) => call(`/api/openings/${id}`, "PUT", patch),
  deleteOpening: async (id) => {
    await call(`/api/openings/${id}`, "DELETE");
  },
};
