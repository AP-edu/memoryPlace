"use client";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import type { HomeSummary } from "@/lib/homeSummary";

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const { data: summary } = useFetch<HomeSummary>("/api/home/summary");

  if (status === "loading") return <p className="p-6 text-muted-foreground">Loading...</p>;
  if (!session) return <p className="p-6 text-muted-foreground">Redirecting to login...</p>;

  const cont = summary?.continueTarget ?? null;
  const weakest = summary
    ? [...summary.palaces].sort((a, b) => b.due - a.due || b.cards - a.cards)[0] ?? null
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
              ? "bg-accent/15 text-highlight"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {session.user.role === "admin" ? "Admin" : "User"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.palaces.length : "–"}</p>
          <p className="text-sm text-muted-foreground">Palaces</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.totalCards : "–"}</p>
          <p className="text-sm text-muted-foreground">Cards</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.dueToday : "–"}</p>
          <p className="text-sm text-muted-foreground">Due today</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold text-link">
            {summary ? (summary.avgScore === null ? "–" : `${Math.round(summary.avgScore * 100)}%`) : "–"}
          </p>
          <p className="text-sm text-muted-foreground">Avg score</p>
        </div>
      </div>

      <div className="card-base mt-6 p-4">
        <p className="mb-1 text-sm text-muted-foreground">Day streak</p>
        <p className="font-display text-lg font-medium">
          {summary ? `${summary.streakDays} day${summary.streakDays === 1 ? "" : "s"}` : "–"}
        </p>
      </div>

      {cont && (
        <div className="card-base mt-6 flex items-center justify-between p-4">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Continue</p>
            <p className="font-display text-lg font-medium">{cont.title}</p>
            <p className="text-sm text-muted-foreground">
              {cont.reviewed} of {cont.total} reviewed{cont.due > 0 ? ` · ${cont.due} due` : ""}
            </p>
          </div>
          <Link href={`/study/palace/${cont.palaceId}`} className="btn-primary">
            Study now →
          </Link>
        </div>
      )}

      {weakest && weakest.due > 0 && (!cont || weakest.palaceId !== cont.palaceId) && (
        <div className="card-base mt-6 flex items-center justify-between p-4">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Needs reinforcement</p>
            <p className="font-display text-lg font-medium">{weakest.title}</p>
            <p className="text-sm text-muted-foreground">{weakest.due} due</p>
          </div>
          <Link href={`/study/palace/${weakest.palaceId}`} className="btn-outline">
            Review →
          </Link>
        </div>
      )}
    </div>
  );
}
