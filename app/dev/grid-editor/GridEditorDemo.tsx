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
const room = (id: string, title: string, level: string, x: number, z: number, w: number, d: number, bg: string | null = null, metadata: Record<string, unknown> = {}): Room => ({
  id,
  palace_id: palace.id,
  user_id: "demo",
  title,
  background: bg,
  metadata,
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
  room("r-hall", "Entrance hall", "lvl-0", 0, 0, 6, 4, "#4255ff"),
  room("r-lib", "Library", "lvl-0", 6, 0, 5, 7, "#3ddc97"),
  room("r-kit", "Kitchen", "lvl-0", 0, 4, 6, 3),
  // Not touching the library: use "Connect rooms" to try the hallway option.
  room("r-garden", "Garden room", "lvl-0", 14, 1, 5, 5, "#f59e0b"),
  // A ready-made corridor (metadata.kind = "hallway") from the kitchen to the bedroom.
  room("r-hw1", "Hallway 1", "lvl-0", 2, 7, 1.5, 3, null, { kind: "hallway" }),
  room("r-bed", "Bedroom", "lvl-0", 0, 10, 5, 4, "#ec4899"),
  room("r-study", "Study", "lvl-1", 0, 0, 5, 4, "#a78bfa"),
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
  // Kitchen -> hallway -> bedroom (door at the kitchen end, archway at the bedroom end).
  op("o-6", "r-kit", "north", 2.75 / 6, 0.9, "r-hw1"),
  op("o-7", "r-hw1", "south", 0.5, 0.9, "r-kit"),
  op("o-8", "r-hw1", "north", 0.5, 1.2, "r-bed", "archway"),
  op("o-9", "r-bed", "south", 2.75 / 5, 1.2, "r-hw1", "archway"),
];

export function GridEditorDemo() {
  const [backend] = useState(() => createMemoryBackend({ palace, levels, rooms, openings }));
  return <GridEditor palace={palace} initialLevels={levels} initialRooms={rooms} initialOpenings={openings} backend={backend} />;
}
