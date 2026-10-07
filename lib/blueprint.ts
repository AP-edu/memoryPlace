// Top-down blueprint layout for the printable export (pure, no React).
// Convention (AGENTS.md): x -> right, north (+z) at the TOP, so svgY = maxZ - z.
import { locusWorldPos, openingWidthM, wallLength, wallPoint } from "@/lib/geometry";
import { tourOrder } from "@/lib/scene3d";
import type { Level, Locus, Opening, Room } from "@/types/database";

export interface BlueprintRoom {
  id: string;
  title: string;
  /** 1-based creation order (matches "Room N" in the text blueprint). */
  number: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BlueprintLocus {
  roomId: string;
  /** Position in the room's tour order, 1-based. */
  n: number;
  x: number;
  y: number;
}

export interface BlueprintOpening {
  roomId: string;
  /** Room on the other side of a linked door (null for plain openings). */
  targetRoomId: string | null;
  kind: Opening["kind"];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Blueprint {
  width: number;
  height: number;
  rooms: BlueprintRoom[];
  loci: BlueprintLocus[];
  openings: BlueprintOpening[];
}

const PAD = 1;

/**
 * Lay out the given rooms (already filtered to one level) in SVG metres.
 * `numbering` maps room id -> its 1-based number in the palace room list.
 */
export function layoutBlueprint(
  rooms: Room[],
  loci: Locus[],
  openings: Opening[],
  numbering: Map<string, number>
): Blueprint | null {
  if (rooms.length === 0) return null;
  const minX = Math.min(...rooms.map((r) => r.pos_x));
  const minZ = Math.min(...rooms.map((r) => r.pos_z));
  const maxX = Math.max(...rooms.map((r) => r.pos_x + r.width));
  const maxZ = Math.max(...rooms.map((r) => r.pos_z + r.depth));
  const sx = (x: number) => x - minX + PAD;
  const sy = (z: number) => maxZ - z + PAD;

  const outRooms: BlueprintRoom[] = rooms.map((r) => ({
    id: r.id,
    title: r.title,
    number: numbering.get(r.id) ?? 0,
    x: sx(r.pos_x),
    y: sy(r.pos_z + r.depth),
    w: r.width,
    h: r.depth,
  }));

  const roomById = new Map(rooms.map((r) => [r.id, r]));
  const outLoci: BlueprintLocus[] = [];
  for (const room of rooms) {
    const ordered = tourOrder(loci.filter((l) => l.room_id === room.id));
    ordered.forEach((l, i) => {
      const p = locusWorldPos(l, room);
      outLoci.push({ roomId: room.id, n: i + 1, x: sx(room.pos_x + p.x), y: sy(room.pos_z + p.z) });
    });
  }

  const outOpenings: BlueprintOpening[] = [];
  for (const o of openings) {
    const room = roomById.get(o.room_id);
    if (!room) continue;
    const len = wallLength(o.wall, room);
    if (len <= 0) continue;
    const half = openingWidthM(o, room) / len / 2;
    const a = wallPoint(o.wall, Math.max(0, o.wall_offset - half), room);
    const b = wallPoint(o.wall, Math.min(1, o.wall_offset + half), room);
    outOpenings.push({
      roomId: room.id,
      targetRoomId: o.target_room_id ?? null,
      kind: o.kind,
      x1: sx(room.pos_x + a.x),
      y1: sy(room.pos_z + a.z),
      x2: sx(room.pos_x + b.x),
      y2: sy(room.pos_z + b.z),
    });
  }

  return {
    width: maxX - minX + PAD * 2,
    height: maxZ - minZ + PAD * 2,
    rooms: outRooms,
    loci: outLoci,
    openings: outOpenings,
  };
}

/**
 * Plan for the level the given room is on (rooms without a level belong to the
 * first one), with room numbers in palace creation order. Used by the live
 * minimap in walk mode and the room editor.
 */
export function levelPlanFor(
  rooms: Room[],
  loci: Locus[],
  openings: Opening[],
  levels: Level[],
  currentRoomId: string
): Blueprint | null {
  const real = rooms.filter((r) => !r.id.startsWith("tmp-"));
  const current = real.find((r) => r.id === currentRoomId);
  if (!current) return null;
  const firstLevelId = [...levels].sort((a, b) => a.idx - b.idx)[0]?.id ?? null;
  const levelId = current.level_id ?? firstLevelId;
  const onLevel = real.filter((r) => (r.level_id ?? firstLevelId) === levelId);
  const ids = new Set(onLevel.map((r) => r.id));
  const numbering = new Map(
    [...real].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((r, i) => [r.id, i + 1] as const)
  );
  return layoutBlueprint(
    onLevel,
    loci.filter((l) => ids.has(l.room_id)),
    openings.filter((o) => ids.has(o.room_id)),
    numbering
  );
}

/** A point in a room's local metres (x east, z north) -> plan coordinates. */
export function playerToPlan(room: Pick<BlueprintRoom, "x" | "y" | "h">, p: { x: number; z: number }): { x: number; y: number } {
  return { x: room.x + p.x, y: room.y + room.h - p.z };
}

/**
 * Field-of-view wedge for the minimap: apex at (cx, cy), looking along `yaw`
 * (forward = (sin yaw, cos yaw) in world, i.e. north-up on the plan).
 * Returns three [x, y] points.
 */
export function viewWedge(cx: number, cy: number, yaw: number, len = 2.2, half = 0.6): Array<[number, number]> {
  const edge = (a: number): [number, number] => [cx + len * Math.sin(a), cy - len * Math.cos(a)];
  return [[cx, cy], edge(yaw - half), edge(yaw + half)];
}

/**
 * Which doors on the minimap should be tappable, in paint order (last = on top).
 * A linked door appears twice at the same spot (once per side). From the room
 * you are in, a door that points back at you would swallow the tap meant for
 * the door that leads onward, so those are dropped, and your own room's doors
 * are painted last so they win any remaining overlap.
 */
export function tappableDoors(openings: BlueprintOpening[], currentRoomId: string): BlueprintOpening[] {
  return openings
    .filter((o) => o.targetRoomId && o.targetRoomId !== currentRoomId)
    .sort((a, b) => Number(a.roomId === currentRoomId) - Number(b.roomId === currentRoomId));
}
