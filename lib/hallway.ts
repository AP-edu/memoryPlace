// Auto-generated hallways between two non-adjacent rooms on the same level.
// Pure geometry (unit-tested in lib/hallway.test.ts). A hallway is one
// straight corridor or an L of two corridors, each an axis-aligned rectangle
// `width` metres wide that touches its neighbours in the chain
// [roomA, ...segments, roomB] along a wall, never overlapping other rooms.
// The editor stores each segment as a regular room with
// metadata.kind = "hallway" and links consecutive pieces with openings.

import { EPS, clean, overlapsAny, rectsOverlap, sharedWalls, snap, type Rect, type SharedWall } from "./grid";

export const HALLWAY_WIDTH_M = 1.5;

export interface HallwayPlan {
  segments: Rect[];
  /** Total corridor length in metres (along the walking direction). */
  length: number;
}

const transpose = (r: Rect): Rect => ({ x: r.z, z: r.x, w: r.d, d: r.w });

/** Candidate start positions in [lo, hi] (snapped), nearest to `prefer` first. */
function positions(lo: number, hi: number, prefer: number, step: number, max = 41): number[] {
  if (hi < lo - EPS) return [];
  const set = new Set<number>([clean(Math.min(hi, Math.max(lo, prefer)))]);
  const s = step > 0 ? step : 0.5;
  for (let v = Math.ceil(lo / s - EPS) * s; v <= hi + EPS; v += s) set.add(clean(v));
  set.add(clean(lo));
  set.add(clean(hi));
  return [...set].sort((a, b) => Math.abs(a - prefer) - Math.abs(b - prefer)).slice(0, max);
}

/** Straight corridors leaving `a` north/south into `b` (in this frame). */
function straightNS(a: Rect, b: Rect, W: number, step: number): Rect[] {
  const lo = Math.max(a.x, b.x);
  const hi = Math.min(a.x + a.w, b.x + b.w) - W;
  const out: Rect[] = [];
  const centre = (lo + hi) / 2;
  if (b.z >= a.z + a.d + EPS) {
    for (const x of positions(lo, hi, snap(centre, step), step)) out.push({ x, z: a.z + a.d, w: W, d: clean(b.z - (a.z + a.d)) });
  } else if (a.z >= b.z + b.d + EPS) {
    for (const x of positions(lo, hi, snap(centre, step), step)) out.push({ x, z: b.z + b.d, w: W, d: clean(a.z - (b.z + b.d)) });
  }
  return out;
}

/** L corridors: leave `a` through its north/south wall, enter `b` through its east/west wall. */
function lShapes(a: Rect, b: Rect, W: number, step: number): Rect[][] {
  const out: Rect[][] = [];
  const north = b.z + b.d / 2 > a.z + a.d / 2;
  const east = b.x + b.w / 2 > a.x + a.w / 2;
  const xs = positions(a.x, a.x + a.w - W, snap(east ? a.x + a.w - W : a.x, step), step);
  const zs = positions(b.z, b.z + b.d - W, snap(north ? b.z : b.z + b.d - W, step), step);
  for (const x0 of xs) {
    for (const z0 of zs) {
      let vertical: Rect;
      if (north) {
        if (z0 < a.z + a.d - EPS) continue;
        vertical = { x: x0, z: a.z + a.d, w: W, d: clean(z0 + W - (a.z + a.d)) };
      } else {
        if (z0 + W > a.z + EPS) continue;
        vertical = { x: x0, z: z0, w: W, d: clean(a.z - z0) };
      }
      if (vertical.d <= EPS) continue;
      let horizontal: Rect | null;
      if (east) {
        if (b.x < x0 + W - EPS) continue;
        const len = clean(b.x - (x0 + W));
        horizontal = len > EPS ? { x: x0 + W, z: z0, w: len, d: W } : null;
      } else {
        if (b.x + b.w > x0 + EPS) continue;
        const len = clean(x0 - (b.x + b.w));
        horizontal = len > EPS ? { x: b.x + b.w, z: z0, w: len, d: W } : null;
      }
      out.push(horizontal ? [vertical, horizontal] : [vertical]);
    }
  }
  return out;
}

function chainOk(chain: Rect[], minShared: number): boolean {
  for (let i = 0; i + 1 < chain.length; i++) {
    const sw = sharedWalls(chain[i], chain[i + 1]);
    if (!sw.some((s) => s.to - s.from + EPS >= minShared)) return false;
  }
  return true;
}

/**
 * Shortest free hallway from `a` to `b`, or null when the rooms touch (connect
 * them directly) or no straight/L corridor fits without crossing `others`.
 */
export function planHallway(a: Rect, b: Rect, others: Rect[], opts: { width?: number; step?: number } = {}): HallwayPlan | null {
  const W = opts.width ?? HALLWAY_WIDTH_M;
  const step = opts.step ?? 0.5;
  if (rectsOverlap(a, b) || sharedWalls(a, b).length > 0) return null;
  const candidates: Rect[][] = [];
  for (const r of straightNS(a, b, W, step)) candidates.push([r]);
  for (const r of straightNS(transpose(a), transpose(b), W, step)) candidates.push([transpose(r)]);
  for (const c of lShapes(a, b, W, step)) candidates.push(c);
  for (const c of lShapes(transpose(a), transpose(b), W, step)) candidates.push(c.map(transpose));

  let best: { plan: HallwayPlan; score: number } | null = null;
  for (const segs of candidates) {
    const blocked = segs.some((s) => overlapsAny(s, others) || rectsOverlap(s, a) || rectsOverlap(s, b));
    if (blocked || !chainOk([a, ...segs, b], Math.min(W, 1))) continue;
    const length = segs.reduce((n, s) => n + Math.max(s.w, s.d), 0);
    // Prefer short, then straight (a turn costs 1.5 m).
    const score = length + (segs.length - 1) * 1.5;
    if (!best || score < best.score - EPS) best = { plan: { segments: segs.map((s) => ({ x: clean(s.x), z: clean(s.z), w: clean(s.w), d: clean(s.d) })), length: clean(length) }, score };
  }
  return best?.plan ?? null;
}

/** Shared wall stretch between two touching rectangles (longest), from `a`'s side. */
export function sharedStretch(a: Rect, b: Rect): SharedWall | null {
  const all = sharedWalls(a, b);
  return all.sort((p, q) => q.to - q.from - (p.to - p.from))[0] ?? null;
}

/** Hallways are regular rooms tagged in their metadata jsonb (no schema change). */
export function isHallway(room: { metadata?: unknown } | null | undefined): boolean {
  const m = room?.metadata;
  return !!m && typeof m === "object" && (m as Record<string, unknown>).kind === "hallway";
}

export const HALLWAY_METADATA = { kind: "hallway" } as const;
