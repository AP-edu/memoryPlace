import { describe, expect, it } from "vitest";
import {
  adjacentRooms,
  autoLinks,
  snapCoord,
  snapDraw,
  snapMove,
  snapResize,
  findLinkTarget,
  findPartner,
  gridLines,
  hitWall,
  moveRect,
  overlapsAny,
  planOpening,
  reconcileLinks,
  rectFromDrag,
  rectsOverlap,
  resizeRect,
  sharedWalls,
  snap,
  type LinkableOpening,
  type PlacementRoom,
  type Rect,
} from "./grid";
import { openingHalfFraction, openingWidthM } from "./geometry";

const r = (x: number, z: number, w: number, d: number): Rect => ({ x, z, w, d });

describe("snap", () => {
  it("snaps to the nearest step without float noise", () => {
    expect(snap(1.26, 0.5)).toBe(1.5);
    expect(snap(1.24, 0.5)).toBe(1);
    expect(snap(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(snap(-0.2, 0.5)).toBe(0);
  });
  it("is a no-op for non-positive steps", () => {
    expect(snap(1.234, 0)).toBe(1.234);
  });
});

describe("rectFromDrag", () => {
  it("normalises any drag direction and snaps both corners", () => {
    expect(rectFromDrag({ x: 4.1, z: 3.2 }, { x: 0.2, z: -0.9 }, 0.5, 1)).toEqual(r(0, -1, 4, 4));
  });
  it("rejects rectangles below the minimum size", () => {
    expect(rectFromDrag({ x: 0, z: 0 }, { x: 0.6, z: 3 }, 0.5, 1)).toBeNull();
  });
});

describe("overlap detection", () => {
  it("treats shared edges as non-overlapping", () => {
    expect(rectsOverlap(r(0, 0, 4, 4), r(4, 0, 4, 4))).toBe(false);
    expect(rectsOverlap(r(0, 0, 4, 4), r(0, 4, 4, 4))).toBe(false);
  });
  it("detects positive-area overlap and containment", () => {
    expect(rectsOverlap(r(0, 0, 4, 4), r(3.5, 1, 4, 4))).toBe(true);
    expect(rectsOverlap(r(0, 0, 10, 10), r(2, 2, 1, 1))).toBe(true);
    expect(overlapsAny(r(0, 0, 2, 2), [r(5, 5, 1, 1), r(1, 1, 2, 2)])).toBe(true);
    expect(overlapsAny(r(0, 0, 2, 2), [])).toBe(false);
  });
});

describe("move / resize", () => {
  it("moves with the min corner snapped", () => {
    expect(moveRect(r(0, 0, 4, 3), 1.3, -0.7, 0.5)).toEqual(r(1.5, -0.5, 4, 3));
  });
  it("resizes edges with snapping and a minimum size", () => {
    expect(resizeRect(r(0, 0, 4, 4), "e", { x: 6.2, z: 0 }, 0.5, 1)).toEqual(r(0, 0, 6, 4));
    expect(resizeRect(r(0, 0, 4, 4), "n", { x: 0, z: 5.9 }, 0.5, 1)).toEqual(r(0, 0, 4, 6));
    expect(resizeRect(r(0, 0, 4, 4), "sw", { x: -1.1, z: -2 }, 0.5, 1)).toEqual(r(-1, -2, 5, 6));
    // Can't drag the west edge past the east edge.
    expect(resizeRect(r(0, 0, 4, 4), "w", { x: 9, z: 0 }, 0.5, 1)).toEqual(r(3, 0, 1, 4));
  });
});

describe("shared-wall detection", () => {
  it("finds east/west shared walls with the overlapping stretch", () => {
    expect(sharedWalls(r(0, 0, 4, 4), r(4, 2, 3, 6))).toEqual([{ wallA: "east", wallB: "west", from: 2, to: 4 }]);
  });
  it("finds north/south shared walls (north = +z)", () => {
    expect(sharedWalls(r(0, 0, 4, 4), r(1, 4, 2, 2))).toEqual([{ wallA: "north", wallB: "south", from: 1, to: 3 }]);
  });
  it("ignores corner-only contact and gaps", () => {
    expect(sharedWalls(r(0, 0, 4, 4), r(4, 4, 2, 2))).toEqual([]);
    expect(sharedWalls(r(0, 0, 4, 4), r(5, 0, 2, 2))).toEqual([]);
  });
});

describe("hitWall", () => {
  it("picks the nearest wall within tolerance and reports offsets from the start corner", () => {
    const hit = hitWall({ x: 1, z: 3.9 }, r(0, 0, 4, 4), 0.25);
    expect(hit?.wall).toBe("north");
    expect(hit?.along).toBeCloseTo(1);
    expect(hit?.offset).toBeCloseTo(0.25);
    expect(hitWall({ x: 3.95, z: 1 }, r(0, 0, 4, 4), 0.25)?.wall).toBe("east");
  });
  it("misses when far from every wall", () => {
    expect(hitWall({ x: 2, z: 2 }, r(0, 0, 4, 4), 0.25)).toBeNull();
  });
});

describe("opening placement", () => {
  const rooms: PlacementRoom[] = [
    { id: "a", rect: r(0, 0, 4, 4) },
    { id: "b", rect: r(4, 2, 3, 6) },
  ];

  it("snaps the centre and clamps so the opening fits on a free wall", () => {
    const plan = planOpening(rooms, "a", "south", 0.1, 0.9, 0.5);
    expect(plan?.link).toBeNull();
    expect(plan?.widthM).toBe(0.9);
    // centre clamped to 0.45 m from the corner -> offset 0.45 / 4
    expect(plan?.offset).toBeCloseTo(0.1125);
  });

  it("links a door on a shared wall and mirrors the offset onto the neighbour", () => {
    const plan = planOpening(rooms, "a", "east", 3, 0.9, 0.5);
    expect(plan?.wall).toBe("east");
    expect(plan?.offset).toBeCloseTo(0.75); // z = 3 on a 4 m wall
    expect(plan?.link).toEqual({ roomId: "b", wall: "west", offset: expect.closeTo(1 / 6, 6) }); // z = 3 is 1 m up b's 6 m wall
  });

  it("clamps into the shared stretch so the whole door is shared", () => {
    // Click at z = 2.1 snaps to 2.0; the shared stretch is z 2..4, so the 0.9 m door centres at 2.45.
    const plan = planOpening(rooms, "a", "east", 2.1, 0.9, 0.5);
    expect(plan?.offset).toBeCloseTo(2.45 / 4);
    expect(plan?.link?.roomId).toBe("b");
  });

  it("does not link when the click is off the shared stretch", () => {
    expect(planOpening(rooms, "a", "east", 0.5, 0.9, 0.5)?.link).toBeNull();
  });

  it("shrinks openings wider than the wall", () => {
    expect(planOpening([{ id: "c", rect: r(0, 0, 1, 1) }], "c", "north", 0.5, 2, 0.5)?.widthM).toBe(1);
  });

  it("findLinkTarget requires the whole span to be on the shared stretch", () => {
    expect(findLinkTarget(rooms, "a", "east", 0.5, 0.9)).toBeNull(); // z 1.55..2.45 straddles z = 2
    expect(findLinkTarget(rooms, "a", "east", 0.75, 0.9)?.roomId).toBe("b");
  });
});

describe("link reconciliation", () => {
  const op = (o: Partial<LinkableOpening> & Pick<LinkableOpening, "id" | "room_id" | "wall">): LinkableOpening => ({
    wall_offset: 0.5,
    widthM: 0.9,
    target_room_id: null,
    ...o,
  });
  const openings = [
    op({ id: "oa", room_id: "a", wall: "east", wall_offset: 0.75, target_room_id: "b" }),
    op({ id: "ob", room_id: "b", wall: "west", wall_offset: 1 / 6, target_room_id: "a" }),
  ];

  it("finds the partner opening", () => {
    expect(findPartner(openings[0], openings)?.id).toBe("ob");
  });

  it("keeps the moved room's door fixed and realigns the partner on the other side", () => {
    const moved: PlacementRoom[] = [
      { id: "a", rect: r(0, 0, 4, 4) },
      { id: "b", rect: r(4, 1, 3, 6) }, // b moved down 1 m
    ];
    // ob stays 1 m up b's west wall (now z = 2), so oa follows to z = 2 on a's 4 m east wall.
    expect(reconcileLinks("b", moved, openings)).toEqual([{ id: "oa", wall_offset: 0.5 }]);
    // Same move, evaluated as a change to room a: oa stays at z = 3, ob realigns to 2 m up b's wall.
    expect(reconcileLinks("a", moved, openings)).toEqual([{ id: "ob", wall_offset: expect.closeTo(2 / 6, 6) }]);
  });

  it("unlinks both sides when the rooms are pulled apart", () => {
    const apart: PlacementRoom[] = [
      { id: "a", rect: r(0, 0, 4, 4) },
      { id: "b", rect: r(6, 2, 3, 6) },
    ];
    expect(reconcileLinks("a", apart, openings)).toEqual([
      { id: "oa", target_room_id: null },
      { id: "ob", target_room_id: null },
    ]);
  });
});

describe("opening width units", () => {
  const size = { width: 10, depth: 5 };
  it("prefers width_m (metres)", () => {
    expect(openingWidthM({ wall: "north", width: 0.5, width_m: 0.9 }, size)).toBe(0.9);
    expect(openingHalfFraction({ wall: "north", width: 0.5, width_m: 1 }, size)).toBeCloseTo(0.05);
  });
  it("falls back to the legacy fraction-of-wall width", () => {
    expect(openingWidthM({ wall: "east", width: 0.2, width_m: null }, size)).toBeCloseTo(1);
    expect(openingWidthM({ wall: "north", width: 0.2 }, size)).toBeCloseTo(2);
  });
  it("never exceeds the wall", () => {
    expect(openingWidthM({ wall: "east", width_m: 9 }, size)).toBe(5);
  });
});

describe("gridLines", () => {
  it("covers the range on step multiples and caps density", () => {
    expect(gridLines(-1.2, 1.2, 0.5)).toEqual([-1, -0.5, 0, 0.5, 1]);
    expect(gridLines(0, 1000, 0.5, 100).length).toBeLessThanOrEqual(101);
  });
});

describe("autoLinks (rooms moved so they touch)", () => {
  const op = (id: string, room_id: string, wall: LinkableOpening["wall"], wall_offset: number, target: string | null = null): LinkableOpening => ({
    id,
    room_id,
    wall,
    wall_offset,
    widthM: 0.9,
    target_room_id: target,
  });
  // a: 4x4 at origin; b: 4x6 moved to touch a's east wall (x = 4), z 0..6.
  const rooms: PlacementRoom[] = [
    { id: "a", rect: r(0, 0, 4, 4) },
    { id: "b", rect: r(4, 0, 4, 6) },
  ];

  it("creates a mirror for an unlinked door that now sits on the shared wall", () => {
    const links = autoLinks("b", rooms, [op("oa", "a", "east", 0.5)]);
    expect(links).toEqual([
      { openingId: "oa", targetRoomId: "b", partnerId: null, mirror: { roomId: "b", wall: "west", offset: expect.closeTo(2 / 6, 6), widthM: 0.9 } },
    ]);
  });

  it("pairs with an overlapping unlinked opening on the neighbour instead of duplicating", () => {
    const links = autoLinks("a", rooms, [op("oa", "a", "east", 0.5), op("ob", "b", "west", 0.35)]);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ openingId: "oa", targetRoomId: "b", partnerId: "ob" });
  });

  it("ignores linked doors, doors off the shared stretch, and rooms not involved in the move", () => {
    expect(autoLinks("b", rooms, [op("oa", "a", "east", 0.5, "b"), op("ob", "b", "west", 2 / 6, "a")])).toEqual([]);
    // b's west wall spans z 0..6 but only 0..4 is shared; a door at z = 5 stays unlinked.
    expect(autoLinks("b", rooms, [op("ob", "b", "west", 5 / 6)])).toEqual([]);
    const three: PlacementRoom[] = [...rooms, { id: "c", rect: r(0, 4, 4, 4) }];
    // a <-> c touch, but only b moved: leave a/c alone.
    expect(autoLinks("b", three, [op("oa", "a", "north", 0.5)])).toEqual([]);
  });
});

