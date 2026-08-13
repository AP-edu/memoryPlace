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

  if (loading) return <p className="p-6 text-muted-foreground">Loading courses...</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load courses: {error}</p>;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-1 text-3xl font-semibold">My Courses</h1>
      <p className="mb-6 text-sm text-muted-foreground">Your palace, room by room.</p>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New course title"
          className="input-base flex-1"
        />
        <button className="btn-primary">Add</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses?.map((course) => (
          <Link
            key={course.id}
            href={`/courses/${course.id}`}
            className="card-base group p-4 hover:shadow-card-hover"
          >
            <div className="flex items-start justify-between">
              <span className="font-medium transition-colors group-hover:text-primary">{course.title}</span>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete(course.id);
                }}
                className="btn-danger"
              >
                Delete
              </button>
            </div>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-2xl font-semibold">Recent Results</h2>
      {results?.length ? (
        <div className="space-y-2">
          {results.slice(0, 5).map((r) => {
            const deck = deckMap.get(r.deck_id);
            return (
              <div
                key={r.id}
                className="card-base flex items-center justify-between p-3"
              >
                <div>
                  <p className="font-medium">{deck?.title ?? "Unknown deck"}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-display text-lg font-medium text-primary">
                    {r.score} / {r.total}
                  </span>
                  <Link href={`/quiz/${r.deck_id}`} className="btn-ghost">
                    Retake
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground">
          No quizzes yet — open a course, pick a deck, and hit Study.
        </p>
      )}
    </div>
  );
}