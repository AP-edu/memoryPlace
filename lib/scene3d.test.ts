import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { Locus, Opening, Room } from "@/types/database";
import {
  anchorFromPoint,
  anchorInOpening,
  distributeOnWall,
  arrowPlacement,
  buildTourStops,
  navArrows,
  navStep,
  navStops,
  orderTourStopsByCards,
  stopPose,
  cutawayWalls,
  easeInOut,
  exitThroughDoor,
  fromScene,
  lerpPose,
  nearestAnchor,
  reorderPositions,
  returnDoor,
  spawnAtDoor,
  toScene,
  tourOrder,
  tourStep,
  viewPoseForLocus,
} from "./scene3d";
import { forwardVec, stepPlayer } from "./walk";

const room: Room = {
  id: "r",
  palace_id: "p",
  user_id: "u",
  title: "Room",
  background: null,
  metadata: {},
  width: 10,
  depth: 8,
  height: 3,
  level_id: null,
  pos_x: 0,
  pos_z: 0,
  rotation: 0,
  outline: null,
  created_at: "2026-01-01T00:00:00Z",
};

const locus = (id: string, position: number, extra: Partial<Locus> = {}): Locus => ({
  id,
  room_id: "r",
  x: 0,
  y: 0,
  z: null,
  label: id,
  tags: [],
  position,
  wall: "north",
  wall_offset: 0.5,
  height: 1.5,
  created_at: "2026-01-01T00:00:00Z",
  ...extra,
});

const opening = (o: Partial<Opening>): Opening => ({
  id: "o",
  room_id: "r",
  wall: "east",
  wall_offset: 0.5,
  width: 0.1,
  width_m: 1,
  kind: "door",
  target_room_id: null,
  created_at: "2026-01-01T00:00:00Z",
  ...o,
});

describe("world <-> scene mapping", () => {
  it("negates z so the scene is not mirrored", () => {
    expect(toScene({ x: 1, y: 2, z: 3 })).toEqual([1, 2, -3]);
    expect(fromScene({ x: 1, y: 2, z: -3 })).toEqual({ x: 1, y: 2, z: 3 });
  });
  it("puts east on the RIGHT when facing north (three.js projection)", () => {
    const cam = new THREE.PerspectiveCamera(70, 1, 0.1, 100);
    const f = forwardVec(0);
    cam.position.set(...toScene({ x: 5, y: 1.6, z: 1 }));
    cam.lookAt(...toScene({ x: 5 + f.x, y: 1.6, z: 1 + f.z }));
    cam.updateMatrixWorld();
    const east = new THREE.Vector3(...toScene({ x: 8, y: 1.6, z: 6 })).project(cam);
    const west = new THREE.Vector3(...toScene({ x: 2, y: 1.6, z: 6 })).project(cam);
    expect(east.x).toBeGreaterThan(0);
    expect(west.x).toBeLessThan(0);
  });
});

describe("raycast hit -> wall anchor", () => {
  it("maps a north/south hit by x and an east/west hit by z", () => {
    expect(anchorFromPoint("north", { x: 2.5, y: 1.42, z: 8 }, room)).toEqual({ wall: "north", wall_offset: 0.25, height: 1.4 });
    expect(anchorFromPoint("east", { x: 10, y: 2, z: 2 }, room)).toEqual({ wall: "east", wall_offset: 0.25, height: 2 });
  });
  it("snaps along the wall and clamps offset and height", () => {
    expect(anchorFromPoint("south", { x: 3.33, y: 1.5, z: 0 }, room).wall_offset).toBeCloseTo(0.33);
    expect(anchorFromPoint("west", { x: 0, y: 9, z: -1 }, room)).toEqual({ wall: "west", wall_offset: 0, height: 2.8 });
    expect(anchorFromPoint("west", { x: 0, y: -1, z: 12 }, room)).toEqual({ wall: "west", wall_offset: 1, height: 0.3 });
  });
  it("picks the nearest wall for free points", () => {
    expect(nearestAnchor({ x: 9.6, y: 1.5, z: 4 }, room).wall).toBe("east");
    expect(nearestAnchor({ x: 5, y: 1.5, z: 0.2 }, room).wall).toBe("south");
  });
});

