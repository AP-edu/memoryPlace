import { describe, expect, it } from "vitest";
import { accentFor, contrast, ensureContrast, hexToRgb, mixHex, rgbToHex } from "./color";

describe("colour maths", () => {
  it("round-trips hex", () => {
    expect(rgbToHex(hexToRgb("#1d5fc4"))).toBe("#1d5fc4");
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("matches known WCAG ratios", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });
  it("ensureContrast keeps passing colours and fixes failing ones in the right direction", () => {
    expect(ensureContrast("#1d5fc4", "#ffffff")).toBe("#1d5fc4");
    const onLight = ensureContrast("#d9a82e", "#ffffff"); // gold on white fails
    expect(contrast(onLight, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    const onDark = ensureContrast("#1d5fc4", "#0f1a3d"); // blue on navy fails
    expect(contrast(onDark, "#0f1a3d")).toBeGreaterThanOrEqual(4.5);
  });
});

describe("accentFor", () => {
  // Every room swatch, on every palette's card colour, stays AA.
  const SWATCHES = ["#1d5fc4", "#1b8fa6", "#d9a82e", "#c8643c", "#7b5ea7", "#7a8f3a", "#2f9e44", "#3b5bdb"];
  const CARDS = ["#fffefb", "#0f1a3d", "#fffaf0", "#241a11", "#ffffff", "#171a20"];
  it("white text on the button and readable links, for every swatch on every card", () => {
    for (const c of SWATCHES)
      for (const card of CARDS) {
        const a = accentFor(c, card);
        expect(contrast(a.primaryForeground, a.primary), `${c} button`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(a.link, card), `${c} link on ${card}`).toBeGreaterThanOrEqual(4.5);
      }
  });
});
