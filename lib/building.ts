// The palace as one building (pure logic, no React/three).
//
// Rooms are authored independently (room-local coords, see AGENTS.md), but on
// a level they sit side by side: neighbours share wall lines and linked doors.
// Walk mode and the 3D model render every room on the level at once, so they
// need to know which stretches of wall are shared (drawn as a thin skin per
// side instead of two full-thickness walls poking into each other), which
// room draws a shared door's frame and leaf, and how to carry the walker's
// pose from one room's frame into the next.

import type { Opening, Room, WallFace } from "@/types/database";
import type { Pose } from "./walk";
import { wallPoint } from "./geometry";
import { inwardNormal } from "./scene3d";

/** A stretch of wall in 0..1 offset space (see wallSegment in lib/geometry). */
export interface Span {
  from: number;
  to: number;
}

type Placed = Pick<Room, "id" | "width" | "depth" | "pos_x" | "pos_z">;

/** Walls this close (metres) count as the same line. */
const SAME_LINE = 0.03;
/** Overlaps shorter than this (metres) are corners touching, not a shared wall. */
const MIN_SHARED = 0.05;

const OPPOSITE: Record<WallFace, WallFace> = { north: "south", south: "north", east: "west", west: "east" };

/** A wall as a level-space line: fixed coordinate `at`, running from..to along the other axis. */
export function wallLine(room: Placed, wall: WallFace): { at: number; from: number; to: number } {
  switch (wall) {
    case "north":
      return { at: room.pos_z + room.depth, from: room.pos_x, to: room.pos_x + room.width };
    case "south":
      return { at: room.pos_z, from: room.pos_x, to: room.pos_x + room.width };
    case "east":
      return { at: room.pos_x + room.width, from: room.pos_z, to: room.pos_z + room.depth };
    case "west":
      return { at: room.pos_x, from: room.pos_z, to: room.pos_z + room.depth };
  }
}

/** Sort and merge overlapping spans. */
export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  const out: Span[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && s.from <= last.to + 1e-9) last.to = Math.max(last.to, s.to);
    else out.push({ ...s });
  }
  return out;
}

/**
 * Per wall of `room`, the stretches another room on the same level sits flush
 * against (its opposite wall on the same line). Walls with nothing shared are
 * absent.
 */
export function sharedSpans(room: Placed, others: Placed[]): Partial<Record<WallFace, Span[]>> {
  const out: Partial<Record<WallFace, Span[]>> = {};
  for (const wall of ["north", "south", "east", "west"] as WallFace[]) {
    const line = wallLine(room, wall);
    const len = line.to - line.from;
    if (len <= 0) continue;
    const spans: Span[] = [];
    for (const o of others) {
      if (o.id === room.id) continue;
      const other = wallLine(o, OPPOSITE[wall]);
      if (Math.abs(other.at - line.at) > SAME_LINE) continue;
      const a = Math.max(line.from, other.from);
      const b = Math.min(line.to, other.to);
      if (b - a < MIN_SHARED) continue;
      spans.push({ from: (a - line.from) / len, to: (b - line.from) / len });
    }
    if (spans.length) out[wall] = mergeSpans(spans);
  }
  return out;
}

/**
 * Split a solid wall span into pieces that are shared (skin) or exterior
 * (full wall), in order. Pieces shorter than 1e-6 are dropped.
 */
export function splitSpan(span: Span, shared: Span[] | undefined): Array<Span & { shared: boolean }> {
  if (!shared || shared.length === 0) return [{ ...span, shared: false }];
  const out: Array<Span & { shared: boolean }> = [];
  let cursor = span.from;
  for (const s of shared) {
    const a = Math.max(s.from, span.from);
    const b = Math.min(s.to, span.to);
    if (b <= a) continue;
    if (a > cursor) out.push({ from: cursor, to: a, shared: false });
    out.push({ from: a, to: b, shared: true });
    cursor = b;
  }
  if (cursor < span.to) out.push({ from: cursor, to: span.to, shared: false });
  return out.filter((p) => p.to - p.from > 1e-6);
}

/** True when a point offset (0..1) along a wall falls inside one of the spans. */
export function inSpans(offset: number, spans: Span[] | undefined): boolean {
  return !!spans?.some((s) => offset >= s.from - 1e-6 && offset <= s.to + 1e-6);
}

/**
 * Linked doors are a pair of openings (one per room). Only one side draws the
 * frame and the leaf, or two leaves would swing out of the same doorway.
 * Returns the ids of openings whose twin does the drawing: the pair goes to
 * the room with the smaller id, and a door without a return twin keeps its own.
 */
export function twinFramedOpenings(openings: Pick<Opening, "id" | "room_id" | "target_room_id">[]): Set<string> {
  const out = new Set<string>();
  for (const o of openings) {
    if (!o.target_room_id) continue;
    const twin = openings.find((x) => x.room_id === o.target_room_id && x.target_room_id === o.room_id);
    if (twin && twin.room_id < o.room_id) out.add(o.id);
  }
  return out;
}

