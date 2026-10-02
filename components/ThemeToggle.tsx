"use client";
import { useSyncExternalStore } from "react";
import { readMode, setMode, subscribeMode, type ThemeMode } from "@/lib/theme";

const OPTIONS: Array<{ mode: ThemeMode; label: string; icon: React.ReactNode }> = [
  {
    mode: "light",
    label: "Light theme",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
        <circle cx="12" cy="12" r="4" />
        <path strokeLinecap="round" d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    ),
  },
  {
    mode: "dark",
    label: "Dark theme",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
      </svg>
    ),
  },
  {
    mode: "system",
    label: "Match system theme",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
        <rect x="3" y="4" width="18" height="12" rx="2" />
        <path strokeLinecap="round" d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
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
