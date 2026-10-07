"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import type { Deck } from "@/types/database";

/**
 * Palace -> deck. Source is a whole room, one locus, or specific cards.
 * Target is a new deck (palace-linked) or an existing one. Created
 * flashcards are live-linked to their cards; already-linked cards are skipped.
 */
export default function SendToDeck({
  source,
  defaultTitle,
  label,
  onClose,
}: {
  source: { room_id?: string; locus_id?: string; card_ids?: string[] };
  defaultTitle: string;
  label: string;
  onClose: () => void;
}) {
  const { data: decks } = useFetch<Deck[]>("/api/decks");
  const [deckId, setDeckId] = useState(""); // "" = new deck
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deckId: string; count: number; skipped: number } | null>(null);

  async function send() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...source, deck_id: deckId || undefined, title: deckId ? undefined : title }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Export failed.");
      setResult({ deckId: body.deck_id, count: body.flashcards?.length ?? 0, skipped: body.skipped ?? 0 });
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="card-base space-y-2 p-4 text-sm">
        <p className="font-medium">
          {result.count} card{result.count === 1 ? "" : "s"} added to the deck
          {result.skipped > 0 ? ` (${result.skipped} already linked, skipped)` : ""}.
        </p>
        <div className="flex gap-2">
          {result.deckId && (
            <Link href={`/decks/${result.deckId}`} className="btn-primary !px-3 !py-1.5">
              Open the deck
            </Link>
          )}
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-base space-y-3 p-4 text-sm">
      <p className="font-medium">{label}</p>
      <select className="input-base" value={deckId} onChange={(e) => setDeckId(e.target.value)}>
        <option value="">New deck…</option>
        {(decks ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      {!deckId && (
        <input className="input-base" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Deck title" />
      )}
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button onClick={send} disabled={saving || (!deckId && !title.trim())} className="btn-primary !px-3 !py-1.5">
          {saving ? "Sending…" : "Send to deck"}
        </button>
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