/** Where `room` sits relative to `origin` (metres), for drawing it in origin's frame. */
export function roomOffset(room: Pick<Room, "pos_x" | "pos_z">, origin: Pick<Room, "pos_x" | "pos_z">): { x: number; z: number } {
  return { x: room.pos_x - origin.pos_x, z: room.pos_z - origin.pos_z };
}

/** The same spot, re-expressed in another room's frame (walking through a door). */
export function carryPose(pose: Pose, from: Pick<Room, "pos_x" | "pos_z">, to: Pick<Room, "pos_x" | "pos_z">): Pose {
  return { ...pose, x: pose.x + from.pos_x - to.pos_x, z: pose.z + from.pos_z - to.pos_z };
}

/** Rooms on the same level as `room` (null level = the fallback/first level). */
export function sameLevel<R extends Pick<Room, "id" | "level_id">>(rooms: R[], room: Pick<Room, "level_id">, fallbackLevelId: string | null = null): R[] {
  const lv = room.level_id ?? fallbackLevelId;
  return rooms.filter((r) => (r.level_id ?? fallbackLevelId) === lv);
}

/** Level-space bounding box of some rooms, with its centre and longest side. */
export function levelBounds(rooms: Placed[]): { minX: number; minZ: number; maxX: number; maxZ: number; cx: number; cz: number; span: number } | null {
  if (rooms.length === 0) return null;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.pos_x);
    minZ = Math.min(minZ, r.pos_z);
    maxX = Math.max(maxX, r.pos_x + r.width);
    maxZ = Math.max(maxZ, r.pos_z + r.depth);
  }
  return { minX, minZ, maxX, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ) };
}

/** Height (metres) a straight-down camera with vertical `fovDeg` needs to frame `span` metres. */
export function overheadHeight(span: number, fovDeg = 62, padding = 1.25): number {
  return (Math.max(span, 4) / 2 / Math.tan((fovDeg * Math.PI) / 360)) * padding;
}

/**
 * Bird's-eye camera over some rooms, in `origin`'s frame: centred over their
 * bounding box at a height that frames it, nudged south so a camera pitched
 * at `pitch` (just short of straight down, so walls keep some depth) looks
 * at the centre. North stays at the top of the screen, as on every plan.
 */
export function aerialView(rooms: Placed[], origin: Pick<Room, "pos_x" | "pos_z">, pitch = -1.45, fovDeg = 62): { x: number; z: number; h: number } | null {
  const b = levelBounds(rooms);
  if (!b) return null;
  const h = overheadHeight(b.span, fovDeg);
  return { x: b.cx - origin.pos_x, z: b.cz - origin.pos_z - h / Math.tan(-pitch), h };
}

/**
 * Glide path through a linked door: stand just inside it facing out, then
 * step through to the same distance beyond the wall (in the room's frame —
 * the far side is the neighbour, drawn alongside).
 */
export function doorPassage(door: Pick<Opening, "wall" | "wall_offset">, room: Pick<Room, "width" | "depth">, inset = 0.9): { approach: Pose; through: Pose } {
  const p = wallPoint(door.wall, door.wall_offset ?? 0.5, room);
  const n = inwardNormal(door.wall);
  const yaw = Math.atan2(-n.x, -n.z);
  return {
    approach: { x: p.x + n.x * inset, z: p.z + n.z * inset, yaw, pitch: 0 },
    through: { x: p.x - n.x * inset, z: p.z - n.z * inset, yaw, pitch: 0 },
  };
}

/** The linked door in `fromId` that leads straight to `toId`, if any. */
export function doorBetween<O extends Pick<Opening, "room_id" | "target_room_id">>(openings: O[], fromId: string, toId: string): O | null {
  return openings.find((o) => o.room_id === fromId && o.target_room_id === toId) ?? null;
}

export interface RoomTally {
  /** Cards on the room's loci. */
  cards: number;
  /** Of those, due now. */
  due: number;
  /** Loci (tour stops exist even without cards). */
  loci: number;
}

/**
 * Where a palace tour should start: the first room (in traversal order) with
 * due cards, else the first with cards, else the first with loci, else the
 * first room. Never picks an empty room while a richer one exists.
 */
export function tourStartRoom(order: string[], tally: Record<string, RoomTally | undefined>): string | null {
  return (
    order.find((id) => (tally[id]?.due ?? 0) > 0) ??
    order.find((id) => (tally[id]?.cards ?? 0) > 0) ??
    order.find((id) => (tally[id]?.loci ?? 0) > 0) ??
    order[0] ??
    null
  );
}

/**
 * The next room a palace tour continues to after `currentId`: the next one in
 * traversal order (wrapping) that still has due cards and hasn't been toured
 * this session. With `includeNotDue`, rooms with any cards count too.
 */
export function nextTourRoom(
  order: string[],
  currentId: string,
  tally: Record<string, RoomTally | undefined>,
  toured: ReadonlySet<string>,
  includeNotDue = false
): string | null {
  const start = order.indexOf(currentId);
  for (let k = 1; k <= order.length; k++) {
    const id = order[(start + k + order.length) % order.length];
    if (id === currentId || toured.has(id)) continue;
    const t = tally[id];
    if (!t) continue;
    if (t.due > 0 || (includeNotDue && t.cards > 0)) return id;
  }
  return null;
}
