// Palace-level 3D layout math (pure logic, no React/three.js).
//
// The 3D palace tab shows every room on ONE level. Rooms are authored in
// room-local coords (x∈[0,width], z∈[0,depth], see AGENTS.md); each entry
// carries the world offset of the room's min corner so a scene can place it
// with `<group position>` + the existing room-local RoomShell.

import type { Opening, Room } from "@/types/database";

export interface PalaceRoomEntry {
  room: Room;
  openings: Opening[];
  /** World offset (metres) of the room's min corner on the level plane. */
  offset: { x: number; z: number };
}

export interface PalaceBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  /** Bounding-box centre (world metres). */
  cx: number;
  cz: number;
  /** Longest horizontal side (metres), for camera fit. */
  span: number;
}

/** Locally-drawn rooms not yet confirmed by the backend. */
export function isTempRoomId(id: string): boolean {
  return id.startsWith("tmp-");
}

/**
 * Rooms (with their openings) on one level, in world layout position.
 * `fallbackLevelId` covers rooms with a null level_id (same rule as the 2D
 * grid editor: they belong to the first level).
 */
export function palaceLevelRooms(
  rooms: Room[],
  openings: Opening[],
  levelId: string | null,
  fallbackLevelId: string | null
): PalaceRoomEntry[] {
  const onLevel = rooms.filter((r) => !isTempRoomId(r.id) && (r.level_id ?? fallbackLevelId) === levelId);
  const byRoom = new Map<string, Opening[]>();
  for (const o of openings) {
    if (isTempRoomId(o.room_id)) continue;
    const list = byRoom.get(o.room_id) ?? [];
    list.push(o);
    byRoom.set(o.room_id, list);
  }
  return onLevel.map((room) => ({
    room,
    openings: byRoom.get(room.id) ?? [],
    offset: { x: room.pos_x, z: room.pos_z },
  }));
}

/** Horizontal bounding box over the entries (world metres). Null when empty. */
export function palaceBounds(entries: PalaceRoomEntry[]): PalaceBounds | null {
  if (entries.length === 0) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const { room, offset } of entries) {
    minX = Math.min(minX, offset.x);
    minZ = Math.min(minZ, offset.z);
    maxX = Math.max(maxX, offset.x + room.width);
    maxZ = Math.max(maxZ, offset.z + room.depth);
  }
  return { minX, minZ, maxX, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) };
}

/**
 * Orbit-camera distance that fits `span` metres vertically at `fovDeg`,
 * with padding. World-space; the scene converts with toScene().
 */
export function palaceCameraDistance(span: number, fovDeg = 50, padding = 1.35): number {
  const half = Math.max(span, 1) / 2;
  return (half / Math.tan(((fovDeg * Math.PI) / 180) / 2)) * padding;
}
