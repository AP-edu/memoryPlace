"use client";
import { useMemo, useSyncExternalStore } from "react";
import { accentFor } from "@/lib/color";

function readCard(): string {
  return getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
}

function subscribe(cb: () => void): () => void {
  // Palette / light-dark switches change the card colour the accent must clear.
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
  return () => mo.disconnect();
}

/**
 * CSS variables that make a room's colour the screen accent (buttons, links,
 * focus rings) while keeping AA contrast in every palette. Spread on a
 * wrapper's `style`; undefined when the room has no colour.
 */
export function useRoomAccent(color: string | null | undefined): React.CSSProperties | undefined {
  const card = useSyncExternalStore(subscribe, readCard, () => "");
  return useMemo(() => {
    if (!color || !/^#[0-9a-f]{6}$/i.test(color) || !/^#[0-9a-f]{6}$/i.test(card)) return undefined;
    const a = accentFor(color, card);
    return {
      "--primary": a.primary,
      "--primary-hover": a.primaryHover,
      "--primary-foreground": a.primaryForeground,
      "--link": a.link,
      "--ring": a.ring,
    } as React.CSSProperties;
  }, [color, card]);
}
