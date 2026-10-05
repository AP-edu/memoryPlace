"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import { tourOrder } from "@/lib/scene3d";
import type { Flashcard, Locus, Palace, Room, WallFace } from "@/types/database";

// Copy a deck flashcard into a palace as a locus card (question -> front,
// answer -> back). Pick palace -> room -> existing locus, or a new locus.
export default function SendToPalace({ card, onClose }: { card: Flashcard; onClose: () => void }) {
  const { data: palaces } = useFetch<Palace[]>("/api/palaces");
  const [palaceId, setPalaceId] = useState("");
  const { data: rooms } = useFetch<Room[]>(palaceId ? `/api/rooms?palace=${palaceId}` : null);
  const [roomId, setRoomId] = useState("");
  const { data: loci } = useFetch<Locus[]>(roomId ? `/api/loci?room=${roomId}` : null);
  const [locusId, setLocusId] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newWall, setNewWall] = useState<WallFace>("north");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneRoomId, setDoneRoomId] = useState<string | null>(null);

  const orderedLoci = tourOrder(loci ?? []);
  const room = rooms?.find((r) => r.id === roomId) ?? null;

  async function send() {
    if (!roomId) return setError("Pick a room first.");
    setSaving(true);
    setError(null);
    try {
      let target = locusId;
      if (!target) {
        const res = await fetch("/api/loci", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ room_id: roomId, label: newLabel.trim() || "From deck", wall: newWall, wall_offset: 0.5 }),
        });
        if (!res.ok) throw new Error("Could not create the locus.");
        target = ((await res.json()) as Locus).id;
      }
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locus_id: target, front: card.question, back: card.answer }),
      });
      if (!res.ok) throw new Error("Could not copy the card.");
      setDoneRoomId(roomId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div role="dialog" aria-label="Send flashcard to palace" className="rounded-xl border border-primary/40 bg-primary/5 p-3">
      {doneRoomId ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-medium">Copied into the palace.</span>
          <Link href={`/rooms/${doneRoomId}`} className="btn-primary !px-3 !py-1.5">
            Open the room →
          </Link>
          <button onClick={onClose} className="btn-ghost">
            Done
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={palaceId}
              onChange={(e) => {
                setPalaceId(e.target.value);
                setRoomId("");
                setLocusId("");
              }}
              className="input-base"
              aria-label="Palace"
            >
              <option value="">Palace…</option>
              {(palaces ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <select
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                setLocusId("");
              }}
              className="input-base"
              aria-label="Room"
              disabled={!palaceId}
            >
              <option value="">Room…</option>
              {(rooms ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <select
              value={locusId}
              onChange={(e) => setLocusId(e.target.value)}
              className="input-base"
              aria-label="Locus"
              disabled={!roomId}
            >
              <option value="">New locus…</option>
              {orderedLoci.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {i + 1}. {l.label || "Untitled"}
                </option>
              ))}
            </select>
          </div>
          {!locusId && roomId && (
            <div className="flex gap-2">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="New locus label"
                className="input-base flex-1"
                aria-label="New locus label"
              />
              <select value={newWall} onChange={(e) => setNewWall(e.target.value as WallFace)} className="input-base w-28" aria-label="New locus wall">
                {(["north", "south", "east", "west"] as WallFace[]).map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          )}
          {room && (
            <p className="text-xs text-muted-foreground">
              Copy “{(card.question ?? "").slice(0, 60)}” to {room.title}
              {locusId ? ` · locus ${orderedLoci.findIndex((l) => l.id === locusId) + 1}` : " · new locus"}.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2 text-sm">
            <button onClick={send} disabled={saving || !roomId} className="btn-primary !px-3 !py-1.5 disabled:opacity-50">
              {saving ? "Sending…" : "Send copy"}
            </button>
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