describe("cutaway walls", () => {
  it("hides the walls between an outside camera and the room", () => {
    expect([...cutawayWalls({ x: 12, z: -3 }, room)].sort()).toEqual(["east", "south"]);
    expect(cutawayWalls({ x: 5, z: 4 }, room).size).toBe(0);
  });
});

describe("tour ordering", () => {
  const loci = [
    locus("c", 2),
    locus("a", 0, { created_at: "2026-01-02T00:00:00Z" }),
    locus("b", 0, { created_at: "2026-01-01T00:00:00Z" }),
  ];
  it("orders by position, then created_at, then id", () => {
    expect(tourOrder(loci).map((l) => l.id)).toEqual(["b", "a", "c"]);
  });
  it("steps with clamping or wrapping", () => {
    expect(tourStep(3, 2, 1)).toBe(2);
    expect(tourStep(3, 2, 1, true)).toBe(0);
    expect(tourStep(3, 0, -1, true)).toBe(2);
    expect(tourStep(0, 0, 1)).toBe(-1);
  });
  it("reorders by swapping and normalising positions", () => {
    // b(0) a(0) c(2) -> move c up -> b, c, a with positions 0,1,2
    expect(reorderPositions(loci, "c", -1)).toEqual([
      { id: "c", position: 1 },
      { id: "a", position: 2 },
    ]);
    expect(reorderPositions(loci, "b", -1)).toEqual([]);
  });
});

describe("tour camera", () => {
  it("stands in front of a north-wall locus looking north", () => {
    const pose = viewPoseForLocus({ wall: "north", wall_offset: 0.5, height: 1.6 }, room, 2);
    expect(pose.x).toBeCloseTo(5);
    expect(pose.z).toBeCloseTo(6);
    expect(pose.yaw).toBeCloseTo(0);
    expect(pose.pitch).toBeCloseTo(0);
  });
  it("faces east for an east-wall locus and stays inside small rooms", () => {
    const pose = viewPoseForLocus({ wall: "east", wall_offset: 0.5, height: 1.6 }, { ...room, width: 2 }, 3);
    expect(pose.x).toBeCloseTo(0.6);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2);
  });
  it("eases and interpolates yaw the short way", () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5);
    const mid = lerpPose({ x: 0, z: 0, yaw: 3, pitch: 0 }, { x: 2, z: 2, yaw: -3, pitch: 0 }, 0.5);
    expect(Math.abs(mid.yaw)).toBeCloseTo(Math.PI, 1);
    expect(mid.x).toBe(1);
  });
});

describe("linked doors in walk mode", () => {
  const linked = opening({ id: "d1", wall: "east", wall_offset: 0.5, width_m: 1, target_room_id: "r2" });
  it("detects walking out through a linked door", () => {
    expect(exitThroughDoor({ x: 10.4, z: 4.1 }, room, [linked])?.id).toBe("d1");
    expect(exitThroughDoor({ x: 10.4, z: 1 }, room, [linked])).toBeNull(); // beside the door
    expect(exitThroughDoor({ x: 10.4, z: 4 }, room, [{ ...linked, target_room_id: null }])).toBeNull(); // unlinked
    expect(exitThroughDoor({ x: 5, z: 4 }, room, [linked])).toBeNull(); // still inside
  });
  it("spawns just inside the return door, facing into the room", () => {
    const back = opening({ id: "d2", room_id: "r2", wall: "west", wall_offset: 0.25, target_room_id: "r" });
    expect(returnDoor([linked, back], "r2", "r")?.id).toBe("d2");
    const pose = spawnAtDoor(back, room);
    expect(pose.x).toBeCloseTo(1);
    expect(pose.z).toBeCloseTo(2);
    expect(pose.yaw).toBeCloseTo(Math.PI / 2); // facing east, into the room
  });
});

