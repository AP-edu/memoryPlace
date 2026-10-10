"use client";
import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { readMode, setMode, subscribeMode, type ThemeMode } from "@/lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode }> = [
  { mode: "light", label: "Light theme", icon: <Sun className="h-4 w-4" aria-hidden /> },
  { mode: "dark", label: "Dark theme", icon: <Moon className="h-4 w-4" aria-hidden /> },
  { mode: "system", label: "Match system theme", icon: <Monitor className="h-4 w-4" aria-hidden /> },
];

/**
 * Light / dark / system switch. The server snapshot is null so the hydrated
 * markup never depends on localStorage (fixes the old toggle's hydration
 * mismatch); the selected state appears right after hydration.
 */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const mode = useSyncExternalStore<ThemeMode | null>(subscribeMode, readMode, () => null);
  return (
    <div role="radiogroup" aria-label="Theme" className={`inline-flex items-center rounded-xl border border-border bg-card p-0.5 ${className}`}>
      {OPTIONS.map((o) => {
        const active = mode === o.mode;
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => setMode(o.mode)}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
