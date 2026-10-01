// Pure geometry for the 2D grid editor (no React, no DOM) — unit-tested in
// lib/grid.test.ts.
//
// Level coordinates are metres. A room occupies the axis-aligned rectangle
// x in [pos_x, pos_x + width], z in [pos_z, pos_z + depth]. North = +z and is
// drawn at the TOP of the screen (screen y = -z). Room-local walls follow
// lib/geometry.ts: north z = depth, south z = 0, east x = width, west x = 0,
// and wall_offset runs 0..1 from the wall's start corner (west end of
// north/south walls, south end of east/west walls) — i.e. always along +x/+z,
// so neighbouring rooms' offsets map linearly onto each other.
//
// v1 assumes rotation = 0 (rotation is stored but not interpreted here).

import type { WallFace } from "@/types/database";

export const EPS = 1e-6;

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface Pt {
  x: number;
  z: number;
}

export const OPPOSITE: Record<WallFace, WallFace> = {
  north: "south",
  south: "north",
  east: "west",
  west: "east",
};

const ALL_WALLS: WallFace[] = ["north", "south", "east", "west"];

/** Round away float noise (e.g. 0.1 + 0.2) to 1e-6 m. */
export function clean(n: number): number {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) ? 0 : r;
}

/** Snap a value to the nearest multiple of `step` (no-op for step <= 0). */
export function snap(value: number, step: number): number {
  if (!(step > 0)) return clean(value);
  return clean(Math.round(value / step) * step);
}

export function snapPoint(p: Pt, step: number): Pt {
  return { x: snap(p.x, step), z: snap(p.z, step) };
}

export function roomRect(room: { pos_x: number; pos_z: number; width: number; depth: number }): Rect {
  return { x: room.pos_x, z: room.pos_z, w: room.width, d: room.depth };
}

/** Normalised rectangle between two (snapped) drag points; null if smaller than `minSize` on either axis. */
export function rectFromDrag(a: Pt, b: Pt, step: number, minSize: number): Rect | null {
  const p = snapPoint(a, step);
  const q = snapPoint(b, step);
  const x = Math.min(p.x, q.x);
  const z = Math.min(p.z, q.z);
  const w = clean(Math.abs(q.x - p.x));
  const d = clean(Math.abs(q.z - p.z));
  if (w + EPS < minSize || d + EPS < minSize) return null;
  return { x, z, w, d };
}

/** True when the rectangles share positive area (touching edges is NOT overlap). */
export function rectsOverlap(a: Rect, b: Rect, eps = EPS): boolean {
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.z < b.z + b.d - eps && b.z < a.z + a.d - eps;
}

export function overlapsAny(r: Rect, others: Rect[]): boolean {
  return others.some((o) => rectsOverlap(r, o));
}

/** Move a rectangle by (dx, dz), snapping its min corner to the grid. */
export function moveRect(orig: Rect, dx: number, dz: number, step: number): Rect {
  return { x: snap(orig.x + dx, step), z: snap(orig.z + dz, step), w: orig.w, d: orig.d };
}

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/**
 * Resize by dragging `handle` to `p` (level coords). Edges snap to the grid and
 * never cross the opposite edge closer than `minSize`. "n" moves the +z edge.
 */
export function resizeRect(orig: Rect, handle: Handle, p: Pt, step: number, minSize: number): Rect {
  let x0 = orig.x;
  let x1 = orig.x + orig.w;
  let z0 = orig.z;
  let z1 = orig.z + orig.d;
  if (handle.includes("e")) x1 = Math.max(snap(p.x, step), x0 + minSize);
  if (handle.includes("w")) x0 = Math.min(snap(p.x, step), x1 - minSize);
  if (handle.includes("n")) z1 = Math.max(snap(p.z, step), z0 + minSize);
  if (handle.includes("s")) z0 = Math.min(snap(p.z, step), z1 - minSize);
  return { x: clean(x0), z: clean(z0), w: clean(x1 - x0), d: clean(z1 - z0) };
}

/** A wall in level coordinates: it runs along `axis` from `from` to `to` at `fixed` on the other axis. */
export interface WallSeg {
  wall: WallFace;
  axis: "x" | "z";
  fixed: number;
  from: number;
  to: number;
}

export function wallSeg(r: Rect, wall: WallFace): WallSeg {
  switch (wall) {
    case "north":
      return { wall, axis: "x", fixed: r.z + r.d, from: r.x, to: r.x + r.w };
    case "south":
      return { wall, axis: "x", fixed: r.z, from: r.x, to: r.x + r.w };
    case "east":
      return { wall, axis: "z", fixed: r.x + r.w, from: r.z, to: r.z + r.d };
    case "west":
      return { wall, axis: "z", fixed: r.x, from: r.z, to: r.z + r.d };
  }
}

