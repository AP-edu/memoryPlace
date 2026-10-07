"use client";
import { useState } from "react";
import Link from "next/link";
import PalacePicker, { type PalaceTarget } from "@/components/decks/PalacePicker";

type Strategy = "new-loci" | "one-locus";

/**
 * Deck -> palace. Whole deck (no flashcardIds) or a chosen subset / single
 * card. Creates live-linked cards; already-linked flashcards are skipped.
 */
export default function PortToPalace({
  deckId,
  flashcardIds,
  count,
  defaultPalaceId = "",
  onClose,
  onDone,
}: {
  deckId: string;
  flashcardIds?: string[];
  count: number;
  defaultPalaceId?: string;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [target, setTarget] = useState<PalaceTarget>({ palaceId: defaultPalaceId, roomId: "", locusId: "" });
  const [strategy, setStrategy] = useState<Strategy>("new-loci");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ cards: number; loci: number; skipped: number; roomId: string } | null>(null);

  async function send() {
    if (!target.roomId) return setError("Pick a room first.");
    if (strategy === "one-locus" && !target.locusId) return setError("Pick a locus first.");
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/imports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deck_id: deckId,
          room_id: target.roomId,
          strategy,
          locus_id: strategy === "one-locus" ? target.locusId : undefined,
          flashcard_ids: flashcardIds,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "Port failed.");
      setResult({ cards: body.cards?.length ?? 0, loci: body.loci?.length ?? 0, skipped: body.skipped ?? 0, roomId: target.roomId });
      onDone?.();
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
          Ported {result.cards} card{result.cards === 1 ? "" : "s"}
          {result.loci > 0 ? ` onto ${result.loci} new loci` : ""}
          {result.skipped > 0 ? ` (${result.skipped} already anchored, skipped)` : ""}.
        </p>
        <p className="text-muted-foreground">They stay linked: use unlink or push on either side.</p>
        <div className="flex gap-2">
          <Link href={`/rooms/${result.roomId}`} className="btn-primary !px-3 !py-1.5">
            Open the room
          </Link>
          <Link href={`/walk/${result.roomId}?tour=1`} className="btn-outline !px-3 !py-1.5">
            Walk it
          </Link>
          <button onClick={onClose} className="btn-ghost">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card-base space-y-3 p-4 text-sm">
      <p className="font-medium">
        Port {flashcardIds ? (count === 1 ? "this card" : `${count} cards`) : `all ${count} cards`} to a palace
      </p>
      <PalacePicker value={target} onChange={setTarget} withLocus={strategy === "one-locus"} />
      <div className="flex gap-4">
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={strategy === "new-loci"} onChange={() => setStrategy("new-loci")} />
          One new locus per card
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={strategy === "one-locus"} onChange={() => setStrategy("one-locus")} />
          All onto one locus
        </label>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button onClick={send} disabled={saving} className="btn-primary !px-3 !py-1.5">
          {saving ? "Porting…" : "Port"}
        </button>
        <button onClick={onClose} className="btn-ghost">
          Cancel
        </button>
      </div>
    </div>
  );
}
