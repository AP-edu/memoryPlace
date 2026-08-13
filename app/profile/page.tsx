"use client";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import type { Course, Deck, QuizResult } from "@/types/database";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { data: courses } = useFetch<Course[]>("/api/courses");
  const { data: decks } = useFetch<Deck[]>("/api/decks");
  const { data: results } = useFetch<QuizResult[]>("/api/quiz-results");

  if (status === "loading") return <p className="p-6 text-muted-foreground">Loading...</p>;
  if (!session) return <p className="p-6 text-muted-foreground">Redirecting to login...</p>;

  const lastResult = results?.[0];
  const avgPct = results?.length
    ? Math.round(
        (results.reduce((sum, r) => sum + r.score / r.total, 0) / results.length) * 100
      )
    : null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-5 text-3xl font-semibold">Profile</h1>

      <div className="card-base mb-6 flex items-center justify-between p-6">
        <div>
          <p className="font-display text-xl font-medium">{session.user.name}</p>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            session.user.role === "admin"
              ? "bg-accent/15 text-accent"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {session.user.role === "admin" ? "Admin" : "User"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{courses?.length ?? "–"}</p>
          <p className="text-sm text-muted-foreground">Courses</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{decks?.length ?? "–"}</p>
          <p className="text-sm text-muted-foreground">Decks</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{results?.length ?? "–"}</p>
          <p className="text-sm text-muted-foreground">Quizzes taken</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold text-primary">
            {avgPct !== null ? `${avgPct}%` : "–"}
          </p>
          <p className="text-sm text-muted-foreground">Avg score</p>
        </div>
      </div>

      {lastResult && (
        <div className="card-base mt-6 p-4">
          <p className="mb-1 text-sm text-muted-foreground">Last quiz</p>
          <p className="font-display text-lg font-medium">
            {lastResult.score} / {lastResult.total}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              on {new Date(lastResult.created_at).toLocaleDateString()}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}