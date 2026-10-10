"use client";
import { useSyncExternalStore } from "react";

// 3D scene colours come from the same CSS design tokens as the rest of the UI
// (see app/globals.css --scene-*), so the canvas follows light/dark theme.

export interface SceneColors {
  /** Dome zenith colour. */
  sky: string;
  /** Dome horizon colour (also the fog + clear colour). */
  horizon: string;
  /** True under the dark (starry night) theme. */
  night: boolean;
  fog: string;
  floor: string;
  wall: string;
  door: string;
  archway: string;
  locus: string;
  locusActive: string;
  path: string;
  grid: string;
  /** Lighting: key (sun/moon/candle), fill and sky (hemisphere) colours. */
  key: string;
  fill: string;
  hemi: string;
  /** Overall light multiplier (a candlelit study needs more than moonlight). */
  boost: string;
}

const VARS: Record<Exclude<keyof SceneColors, "night">, string> = {
  sky: "--scene-sky",
  horizon: "--scene-horizon",
  fog: "--scene-fog",
  floor: "--scene-floor",
  wall: "--scene-wall",
  door: "--scene-door",
  archway: "--scene-archway",
  locus: "--scene-locus",
  locusActive: "--scene-locus-active",
  path: "--scene-path",
  grid: "--scene-grid",
  key: "--scene-key",
  fill: "--scene-fill",
  hemi: "--scene-hemi",
  boost: "--scene-boost",
};

// SSR / pre-hydration fallback = the dark (starry night) values in globals.css.
export const DEFAULT_SCENE_COLORS: SceneColors = {
  sky: "#02050f",
  horizon: "#101b45",
  night: true,
  fog: "#101b45",
  floor: "#1d2754",
  wall: "#4a5896",
  door: "#f2cf72",
  archway: "#5fd0d6",
  locus: "#6aa0ff",
  locusActive: "#f2cf72",
  path: "#8db4ff",
  grid: "#1d2754",
  key: "#dbe4ff",
  fill: "#9fb2ff",
  hemi: "#c9d5ff",
  boost: "1",
};

let cacheKey = "";
let cache: SceneColors = DEFAULT_SCENE_COLORS;

function read(): SceneColors {
  if (typeof window === "undefined") return DEFAULT_SCENE_COLORS;
  const style = getComputedStyle(document.documentElement);
  const next: SceneColors = { ...DEFAULT_SCENE_COLORS, night: document.documentElement.classList.contains("dark") };
  for (const k of Object.keys(VARS) as Array<keyof typeof VARS>) {
    const v = style.getPropertyValue(VARS[k]).trim();
    if (v) next[k] = v;
  }
  const key = JSON.stringify(next);
  if (key !== cacheKey) {
    cacheKey = key;
    cache = next;
  }
  return cache;
}

function subscribe(cb: () => void): () => void {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-palette", "style"] });
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener("change", cb);
  };
}

export function useSceneColors(): SceneColors {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_SCENE_COLORS);
}