describe("walk movement handedness", () => {
  it("strafes right = east when facing north", () => {
    const next = stepPlayer({ x: 5, z: 4, yaw: 0, pitch: 0 }, { throttle: 0, strafe: 1 }, 0.05, room, []);
    expect(next.x).toBeGreaterThan(5);
    expect(next.z).toBeCloseTo(4);
  });
  it("walks forward = north at yaw 0", () => {
    const next = stepPlayer({ x: 5, z: 4, yaw: 0, pitch: 0 }, { throttle: 1, strafe: 0 }, 0.05, room, []);
    expect(next.z).toBeGreaterThan(4);
  });
});

describe("tour stops", () => {
  it("makes one stop per card in locus order, and a card-less stop for empty loci", () => {
    const loci = [locus("b", 1), locus("a", 0), locus("e", 2)];
    const cards = [
      { id: "c2", locus_id: "a", created_at: "2026-01-02T00:00:00Z" },
      { id: "c1", locus_id: "a", created_at: "2026-01-01T00:00:00Z" },
      { id: "c3", locus_id: "b", created_at: "2026-01-01T00:00:00Z" },
      { id: "orphan", locus_id: "zzz", created_at: "2026-01-01T00:00:00Z" },
    ];
    const stops = buildTourStops(loci, cards);
    expect(stops.map((s) => [s.locus.id, s.card?.id ?? null, s.locusIndex])).toEqual([
      ["a", "c1", 0],
      ["a", "c2", 0],
      ["b", "c3", 1],
      ["e", null, 2],
    ]);
    expect(new Set(stops.map((s) => s.key)).size).toBe(4);
  });

  it("reorders stops by a due-first card order, card-less stops last in canonical order", () => {
    const loci = [locus("b", 1), locus("a", 0), locus("e", 2)];
    const cards = [
      { id: "c1", locus_id: "a", created_at: "2026-01-01T00:00:00Z" },
      { id: "c2", locus_id: "a", created_at: "2026-01-02T00:00:00Z" },
      { id: "c3", locus_id: "b", created_at: "2026-01-01T00:00:00Z" },
    ];
    const stops = buildTourStops(loci, cards);
    const ordered = orderTourStopsByCards(stops, ["c3", "c1"]);
    expect(ordered.map((s) => s.card?.id ?? null)).toEqual(["c3", "c1", "c2", null]);
  });

  it("returns stops unchanged for an empty card order", () => {
    const loci = [locus("a", 0)];
    const stops = buildTourStops(loci, [{ id: "c1", locus_id: "a", created_at: "2026-01-01T00:00:00Z" }]);
    expect(orderTourStopsByCards(stops, [])).toBe(stops);
  });
});

