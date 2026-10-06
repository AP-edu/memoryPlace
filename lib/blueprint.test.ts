import { describe, expect, it } from "vitest";
import type { Locus, Opening, Room } from "@/types/database";
import { layoutBlueprint } from "./blueprint";

const room = (over: Partial<Room> & { id: string }): Room =>
  ({
    palace_id: "p",
    user_id: "u",
    title: over.id,
    width: 10,
    depth: 8,
    height: 3,
    pos_x: 0,
    pos_z: 0,
    level_id: "L",
    rotation: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  }) as Room;

const locus = (over: Partial<Locus> & { id: string; room_id: string }): Locus =>
  ({ label: "", position: 0, wall: "north", wall_offset: 0.5, height: 1.5, created_at: "2026-01-01T00:00:00Z", ...over }) as Locus;

describe("layoutBlueprint", () => {
  it("returns null with no rooms", () => {
    expect(layoutBlueprint([], [], [], new Map())).toBeNull();
  });

  it("draws north at the top (svg y = maxZ - z)", () => {
    const bp = layoutBlueprint([room({ id: "a" })], [locus({ id: "l1", room_id: "a", wall: "north" })], [], new Map([["a", 1]]))!;
    const north = bp.loci[0];
    const south = layoutBlueprint([room({ id: "a" })], [locus({ id: "l2", room_id: "a", wall: "south" })], [], new Map())!.loci[0];
    expect(north.y).toBeLessThan(south.y);
    expect(north.x).toBeCloseTo(1 + 5); // pad + half of width
  });

  it("offsets rooms by their level position and numbers loci in tour order", () => {
    const bp = layoutBlueprint(
      [room({ id: "a" }), room({ id: "b", pos_x: 12 })],
      [
        locus({ id: "l1", room_id: "b", position: 5, wall: "east" }),
        locus({ id: "l0", room_id: "b", position: 1, wall: "west" }),
      ],
      [],
      new Map([["a", 1], ["b", 2]])
    )!;
    expect(bp.width).toBe(22 + 2);
    const b = bp.rooms.find((r) => r.id === "b")!;
    expect(b.x).toBe(13);
    expect(b.number).toBe(2);
    const bl = bp.loci.filter((l) => l.roomId === "b");
    expect(bl.map((l) => l.n)).toEqual([1, 2]);
    expect(bl[0].x).toBeLessThan(bl[1].x); // west (n=1) is left of east (n=2)
  });

  it("places a door gap along its wall", () => {
    const o = { id: "o", room_id: "a", wall: "south", wall_offset: 0.5, width: 0.2, width_m: 2, kind: "door", target_room_id: null } as unknown as Opening;
    const bp = layoutBlueprint([room({ id: "a" })], [], [o], new Map())!;
    const g = bp.openings[0];
    expect(Math.abs(g.x2 - g.x1)).toBeCloseTo(2);
    expect(g.y1).toBe(g.y2);
  });
});
