import { describe, expect, it } from "vitest";
import type { Opening, Room } from "@/types/database";
import { isTempRoomId, palaceBounds, palaceCameraDistance, palaceLevelRooms } from "./palaceScene";

function room(over: Partial<Room> & { id: string }): Room {
  return {
    palace_id: "p1",
    title: over.id,
    width: 4,
    depth: 3,
    height: 3,
    level_id: "L1",
    pos_x: 0,
    pos_z: 0,
    ...over,
  } as Room;
}

function opening(over: Partial<Opening> & { id: string; room_id: string }): Opening {
  return { wall: "north", kind: "door", wall_offset: 0.5, ...over } as Opening;
}

describe("isTempRoomId", () => {
  it("flags unconfirmed local rooms", () => {
    expect(isTempRoomId("tmp-1")).toBe(true);
    expect(isTempRoomId("abc")).toBe(false);
  });
});

describe("palaceLevelRooms", () => {
  const rooms = [
    room({ id: "a", level_id: "L1", pos_x: 0, pos_z: 0 }),
    room({ id: "b", level_id: "L1", pos_x: 5, pos_z: 1 }),
    room({ id: "c", level_id: "L2", pos_x: 0, pos_z: 0 }),
    room({ id: "tmp-9", level_id: "L1", pos_x: 9, pos_z: 9 }),
    room({ id: "d", level_id: null, pos_x: 2, pos_z: 2 }),
  ];
  const openings = [
    opening({ id: "o1", room_id: "a" }),
    opening({ id: "o2", room_id: "c" }),
    opening({ id: "o3", room_id: "tmp-9" }),
  ];

  it("keeps only confirmed rooms on the level, with offsets + openings", () => {
    const entries = palaceLevelRooms(rooms, openings, "L1", "L1");
    expect(entries.map((e) => e.room.id).sort()).toEqual(["a", "b", "d"]);
    expect(entries.find((e) => e.room.id === "a")).toMatchObject({
      openings: [openings[0]],
      offset: { x: 0, z: 0 },
    });
    expect(entries.find((e) => e.room.id === "b")?.openings).toEqual([]);
  });

  it("assigns null-level rooms to the fallback level", () => {
    expect(palaceLevelRooms(rooms, openings, "L2", "L1").map((e) => e.room.id)).toEqual(["c"]);
    expect(palaceLevelRooms(rooms, openings, "L1", "L2").map((e) => e.room.id).sort()).toEqual(["a", "b"]);
  });
});

describe("palaceBounds", () => {
  it("returns null for no rooms", () => {
    expect(palaceBounds([])).toBeNull();
  });

  it("covers room rects in world position", () => {
    const entries = palaceLevelRooms(
      [room({ id: "a", pos_x: 0, pos_z: 0, width: 4, depth: 3 }), room({ id: "b", pos_x: 5, pos_z: 1, width: 2, depth: 2 })],
      [],
      "L1",
      "L1"
    );
    expect(palaceBounds(entries)).toEqual({ minX: 0, minZ: 0, maxX: 7, maxZ: 3, cx: 3.5, cz: 1.5, span: 7 });
  });
});

describe("palaceCameraDistance", () => {
  it("grows with span and never collapses", () => {
    const near = palaceCameraDistance(4);
    expect(palaceCameraDistance(12)).toBeGreaterThan(near);
    expect(palaceCameraDistance(0)).toBeGreaterThan(0);
    expect(Number.isFinite(near)).toBe(true);
  });
});
