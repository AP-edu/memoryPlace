"use client";
import { useSyncExternalStore } from "react";

// 3D scene colours come from the same CSS design tokens as the rest of the UI
// (see app/globals.css --scene-*), so the canvas follows light/dark theme.

export interface SceneColors {
  sky: string;
  fog: string;
  floor: string;
  wall: string;
  door: string;
  archway: string;
  locus: string;
  locusActive: string;
  path: string;
  grid: string;
}

const VARS: Record<keyof SceneColors, string> = {
  sky: "--scene-sky",
  fog: "--scene-fog",
  floor: "--scene-floor",
  wall: "--scene-wall",
  door: "--scene-door",
  archway: "--scene-archway",
  locus: "--scene-locus",
  locusActive: "--scene-locus-active",
  path: "--scene-path",
  grid: "--scene-grid",
};

export const DEFAULT_SCENE_COLORS: SceneColors = {
  sky: "#0a0b14",
  fog: "#0a0b14",
  floor: "#262b57",
  wall: "#4a52a3",
  door: "#ffcd1f",
  archway: "#3ccfcf",
  locus: "#5a6bff",
  locusActive: "#ffcd1f",
  path: "#8f9bff",
  grid: "#232858",
};

let cacheKey = "";
let cache: SceneColors = DEFAULT_SCENE_COLORS;

function read(): SceneColors {
  if (typeof window === "undefined") return DEFAULT_SCENE_COLORS;
  const style = getComputedStyle(document.documentElement);
  const next = { ...DEFAULT_SCENE_COLORS };
  for (const k of Object.keys(VARS) as Array<keyof SceneColors>) {
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
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
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