export function wallLen(r: Rect, wall: WallFace): number {
  return wall === "north" || wall === "south" ? r.w : r.d;
}

export interface SharedWall {
  wallA: WallFace;
  wallB: WallFace;
  /** Overlap along the wall axis, in level coordinates. */
  from: number;
  to: number;
}

/** Wall segments where `a` and `b` touch (e.g. a's east wall = b's west wall), with positive overlap length. */
export function sharedWalls(a: Rect, b: Rect, eps = 1e-4): SharedWall[] {
  const out: SharedWall[] = [];
  for (const wallA of ALL_WALLS) {
    const wallB = OPPOSITE[wallA];
    const sa = wallSeg(a, wallA);
    const sb = wallSeg(b, wallB);
    if (Math.abs(sa.fixed - sb.fixed) > eps) continue;
    const from = Math.max(sa.from, sb.from);
    const to = Math.min(sa.to, sb.to);
    if (to - from > eps) out.push({ wallA, wallB, from: clean(from), to: clean(to) });
  }
  return out;
}

/** Position along a wall (metres from the wall's start corner) -> world coordinate along its axis, and back. */
export function alongToWorld(r: Rect, wall: WallFace, along: number): number {
  return wallSeg(r, wall).from + along;
}

export interface WallHit {
  wall: WallFace;
  /** Metres from the wall's start corner. */
  along: number;
  /** 0..1 along the wall. */
  offset: number;
  distance: number;
}

/** Nearest wall of `r` within `tol` metres of `p` (point must project onto the wall). */
export function hitWall(p: Pt, r: Rect, tol: number): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of ALL_WALLS) {
    const s = wallSeg(r, wall);
    const alongWorld = s.axis === "x" ? p.x : p.z;
    const across = s.axis === "x" ? p.z : p.x;
    if (alongWorld < s.from - EPS || alongWorld > s.to + EPS) continue;
    const distance = Math.abs(across - s.fixed);
    if (distance > tol) continue;
    const len = s.to - s.from;
    const along = Math.min(len, Math.max(0, alongWorld - s.from));
    if (!best || distance < best.distance) {
      best = { wall, along, offset: len > 0 ? along / len : 0, distance };
    }
  }
  return best;
}

/** Clamp an opening of `widthM` centred at `center` into [lo, hi] (all along the same axis). */
function clampCenter(center: number, widthM: number, lo: number, hi: number): number {
  const half = widthM / 2;
  if (hi - lo <= widthM) return (lo + hi) / 2;
  return Math.min(hi - half, Math.max(lo + half, center));
}

export interface PlacementRoom {
  id: string;
  rect: Rect;
}

export interface OpeningPlan {
  roomId: string;
  wall: WallFace;
  /** 0..1 along the wall (centre of the opening). */
  offset: number;
  widthM: number;
  /** Set when the opening sits on a wall shared with an adjacent room. */
  link: { roomId: string; wall: WallFace; offset: number } | null;
}

/**
 * Plan a door/archway clicked at `along` metres on `wall` of `roomId`.
 * The centre snaps to the grid and is clamped so the opening fits on the wall.
 * If the click falls on a stretch of wall shared with an adjacent room (on the
 * same level), the opening is clamped into that shared stretch and linked: the
 * returned `link` is where the mirror opening goes on the neighbour.
 */
export function planOpening(
  rooms: PlacementRoom[],
  roomId: string,
  wall: WallFace,
  along: number,
  widthM: number,
  step: number
): OpeningPlan | null {
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return null;
  const seg = wallSeg(self.rect, wall);
  const len = seg.to - seg.from;
  if (len <= EPS) return null;
  const width = Math.min(widthM, len);
  const clickWorld = seg.from + Math.min(len, Math.max(0, along));
  let centerWorld = seg.from + snap(clickWorld - seg.from, step);

  // Prefer a shared stretch containing the click.
  let neighbour: { room: PlacementRoom; shared: SharedWall } | null = null;
  for (const other of rooms) {
    if (other.id === roomId) continue;
    for (const sw of sharedWalls(self.rect, other.rect)) {
      if (sw.wallA !== wall) continue;
      if (clickWorld >= sw.from - EPS && clickWorld <= sw.to + EPS && sw.to - sw.from + EPS >= width) {
        neighbour = { room: other, shared: sw };
      }
    }
  }

  if (neighbour) {
    centerWorld = clampCenter(centerWorld, width, neighbour.shared.from, neighbour.shared.to);
  } else {
    centerWorld = clampCenter(centerWorld, width, seg.from, seg.to);
  }
  centerWorld = clean(centerWorld);
  const offset = clean((centerWorld - seg.from) / len);
  const link = neighbour
    ? linkFor(neighbour.room, OPPOSITE[wall], centerWorld)
    : findLinkTarget(rooms, roomId, wall, offset, width);
  return { roomId, wall, offset, widthM: clean(width), link };
}

