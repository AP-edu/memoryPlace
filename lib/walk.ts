import { clamp01, locusWorldPos, openingHalfFraction, wallLength } from "./geometry";
import type { Locus, Opening, Room, WallFace } from "@/types/database";

// First-person walk logic (Phase F). All pure functions — no DOM, no three —
// so movement, collision, and focus rules are verifiable without a browser.
//
// Conventions (shared with lib/geometry.ts):
//   forward(yaw) = (sin yaw, cos yaw) in (x, z); yaw = 0 faces north (+z).
//   Camera eye height is EYE_HEIGHT; movement is planar (x, z).

export const EYE_HEIGHT = 1.6;
export const PLAYER_RADIUS = 0.35;
export const WALK_SPEED = 3;
export const OUTSIDE_MARGIN = 4;
export const FOCUS_NEAR_RADIUS = 1.4;
export const FOCUS_GAZE_ANGLE = 0.45;
export const FOCUS_GAZE_DIST = 7;

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
}

export interface MoveInput {
  /** +1 forward, -1 back */
  throttle: number;
  /** +1 right, -1 left */
  strafe: number;
}

export interface RoomSize {
  width: number;
  depth: number;
}

export interface WorldLocus {
  locus: Locus;
  x: number;
  y: number;
  z: number;
}

export function toWorldLoci(loci: Locus[], room: Room): WorldLocus[] {
  return loci.map((locus) => {
    const p = locusWorldPos(locus, room);
    return { locus, x: p.x, y: p.y, z: p.z };
  });
}

export function spawnPose(room: RoomSize): Pose {
  return { x: room.width / 2, z: room.depth / 2, yaw: 0, pitch: 0 };
}

export function forwardVec(yaw: number, pitch = 0): { x: number; y: number; z: number } {
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: Math.cos(yaw) * cp };
}

/** Solid wall spans in 0..1 offset space, given the openings cut into that wall. */
export function wallSpans(
  size: RoomSize,
  wall: WallFace,
  openings: Opening[]
): Array<{ from: number; to: number }> {
  const gaps = openings
    .filter((o) => o.wall === wall)
    .map((o) => {
      const half = openingHalfFraction(o, size);
      const c = clamp01(o.wall_offset ?? 0.5);
      return { from: Math.max(0, c - half), to: Math.min(1, c + half) };
    })
    .sort((a, b) => a.from - b.from);
  const spans: Array<{ from: number; to: number }> = [];
  let cursor = 0;
  for (const g of gaps) {
    if (g.from > cursor) spans.push({ from: cursor, to: g.from });
    cursor = Math.max(cursor, g.to);
  }
  if (cursor < 1) spans.push({ from: cursor, to: 1 });
  return spans;
}

/** Opening whose gap contains `offset` (0..1), expanded by a world-unit margin. */
export function openingAt(
  size: RoomSize,
  wall: WallFace,
  offset: number,
  openings: Opening[],
  marginWorld = 0
): Opening | null {
  const len = wallLength(wall, size);
  const margin = len > 0 ? marginWorld / len : 0;
  for (const o of openings) {
    if (o.wall !== wall) continue;
    const half = openingHalfFraction(o, size) + margin;
    const c = clamp01(o.wall_offset ?? 0.5);
    if (offset >= c - half && offset <= c + half) return o;
  }
  return null;
}

/**
 * Advance the player one step with axis-separated collision. Walls block
 * unless the crossing point lies inside an opening gap (doors/archways are
 * passable). The void outside is bounded so wanderers can't get lost.
 */
export function stepPlayer(
  pose: Pose,
  input: MoveInput,
  dt: number,
  room: RoomSize,
  openings: Opening[],
  opts?: { speed?: number; radius?: number }
): Pose {
  const speed = opts?.speed ?? WALK_SPEED;
  const r = opts?.radius ?? PLAYER_RADIUS;
  const step = Math.min(Math.max(dt, 0), 0.05) * speed;
  const fx = Math.sin(pose.yaw);
  const fz = Math.cos(pose.yaw);
  // Right-hand vector in world (x east, z north): facing north, right is east.
  const rx = fz;
  const rz = -fx;
  const dx = (fx * input.throttle + rx * input.strafe) * step;
  const dz = (fz * input.throttle + rz * input.strafe) * step;

  let nx = pose.x + dx;
  if (nx < r && pose.x >= r) {
    if (!openingAt(room, "west", clamp01(pose.z / room.depth), openings, r)) nx = r;
  } else if (nx > room.width - r && pose.x <= room.width - r) {
    if (!openingAt(room, "east", clamp01(pose.z / room.depth), openings, r)) nx = room.width - r;
  }

  let nz = pose.z + dz;
  if (nz < r && pose.z >= r) {
    if (!openingAt(room, "south", clamp01(nx / room.width), openings, r)) nz = r;
  } else if (nz > room.depth - r && pose.z <= room.depth - r) {
    if (!openingAt(room, "north", clamp01(nx / room.width), openings, r)) nz = room.depth - r;
  }

  nx = Math.min(room.width + OUTSIDE_MARGIN, Math.max(-OUTSIDE_MARGIN, nx));
  nz = Math.min(room.depth + OUTSIDE_MARGIN, Math.max(-OUTSIDE_MARGIN, nz));
  return { ...pose, x: nx, z: nz };
}

export function isOutside(pos: { x: number; z: number }, room: RoomSize): boolean {
  return pos.x < 0 || pos.x > room.width || pos.z < 0 || pos.z > room.depth;
}

function dist3(ax: number, ay: number, az: number, b: { x: number; y: number; z: number }): number {
  return Math.hypot(ax - b.x, ay - b.y, az - b.z);
}

/** Locus the player should be engaging: nearest within reach, else best gaze target. */
export function focusLocus(
  cam: { x: number; y: number; z: number; yaw: number; pitch: number },
  items: WorldLocus[],
  opts?: { nearRadius?: number; gazeAngle?: number; gazeDist?: number }
): WorldLocus | null {
  const nearRadius = opts?.nearRadius ?? FOCUS_NEAR_RADIUS;
  const gazeAngle = opts?.gazeAngle ?? FOCUS_GAZE_ANGLE;
  const gazeDist = opts?.gazeDist ?? FOCUS_GAZE_DIST;

  let bestNear: WorldLocus | null = null;
  let bestNearDist = Infinity;
  let bestGaze: WorldLocus | null = null;
  let bestGazeDist = Infinity;
  const f = forwardVec(cam.yaw, cam.pitch);

  for (const item of items) {
    const d = dist3(cam.x, cam.y, cam.z, item);
    if (d < nearRadius && d < bestNearDist) {
      bestNear = item;
      bestNearDist = d;
    }
    if (d <= gazeDist && d > 1e-6) {
      const dot = ((item.x - cam.x) * f.x + (item.y - cam.y) * f.y + (item.z - cam.z) * f.z) / d;
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (angle <= gazeAngle && d < bestGazeDist) {
        bestGaze = item;
        bestGazeDist = d;
      }
    }
  }
  return bestNear ?? bestGaze;
}
