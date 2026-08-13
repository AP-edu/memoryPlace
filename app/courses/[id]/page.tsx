"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Deck } from "@/types/database";

function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const { data: decks, loading, error, refetch } = useFetch<Deck[]>(`/api/decks?course=${id}`);

  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, course_id: id }),
    });
    if (!res.ok) return setFormError("Failed to create deck");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleDelete(deckId: string) {
    if (!confirm("Delete this deck and its flashcards?")) return;
    const res = await fetch(`/api/decks/${deckId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete deck");
    refetch();
  }

  if (loading) return <p className="p-6 text-muted-foreground">Loading decks...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load decks: {error}</p>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <Link href="/dashboard" className="btn-ghost">
        {"\u2190 Back to courses"}
      </Link>
      <h1 className="mb-1 mt-3 text-3xl font-semibold">Course Decks</h1>
      <p className="mb-5 text-sm text-muted-foreground">The doors of this room.</p>

      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New deck title"
          className="input-base flex-1"
        />
        <button className="btn-primary">Add</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {decks?.length === 0 && <p className="text-muted-foreground">No decks yet — add one above.</p>}

      <div className="space-y-3">
        {decks?.map((deck) => (
          <div key={deck.id} className="card-base flex items-center justify-between p-4">
            <span className="font-display text-lg font-medium">{deck.title}</span>
            <div className="flex items-center gap-4 text-sm">
              <Link href={`/quiz/${deck.id}`} className="btn-primary `px-3` `py-1.5`">
                Study
              </Link>
              <Link href={`/decks/${deck.id}`} className="btn-ghost">
                Manage cards
              </Link>
              <button onClick={() => handleDelete(deck.id)} className="btn-danger">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default CoursePage;