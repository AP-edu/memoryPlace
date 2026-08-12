"use client";
import { useState } from "react";
import Link from "next/link";
import { useFetch } from "@/hooks/useFetch";
import type { Course, Deck, QuizResult } from "@/types/database";

export default function Dashboard() {
  const { data: courses, loading, error, refetch } = useFetch<Course[]>("/api/courses");
  const { data: results } = useFetch<QuizResult[]>("/api/quiz-results");
  const { data: decks } = useFetch<Deck[]>("/api/decks");
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const deckMap = new Map(decks?.map((d) => [d.id, d]));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (!res.ok) return setFormError("Failed to create course");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this course and everything in it?")) return;
    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete course");
    refetch();
  }

  if (loading) return <p className="p-6 text-gray-500">Loading courses...</p>;
  if (error) return <p className="p-6 text-red-600">Failed to load courses: {error}</p>;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">My Courses</h1>
      <form onSubmit={handleCreate} className="flex gap-2 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New course title"
          className="flex-1 border rounded-lg px-3 py-2"
        />
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          Add
        </button>
      </form>
      {formError && <p className="text-red-600 text-sm mb-4">{formError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses?.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="border rounded-lg p-4 hover:shadow transition-shadow"
          >
            <div className="flex justify-between items-start">
              <span className="font-medium">{course.title}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(course.id);
                }}
                className="text-red-600 text-sm hover:underline"
              >
                Delete
              </button>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-bold mt-10 mb-3">Recent Results</h2>
      {results?.length ? (
        <div className="space-y-2">
          {results.slice(0, 5).map((r) => {
            const deck = deckMap.get(r.deck_id);
            return (
              <div
                key={r.id}
                className="border rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <p className="font-medium">{deck?.title ?? "Unknown deck"}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="font-medium">
                    {r.score} / {r.total}
                  </span>
                  <Link href={`/quiz/${r.deck_id}`} className="text-blue-600 hover:underline">
                    Retake
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-gray-500">
          No quizzes yet — open a course, pick a deck, and hit Study.
        </p>
      )}
    </div>
  );
}