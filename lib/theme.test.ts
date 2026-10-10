import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isPalette, PALETTES, resolveDark, THEME_INIT_SCRIPT } from "./theme";

describe("theme", () => {
  it("resolves system mode from the OS preference", () => {
    expect(resolveDark("dark", false)).toBe(true);
    expect(resolveDark("light", true)).toBe(false);
    expect(resolveDark("system", true)).toBe(true);
    expect(resolveDark("system", false)).toBe(false);
  });
  it("init script is a self-contained IIFE using the same storage key", () => {
    expect(THEME_INIT_SCRIPT.startsWith("(function(){")).toBe(true);
    expect(THEME_INIT_SCRIPT).toContain('"mp-theme"');
    expect(() => new Function(THEME_INIT_SCRIPT)).not.toThrow();
  });
  it("every palette is styled in globals.css and known to the init script", () => {
    const css = readFileSync(join(__dirname, "..", "app", "globals.css"), "utf8");
    for (const p of PALETTES.filter((x) => x.id !== "aegean")) {
      expect(css).toContain(`[data-palette="${p.id}"]:not(.dark)`);
      expect(css).toContain(`[data-palette="${p.id}"].dark`);
      expect(THEME_INIT_SCRIPT).toContain(`"${p.id}"`);
    }
    expect(THEME_INIT_SCRIPT).toContain('"mp-palette"');
    expect(isPalette("library")).toBe(true);
    expect(isPalette("neon")).toBe(false);
  });
});
