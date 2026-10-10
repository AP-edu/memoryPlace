"use client";
import { useEffect, useId, useRef, useState } from "react";

/**
 * Small popover menu: a trigger button and a panel that closes on outside
 * click, Escape, or when an item inside asks it to (`close()` render prop).
 */
export default function Menu({
  label,
  trigger,
  children,
  align = "right",
  className = "",
  panelClassName = "w-64",
}: {
  /** Accessible name of the trigger. */
  label: string;
  trigger: React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground"
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          className={`absolute top-full z-50 mt-2 rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-card-hover ${align === "right" ? "right-0" : "left-0"} ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
