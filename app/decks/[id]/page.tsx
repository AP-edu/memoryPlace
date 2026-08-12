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

  if (loading) return <p className="p-6 text-gray-500">Loading cards...</p>;
  if (error) return <p className="p-6 text-red-600">Failed to load flashcards: {error}</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {deck?.course_id && (
        <Link href={`/courses/${deck.course_id}`} className="text-sm text-blue-600 hover:underline">
          {"\u2190 Back to course"}
        </Link>
      )}
      <h1 className="text-2xl font-bold mb-4 mt-2">{deck?.title ?? "Deck"} Flashcards</h1>

      <form onSubmit={handleCreate} className="flex flex-col gap-2 mb-4">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Question"
          className="border rounded-lg px-3 py-2"
        />
        <div className="flex gap-2">
          <input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Answer"
            className="flex-1 border rounded-lg px-3 py-2"
          />
          <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
            Add card
          </button>
        </div>
      </form>
      {formError && <p className="text-red-600 text-sm mb-4">{formError}</p>}

      {cards?.length === 0 && <p className="text-gray-500">No flashcards yet — add one above.</p>}

      <div className="space-y-3">
        {cards?.map((card) => (
          <div key={card.id} className="border rounded-lg p-4">
            {editingId === card.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                />
                <input
                  value={editAnswer}
                  onChange={(e) => setEditAnswer(e.target.value)}
                  className="border rounded-lg px-3 py-2"
                />
                <div className="flex gap-2 text-sm">
                  <button onClick={() => handleSave(card.id)} className="text-green-600 hover:underline">
                    Save
                  </button>
                  <button onClick={() => setEditingId(null)} className="text-gray-600 hover:underline">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{card.question}</p>
                  <p className="text-gray-500 text-sm">{card.answer}</p>
                </div>
                <div className="flex gap-3 text-sm shrink-0">
                  <button onClick={() => handleEdit(card)} className="text-gray-600 hover:underline">
                    Edit
                  </button>
                  <button onClick={() => handleDelete(card.id)} className="text-red-600 hover:underline">
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