import { describe, expect, it } from "vitest";
import {
  aerialView,
  carryPose,
  doorPassage,
  doorBetween,
  levelBounds,
  mergeSpans,
  nextTourRoom,
  overheadHeight,
  roomOffset,
  sameLevel,
  sharedSpans,
  splitSpan,
  tourStartRoom,
  twinFramedOpenings,
  wallLine,
} from "./building";

const room = (id: string, pos_x: number, pos_z: number, width: number, depth: number, level_id: string | null = "L0") => ({
  id,
  pos_x,
  pos_z,
  width,
  depth,
  level_id,
});

// Atrium 8x6 at the origin, Library 8x5 north of it, Garden 6x11 east of both.
const atrium = room("a", 0, 0, 8, 6);
const library = room("b", 0, 6, 8, 5);
const garden = room("c", 8, 0, 6, 11);

describe("wall lines", () => {
  it("places each wall on the level plane", () => {
    expect(wallLine(library, "south")).toEqual({ at: 6, from: 0, to: 8 });
    expect(wallLine(atrium, "north")).toEqual({ at: 6, from: 0, to: 8 });
    expect(wallLine(garden, "west")).toEqual({ at: 8, from: 0, to: 11 });
  });
});

describe("shared spans", () => {
  it("finds a wall shared end to end", () => {
    const s = sharedSpans(atrium, [library, garden]);
    expect(s.north).toEqual([{ from: 0, to: 1 }]);
    expect(s.east).toEqual([{ from: 0, to: 1 }]);
    expect(s.south).toBeUndefined();
    expect(s.west).toBeUndefined();
  });

  it("finds partial overlaps as fractions of the wall", () => {
    // Garden's west wall (11 m) touches the atrium (0..6) and the library (6..11).
    const s = sharedSpans(garden, [atrium, library]);
    expect(s.west).toEqual([{ from: 0, to: 1 }]);
    const lonely = sharedSpans(garden, [atrium]);
    expect(lonely.west?.[0].from).toBe(0);
    expect(lonely.west?.[0].to).toBeCloseTo(6 / 11);
  });

  it("ignores corner touches and rooms a gap apart", () => {
    const corner = room("d", 8, 6, 4, 4); // touches the atrium only at its NE corner
    expect(sharedSpans(atrium, [corner])).toEqual({});
    const apart = room("e", 8.5, 0, 4, 6);
    expect(sharedSpans(atrium, [apart])).toEqual({});
  });

  it("ignores itself", () => {
    expect(sharedSpans(atrium, [atrium])).toEqual({});
  });

  it("merges overlapping spans", () => {
    expect(mergeSpans([{ from: 0.5, to: 0.8 }, { from: 0, to: 0.3 }, { from: 0.2, to: 0.6 }])).toEqual([{ from: 0, to: 0.8 }]);
  });
});

describe("splitting a solid span", () => {
  it("keeps exterior walls whole", () => {
    expect(splitSpan({ from: 0, to: 1 }, undefined)).toEqual([{ from: 0, to: 1, shared: false }]);
  });

  it("cuts shared stretches out of a span", () => {
    expect(splitSpan({ from: 0.1, to: 0.9 }, [{ from: 0, to: 0.3 }, { from: 0.6, to: 0.7 }])).toEqual([
      { from: 0.1, to: 0.3, shared: true },
      { from: 0.3, to: 0.6, shared: false },
      { from: 0.6, to: 0.7, shared: true },
      { from: 0.7, to: 0.9, shared: false },
    ]);
  });
});

describe("linked door frames", () => {
  it("gives a linked pair's frame to exactly one side", () => {
    const openings = [
      { id: "o1", room_id: "a", target_room_id: "b" },
      { id: "o2", room_id: "b", target_room_id: "a" },
      { id: "o3", room_id: "a", target_room_id: null },
      { id: "o4", room_id: "c", target_room_id: "a" }, // no return twin: keeps its own frame
    ];
    expect([...twinFramedOpenings(openings)]).toEqual(["o2"]);
  });

  it("finds the door between two rooms", () => {
    const openings = [
      { id: "o1", room_id: "a", target_room_id: "b" },
      { id: "o2", room_id: "b", target_room_id: "a" },
    ];
    expect(doorBetween(openings, "b", "a")?.id).toBe("o2");
    expect(doorBetween(openings, "a", "c")).toBeNull();
  });
});

