import { describe, expect, it } from "vitest";
import { seededRandom, starField } from "./sky";

describe("seededRandom", () => {
  it("is deterministic per seed and stays in [0, 1)", () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    const xs = Array.from({ length: 1000 }, () => a());
    expect(xs).toEqual(Array.from({ length: 1000 }, () => b()));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(seededRandom(43)()).not.toBe(xs[0]);
  });
});

describe("starField", () => {
  const f = starField(4000, 80, 7);
  const ys = Array.from({ length: 4000 }, (_, i) => f.positions[i * 3 + 1] / 80);

  it("puts every star on the sphere, above the horizon cut", () => {
    for (let i = 0; i < 4000; i++) {
      const [x, y, z] = [f.positions[i * 3], f.positions[i * 3 + 1], f.positions[i * 3 + 2]];
      expect(Math.hypot(x, y, z)).toBeCloseTo(80, 3);
      expect(y / 80).toBeGreaterThanOrEqual(-0.05 - 1e-6);
    }
  });

  it("is as dense overhead as near the horizon (uniform per solid angle)", () => {
    // Equal slices of y are equal solid angles.
    const high = ys.filter((y) => y > 0.6).length;
    const low = ys.filter((y) => y >= 0 && y < 0.4).length;
    expect(high / low).toBeGreaterThan(0.85);
    expect(high / low).toBeLessThan(1.15);
  });

  it("is mostly faint with a few bright stars, in a visible pixel range", () => {
    const sizes = Array.from(f.sizes).sort((a, b) => a - b);
    expect(sizes[0]).toBeGreaterThanOrEqual(1.5);
    expect(sizes[sizes.length - 1]).toBeLessThanOrEqual(4);
    expect(sizes[Math.floor(sizes.length / 2)]).toBeLessThan(2); // median faint
    const bright = Array.from(f.brightness).filter((b) => b > 0.7).length;
    expect(bright / 4000).toBeGreaterThan(0.05);
    expect(bright / 4000).toBeLessThan(0.35);
  });

  it("is the same sky every time for a seed", () => {
    expect(starField(50, 10, 3).positions).toEqual(starField(50, 10, 3).positions);
  });
});
