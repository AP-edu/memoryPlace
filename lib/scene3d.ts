// Pure helpers for the 3D views (room editor, preview, walk/tour). No three.js,
// no DOM — unit-tested in lib/scene3d.test.ts.
//
// World convention (lib/geometry.ts): x = east, y = up, z = north, metres.
// That frame is left-handed, while three.js is right-handed, so rendering it
// directly mirrors the room (east shows up on the LEFT when facing north).
// Every 3D view therefore maps world -> scene with z negated: toScene/fromScene.

import type { Locus, Opening, Room, WallFace } from "@/types/database";
import { clamp01, locusWorldPos, wallLength, wallPoint } from "./geometry";
import { openingAt, EYE_HEIGHT, type Pose } from "./walk";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SceneTuple = [number, number, number];

/** World (x east, y up, z north) -> three.js scene coordinates. */
export function toScene(p: Vec3): SceneTuple {
  return [p.x, p.y, -p.z];
}

/** three.js scene coordinates -> world. */
export function fromScene(p: { x: number; y: number; z: number }): Vec3 {
  return { x: p.x, y: p.y, z: p.z === 0 ? 0 : -p.z };
}

export const WALL_FACES: WallFace[] = ["north", "south", "east", "west"];

/** Unit normal pointing INTO the room, in world (x, z). */
export function inwardNormal(wall: WallFace): { x: number; z: number } {
  switch (wall) {
    case "north":
      return { x: 0, z: -1 };
    case "south":
      return { x: 0, z: 1 };
    case "east":
      return { x: -1, z: 0 };
    case "west":
      return { x: 1, z: 0 };
  }
}

export interface WallAnchor {
  wall: WallFace;
  wall_offset: number;
  height: number;
}

const round = (n: number, step: number) => (step > 0 ? Math.round(n / step) * step : n);
const clean = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Map a hit point on `wall` (world coords, e.g. from a raycast) to the locus
 * anchor stored in the DB: wall_offset 0..1 from the wall's start corner and an
 * absolute height. Offsets snap to `snapM` metres along the wall, height to
 * `heightStep`; both are clamped so markers stay on the wall.
 */
export function anchorFromPoint(
  wall: WallFace,
  p: Vec3,
  room: Pick<Room, "width" | "depth" | "height">,
  opts: { snapM?: number; heightStep?: number; minHeight?: number } = {}
): WallAnchor {
  const len = wallLength(wall, room);
  const along = wall === "north" || wall === "south" ? p.x : p.z;
  const snapped = round(Math.min(len, Math.max(0, along)), opts.snapM ?? 0.1);
  const minH = opts.minHeight ?? 0.3;
  const maxH = Math.max(minH, room.height - 0.2);
  const height = Math.min(maxH, Math.max(minH, round(p.y, opts.heightStep ?? 0.05)));
  return { wall, wall_offset: clean(len > 0 ? clamp01(snapped / len) : 0.5), height: clean(height) };
}

/** Nearest wall to an arbitrary point inside/around the room, as an anchor. */
export function nearestAnchor(p: Vec3, room: Pick<Room, "width" | "depth" | "height">, opts?: Parameters<typeof anchorFromPoint>[3]): WallAnchor {
  const d: Record<WallFace, number> = {
    north: Math.abs(room.depth - p.z),
    south: Math.abs(p.z),
    east: Math.abs(room.width - p.x),
    west: Math.abs(p.x),
  };
  const wall = WALL_FACES.reduce((best, w) => (d[w] < d[best] ? w : best), "north" as WallFace);
  return anchorFromPoint(wall, p, room, opts);
}

/**
 * Walls to cut away for an orbit camera at `cam` (world): any wall whose
 * outside face the camera is looking at, so the interior stays visible.
 */
