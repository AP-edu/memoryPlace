import type { Level, Opening, Palace, Room } from "@/types/database";
import { wallLength } from "@/lib/geometry";
import type { EditorBackend } from "./backend";

/** In-memory backend for the dev demo route (no database). Small artificial latency. */
export function createMemoryBackend(seed: { palace: Palace; levels: Level[]; rooms: Room[]; openings: Opening[] }): EditorBackend {
  let palace = { ...seed.palace };
  const levels = new Map(seed.levels.map((l) => [l.id, { ...l }]));
  const rooms = new Map(seed.rooms.map((r) => [r.id, { ...r }]));
  const openings = new Map(seed.openings.map((o) => [o.id, { ...o }]));
  let n = 0;
  const id = (p: string) => `${p}-mem-${++n}`;
  const now = () => new Date().toISOString();
  const wait = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120));
  const must = <T,>(v: T | undefined): T => {
    if (!v) throw new Error("Not found");
    return v;
  };

  return {
    async updatePalace(_id, patch) {
      palace = { ...palace, ...patch };
      return wait(palace);
    },
    async createLevel(input) {
      const level: Level = { id: id("level"), created_at: now(), ...input };
      levels.set(level.id, level);
      return wait(level);
    },
    async updateLevel(levelId, patch) {
      const level = { ...must(levels.get(levelId)), ...patch };
      levels.set(levelId, level);
      return wait(level);
    },
    async deleteLevel(levelId) {
      levels.delete(levelId);
      for (const r of [...rooms.values()]) if (r.level_id === levelId) rooms.delete(r.id);
      await wait(null);
    },
    async createRoom(input) {
      const room: Room = {
        id: id("room"),
        user_id: "demo",
        background: null,
        metadata: {},
        rotation: 0,
        outline: null,
        created_at: now(),
        ...input,
      };
      rooms.set(room.id, room);
      return wait(room);
    },
    async updateRoom(roomId, patch) {
      const room = { ...must(rooms.get(roomId)), ...patch };
      rooms.set(roomId, room);
      return wait(room);
    },
    async deleteRoom(roomId) {
      rooms.delete(roomId);
      for (const o of [...openings.values()]) {
        if (o.room_id === roomId) openings.delete(o.id);
        else if (o.target_room_id === roomId) openings.set(o.id, { ...o, target_room_id: null });
      }
      await wait(null);
    },
    async createOpening(input) {
      const room = must(rooms.get(input.room_id));
      const opening: Opening = {
        id: id("opening"),
        created_at: now(),
        width: input.width_m / wallLength(input.wall, room),
        ...input,
      };
      openings.set(opening.id, opening);
      return wait(opening);
    },
    async updateOpening(openingId, patch) {
      const opening = { ...must(openings.get(openingId)), ...patch };
      openings.set(openingId, opening);
      return wait(opening);
    },
    async deleteOpening(openingId) {
      openings.delete(openingId);
      await wait(null);
    },
  };
}
