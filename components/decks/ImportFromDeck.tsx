"use client";
import { useState } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { Deck, Flashcard } from "@/types/database";

/**
 * Pull flashcards from a deck into THIS room (one new locus per card) or onto
 * ONE locus when `locusId` is set. Pick individual cards or the whole deck.
 * Created cards stay live-linked; already-anchored flashcards aren't listed.
 */
export default function ImportFromDeck({
  roomId,
  locusId,
  onDone,
  onClose,
}: {
  roomId: string;
  locusId?: string;
  onDone: () => void;
  onClose: () => void;
}) {
  const { data: decks } = useFetch<Deck[]>("/api/decks");
  const [deckId, setDeckId] = useState("");
  const { data: flashcards } = useFetch<Flashcard[]>(deckId ? `/api/flashcards?deck=${deckId}` : null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const available = (flashcards ?? [])
    .filter((f) => !f.source_card_id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (!deckId || picked.size === 0) return setError("Pick at least one card.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deck_id: deckId,
          room_id: roomId,
          strategy: locusId ? "one-locus" : "new-loci",
          locus_id: locusId,
          flashcard_ids: [...picked],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Import failed.");
      setDone(`Imported ${body.cards?.length ?? 0} card${body.cards?.length === 1 ? "" : "s"}.`);
      setPicked(new Set());
      onDone();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
      <p className="font-medium">{locusId ? "Import cards onto this locus" : "Import deck cards (one new locus each)"}</p>
      <select
        className="input-base"
        value={deckId}
        onChange={(e) => {
          setDeckId(e.target.value);
          setPicked(new Set());
          setDone(null);
        }}
      >
        <option value="">Pick a deck…</option>
        {(decks ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.title}
          </option>
        ))}
      </select>
      {deckId && flashcards && available.length === 0 && (
        <p className="text-muted-foreground">Every card in this deck is already anchored.</p>
      )}
      {available.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              className="text-link hover:underline"
              onClick={() => setPicked(picked.size === available.length ? new Set() : new Set(available.map((f) => f.id)))}
            >
              {picked.size === available.length ? "Clear" : `Select all ${available.length}`}
            </button>
            <span className="text-muted-foreground">{picked.size} selected</span>
          </div>
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {available.map((f) => (
              <li key={f.id}>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={picked.has(f.id)} onChange={() => toggle(f.id)} className="mt-1" />
                  <span className="line-clamp-2">{f.question}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {done && <p className="text-success">{done}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={saving || picked.size === 0} className="btn-primary !px-3 !py-1.5">
          {saving ? "Importing…" : "Import"}
        </button>
        <button type="button" onClick={onClose} className="btn-ghost">
          Close
        </button>
      </div>
    </div>
  );
}