export function cutawayWalls(cam: { x: number; z: number }, room: Pick<Room, "width" | "depth">, margin = 0.05): Set<WallFace> {
  const out = new Set<WallFace>();
  if (cam.z > room.depth + margin) out.add("north");
  if (cam.z < -margin) out.add("south");
  if (cam.x > room.width + margin) out.add("east");
  if (cam.x < -margin) out.add("west");
  return out;
}

/** Study/tour order: loci.position, then created_at, then id (stable). */
export function tourOrder<T extends Pick<Locus, "id" | "position" | "created_at">>(loci: T[]): T[] {
  return [...loci].sort(
    (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  );
}

/** Index of the next tour stop (wraps unless `wrap` is false, then clamps). */
export function tourStep(length: number, index: number, dir: 1 | -1, wrap = false): number {
  if (length <= 0) return -1;
  const next = index + dir;
  if (wrap) return ((next % length) + length) % length;
  return Math.min(length - 1, Math.max(0, next));
}

/** New position values after moving `id` by `dir` in the ordered list; only changed rows are returned. */
export function reorderPositions<T extends Pick<Locus, "id" | "position" | "created_at">>(
  loci: T[],
  id: string,
  dir: -1 | 1
): Array<{ id: string; position: number }> {
  const order = tourOrder(loci);
  const i = order.findIndex((l) => l.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return [];
  [order[i], order[j]] = [order[j], order[i]];
  // Normalise to 0..n-1 so duplicate/legacy positions can't make swaps no-ops.
  return order.flatMap((l, idx) => (l.position === idx ? [] : [{ id: l.id, position: idx }]));
}

const yawTo = (dx: number, dz: number) => Math.atan2(dx, dz); // forward(yaw) = (sin, cos)

/**
 * First-person pose that frames a locus: step back `dist` metres from its wall
 * into the room (clamped inside), at eye height, looking at the marker.
 */
export function viewPoseForLocus(
  locus: Pick<Locus, "wall" | "wall_offset" | "height">,
  room: Room,
  dist = 2.2,
  margin = 0.6
): Pose {
  const p = locusWorldPos(locus, room);
  const n = inwardNormal(p.wall);
  const x = Math.min(room.width - margin, Math.max(margin, p.x + n.x * dist));
  const z = Math.min(room.depth - margin, Math.max(margin, p.z + n.z * dist));
  const dx = p.x - x;
  const dz = p.z - z;
  return { x, z, yaw: yawTo(dx, dz), pitch: Math.atan2(p.y - EYE_HEIGHT, Math.hypot(dx, dz)) };
}

export function easeInOut(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

/** Interpolate poses; yaw takes the shortest way round. */
export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  let dy = b.yaw - a.yaw;
  while (dy > Math.PI) dy -= 2 * Math.PI;
  while (dy < -Math.PI) dy += 2 * Math.PI;
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: a.yaw + dy * t,
    pitch: a.pitch + (b.pitch - a.pitch) * t,
  };
}

/**
 * Linked door the player has just walked out through (pose outside the room,
 * within `reach` metres of the wall and inside the door's gap), or null.
 */
export function exitThroughDoor(pose: { x: number; z: number }, room: Pick<Room, "width" | "depth">, openings: Opening[], reach = 1.5): Opening | null {
  const linked = openings.filter((o) => o.target_room_id);
  if (linked.length === 0) return null;
  const size = { width: room.width, depth: room.depth };
  let wall: WallFace | null = null;
  let offset = 0;
  if (pose.z > room.depth && pose.z - room.depth <= reach && pose.x >= 0 && pose.x <= room.width) {
    wall = "north";
    offset = pose.x / room.width;
  } else if (pose.z < 0 && -pose.z <= reach && pose.x >= 0 && pose.x <= room.width) {
    wall = "south";
    offset = pose.x / room.width;
  } else if (pose.x > room.width && pose.x - room.width <= reach && pose.z >= 0 && pose.z <= room.depth) {
    wall = "east";
    offset = pose.z / room.depth;
  } else if (pose.x < 0 && -pose.x <= reach && pose.z >= 0 && pose.z <= room.depth) {
    wall = "west";
    offset = pose.z / room.depth;
  }
  if (!wall) return null;
  return openingAt(size, wall, offset, linked, 0.3);
}

/** Pose just inside `opening` of `room`, facing into the room. */
export function spawnAtDoor(opening: Pick<Opening, "wall" | "wall_offset">, room: Pick<Room, "width" | "depth">, inset = 1): Pose {
  const p = wallPoint(opening.wall, opening.wall_offset ?? 0.5, room);
  const n = inwardNormal(opening.wall);
  return { x: p.x + n.x * inset, z: p.z + n.z * inset, yaw: yawTo(n.x, n.z), pitch: 0 };
}

/** The opening in `room` that leads back to `fromRoomId` (the other half of a linked door). */
export function returnDoor(openings: Opening[], roomId: string, fromRoomId: string): Opening | null {
  return openings.find((o) => o.room_id === roomId && o.target_room_id === fromRoomId) ?? null;
}

export interface TourStop<L, C> {
  key: string;
  locus: L;
  /** null when the locus has no card yet (still a stop: you rehearse the place itself). */
  card: C | null;
  /** 0-based index of the locus in study order (stops of the same locus share it). */
  locusIndex: number;
}

/**
 * Reorder tour stops by a due-first card order (e.g. from
 * `sortPlayQueue(items, "due", now).map((i) => i.id)`).
 * Stops whose card isn't in `cardOrder` (card-less loci, unknown cards)
 * keep canonical relative order after the ordered ones. Stable.
 */
export function orderTourStopsByCards<S extends { card: { id: string } | null }>(
  stops: S[],
  cardOrder: string[]
): S[] {
  if (cardOrder.length === 0) return stops;
  const rank = new Map(cardOrder.map((id, i) => [id, i]));
  const INF = Number.MAX_SAFE_INTEGER;
  return stops
    .map((stop, index) => ({ stop, index }))
    .sort((a, b) => {
      const ra = a.stop.card ? (rank.get(a.stop.card.id) ?? INF) : INF;
      const rb = b.stop.card ? (rank.get(b.stop.card.id) ?? INF) : INF;
      return ra - rb || a.index - b.index;
    })
    .map(({ stop }) => stop);
}

/**
 * Tour stops in study order: one stop per card (cards on a locus by
 * created_at), or one card-less stop for an empty locus.
 */
export function buildTourStops<
  L extends Pick<Locus, "id" | "position" | "created_at">,
  C extends { id: string; locus_id: string; created_at: string; position?: number | null },
>(loci: L[], cards: C[]): Array<TourStop<L, C>> {
  const byLocus = new Map<string, C[]>();
  for (const c of cards) {
    const list = byLocus.get(c.locus_id) ?? [];
    list.push(c);
    byLocus.set(c.locus_id, list);
  }
  const posOf = (c: C) => (typeof c.position === "number" ? c.position : Number.MAX_SAFE_INTEGER);
  return tourOrder(loci).flatMap((locus, locusIndex): Array<TourStop<L, C>> => {
    const list = (byLocus.get(locus.id) ?? []).sort(
      (a, b) => posOf(a) - posOf(b) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
    );
    if (list.length === 0) return [{ key: locus.id, locus, card: null, locusIndex }];
    return list.map((card) => ({ key: `${locus.id}:${card.id}`, locus, card, locusIndex }));
  });
}

// ---------------------------------------------------------------- Street-View style navigation

export type NavStop<L extends Pick<Locus, "id" | "position" | "created_at" | "wall" | "wall_offset" | "height">> =
  | { kind: "locus"; key: string; locus: L; number: number }
  | { kind: "door"; key: string; opening: Opening; targetRoomId: string };

/** Navigation stops: loci in study order, then linked doors (so "next" after the last locus leads on). */
export function navStops<L extends Pick<Locus, "id" | "position" | "created_at" | "wall" | "wall_offset" | "height">>(
  loci: L[],
  openings: Opening[]
): Array<NavStop<L>> {
  const lociStops = tourOrder(loci).map((locus, i) => ({ kind: "locus" as const, key: `l:${locus.id}`, locus, number: i + 1 }));
  const doors = openings
    .filter((o) => o.target_room_id)
    .sort((a, b) => a.wall.localeCompare(b.wall) || (a.wall_offset ?? 0) - (b.wall_offset ?? 0))
    .map((opening) => ({ kind: "door" as const, key: `d:${opening.id}`, opening, targetRoomId: opening.target_room_id as string }));
  return [...lociStops, ...doors];
}

/** Next/previous stop index from `index` (-1 = not at a stop yet: next is 0, prev is the last). */
export function navStep(length: number, index: number, dir: 1 | -1): number {
  if (length <= 0) return -1;
  if (index < 0) return dir === 1 ? 0 : length - 1;
  return Math.min(length - 1, Math.max(0, index + dir));
}

/** Where the camera goes for a stop: framing a locus, or just inside a door looking out through it. */
export function stopPose(stop: NavStop<Locus>, room: Room): Pose {
  if (stop.kind === "locus") {
    const p = viewPoseForLocus(stop.locus, room, 2.6);
    return { ...p, pitch: p.pitch - 0.22 };
  }
  const inside = spawnAtDoor(stop.opening, room, 1.4);
  return { ...inside, yaw: yawTo(-Math.sin(inside.yaw), -Math.cos(inside.yaw)), pitch: -0.25 };
}

/** The thing a stop is about (locus marker or door centre), which arrows point at. */
export function stopFocus(stop: NavStop<Locus>, room: Room): { x: number; z: number } {
  if (stop.kind === "locus") {
    const p = locusWorldPos(stop.locus, room);
    return { x: p.x, z: p.z };
  }
  return wallPoint(stop.opening.wall, stop.opening.wall_offset ?? 0.5, room);
}

export interface NavArrow {
  stopIndex: number;
  role: "next" | "prev" | "door";
  /** Floor position (world) and heading the chevron points at. */
  x: number;
  z: number;
  yaw: number;
  distance: number;
}

/** Floor chevron `dist` metres from the player toward `target` (closer if the target is near). */
export function arrowPlacement(from: { x: number; z: number }, target: { x: number; z: number }, dist = 2.4): { x: number; z: number; yaw: number; distance: number } {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-6) return { x: from.x, z: from.z, yaw: 0, distance: 0 };
  // ~2.4 m ahead keeps the chevron inside a 70° view at eye height without looking down.
  const k = Math.min(dist, d * 0.7) / d;
  return { x: from.x + dx * k, z: from.z + dz * k, yaw: yawTo(dx, dz), distance: d };
}

/** Arrows to show: the next and previous stop, plus every linked door; none for the stop you're at. */
export function navArrows(pose: { x: number; z: number }, stops: Array<NavStop<Locus>>, index: number, room: Room): NavArrow[] {
  if (stops.length === 0) return [];
  const want = new Map<number, NavArrow["role"]>();
  const next = navStep(stops.length, index, 1);
  const prev = navStep(stops.length, index, -1);
  stops.forEach((s, i) => {
    if (s.kind === "door") want.set(i, "door");
  });
  if (index >= 0 && prev !== index) want.set(prev, "prev");
  if (next !== index) want.set(next, "next");
  const out: NavArrow[] = [];
  for (const [i, role] of want) {
    if (i === index) continue;
    const a = arrowPlacement(pose, stopFocus(stops[i], room));
    if (a.distance < 0.3) continue;
    out.push({ stopIndex: i, role, ...a });
  }
  return out.sort((p, q) => p.stopIndex - q.stopIndex);
}