describe("street-view navigation", () => {
  const room = { id: "r", width: 6, depth: 4, height: 3 } as Room;
  const loci = [locus("b", 1, { wall: "east", wall_offset: 0.5, height: 1.5 }), locus("a", 0, { wall: "north", wall_offset: 0.5, height: 1.5 })];
  const door = { id: "d1", room_id: "r", wall: "west", wall_offset: 0.5, width: 0.2, width_m: 0.9, kind: "door", target_room_id: "lib", created_at: "" } as Opening;
  const plain = { ...door, id: "d2", target_room_id: null, wall: "south" } as Opening;

  it("lists loci in study order, then linked doors only", () => {
    const stops = navStops(loci, [plain, door]);
    expect(stops.map((s) => s.key)).toEqual(["l:a", "l:b", "d:d1"]);
  });

  it("steps from 'nowhere' to the first/last stop and clamps at the ends", () => {
    expect(navStep(3, -1, 1)).toBe(0);
    expect(navStep(3, -1, -1)).toBe(2);
    expect(navStep(3, 2, 1)).toBe(2);
    expect(navStep(3, 0, -1)).toBe(0);
  });

  it("points arrows at the next/prev stop and every linked door", () => {
    const stops = navStops(loci, [door]);
    const centre = { x: 3, z: 2 };
    const fromStart = navArrows(centre, stops, -1, room);
    expect(fromStart.map((a) => [a.stopIndex, a.role])).toEqual([
      [0, "next"],
      [2, "door"],
    ]);
    // Next = locus "a" on the north wall: chevron sits north of the player, heading ~0 (north).
    const n = fromStart[0];
    expect(n.z).toBeGreaterThan(centre.z);
    expect(Math.abs(n.yaw)).toBeLessThan(0.3);
    // The door is on the west wall: heading ~ -pi/2 (west).
    expect(fromStart[1].yaw).toBeCloseTo(-Math.PI / 2, 1);
    const atA = navArrows(stopPose(stops[0], room), stops, 0, room);
    expect(atA.map((a) => [a.stopIndex, a.role])).toEqual([
      [1, "next"],
      [2, "door"],
    ]);
  });

  it("stands just inside a door looking out through it", () => {
    const stops = navStops([], [door]);
    const p = stopPose(stops[0], room);
    expect(p.x).toBeCloseTo(1.4);
    expect(p.z).toBeCloseTo(2);
    expect(p.yaw).toBeCloseTo(-Math.PI / 2); // facing west, out of the room
  });

  it("places chevrons partway to a close target", () => {
    const a = arrowPlacement({ x: 0, z: 0 }, { x: 1, z: 0 });
    expect(a.x).toBeCloseTo(0.7);
    expect(a.yaw).toBeCloseTo(Math.PI / 2);
  });
});

describe("anchorInOpening", () => {
  const door = opening({ wall: "north", wall_offset: 0.5, width_m: 2 }); // 2 m of a 10 m wall: 0.4..0.6
  it("flags anchors inside a gap, with clearance", () => {
    expect(anchorInOpening({ wall: "north", wall_offset: 0.5 }, room, [door])).toBe(true);
    expect(anchorInOpening({ wall: "north", wall_offset: 0.61 }, room, [door])).toBe(true); // within 0.15 m margin
    expect(anchorInOpening({ wall: "north", wall_offset: 0.7 }, room, [door])).toBe(false);
  });
  it("only looks at the same wall", () => {
    expect(anchorInOpening({ wall: "south", wall_offset: 0.5 }, room, [door])).toBe(false);
  });
});

describe("distributeOnWall", () => {
  it("spreads loci evenly in their current order", () => {
    const out = distributeOnWall(
      [
        { id: "c", wall_offset: 0.9, position: 2 },
        { id: "a", wall_offset: 0.1, position: 0 },
        { id: "b", wall_offset: 0.15, position: 1 },
      ],
      "north",
      room,
      []
    );
    const byId = Object.fromEntries(out.map((u) => [u.id, u.wall_offset]));
    expect(byId.a).toBe(0.25);
    expect(byId.b).toBe(0.5);
    expect(byId.c).toBe(0.75);
  });
  it("skips loci that already sit in place and returns nothing for empty input", () => {
    expect(distributeOnWall([{ id: "a", wall_offset: 0.5, position: 0 }], "north", room, [])).toEqual([]);
    expect(distributeOnWall([], "north", room, [])).toEqual([]);
  });
  it("keeps loci out of door gaps", () => {
    const door = opening({ wall: "north", wall_offset: 0.5, width_m: 2 }); // gap 0.4..0.6
    const out = distributeOnWall(
      [
        { id: "a", wall_offset: 0.1, position: 0 },
        { id: "b", wall_offset: 0.9, position: 1 },
      ],
      "north",
      room,
      [door]
    );
    expect(out).toHaveLength(2);
    for (const u of out) expect(u.wall_offset < 0.4 || u.wall_offset > 0.6).toBe(true);
    expect(out.find((u) => u.id === "a")!.wall_offset).toBeLessThan(out.find((u) => u.id === "b")!.wall_offset);
  });
});
