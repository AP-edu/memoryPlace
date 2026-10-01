"use client";
import { useState } from "react";
import { GridEditor } from "@/components/palace-editor/GridEditor";
import { createMemoryBackend } from "@/components/palace-editor/memoryBackend";
import type { Level, Opening, Palace, Room } from "@/types/database";

const T = "2026-10-01T12:00:00.000Z";
const palace: Palace = {
  id: "demo-palace",
  user_id: "demo",
  title: "Demo palace",
  description: null,
  theme: {},
  visibility: "private",
  grid_snap: 0.5,
  unit: "m",
  created_at: T,
};
const levels: Level[] = [
  { id: "lvl-0", palace_id: palace.id, idx: 0, name: "Ground", elevation: 0, default_height: 3, created_at: T },
  { id: "lvl-1", palace_id: palace.id, idx: 1, name: "Upper floor", elevation: 3, default_height: 2.8, created_at: T },
];
const room = (id: string, title: string, level: string, x: number, z: number, w: number, d: number, bg: string | null = null): Room => ({
  id,
  palace_id: palace.id,
  user_id: "demo",
  title,
  background: bg,
  metadata: {},
  width: w,
  depth: d,
  height: 3,
  level_id: level,
  pos_x: x,
  pos_z: z,
  rotation: 0,
  outline: null,
  created_at: T,
});
const rooms: Room[] = [
  room("r-hall", "Entrance hall", "lvl-0", 0, 0, 6, 4, "#e8dcc8"),
  room("r-lib", "Library", "lvl-0", 6, 0, 5, 7, "#cfd4c0"),
  room("r-kit", "Kitchen", "lvl-0", 0, 4, 6, 3),
  room("r-study", "Study", "lvl-1", 0, 0, 5, 4, "#c9d1d8"),
];
const op = (id: string, roomId: string, wall: Opening["wall"], offset: number, widthM: number, target: string | null, kind: Opening["kind"] = "door"): Opening => ({
  id,
  room_id: roomId,
  wall,
  wall_offset: offset,
  width: 0,
  width_m: widthM,
  kind,
  target_room_id: target,
  created_at: T,
});
const openings: Opening[] = [
  op("o-1", "r-hall", "east", 0.5, 0.9, "r-lib"),
  op("o-2", "r-lib", "west", 2 / 7, 0.9, "r-hall"),
  op("o-3", "r-hall", "north", 0.25, 1.2, "r-kit", "archway"),
  op("o-4", "r-kit", "south", 0.25, 1.2, "r-hall", "archway"),
  op("o-5", "r-hall", "south", 0.5, 1.2, null),
];

export function GridEditorDemo() {
  const [backend] = useState(() => createMemoryBackend({ palace, levels, rooms, openings }));
  return <GridEditor palace={palace} initialLevels={levels} initialRooms={rooms} initialOpenings={openings} backend={backend} />;
}
