// WebGL availability probe (pure logic — no scene code here).
// A missing/blocked GPU context (e.g. hardware acceleration off) throws deep
// inside THREE otherwise, so every R3F Canvas site checks this first and the
// error boundary below catches anything that still fails at runtime.

export interface WebGLStatus {
  ok: boolean;
  /** "webgl2" | "webgl" when ok, otherwise a short machine-readable reason. */
  detail: string;
}

/** True when forced off for QA via ?webgl=off (mirrors the ?debug=1 hook). */
export function webglForceOff(search = ""): boolean {
  try {
    return new URLSearchParams(search).get("webgl") === "off";
  } catch {
    return false;
  }
}

/**
 * Probe for a usable WebGL context. Pass-through `canvas` exists for tests
 * (jsdom has no real GL); never throws.
 */
export function supportsWebGL(
  doc: { createElement?: (tag: string) => { getContext?: (kind: string) => unknown } } | null = typeof document !== "undefined" ? document : null,
  search = typeof window !== "undefined" ? window.location.search : ""
): WebGLStatus {
  if (webglForceOff(search)) return { ok: false, detail: "forced-off" };
  if (!doc?.createElement) return { ok: false, detail: "no-dom" };
  try {
    const canvas = doc.createElement("canvas");
    if (!canvas?.getContext) return { ok: false, detail: "no-canvas" };
    if (canvas.getContext("webgl2")) return { ok: true, detail: "webgl2" };
    if (canvas.getContext("webgl")) return { ok: true, detail: "webgl" };
    return { ok: false, detail: "no-context" };
  } catch {
    return { ok: false, detail: "probe-threw" };
  }
}
