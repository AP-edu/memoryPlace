import type { Locus, Room, WallFace } from "@/types/database";

// v2 geometry (see migration 20260916131701_palace_v2_geometry.sql).
// World y-up. Room spans x∈[0,width], z∈[0,depth], y∈[0,height].
// Top-down floorplan: x -> right, north (+z) drawn at the TOP (screen y = -z).
// Walls: north (z=depth), south (z=0), east (x=width), west (x=0).
// `wall_offset` runs 0..1 along the wall (see wallSegment for each direction).

export const WALLS: WallFace[] = ["west", "south", "east", "north"];
export const WALL_START: Record<WallFace, { x: number; z: number }> = {
  north: { x: 0, z: 0 }, // west corner -> east
  south: { x: 0, z: 0 }, // west corner -> east
  east: { x: 0, z: 0 }, // north corner -> south
  west: { x: 0, z: 0 }, // north corner -> south
};

export function wallSegment(wall: WallFace, size: { width: number; depth: number }) {
  const { width, depth } = size;
  switch (wall) {
    case "north":
      return { start: { x: 0, z: depth }, end: { x: width, z: depth } };
    case "south":
      return { start: { x: 0, z: 0 }, end: { x: width, z: 0 } };
    case "east":
      return { start: { x: width, z: 0 }, end: { x: width, z: depth } };
    case "west":
      return { start: { x: 0, z: 0 }, end: { x: 0, z: depth } };
  }
}

export function wallLength(wall: WallFace, size: { width: number; depth: number }): number {
  return wall === "east" || wall === "west" ? size.depth : size.width;
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function wallPoint(wall: WallFace, offset: number, size: { width: number; depth: number }) {
  const { start, end } = wallSegment(wall, size);
  const o = clamp01(offset);
  return { x: start.x + (end.x - start.x) * o, z: start.z + (end.z - start.z) * o };
}

// Legacy x/y are floorplan percentages (0..100). Kept so any remaining consumer
// of the old coordinate space still sees something sensible.
export function locusPercent(locus: Pick<Locus, "wall" | "wall_offset" | "x" | "y">, size: { width: number; depth: number }) {
  if (locus.wall && typeof locus.wall_offset === "number") {
    const p = wallPoint(locus.wall, locus.wall_offset, size);
    return { x: (p.x / size.width) * 100, y: (p.z / size.depth) * 100 };
  }
  return { x: locus.x ?? 0, y: locus.y ?? 0 };
}

export function locusWorldPos(locus: Pick<Locus, "wall" | "wall_offset" | "height">, room: Room) {
  const wall = locus.wall ?? "north";
  const offset = typeof locus.wall_offset === "number" ? locus.wall_offset : 0;
  const height = typeof locus.height === "number" ? locus.height : 1.5;
  const p = wallPoint(wall, offset, room);
  return { x: p.x, y: height, z: p.z, wall, wallOffset: offset };
}
// ---------------------------------------------------------------- opening widths
// width_m (metres) is authoritative; legacy rows only have `width` as a
// fraction of the wall length. Every consumer (walk mode, 3D preview, room
// editor, grid editor) goes through these helpers so they agree on units.
export const DEFAULT_OPENING_WIDTH_M = { door: 0.9, archway: 1.2 } as const;

export function openingWidthM(
  op: { wall: WallFace; width?: number | null; width_m?: number | null },
  size: { width: number; depth: number }
): number {
  const len = wallLength(op.wall, size);
  const raw =
    typeof op.width_m === "number" && Number.isFinite(op.width_m) && op.width_m > 0
      ? op.width_m
      : (typeof op.width === "number" && Number.isFinite(op.width) && op.width > 0 ? op.width : 0.2) * len;
  return Math.min(raw, len);
}

/** Half the opening width as a fraction of its wall (0..0.5). */
export function openingHalfFraction(
  op: { wall: WallFace; width?: number | null; width_m?: number | null },
  size: { width: number; depth: number }
): number {
  const len = wallLength(op.wall, size);
  if (len <= 0) return 0;
  return openingWidthM(op, size) / len / 2;
}
