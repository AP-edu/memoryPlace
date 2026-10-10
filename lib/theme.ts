// Theme preference store (light / dark / system), persisted in localStorage.
// The inline script in app/layout.tsx applies it before first paint (no
// flash) and follows OS changes while "system" is selected; this module is
// the client-side API the toggle uses.

export type ThemeMode = "light" | "dark" | "system";
export const THEME_KEY = "mp-theme";
const EVENT = "mp-theme-change";

export function readMode(): ThemeMode {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function resolveDark(mode: ThemeMode, systemDark: boolean): boolean {
  return mode === "dark" || (mode === "system" && systemDark);
}

export function applyMode(mode: ThemeMode) {
  const dark = resolveDark(mode, window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.dataset.theme = mode;
}

export function setMode(mode: ThemeMode) {
  try {
    if (mode === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, mode);
  } catch {
    // private mode: still apply for this page
  }
  applyMode(mode);
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeMode(cb: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_KEY) {
      applyMode(readMode());
      cb();
    } else if (e.key === PALETTE_KEY) {
      applyPalette(readPalette());
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

// ------------------------------------------------------------------ palettes
// Palettes are orthogonal to light/dark: data-palette on <html> swaps the
// token set in app/globals.css (Aegean is the default, no attribute).

export const PALETTES = [
  { id: "aegean", name: "Aegean", blurb: "Blue sky and white marble; a starry night after dark.", swatch: ["#f3f8fd", "#1d5fc4", "#d9a82e", "#060b1f"] },
  { id: "library", name: "Library", blurb: "Parchment, ink and brass; a candlelit study at night.", swatch: ["#f6f0e3", "#2f5d46", "#c4932f", "#17110b"] },
  { id: "modern", name: "Modern", blurb: "Crisp neutral greys with an indigo accent.", swatch: ["#f6f7f9", "#3b5bdb", "#f59f00", "#0d0f12"] },
] as const;
export type Palette = (typeof PALETTES)[number]["id"];
export const PALETTE_KEY = "mp-palette";

export function isPalette(p: unknown): p is Palette {
  return PALETTES.some((x) => x.id === p);
}

export function readPalette(): Palette {
  try {
    const p = localStorage.getItem(PALETTE_KEY);
    return isPalette(p) ? p : "aegean";
  } catch {
    return "aegean";
  }
}

export function applyPalette(p: Palette) {
  const root = document.documentElement;
  if (p === "aegean") delete root.dataset.palette;
  else root.dataset.palette = p;
}

export function setPalette(p: Palette) {
  try {
    if (p === "aegean") localStorage.removeItem(PALETTE_KEY);
    else localStorage.setItem(PALETTE_KEY, p);
  } catch {
    // private mode: still apply for this page
  }
  applyPalette(p);
  window.dispatchEvent(new Event(EVENT));
}

/** Inline, pre-paint script (stringified into the document head): mode + palette, no flash. */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var pk=${JSON.stringify(PALETTE_KEY)};var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="system";var r=document.documentElement;r.classList.toggle("dark",t==="dark"||(t==="system"&&m.matches));r.dataset.theme=t;var p=localStorage.getItem(pk);if(p==="library"||p==="modern")r.dataset.palette=p;else delete r.dataset.palette;};a();m.addEventListener("change",a);}catch(e){}})();`;
