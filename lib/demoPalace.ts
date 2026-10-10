// Demo palace for the logged-out landing page: pure data laid out with the
// same blueprint code the app uses, plus the walking route through it.
import type { Locus, Opening, Room } from "@/types/database";
import { layoutBlueprint, type Blueprint } from "./blueprint";

const room = (id: string, title: string, x: number, z: number, w: number, d: number, background: string | null, created_at: string, furniture: unknown[] = []) =>
  ({ id, palace_id: "demo", user_id: "demo", title, width: w, depth: d, height: 3, pos_x: x, pos_z: z, level_id: "L", rotation: 0, background, created_at, metadata: { furniture } }) as unknown as Room;

// Tour order = room order: Atrium -> Garden -> Library, each joined by a door.
const ROOMS: Room[] = [
  room("atrium", "Atrium", 0, 0, 8, 6, null, "2026-01-01T00:00:00Z", [{ id: "f1", kind: "fountain", x: 4, z: 3 }]),
  room("garden", "Garden", 8, 0, 6, 11, "#2f9e44", "2026-01-02T00:00:00Z", [
    { id: "f2", kind: "plant", x: 1.2, z: 9.6 },
    { id: "f3", kind: "statue", x: 3, z: 5.5 },
  ]),
  room("library", "Library", 0, 6, 8, 5, "#3b5bdb", "2026-01-03T00:00:00Z", [
    { id: "f4", kind: "table", x: 4, z: 2.4 },
    { id: "f5", kind: "bookshelf", x: 5.5, z: 4.6 },
  ]),
];

const SPOTS: Array<[string, Locus["wall"], number]> = [
  ["atrium", "south", 0.3],
  ["atrium", "west", 0.5],
  ["atrium", "north", 0.2],
  ["atrium", "east", 0.35],
  ["garden", "south", 0.5],
  ["garden", "east", 0.3],
  ["garden", "east", 0.75],
  ["garden", "north", 0.5],
  ["library", "east", 0.6],
  ["library", "north", 0.65],
  ["library", "north", 0.25],
  ["library", "west", 0.5],
];

const LOCI: Locus[] = SPOTS.map(
  ([room_id, wall, wall_offset], i) =>
    ({ id: `l${i}`, room_id, label: "", wall, wall_offset, height: 1.5, position: i, created_at: "2026-01-01T00:00:00Z" }) as unknown as Locus
);

const door = (id: string, room_id: string, wall: Opening["wall"], wall_offset: number, target_room_id: string) =>
  ({ id, room_id, wall, wall_offset, width_m: 1.1, width: null, kind: "door", target_room_id }) as unknown as Opening;

const OPENINGS: Opening[] = [
  door("d1", "atrium", "east", 0.7, "garden"),
  door("d2", "garden", "west", 0.38, "atrium"),
  door("d3", "garden", "west", 0.82, "library"),
  door("d4", "library", "east", 0.6, "garden"),
];

export function demoPlan(): Blueprint {
  const numbering = new Map(ROOMS.map((r, i) => [r.id, i + 1]));
  return layoutBlueprint(ROOMS, LOCI, OPENINGS, numbering)!;
}

/**
 * The study route on a plan: every locus room by room (room number, then
 * study order), passing through the door between rooms rather than the wall.
 */
export function walkRoute(plan: Blueprint): Array<{ x: number; y: number }> {
  const roomNo = new Map(plan.rooms.map((r) => [r.id, r.number]));
  const loci = [...plan.loci].sort((a, b) => (roomNo.get(a.roomId) ?? 0) - (roomNo.get(b.roomId) ?? 0) || a.n - b.n);
  const route: Array<{ x: number; y: number }> = [];
  loci.forEach((l, i) => {
    const prev = loci[i - 1];
    if (prev && prev.roomId !== l.roomId) {
      const d = plan.openings.find(
        (o) => (o.roomId === prev.roomId && o.targetRoomId === l.roomId) || (o.roomId === l.roomId && o.targetRoomId === prev.roomId)
      );
      if (d) route.push({ x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 });
    }
    route.push({ x: l.x, y: l.y });
  });
  return route;
}
