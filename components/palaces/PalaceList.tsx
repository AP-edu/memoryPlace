"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { PalaceCounts } from "@/lib/homeSummary";

/**
 * Palace create form + grid, shared by /palaces (full list, search) and /home
 * (compact: first few, link to the rest). The create form keeps
 * data-tour="palace-form" because the onboarding overlay spotlights it.
 */
export default function PalaceList({
  palaces,
  onChanged,
  limit,
  searchable = false,
}: {
  palaces: PalaceCounts[];
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

  return (
    <div>
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
        <button className="btn-primary" disabled={busy}>
          {busy ? "Adding…" : "Add palace"}
        </button>
      </form>
      {formError && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {formError}
        </p>
      )}

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
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((p) => (
            <li key={p.palaceId} className="card-base group flex flex-col p-4 hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/palaces/${p.palaceId}`} className="text-lg font-semibold transition-colors group-hover:text-link">
                  {p.title}
                </Link>
                <button onClick={() => handleDelete(p)} className="btn-danger shrink-0" aria-label={`Delete ${p.title}`}>
                  Delete
                </button>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.rooms} room{p.rooms === 1 ? "" : "s"} · {p.cards} card{p.cards === 1 ? "" : "s"}
                {p.due > 0 ? ` · ${p.due} due` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/palaces/${p.palaceId}`} className="btn-outline !px-3 !py-1.5">
                  {p.rooms === 0 ? "Draw rooms" : "Open"}
                </Link>
                {p.rooms > 0 && p.cards > 0 && (
                  <Link href={`/walk/palace/${p.palaceId}?tour=1`} className="btn-primary !px-3 !py-1.5">
                    Walk
                  </Link>
                )}
                {p.due > 0 && (
                  <Link href={`/study/palace/${p.palaceId}`} className="btn-ghost">
                    Study {p.due} due
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
