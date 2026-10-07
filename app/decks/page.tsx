"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import { parseTagInput } from "@/lib/deckLink";
import type { Deck, Palace } from "@/types/database";
import { CardGridSkeleton } from "@/components/ui/Skeleton";

type DeckRow = Deck & { card_count: number; linked_count: number };

export default function DecksPage() {
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [palaceId, setPalaceId] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { data: all, loading, error, refetch } = useFetch<DeckRow[]>("/api/decks");
  const filterUrl = useMemo(() => {
    if (!q.trim() && !tag) return null;
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (tag) sp.set("tag", tag);
    return `/api/decks?${sp.toString()}`;
  }, [q, tag]);
  const { data: filtered } = useFetch<DeckRow[]>(filterUrl);
  const { data: palaces } = useFetch<Palace[]>("/api/palaces");

  const decks = filterUrl ? (filtered ?? []) : (all ?? []);
  const allTags = useMemo(() => [...new Set((all ?? []).flatMap((d) => d.tags ?? []))].sort(), [all]);
  const palaceTitle = (id: string | null) => (id ? (palaces ?? []).find((p) => p.id === id)?.title : undefined);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Title required");
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), palace_id: palaceId || null, tags: parseTagInput(tagsText) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return setFormError(body.error ?? "Failed to create deck");
    }
    setFormError(null);
    setTitle("");
    setTagsText("");
    setPalaceId("");
    refetch();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this deck? Linked palace cards are kept.")) return;
    const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete deck");
    refetch();
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-semibold">Decks</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Quiz yourself Quizlet-style, or port a deck into a palace so every card gets a place to live.
      </p>

      <form onSubmit={handleCreate} className="card-base mb-6 grid gap-2 p-4 sm:grid-cols-[1fr_12rem_12rem_auto]">
        <input className="input-base" placeholder="New deck title" aria-label="New deck title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input-base" value={palaceId} onChange={(e) => setPalaceId(e.target.value)}>
          <option value="">No palace</option>
          {(palaces ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
        <input className="input-base" placeholder="tags, comma, separated" aria-label="tags, comma, separated" value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
        <button className="btn-primary">Create</button>
      </form>
      {formError && <p className="mb-3 text-sm text-destructive">{formError}</p>}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input-base max-w-xs" placeholder="Search decks…" aria-label="Search decks…" value={q} onChange={(e) => setQ(e.target.value)} />
        {allTags.map((t) => (
          <button
            key={t}
            onClick={() => setTag(tag === t ? "" : t)}
            className={`rounded-full border px-3 py-1 text-xs ${
              tag === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            #{t}
          </button>
        ))}
      </div>

      {loading ? (
        <CardGridSkeleton cards={4} />
      ) : error ? (
        <p className="text-destructive">Failed to load decks: {error}</p>
      ) : decks.length === 0 ? (
        <p className="text-muted-foreground">{filterUrl ? "No decks match." : "No decks yet. Create one above."}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {decks.map((d) => (
            <li key={d.id} className="card-base p-4">
              <Link href={`/decks/${d.id}`} className="text-lg font-semibold hover:underline">
                {d.title}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.card_count} card{d.card_count === 1 ? "" : "s"}
                {d.card_count > 0 ? ` · ${d.linked_count} anchored` : ""}
                {palaceTitle(d.palace_id) ? ` · ${palaceTitle(d.palace_id)}` : ""}
              </p>
              {d.tags?.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-1 text-xs text-highlight">
                  {d.tags.map((t) => (
                    <span key={t}>#{t}</span>
                  ))}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                {d.card_count > 0 && (
                  <Link href={`/quiz/${d.id}`} className="btn-primary !px-3 !py-1.5">
                    Quiz
                  </Link>
                )}
                {d.card_count > d.linked_count && (
                  <Link href={`/decks/${d.id}?port=1`} className="btn-outline !px-3 !py-1.5">
                    Port {d.card_count - d.linked_count} to palace
                  </Link>
                )}
                <Link href={`/decks/${d.id}`} className="btn-outline !px-3 !py-1.5">
                  Open
                </Link>
                <button onClick={() => handleDelete(d.id)} className="btn-ghost text-destructive">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