describe("magnetic snapping to room edges", () => {
  // Neighbour edges at x = 3.3 / 6.3 (off the 1 m grid), z = 0 / 4.
  const others = [r(3.3, 0, 3, 4)];

  it("snaps a coordinate to a nearby edge before the grid", () => {
    expect(snapCoord(3.45, 1, [3.3, 6.3], 0.3)).toEqual({ v: 3.3, hit: 3.3 });
    expect(snapCoord(4.7, 1, [3.3, 6.3], 0.3)).toEqual({ v: 5, hit: null });
  });

  it("moves a room flush against a neighbour's wall and reports guides", () => {
    // 2 m wide room dragged so its east edge lands near x = 3.3.
    const { rect, guides } = snapMove(r(0, 0, 2, 2), 1.15, 0.1, 1, others, 0.3);
    expect(rect).toEqual({ x: 1.3, z: 0, w: 2, d: 2 });
    expect(guides.x).toContain(3.3);
    expect(guides.z).toContain(0);
  });

  it("falls back to the grid when nothing is close", () => {
    const { rect, guides } = snapMove(r(0, 0, 2, 2), 10.4, 10.6, 1, others, 0.3);
    expect(rect).toEqual({ x: 10, z: 11, w: 2, d: 2 });
    expect(guides).toEqual({ x: [], z: [] });
  });

  it("snaps drawn and resized edges to neighbours", () => {
    const drawn = snapDraw({ x: 6.4, z: 0.1 }, { x: 9.2, z: 3.8 }, 1, 1, others, 0.3);
    expect(drawn.rect).toEqual({ x: 6.3, z: 0, w: 2.7, d: 4 });
    expect(drawn.guides.x).toContain(6.3);
    const resized = snapResize(r(7, 0, 2, 2), "w", { x: 6.2, z: 1 }, 1, 1, others, 0.3);
    expect(resized.rect).toEqual({ x: 6.3, z: 0, w: 2.7, d: 2 });
  });

  it("lists adjacent rooms with enough shared wall", () => {
    const rooms = [
      { id: "a", rect: r(0, 0, 4, 4) },
      { id: "b", rect: r(4, 0, 4, 4) },
      { id: "c", rect: r(0, 4, 0.5, 2) }, // touches a's north wall for only 0.5 m
    ];
    expect(adjacentRooms("a", rooms).map((x) => x.roomId)).toEqual(["b"]);
  });
});
