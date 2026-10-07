import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards WCAG AA (4.5:1) for the token pairs the UI actually uses.
const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
function lum(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const PAIRS: Array<[string, string]> = [
  ["foreground", "background"],
  ["foreground", "card"],
  ["card-foreground", "card"],
  ["foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "muted"],
  ["link", "background"],
  ["link", "card"],
  ["primary-foreground", "primary"],
  ["primary-foreground", "primary-hover"],
  ["accent-foreground", "accent"],
  ["highlight", "card"],
  ["highlight", "background"],
  ["destructive", "card"],
  ["destructive", "background"],
  ["destructive-foreground", "destructive"],
  ["success", "card"],
  ["success-foreground", "success"],
];

describe("theme tokens meet WCAG AA", () => {
  const light = tokens(":root");
  const dark = { ...light, ...tokens(".dark") };
  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${name} theme`, () => {
      for (const [fg, bg] of PAIRS) {
        expect(t[fg], `${name} --${fg}`).toBeDefined();
        expect(t[bg], `${name} --${bg}`).toBeDefined();
        expect(ratio(t[fg], t[bg]), `${name}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

describe("scene tokens", () => {
  const light = tokens(":root");
  const dark = { ...light, ...tokens(".dark") };
  const REQUIRED = ["sky", "horizon", "fog", "floor", "wall", "door", "archway", "locus", "locus-active", "path", "grid"];
  for (const [name, t] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    it(`${name} defines every --scene-* token`, () => {
      for (const k of REQUIRED) expect(t[`scene-${k}`], `${name} --scene-${k}`).toBeDefined();
    });
  }
  it("night sky is darker than day sky and walls stay distinct from floors", () => {
    expect(lum(dark["scene-sky"])).toBeLessThan(lum(light["scene-sky"]));
    expect(ratio(light["scene-wall"], light["scene-floor"])).toBeGreaterThan(1.05);
    expect(ratio(dark["scene-wall"], dark["scene-floor"])).toBeGreaterThan(1.3);
  });
  it("markers read against the floor in both themes", () => {
    expect(ratio(light["scene-locus"], light["scene-floor"])).toBeGreaterThanOrEqual(3);
    expect(ratio(dark["scene-locus"], dark["scene-floor"])).toBeGreaterThanOrEqual(3);
  });
});
