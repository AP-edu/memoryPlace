import { describe, expect, it } from "vitest";
import { blockers, clampToRoom, footprint, FURNITURE, FURNITURE_KINDS, furnitureOf, itemRect, nextRotation, normalizeFurniture, obstacles, placeAt } from "./furniture";
import { stepPlayer } from "./walk";

const room = { width: 6, depth: 4 };

describe("furniture geometry", () => {
  it("every kind has a sensible spec", () => {
    for (const k of FURNITURE_KINDS) {
      const s = FURNITURE[k];
      expect(s.w).toBeGreaterThan(0);
      expect(s.d).toBeGreaterThan(0);
      expect(s.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
  it("rotating 90/270 swaps the footprint", () => {
    expect(footprint({ kind: "sofa", rot: 0 })).toEqual({ w: 2, d: 0.9 });
    expect(footprint({ kind: "sofa", rot: 90 })).toEqual({ w: 0.9, d: 2 });
    expect(nextRotation(270)).toBe(0);
  });
  it("keeps items inside the room, snapped", () => {
    const sofa = placeAt({ kind: "sofa" as const, rot: 0 as const, x: 0, z: 0 }, 0.12, 9, room);
    const r = itemRect(sofa);
    expect(r.x0).toBeGreaterThanOrEqual(0);
    expect(r.z1).toBeLessThanOrEqual(room.depth);
    expect(clampToRoom({ kind: "bed" as const, rot: 0 as const, x: 1, z: 1 }, { width: 1, depth: 1 })).toMatchObject({ x: 0.5, z: 0.5 });
  });
});

describe("normalizeFurniture", () => {
  it("drops junk, dedupes ids, snaps rotation, clamps, keeps valid colours", () => {
    const out = normalizeFurniture(
      [
        { id: "a", kind: "table", x: 3, z: 2, rot: 95, color: "#ABCDEF" },
        { id: "a", kind: "chair", x: 1, z: 1 },
        { id: "b", kind: "spaceship", x: 1, z: 1 },
        { id: "c", kind: "rug", x: "1", z: 1 },
        { id: "d", kind: "plant", x: -5, z: 99, color: "red" },
        null,
        "nope",
      ],
      room
    );
    expect(out.map((i) => i.id)).toEqual(["a", "d"]);
    expect(out[0]).toMatchObject({ rot: 90, color: "#abcdef" });
    expect(out[1].color).toBeUndefined();
    expect(out[1].x).toBeGreaterThan(0);
    expect(out[1].z).toBeLessThan(room.depth);
    expect(normalizeFurniture("x", room)).toEqual([]);
  });
  it("reads a room's metadata safely", () => {
    expect(furnitureOf({ ...room, metadata: null })).toEqual([]);
    expect(furnitureOf({ ...room, metadata: { furniture: [{ id: "x", kind: "lamp", x: 1, z: 1 }] } })).toHaveLength(1);
  });
  it("rugs don't block walking", () => {
    const items = normalizeFurniture([{ id: "r", kind: "rug", x: 3, z: 2 }, { id: "t", kind: "table", x: 3, z: 2 }], room);
    expect(obstacles(items)).toHaveLength(1);
  });
});

describe("walking around furniture", () => {
  const table = obstacles(normalizeFurniture([{ id: "t", kind: "table", x: 3, z: 2 }], room));
  it("a table stops you walking into it", () => {
    let pose = { x: 3, z: 0.6, yaw: 0, pitch: 0 }; // south of the table, facing north
    for (let i = 0; i < 40; i++) pose = stepPlayer(pose, { throttle: 1, strafe: 0 }, 0.05, room, [], { obstacles: table });
    expect(pose.z).toBeLessThan(2 - 0.4 - 0.3); // table front edge (z 1.6) minus the walker's radius
  });
  it("you can always walk out of a piece you start inside", () => {
    let pose = { x: 3, z: 2, yaw: Math.PI, pitch: 0 }; // inside the table, facing south
    for (let i = 0; i < 40; i++) pose = stepPlayer(pose, { throttle: 1, strafe: 0 }, 0.05, room, [], { obstacles: table });
    expect(pose.z).toBeLessThan(1.3);
  });
});

describe("tour viewpoints step around furniture", () => {
  const roomFull = { id: "r", palace_id: "p", user_id: "u", title: "R", width: 8, depth: 6, height: 3, pos_x: 0, pos_z: 0, level_id: null, rotation: 0, background: null, metadata: {}, outline: null, created_at: "" } as unknown as import("@/types/database").Room;
  const locus = { wall: "south" as const, wall_offset: 0.5, height: 1.5 };
  it("without furniture stands the full distance back", async () => {
    const { viewPoseForLocus } = await import("./scene3d");
    expect(viewPoseForLocus(locus, roomFull, 2.6).z).toBeCloseTo(2.6, 5);
  });
  it("steps closer when a bookshelf blocks the line of sight", async () => {
    const { viewPoseForLocus } = await import("./scene3d");
    const shelf = blockers(normalizeFurniture([{ id: "b", kind: "bookshelf", x: 4, z: 2.0, rot: 0 }], roomFull), 3);
    const pose = viewPoseForLocus(locus, roomFull, 2.6, 0.6, shelf);
    expect(pose.z).toBeLessThan(1.8);
  });
  it("a low table in between does not block the view", async () => {
    const { viewPoseForLocus } = await import("./scene3d");
    const table = blockers(normalizeFurniture([{ id: "t", kind: "table", x: 4, z: 1.2, rot: 0 }], roomFull), 3);
    expect(viewPoseForLocus(locus, roomFull, 2.6, 0.6, table).z).toBeCloseTo(2.6, 5);
  });
  it("never stands inside a piece", async () => {
    const { viewPoseForLocus } = await import("./scene3d");
    const chair = blockers(normalizeFurniture([{ id: "c", kind: "armchair", x: 4, z: 2.6, rot: 0 }], roomFull), 3);
    const pose = viewPoseForLocus(locus, roomFull, 2.6, 0.6, chair);
    expect(chair.every((b) => !(pose.x > b.x0 && pose.x < b.x1 && pose.z > b.z0 && pose.z < b.z1))).toBe(true);
  });
});
