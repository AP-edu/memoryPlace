"use client";
import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import type { HomeSummary } from "@/lib/homeSummary";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Date/time text differs per client, so it resolves after hydration (server
// snapshot is null) instead of risking a hydration mismatch.
function subscribeNoop(): () => void {
  return () => {};
}
let cachedToday: Date | null = null;
function getToday(): Date {
  if (!cachedToday) cachedToday = new Date();
  return cachedToday;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: summary, loading, error } = useFetch<HomeSummary>("/api/home/summary");
  const today = useSyncExternalStore(subscribeNoop, getToday, () => null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  if (status === "loading" || loading) return <p className="p-6 text-muted-foreground">Loading home…</p>;
  if (error) return <p className="p-6 text-destructive">Failed to load home: {error}</p>;
  if (!summary) return <p className="p-6 text-muted-foreground">Nothing here yet.</p>;

  const firstName = session?.user?.name?.split(" ")[0] ?? "scholar";
  const weekday = today?.toLocaleDateString("en-US", { weekday: "long" }) ?? "";
  const greeting = today ? `${greetingFor(today.getHours())},` : "Welcome,";
  const dueLine =
    summary.dueToday > 0
      ? `${summary.dueToday} item${summary.dueToday === 1 ? "" : "s"} due today`
      : "All caught up — nothing due";
  const cont = summary.continueTarget;

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">
        {greeting} {firstName}.{weekday ? ` ${weekday} — ` : " "}
        {dueLine}
      </p>
      <h1 className="mb-6 mt-1 text-3xl font-semibold">Home</h1>

      {cont ? (
        <div className="card-base mb-8 p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">Continue</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xl font-semibold">{cont.title}</p>
              <p className="text-sm text-muted-foreground">
                {cont.reviewed} of {cont.total} cards reviewed
                {cont.due > 0 ? ` · ${cont.due} due` : ""}
              </p>
            </div>
            <Link href={`/study/palace/${cont.palaceId}`} className="btn-primary">
              Study now →
            </Link>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${cont.total > 0 ? Math.round((cont.reviewed / cont.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="card-base mb-8 p-5">
          <p className="text-xl font-semibold">Raise your first palace</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Draw rooms on a 2D blueprint, place loci on the walls, and walk them in 3D.
          </p>
          <Link href="/palaces" className="btn-primary mt-3 inline-block">
            Go to palaces →
          </Link>
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">My Palaces</h2>
        <Link href="/palaces" className="text-sm text-link hover:underline">
          See all →
        </Link>
      </div>
      {summary.palaces.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">No palaces yet.</p>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.palaces.map((p) => (
            <Link key={p.palaceId} href={`/palaces/${p.palaceId}`} className="card-base group p-4 hover:shadow-card-hover">
              <p className="font-medium transition-colors group-hover:text-link">{p.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {p.rooms} room{p.rooms === 1 ? "" : "s"} · {p.cards} card{p.cards === 1 ? "" : "s"}
                {p.due > 0 ? ` · ${p.due} due` : ""}
              </p>
            </Link>
          ))}
          <Link href="/palaces" className="card-base grid place-items-center p-4 text-sm text-link hover:shadow-card-hover">
            + New palace
          </Link>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card-base p-4">
          <p className="font-display text-2xl font-semibold">{summary.streakDays}</p>
          <p className="text-xs text-muted-foreground">day streak</p>
        </div>
        <div className="card-base p-4">
          <p className="font-display text-2xl font-semibold">
            {summary.avgScore === null ? "—" : `${Math.round(summary.avgScore * 100)}%`}
          </p>
          <p className="text-xs text-muted-foreground">avg score</p>
        </div>
        <div className="card-base p-4">
          <p className="font-display text-2xl font-semibold">{summary.dueToday}</p>
          <p className="text-xs text-muted-foreground">cards due</p>
        </div>
      </div>
    </div>
  );
}
