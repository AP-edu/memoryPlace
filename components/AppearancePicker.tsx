"use client";
import { useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { PALETTES, readPalette, setPalette, subscribeMode, type Palette } from "@/lib/theme";
import ThemeToggle from "./ThemeToggle";

/**
 * Palette cards (Aegean / Library / Modern) + the light/dark/system switch.
 * Used in the nav's appearance menu and on the profile page.
 */
export default function AppearancePicker({ compact = false }: { compact?: boolean }) {
  // Server snapshot null: the selected state appears right after hydration.
  const palette = useSyncExternalStore<Palette | null>(subscribeMode, readPalette, () => null);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Mode</span>
        <ThemeToggle />
      </div>
      <div role="radiogroup" aria-label="Palette" className={compact ? "space-y-1.5" : "grid gap-2 sm:grid-cols-3"}>
        {PALETTES.map((p) => {
          const active = palette === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setPalette(p.id)}
              className={`flex w-full items-center gap-3 rounded-xl border-2 p-2 text-left transition-colors ${
                active ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <span aria-hidden className="grid h-9 w-9 shrink-0 grid-cols-2 overflow-hidden rounded-lg border border-border">
                {p.swatch.map((c) => (
                  <span key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-semibold">
                  {p.name}
                  {active && <Check className="h-3.5 w-3.5 text-link" aria-hidden />}
                </span>
                <span className="block text-xs leading-snug text-muted-foreground">{p.blurb}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
