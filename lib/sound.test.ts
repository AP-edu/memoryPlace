import { describe, expect, it } from "vitest";
import { chimeFrequency } from "./sound";

describe("chimeFrequency", () => {
  it("climbs a pentatonic scale in study order", () => {
    expect(chimeFrequency(0)).toBeCloseTo(523.25, 1);
    const f = Array.from({ length: 10 }, (_, i) => chimeFrequency(i));
    for (let i = 1; i < f.length; i++) expect(f[i]).toBeGreaterThan(f[i - 1]);
    expect(chimeFrequency(5)).toBeCloseTo(1046.5, 0); // one octave up
  });
  it("wraps after two octaves and tolerates junk", () => {
    expect(chimeFrequency(10)).toBeCloseTo(chimeFrequency(0), 5);
    expect(chimeFrequency(-3)).toBeCloseTo(chimeFrequency(0), 5);
  });
});
