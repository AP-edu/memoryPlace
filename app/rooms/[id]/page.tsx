"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Card, Locus, Room } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const { data: room } = useFetch<Room>(id ? `/api/rooms/${id}` : null);
  const { data: loci, loading: loadingLoci, error: lociError, refetch: refetchLoci } = useFetch<Locus[]>(
    id ? `/api/loci?room=${id}` : null
  );
  const { data: cards, loading: loadingCards, error: cardsError, refetch: refetchCards } = useFetch<Card[]>(
    id ? `/api/cards?room=${id}` : null
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editFront, setEditFront] = useState("");
  const [editBack, setEditBack] = useState("");

  const selected = loci?.find((l) => l.id === selectedId) ?? null;
  const selectedCards = cards?.filter((c) => c.locus_id === selectedId) ?? [];

  async function placeLocus(e: React.MouseEvent<HTMLDivElement>) {
    if (!id || !loci) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    const res = await fetch("/api/loci", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: id, label: `Locus ${loci.length + 1}`, x, y }),
    });
    if (!res.ok) return setFormError("Failed to place locus");
    const created = await res.json();
    setFormError(null);
    setSelectedId(created.id);
    refetchLoci();
  }

  async function renameLocus() {
    if (!selected || !label.trim()) return;
    const res = await fetch(`/api/loci/${selected.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) return setFormError("Failed to rename locus");
    setFormError(null);
    setLabel("");
    refetchLoci();
  }

  async function deleteLocus(locusId: string) {
    if (!confirm("Delete this locus and its cards?")) return;
    const res = await fetch(`/api/loci/${locusId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete locus");
    if (selectedId === locusId) setSelectedId(null);
    refetchLoci();
    refetchCards();
  }

  async function addCard(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return setFormError("Select a locus first");
    if (!front.trim() || !back.trim()) return setFormError("Both sides are required");
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locus_id: selectedId, front, back }),
    });
    if (!res.ok) return setFormError("Failed to add card");
    setFormError(null);
    setFront("");
    setBack("");
    refetchCards();
  }

  async function saveCard(cardId: string) {
    const res = await fetch(`/api/cards/${cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ front: editFront, back: editBack }),
    });
    if (!res.ok) return setFormError("Failed to save card");
    setFormError(null);
    setEditingCardId(null);
    refetchCards();
  }

  async function deleteCard(cardId: string) {
    if (!confirm("Delete this card?")) return;
    const res = await fetch(`/api/cards/${cardId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete card");
    refetchCards();
  }

  if (!id) return <p className="p-6">This room link is missing an id.</p>;
  if (loadingLoci || loadingCards) return <p className="p-6 text-muted-foreground">Loading room...</p>;
  if (lociError || cardsError) {
    return <p className="p-6 text-destructive">Failed to load room: {lociError ?? cardsError}</p>;
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      {room?.palace_id && (
        <Link href={`/palaces/${room.palace_id}`} className="btn-ghost">
          {"\u2190 Back to palace"}
        </Link>
      )}
      <h1 className="mb-1 mt-3 text-3xl font-semibold">{room?.title ?? "Room"} Loci</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        Click the floor plan to place a locus, then attach cards to it.
      </p>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      <div
        onClick={placeLocus}
        className="card-base relative h-72 w-full cursor-crosshair overflow-hidden"
        role="application"
        aria-label="Room floor plan. Click to place a locus."
      >
        {loci?.map((locus) => (
          <button
            key={locus.id}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId(locus.id);
            }}
            className={`absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 text-xs font-semibold transition-colors ${
              locus.id === selectedId
                ? "border-primary bg-primary text-white"
                : "border-accent bg-background text-foreground hover:border-primary"
            }`}
            style={{ left: `${locus.x}%`, top: `${locus.y}%` }}
            title={locus.label}
            aria-label={`Locus ${locus.label}`}
          >
            {locus.position + 1}
          </button>
        ))}
        {loci?.length === 0 && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted-foreground">
            Empty chamber — click anywhere to place your first locus.
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {loci?.map((locus) => (
          <div key={locus.id} className="flex items-center gap-1">
            <button
              onClick={() => setSelectedId(locus.id)}
              className={`rounded-full px-3 py-1 text-sm ${
                locus.id === selectedId ? "bg-primary text-white" : "card-base hover:shadow-card-hover"
              }`}
            >
              {locus.position + 1}. {locus.label}
            </button>
            <button onClick={() => deleteLocus(locus.id)} className="btn-danger" aria-label={`Delete ${locus.label}`}>
              ×
            </button>
          </div>
        ))}
      </div>

      {selected && (
        <div className="card-base mt-6 p-4">
          <h2 className="mb-3 text-xl font-semibold">Locus: {selected.label}</h2>
          <div className="mb-4 flex gap-2">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Rename locus"
              className="input-base flex-1"
            />
            <button onClick={renameLocus} className="btn-primary">
              Rename
            </button>
          </div>

          <form onSubmit={addCard} className="mb-4 flex flex-col gap-2">
            <input
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder="Card front"
              className="input-base"
            />
            <div className="flex gap-2">
              <input
                value={back}
                onChange={(e) => setBack(e.target.value)}
                placeholder="Card back"
                className="input-base flex-1"
              />
              <button className="btn-primary">Add card</button>
            </div>
          </form>

          <div className="space-y-2">
            {selectedCards.length === 0 && (
              <p className="text-sm text-muted-foreground">No cards on this locus yet.</p>
            )}
            {selectedCards.map((card) => (
              <div key={card.id} className="card-base p-3">
                {editingCardId === card.id ? (
                  <div className="flex flex-col gap-2">
                    <input value={editFront} onChange={(e) => setEditFront(e.target.value)} className="input-base" />
                    <input value={editBack} onChange={(e) => setEditBack(e.target.value)} className="input-base" />
                    <div className="flex gap-3 text-sm">
                      <button onClick={() => saveCard(card.id)} className="btn-primary !px-3 !py-1.5">
                        Save
                      </button>
                      <button onClick={() => setEditingCardId(null)} className="btn-ghost">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{cardFront(card)}</p>
                      <p className="text-sm text-muted-foreground">{cardBack(card)}</p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-sm">
                      <button
                        onClick={() => {
                          setEditingCardId(card.id);
                          setEditFront(cardFront(card));
                          setEditBack(cardBack(card));
                        }}
                        className="btn-ghost"
                      >
                        Edit
                      </button>
                      <button onClick={() => deleteCard(card.id)} className="btn-danger">
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
