// Tracing underlay for the 2D blueprint (pure maths, no DOM): a photo or scan
// of a real floor plan pinned under the grid so rooms can be drawn over it.
// Placement is in level metres: (x, z) is the image's top-left (north-west)
// corner, `scale` is metres per image pixel.

export interface UnderlayPlacement {
  x: number;
  z: number;
  /** Metres per image pixel. */
  scale: number;
  /** Image size in pixels. */
  w: number;
  h: number;
  opacity: number;
  visible: boolean;
}

export interface Pt {
  x: number;
  z: number;
}

/** First placement: centred on the view, 80% of its width (calibrate the scale next). */
export function initialPlacement(imgW: number, imgH: number, view: { cx: number; cz: number; widthM: number; heightM: number }): UnderlayPlacement {
  const scale = Math.min((view.widthM * 0.8) / imgW, (view.heightM * 0.8) / imgH);
  return { x: view.cx - (imgW * scale) / 2, z: view.cz + (imgH * scale) / 2, scale, w: imgW, h: imgH, opacity: 0.5, visible: true };
}

/** The image's extent on the level (for drawing): left x, top (north) z, size in metres. */
export function underlayRect(p: UnderlayPlacement): { x: number; z: number; w: number; d: number } {
  return { x: p.x, z: p.z, w: p.w * p.scale, d: p.h * p.scale };
}

/** Slide the image by a pointer drag (metres). */
export function moveUnderlay(p: UnderlayPlacement, dx: number, dz: number): UnderlayPlacement {
  return { ...p, x: p.x + dx, z: p.z + dz };
}

/**
 * Calibrate: two points on the image are `metres` apart in reality. Rescale
 * so they are, keeping the first point where it is on screen.
 */
export function calibrateUnderlay(p: UnderlayPlacement, a: Pt, b: Pt, metres: number): UnderlayPlacement {
  const d = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(metres > 0) || !(d > 1e-6)) return p;
  const k = metres / d;
  // a in image pixels, before and after: same pixel, new scale.
  const ix = (a.x - p.x) / p.scale;
  const iz = (p.z - a.z) / p.scale;
  const scale = p.scale * k;
  return { ...p, scale, x: a.x - ix * scale, z: a.z + iz * scale };
}

/** Longest side (px) stored; bigger photos are downscaled before saving. */
export const UNDERLAY_MAX_PX = 2400;

/** Size to store an image at (keeps aspect, never upscales). */
export function storedSize(w: number, h: number, max = UNDERLAY_MAX_PX): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
