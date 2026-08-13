"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Deck, Flashcard } from "@/types/database";

function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deck } = useFetch<Deck>(`/api/decks/${id}`);
  const { data: cards, loading, error, refetch } = useFetch<Flashcard[]>(`/api/flashcards?deck=${id}`);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return setFormError("Both fields are required");
    const res = await fetch("/api/flashcards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, answer, deck_id: id }),
    });
    if (!res.ok) return setFormError("Failed to create flashcard");
    setFormError(null);
    setQuestion("");
    setAnswer("");
    refetch();
  }

  async function handleEdit(card: Flashcard) {
    setEditingId(card.id);
    setEditQuestion(card.question);
    setEditAnswer(card.answer);
  }

  async function handleSave(cardId: string) {
    const res = await fetch(`/api/flashcards/${cardId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: editQuestion, answer: editAnswer }),
    });
    if (!res.ok) return setFormError("Failed to save changes");
    setFormError(null);
    setEditingId(null);
    refetch();
  }

  async function handleDelete(cardId: string) {
    if (!confirm("Delete this flashcard?")) return;
    const res = await fetch(`/api/flashcards/${cardId}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete flashcard");
    refetch();
  }

  if (loading) return <p className="p-6 text-muted-foreground">Loading cards...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load flashcards: {error}</p>;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      {deck?.course_id && (
        <Link href={`/courses/${deck.course_id}`} className="btn-ghost">
          {"\u2190 Back to course"}
        </Link>
      )}
      <h1 className="mb-1 mt-3 text-3xl font-semibold">{deck?.title ?? "Deck"} Flashcards</h1>
      <p className="mb-5 text-sm text-muted-foreground">The keepsakes you place inside.</p>

      <form onSubmit={handleCreate} className="mb-4 flex flex-col gap-2">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question"
          className="input-base"
        />
        <div className="flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer"
            className="input-base flex-1"
          />
          <button className="btn-primary">Add card</button>
        </div>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      {cards?.length === 0 && <p className="text-muted-foreground">No flashcards yet — add one above.</p>}

      <div className="space-y-3">
        {cards?.map((card) => (
          <div key={card.id} className="card-base p-4">
            {editingId === card.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                  className="input-base"
                />
                <input
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  className="input-base"
                />
                <div className="flex gap-3 text-sm">
                  <button onClick={() => handleSave(card.id)} className="btn-primary !px-3 !py-1.5">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="btn-ghost">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{card.question}</p>
                  <p className="text-sm text-muted-foreground">{card.answer}</p>
                </div>
                <div className="flex shrink-0 gap-3 text-sm">
                  <button onClick={() => handleEdit(card)} className="btn-ghost">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(card.id)} className="btn-danger">
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DeckPage;