import { describe, expect, it } from "vitest";
import { resolveDark, THEME_INIT_SCRIPT } from "./theme";

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
});
