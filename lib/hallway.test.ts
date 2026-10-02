import { describe, expect, it } from "vitest";
import { planHallway, sharedStretch } from "./hallway";
import { rectsOverlap, sharedWalls, type Rect } from "./grid";

const r = (x: number, z: number, w: number, d: number): Rect => ({ x, z, w, d });

function assertChain(a: Rect, b: Rect, segs: Rect[], others: Rect[] = []) {
  const chain = [a, ...segs, b];
  for (let i = 0; i + 1 < chain.length; i++) expect(sharedWalls(chain[i], chain[i + 1]).length).toBeGreaterThan(0);
  for (const s of segs) for (const o of [a, b, ...others]) expect(rectsOverlap(s, o)).toBe(false);
}

describe("hallway pathing", () => {
  it("runs a straight corridor between rooms facing each other", () => {
    const a = r(0, 0, 4, 4);
    const b = r(0, 8, 4, 4);
    const plan = planHallway(a, b, [], { width: 1.5, step: 0.5 })!;
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]).toMatchObject({ z: 4, d: 4, w: 1.5 });
    expect(plan.length).toBe(4);
    assertChain(a, b, plan.segments);
  });

  it("works east-west too", () => {
    const a = r(0, 0, 4, 4);
    const b = r(10, 1, 3, 3);
    const plan = planHallway(a, b, [])!;
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]).toMatchObject({ x: 4, w: 6, d: 1.5 });
    assertChain(a, b, plan.segments);
  });

  it("bends into an L when the rooms are diagonal", () => {
    const a = r(0, 0, 4, 4);
    const b = r(8, 8, 4, 4);
    const plan = planHallway(a, b, [])!;
    expect(plan.segments).toHaveLength(2);
    assertChain(a, b, plan.segments);
  });

  it("routes around a room in the way, or gives up when boxed in", () => {
    const a = r(0, 0, 4, 4);
    const b = r(0, 10, 4, 4);
    const blocker = r(-2, 6, 8, 2); // spans the whole gap between a and b
    expect(planHallway(a, b, [blocker])).toBeNull();
    const narrow = r(0, 6, 2, 2); // only blocks the west half
    const plan = planHallway(a, b, [narrow])!;
    expect(plan).not.toBeNull();
    assertChain(a, b, plan.segments, [narrow]);
  });

  it("is not needed for adjacent rooms", () => {
    expect(planHallway(r(0, 0, 4, 4), r(4, 0, 4, 4), [])).toBeNull();
  });

  it("reports the shared stretch between touching pieces", () => {
    expect(sharedStretch(r(0, 0, 4, 4), r(4, 1, 4, 2))).toMatchObject({ wallA: "east", wallB: "west", from: 1, to: 3 });
  });
});
