"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PalaceCounts } from "@/lib/homeSummary";
import type { Blueprint } from "@/lib/blueprint";
import PlanThumb from "./PlanThumb";

/**
 * Palace create form + grid, shared by /palaces (full list, search) and /home
 * (compact: first few, link to the rest). The create form keeps
 * data-tour="palace-form" because the onboarding overlay spotlights it.
 */
export default function PalaceList({
  palaces,
  plans = {},
  onChanged,
  limit,
  searchable = false,
}: {
  palaces: PalaceCounts[];
  /** Ground-floor plan per palace id (from /api/home/summary) for the card thumbnails. */
  plans?: Record<string, Blueprint>;
  onChanged: () => void;
  limit?: number;
  searchable?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [q, setQ] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? palaces.filter((p) => p.title.toLowerCase().includes(needle)) : palaces;
  }, [palaces, q]);
  const shown = limit ? filtered.slice(0, limit) : filtered;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!title.trim()) return setFormError("Give your palace a name");
    setBusy(true);
    try {
      const res = await fetch("/api/palaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        return setFormError(body.error ?? "Failed to create palace");
      }
      setFormError(null);
      setTitle("");
      onChanged();
    } catch {
      setFormError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(p: PalaceCounts) {
    if (!confirm(`Delete "${p.title}" and every room, locus and card in it?`)) return;
    const res = await fetch(`/api/palaces/${p.palaceId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete palace");
    onChanged();
  }

  const createForm = (
    <>
      <form onSubmit={handleCreate} data-tour="palace-form" className="mb-4 flex gap-2 rounded-2xl">
        <label className="sr-only" htmlFor="new-palace-title">
          New palace title
        </label>
        <input
          id="new-palace-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New palace title"
          className="input-base flex-1"
        />
        <button className={palaces.length === 0 ? "btn-primary" : "btn-outline"} disabled={busy}>
          {busy ? "Adding…" : "Add palace"}
        </button>
      </form>
      {formError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {formError}
        </p>
      )}
    </>
  );

  return (
    <div>
      {palaces.length === 0 && createForm}
      {searchable && palaces.length > 3 && (
        <div className="mb-4">
          <label className="sr-only" htmlFor="palace-search">
            Search palaces
          </label>
          <input
            id="palace-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search palaces…"
            className="input-base max-w-xs"
          />
        </div>
      )}

      {palaces.length === 0 ? (
        <div className="card-base p-6 text-center">
          <p className="text-lg font-semibold">Raise your first palace</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            A palace is a place you design once and walk forever. Name it above, draw its rooms, then place loci on the walls.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No palaces match “{q}”.</p>
      ) : (
        <ul className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => {
            const plan = plans[p.palaceId];
            return (
              <li key={p.palaceId} className="card-base group flex flex-col overflow-hidden !p-0 hover:shadow-card-hover">
                <Link
                  href={`/palaces/${p.palaceId}`}
                  className="block border-b border-border bg-muted/40 px-4 py-3"
                  aria-label={`Open ${p.title} blueprint`}
                  tabIndex={-1}
                >
                  {plan ? (
                    <PlanThumb plan={plan} className="h-28 w-full" />
                  ) : (
                    <div className="grid h-28 place-items-center text-xs text-muted-foreground">No rooms drawn yet</div>
                  )}
                </Link>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/palaces/${p.palaceId}`} className="text-lg font-semibold leading-snug transition-colors group-hover:text-link">
                      {p.title}
                    </Link>
                    <details className="relative shrink-0">
                      <summary
                        className="cursor-pointer list-none rounded-lg px-2 leading-7 text-muted-foreground hover:bg-muted hover:text-foreground [&::-webkit-details-marker]:hidden"
                        aria-label={`More actions for ${p.title}`}
                      >
                        {"\u22EF"}
                      </summary>
                      <div className="absolute right-0 z-10 mt-1 w-44 rounded-xl border border-border bg-card p-1 shadow-lg">
                        <Link href={`/palaces/${p.palaceId}/print`} className="block rounded-lg px-3 py-1.5 text-sm hover:bg-muted">
                          Print blueprint
                        </Link>
                        <button
                          onClick={() => handleDelete(p)}
                          className="block w-full rounded-lg px-3 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10"
                        >
                          Delete palace…
                        </button>
                      </div>
                    </details>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {p.rooms} room{p.rooms === 1 ? "" : "s"} · {p.cards} card{p.cards === 1 ? "" : "s"}
                    {p.due > 0 && <span className="font-medium text-highlight"> · {p.due} due</span>}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-3">
                    {p.rooms > 0 && p.cards > 0 && (
                      <Link href={`/walk/palace/${p.palaceId}?tour=1`} className="btn-primary !px-3 !py-1.5">
                        {"\u25B6"} Walk
                      </Link>
                    )}
                    {p.due > 0 && (
                      <Link href={`/study/palace/${p.palaceId}`} className="btn-outline !px-3 !py-1.5">
                        Study {p.due}
                      </Link>
                    )}
                    <Link href={`/palaces/${p.palaceId}`} className="btn-ghost">
                      {p.rooms === 0 ? "Draw rooms" : "Blueprint"}
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {palaces.length > 0 && createForm}
    </div>
  );
}
