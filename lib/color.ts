// Small colour maths for accessible accents (pure; no DOM).

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16)) as [number, number, number];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** Mix `hex` toward `to` by t (0..1). */
export function mixHex(hex: string, to: string, t: number): string {
  const a = hexToRgb(hex);
  const b = hexToRgb(to);
  return rgbToHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as [number, number, number]);
}

/**
 * Nudge `hex` toward black or white (whichever increases contrast against
 * `against`) until the pair reaches `min`. Keeps the hue; returns the first
 * step that passes.
 */
export function ensureContrast(hex: string, against: string, min = 4.5): string {
  if (contrast(hex, against) >= min) return hex;
  const toward = luminance(against) > 0.18 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mixHex(hex, toward, t);
    if (contrast(c, against) >= min) return c;
  }
  return toward;
}

export interface Accent {
  primary: string;
  primaryHover: string;
  primaryForeground: string;
  link: string;
  ring: string;
}

/**
 * A room's colour as the screen accent: a solid button colour that carries
 * white text (AA), and a link/ring colour readable on the page's cards.
 */
export function accentFor(color: string, card: string): Accent {
  const primary = ensureContrast(color, "#ffffff", 4.5);
  const link = ensureContrast(color, card, 4.5);
  return { primary, primaryHover: mixHex(primary, "#000000", 0.12), primaryForeground: "#ffffff", link, ring: link };
}