describe("frames and poses", () => {
  it("offsets a neighbour into the current room's frame", () => {
    expect(roomOffset(garden, library)).toEqual({ x: 8, z: -6 });
  });

  it("carries a pose through a door without moving it in the world", () => {
    // Just north of the atrium's north wall = just inside the library.
    const p = carryPose({ x: 4, z: 6.2, yaw: 0, pitch: -0.3 }, atrium, library);
    expect(p).toEqual({ x: 4, z: expect.closeTo(0.2), yaw: 0, pitch: -0.3 });
  });

  it("filters rooms to a level, with null levels on the fallback", () => {
    const up = room("u", 0, 0, 4, 4, "L1");
    const floating = room("f", 20, 0, 4, 4, null);
    expect(sameLevel([atrium, up, floating], atrium, "L0").map((r) => r.id)).toEqual(["a", "f"]);
    expect(sameLevel([atrium, up, floating], up, "L0").map((r) => r.id)).toEqual(["u"]);
  });

  it("frames a level from above", () => {
    const b = levelBounds([atrium, library, garden])!;
    expect(b).toMatchObject({ minX: 0, minZ: 0, maxX: 14, maxZ: 11, cx: 7, cz: 5.5, span: 14 });
    expect(levelBounds([])).toBeNull();
    // A wider building needs a higher camera.
    expect(overheadHeight(28)).toBeGreaterThan(overheadHeight(14));
  });
});

describe("travel", () => {
  it("walks through a door: inside facing out, then the same distance beyond", () => {
    const { approach, through } = doorPassage({ wall: "north", wall_offset: 0.5 }, atrium, 1);
    expect(approach).toMatchObject({ x: 4, z: 5 });
    expect(through).toMatchObject({ x: 4, z: 7 });
    // Facing north (+z) is yaw 0.
    expect(approach.yaw).toBeCloseTo(0);
    const east = doorPassage({ wall: "east", wall_offset: 0.5 }, atrium, 1);
    expect(east.through).toMatchObject({ x: 9, z: 3 });
    expect(east.approach.yaw).toBeCloseTo(Math.PI / 2);
  });

  it("puts the bird's-eye camera over the level centre, in the current room's frame", () => {
    const v = aerialView([atrium, library, garden], library, -Math.PI / 2 + 1e-9)!;
    expect(v.x).toBeCloseTo(7);
    expect(v.z).toBeCloseTo(-0.5); // level centre z 5.5, library starts at z 6
    expect(v.h).toBeGreaterThan(10);
    // Pitched short of straight down, the camera backs off south to keep the centre in view.
    const tilted = aerialView([atrium, library, garden], library, -1.2)!;
    expect(tilted.z).toBeLessThan(v.z);
    expect(aerialView([], library)).toBeNull();
  });
});

describe("palace tour order", () => {
  const order = ["entry", "a", "b", "c"];
  const tally = {
    entry: { cards: 0, due: 0, loci: 0 },
    a: { cards: 3, due: 0, loci: 3 },
    b: { cards: 4, due: 2, loci: 4 },
    c: { cards: 2, due: 1, loci: 2 },
  };

  it("starts in the first room with due cards, never an empty entrance", () => {
    expect(tourStartRoom(order, tally)).toBe("b");
    expect(tourStartRoom(order, { ...tally, b: { cards: 4, due: 0, loci: 4 }, c: { cards: 2, due: 0, loci: 2 } })).toBe("a");
    expect(tourStartRoom(order, { entry: { cards: 0, due: 0, loci: 2 } })).toBe("entry");
    expect(tourStartRoom(["x"], {})).toBe("x");
    expect(tourStartRoom([], {})).toBeNull();
  });

  it("continues to the next room with due cards, wrapping and skipping toured rooms", () => {
    expect(nextTourRoom(order, "b", tally, new Set(["b"]))).toBe("c");
    expect(nextTourRoom(order, "c", tally, new Set(["b", "c"]))).toBeNull();
    // Wraps past the end of the order.
    expect(nextTourRoom(order, "c", tally, new Set(["c"]))).toBe("b");
    // Walkthrough mode also visits rooms whose cards aren't due.
    expect(nextTourRoom(order, "c", tally, new Set(["b", "c"]), true)).toBe("a");
  });
});