function linkFor(room: PlacementRoom, wall: WallFace, centerWorld: number) {
  const s = wallSeg(room.rect, wall);
  const len = s.to - s.from;
  return { roomId: room.id, wall, offset: clean(len > 0 ? (centerWorld - s.from) / len : 0.5) };
}

/** World span [from, to] along the wall axis of an opening. */
export function openingSpan(r: Rect, wall: WallFace, offset: number, widthM: number): { from: number; to: number } {
  const s = wallSeg(r, wall);
  const c = s.from + offset * (s.to - s.from);
  return { from: c - widthM / 2, to: c + widthM / 2 };
}

/** Neighbour whose shared wall fully contains the opening, with the mirrored offset on its wall. */
export function findLinkTarget(
  rooms: PlacementRoom[],
  roomId: string,
  wall: WallFace,
  offset: number,
  widthM: number
): { roomId: string; wall: WallFace; offset: number } | null {
  const self = rooms.find((r) => r.id === roomId);
  if (!self) return null;
  const span = openingSpan(self.rect, wall, offset, widthM);
  const center = (span.from + span.to) / 2;
  for (const other of rooms) {
    if (other.id === roomId) continue;
    for (const sw of sharedWalls(self.rect, other.rect)) {
      if (sw.wallA !== wall) continue;
      if (span.from >= sw.from - 1e-4 && span.to <= sw.to + 1e-4) return linkFor(other, OPPOSITE[wall], center);
    }
  }
  return null;
}

export interface LinkableOpening {
  id: string;
  room_id: string;
  wall: WallFace;
  wall_offset: number;
  widthM: number;
  target_room_id: string | null;
}

/** The mirror opening of `op` in its target room (opposite wall, pointing back), nearest by offset. */
export function findPartner<T extends LinkableOpening>(op: T, openings: T[]): T | null {
  if (!op.target_room_id) return null;
  let best: T | null = null;
  let bestDist = Infinity;
  for (const o of openings) {
    if (o.id === op.id || o.room_id !== op.target_room_id) continue;
    if (o.target_room_id !== op.room_id || o.wall !== OPPOSITE[op.wall]) continue;
    const dist = Math.abs(o.wall_offset - op.wall_offset);
    if (dist < bestDist) {
      best = o;
      bestDist = dist;
    }
  }
  return best;
}

export interface OpeningPatch {
  id: string;
  wall_offset?: number;
  target_room_id?: null;
}

/**
 * After `changedRoomId` moved/resized, keep linked openings consistent:
 * - link still valid -> realign the partner's offset onto the shared wall;
 * - link broken (rooms no longer adjacent there) -> clear target on both sides.
 * New links are only created at placement time (planOpening).
 */
export function reconcileLinks(changedRoomId: string, rooms: PlacementRoom[], openings: LinkableOpening[]): OpeningPatch[] {
  const patches = new Map<string, OpeningPatch>();
  const add = (p: OpeningPatch) => patches.set(p.id, { ...patches.get(p.id), ...p });
  for (const o of openings) {
    if (!o.target_room_id) continue;
    if (o.room_id !== changedRoomId && o.target_room_id !== changedRoomId) continue;
    if (patches.has(o.id)) continue;
    const partner = findPartner(o, openings);
    // Evaluate from the changed room's side so its offset stays put.
    const [anchor, mirror] = o.room_id === changedRoomId || !partner ? [o, partner] : [partner, o];
    const link = findLinkTarget(rooms, anchor.room_id, anchor.wall, anchor.wall_offset, anchor.widthM);
    if (link && link.roomId === anchor.target_room_id) {
      if (mirror && Math.abs(mirror.wall_offset - link.offset) > 1e-6) add({ id: mirror.id, wall_offset: link.offset });
    } else {
      add({ id: anchor.id, target_room_id: null });
      if (mirror) add({ id: mirror.id, target_room_id: null });
    }
  }
  return [...patches.values()];
}

/** Grid line positions covering [min, max] for `step`, capped to `maxLines`. */
export function gridLines(min: number, max: number, step: number, maxLines = 400): number[] {
  if (!(step > 0) || max <= min) return [];
  let s = step;
  while ((max - min) / s > maxLines) s *= 2;
  const out: number[] = [];
  for (let v = Math.ceil(min / s) * s; v <= max + EPS; v += s) out.push(clean(v));
  return out;
}

/** Human-readable metres, e.g. 4 -> "4 m", 2.5 -> "2.5 m". */
export function fmtM(n: number): string {
  return `${Math.round(n * 100) / 100} m`;
}
