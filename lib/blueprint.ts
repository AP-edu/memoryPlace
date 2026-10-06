// Top-down blueprint layout for the printable export (pure, no React).
// Convention (AGENTS.md): x -> right, north (+z) at the TOP, so svgY = maxZ - z.
import { locusWorldPos, openingWidthM, wallLength, wallPoint } from "@/lib/geometry";
import { tourOrder } from "@/lib/scene3d";
import type { Locus, Opening, Room } from "@/types/database";

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
