import { describe, expect, it } from "vitest";
import { calibrateUnderlay, initialPlacement, moveUnderlay, storedSize, underlayRect } from "./underlay";

describe("tracing underlay", () => {
  const view = { cx: 10, cz: 5, widthM: 40, heightM: 20 };

  it("starts centred on the view, fitting 80% of it", () => {
    const p = initialPlacement(1000, 500, view);
    const r = underlayRect(p);
    expect(r.w).toBeCloseTo(32);
    expect(r.d).toBeCloseTo(16);
    expect(r.x + r.w / 2).toBeCloseTo(10);
    expect(r.z - r.d / 2).toBeCloseTo(5);
    expect(p.visible).toBe(true);
  });

  it("moves with a drag", () => {
    const p = moveUnderlay(initialPlacement(1000, 500, view), 2, -1);
    expect(underlayRect(p).x).toBeCloseTo(10 - 16 + 2);
  });

  it("calibrates two points to a real distance, pinning the first", () => {
    const p = initialPlacement(1000, 500, view); // 0.032 m per px
    const a = { x: p.x + 100 * p.scale, z: p.z - 50 * p.scale };
    const b = { x: a.x + 200 * p.scale, z: a.z };
    const q = calibrateUnderlay(p, a, b, 10); // those 200 px are really 10 m
    expect(q.scale).toBeCloseTo(0.05);
    // The first point still sits on the same image pixel.
    expect((a.x - q.x) / q.scale).toBeCloseTo(100);
    expect((q.z - a.z) / q.scale).toBeCloseTo(50);
    // Nonsense input leaves it alone.
    expect(calibrateUnderlay(p, a, a, 10)).toBe(p);
    expect(calibrateUnderlay(p, a, b, 0)).toBe(p);
  });

  it("downscales big photos for storage, never upscales", () => {
    expect(storedSize(4800, 3600)).toEqual({ w: 2400, h: 1800 });
    expect(storedSize(800, 600)).toEqual({ w: 800, h: 600 });
  });
});
