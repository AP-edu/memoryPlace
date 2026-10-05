import { describe, expect, it } from "vitest";
import { supportsWebGL, webglForceOff } from "./webgl";

describe("webglForceOff", () => {
  it("detects ?webgl=off", () => {
    expect(webglForceOff("?webgl=off")).toBe(true);
    expect(webglForceOff("?tour=1")).toBe(false);
    expect(webglForceOff("")).toBe(false);
  });
});

describe("supportsWebGL", () => {
  it("reports webgl2 when available", () => {
    const doc = { createElement: () => ({ getContext: (k: string) => (k === "webgl2" ? {} : null) }) };
    expect(supportsWebGL(doc, "")).toEqual({ ok: true, detail: "webgl2" });
  });
  it("falls back to webgl", () => {
    const doc = { createElement: () => ({ getContext: (k: string) => (k === "webgl" ? {} : null) }) };
    expect(supportsWebGL(doc, "")).toEqual({ ok: true, detail: "webgl" });
  });
  it("reports no-context when GL is blocked (HW accel off)", () => {
    const doc = { createElement: () => ({ getContext: () => null }) };
    expect(supportsWebGL(doc, "")).toEqual({ ok: false, detail: "no-context" });
  });
  it("honours ?webgl=off", () => {
    const doc = { createElement: () => ({ getContext: () => ({}) }) };
    expect(supportsWebGL(doc, "?webgl=off")).toEqual({ ok: false, detail: "forced-off" });
  });
  it("never throws", () => {
    expect(supportsWebGL(null, "")).toEqual({ ok: false, detail: "no-dom" });
    const doc = {
      createElement: () => ({
        getContext: () => {
          throw new Error("blocked");
        },
      }),
    };
    expect(supportsWebGL(doc, "").ok).toBe(false);
  });
});
