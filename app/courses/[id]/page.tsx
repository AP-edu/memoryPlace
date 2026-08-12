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

  if (loading) return <p className="p-6 text-gray-500">Loading decks...</p>;
  if (error) return <p className="p-6 text-red-600">Failed to load decks: {error}</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
        {"\u2190 Back to courses"}
      </Link>
      <h1 className="text-2xl font-bold mb-4 mt-2">Course Decks</h1>

      <form onSubmit={handleCreate} className="flex gap-2 mb-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New deck title"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Add
        </button>
      </form>
      {formError && <p className="text-red-600 text-sm mb-4">{formError}</p>}

      {decks?.length === 0 && <p className="text-gray-500">No decks yet — add one above.</p>}

      <div className="space-y-3">
        {decks?.map((deck) => (
          <div key={deck.id} className="border rounded-lg p-4 flex items-center justify-between">
            <span className="font-medium">{deck.title}</span>
            <div className="flex gap-3 text-sm">
              <Link href={`/quiz/${deck.id}`} className="text-blue-600 hover:underline">
                Study
              </Link>
              <Link href={`/decks/${deck.id}`} className="text-gray-600 hover:underline">
                Manage cards
              </Link>
              <button onClick={() => handleDelete(deck.id)} className="text-red-600 hover:underline">
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