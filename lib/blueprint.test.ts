import { describe, expect, it } from "vitest";
import type { Locus, Opening, Room } from "@/types/database";
import type { Level } from "@/types/database";
import { groundPlan, layoutBlueprint, levelPlanFor, pickMapTarget, playerToPlan, tappableDoors, viewWedge, type BlueprintOpening } from "./blueprint";

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

  it("insets loci into their own room, so a shared wall stays unambiguous", () => {
    // a's north wall is b's south wall (b sits directly north of a).
    const rooms = [room({ id: "a" }), room({ id: "b", pos_z: 8 })];
    const bp = layoutBlueprint(rooms, [locus({ id: "la", room_id: "a", wall: "north" }), locus({ id: "lb", room_id: "b", wall: "south" })], [], new Map())!;
    const inside = (roomId: string, p: { x: number; y: number }) => {
      const r = bp.rooms.find((x) => x.id === roomId)!;
      return p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
    };
    const la = bp.loci.find((l) => l.roomId === "a")!;
    const lb = bp.loci.find((l) => l.roomId === "b")!;
    expect(inside("a", la)).toBe(true);
    expect(inside("b", lb)).toBe(true);
    expect(lb.y).toBeLessThan(la.y); // b is north, drawn above
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

describe("playerToPlan", () => {
  const r = { x: 1, y: 1, w: 10, h: 8 };
  it("maps room-local metres into the plan, north up", () => {
    expect(playerToPlan(r, { x: 0, z: 0 })).toEqual({ x: 1, y: 9 }); // south-west corner
    expect(playerToPlan(r, { x: 10, z: 8 })).toEqual({ x: 11, y: 1 }); // north-east corner
    expect(playerToPlan(r, { x: 5, z: 4 })).toEqual({ x: 6, y: 5 });
  });
});

describe("viewWedge", () => {
  it("faces north (up) at yaw 0 and east at yaw pi/2", () => {
    const [apex, a, b] = viewWedge(5, 5, 0, 2, 0.5);
    expect(apex).toEqual([5, 5]);
    expect(a[1]).toBeLessThan(5);
    expect(b[1]).toBeLessThan(5);
    const [, e1, e2] = viewWedge(5, 5, Math.PI / 2, 2, 0.5);
    expect(e1[0]).toBeGreaterThan(5);
    expect(e2[0]).toBeGreaterThan(5);
  });
});

describe("levelPlanFor", () => {
  const lvl = (id: string, idx: number) => ({ id, idx, name: id }) as unknown as Level;
  const levels = [lvl("L0", 0), lvl("L1", 1)];
  const rooms = [
    room({ id: "a", level_id: "L0", created_at: "2026-01-01T00:00:00Z" }),
    room({ id: "b", level_id: null, pos_x: 12, created_at: "2026-01-02T00:00:00Z" }), // null level = first level
    room({ id: "c", level_id: "L1", created_at: "2026-01-03T00:00:00Z" }),
  ];
  it("keeps only rooms on the current room's level and numbers by palace creation order", () => {
    const plan = levelPlanFor(rooms, [], [], levels, "a")!;
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(plan.rooms.find((r) => r.id === "b")!.number).toBe(2);
    const upper = levelPlanFor(rooms, [], [], levels, "c")!;
    expect(upper.rooms.map((r) => r.id)).toEqual(["c"]);
    expect(upper.rooms[0].number).toBe(3);
  });
  it("returns null for an unknown room", () => {
    expect(levelPlanFor(rooms, [], [], levels, "zzz")).toBeNull();
  });
});

describe("tappableDoors", () => {
  const d = (roomId: string, targetRoomId: string | null): BlueprintOpening => ({ roomId, targetRoomId, kind: "door", x1: 0, y1: 0, x2: 1, y2: 0 });
  it("drops doors pointing back at the current room and plain openings", () => {
    const out = tappableDoors([d("lib", "hall"), d("hall", "lib"), d("hall", null)], "hall");
    expect(out).toHaveLength(1);
    expect(out[0].roomId).toBe("hall");
  });
  it("paints the current room's doors last so they win overlaps", () => {
    const out = tappableDoors([d("hall", "lib"), d("lib", "study")], "hall");
    expect(out.map((o) => o.roomId)).toEqual(["lib", "hall"]);
  });
});

describe("pickMapTarget", () => {
  // Hall's north door spans x 4..6 at y 0 and leads to "lib"; a hall locus hangs just beside it.
  const plan = {
    loci: [
      { roomId: "hall", locusId: "h1", n: 1, x: 6.6, y: 0 },
      { roomId: "lib", locusId: "l1", n: 1, x: 2, y: -4 },
    ],
    openings: [
      { roomId: "hall", targetRoomId: "lib", kind: "door" as const, x1: 4, y1: 0, x2: 6, y2: 0 },
      { roomId: "lib", targetRoomId: "hall", kind: "door" as const, x1: 4, y1: 0, x2: 6, y2: 0 },
    ],
  };
  const all = { loci: true, rooms: true };
  it("a tap on the door opens the next room even with a locus beside it", () => {
    expect(pickMapTarget(plan, "hall", { x: 5.4, y: 0.2 }, 1.3, all)).toEqual({ kind: "room", roomId: "lib" });
  });
  it("a tap on the locus beside the door still selects the locus", () => {
    expect(pickMapTarget(plan, "hall", { x: 6.55, y: 0.1 }, 1.3, all)).toEqual({ kind: "locus", n: 1 });
  });
  it("loci in other rooms open that room; nothing within reach is null", () => {
    expect(pickMapTarget(plan, "hall", { x: 2.2, y: -3.8 }, 1.3, all)).toEqual({ kind: "room", roomId: "lib" });
    expect(pickMapTarget(plan, "hall", { x: 20, y: 20 }, 1.3, all)).toBeNull();
  });
  it("respects which handlers exist", () => {
    expect(pickMapTarget(plan, "hall", { x: 6.55, y: 0.1 }, 1.3, { loci: false, rooms: true })).toEqual({ kind: "room", roomId: "lib" });
    expect(pickMapTarget(plan, "hall", { x: 5.6, y: 0 }, 1.3, { loci: true, rooms: false })).toEqual({ kind: "locus", n: 1 });
  });
});

describe("groundPlan", () => {
  const lvl = (id: string, idx: number) => ({ id, idx, name: id }) as unknown as Level;
  it("plans the lowest level, with room colours and numbering by creation", () => {
    const rooms = [
      room({ id: "up", level_id: "L2", created_at: "2026-01-01T00:00:00Z" }),
      room({ id: "a", level_id: "L1", background: "#2f9e44", created_at: "2026-01-02T00:00:00Z" }),
      room({ id: "b", level_id: null, pos_x: 12, created_at: "2026-01-03T00:00:00Z" }),
    ];
    const plan = groundPlan(rooms, [], [], [lvl("L2", 1), lvl("L1", 0)])!;
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(["a", "b"]);
    expect(plan.rooms.find((r) => r.id === "a")).toMatchObject({ color: "#2f9e44", number: 2 });
  });
  it("is null for a palace without rooms", () => {
    expect(groundPlan([], [], [], [])).toBeNull();
  });
});

describe("furniture on the plan", () => {
  it("draws each piece's footprint inside its room, north up", () => {
    const r = room({ id: "a", metadata: { furniture: [{ id: "s", kind: "sofa", x: 5, z: 7, rot: 0 }] } } as Partial<Room> & { id: string });
    const bp = layoutBlueprint([r], [], [], new Map())!;
    const f = bp.furniture[0];
    expect(f).toMatchObject({ roomId: "a", kind: "sofa", w: 2, h: 0.9 });
    const rr = bp.rooms[0];
    expect(f.x).toBeGreaterThanOrEqual(rr.x);
    expect(f.y).toBeGreaterThanOrEqual(rr.y);
    expect(f.y).toBeLessThan(rr.y + 1.5); // near the north (top) wall
  });
});
