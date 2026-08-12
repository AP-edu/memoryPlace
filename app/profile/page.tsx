"use client";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import type { Course, Deck, QuizResult } from "@/types/database";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { data: courses } = useFetch<Course[]>("/api/courses");
  const { data: decks } = useFetch<Deck[]>("/api/decks");
  const { data: results } = useFetch<QuizResult[]>("/api/quiz-results");

  if (status === "loading") return <p className="p-6 text-gray-500">Loading...</p>;
  if (!session) return <p className="p-6 text-gray-500">Redirecting to login...</p>;

  const lastResult = results?.[0];
  const avgPct = results?.length
    ? Math.round(
        (results.reduce((sum, r) => sum + r.score / r.total, 0) / results.length) * 100
      )
    : null;

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold mb-4">Profile</h1>

      <div className="border rounded-lg p-6 mb-6 flex items-center justify-between">
        <div>
          <p className="text-lg font-medium">{session.user.name}</p>
          <p className="text-gray-500 text-sm">{session.user.email}</p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-xs font-medium ${
            session.user.role === "admin"
              ? "bg-blue-100 text-blue-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {session.user.role === "admin" ? "Admin" : "User"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{courses?.length ?? "–"}</p>
          <p className="text-sm text-gray-500">Courses</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{decks?.length ?? "–"}</p>
          <p className="text-sm text-gray-500">Decks</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{results?.length ?? "–"}</p>
          <p className="text-sm text-gray-500">Quizzes taken</p>
        </div>
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{avgPct !== null ? `${avgPct}%` : "–"}</p>
          <p className="text-sm text-gray-500">Avg score</p>
        </div>
      </div>

      {lastResult && (
        <div className="border rounded-lg p-4 mt-6">
          <p className="text-sm text-gray-500 mb-1">Last quiz</p>
          <p className="font-medium">
            {lastResult.score} / {lastResult.total}
            <span className="text-gray-500 text-sm font-normal">
              {" "}
              on {new Date(lastResult.created_at).toLocaleDateString()}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}