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
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Inline, pre-paint script (stringified into the document head). */
export const THEME_INIT_SCRIPT = `(function(){try{var k=${JSON.stringify(THEME_KEY)};var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark")t="system";var r=document.documentElement;r.classList.toggle("dark",t==="dark"||(t==="system"&&m.matches));r.dataset.theme=t;};a();m.addEventListener("change",a);}catch(e){}})();`;
