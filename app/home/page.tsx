"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
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

// Dismissal flag: server snapshot is "onboarded" (no tour card) so markup
// matches; the real value applies right after hydration (same pattern as today).
function getStoredOnboarded(): boolean {
  try {
    return window.localStorage.getItem("mp.onboarded") === "1";
  } catch {
    return true;
  }
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: summary, loading, error, refetch } = useFetch<HomeSummary>("/api/home/summary");
  const today = useSyncExternalStore(subscribeNoop, getToday, () => null);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Guided tour (Phase G, lightweight): a getting-started checklist until the
  // user completes their first loop or dismisses it. Persisted locally.
  const storedOnboarded = useSyncExternalStore(subscribeNoop, getStoredOnboarded, () => true);
  const [dismissedTour, setDismissedTour] = useState(false);
  const onboarded = storedOnboarded || dismissedTour;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  function dismissOnboarding() {
    try {
      window.localStorage.setItem("mp.onboarded", "1");
    } catch {
      // Private mode etc: hiding for this session is still fine.
    }
    setDismissedTour(true);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setFormError("Title required");
    const res = await fetch("/api/palaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    });
    if (!res.ok) return setFormError("Failed to create palace");
    setFormError(null);
    setTitle("");
    refetch();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this palace and everything in it?")) return;
    const res = await fetch(`/api/palaces/${id}`, { method: "DELETE" });
    if (!res.ok) return setFormError("Failed to delete palace");
    refetch();
  }

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
  const reviewedTotal = summary.palaces.reduce((n, p) => n + p.reviewed, 0);
  const steps = [
    { done: summary.palaces.length > 0, label: "Raise your first palace", hint: "Use the form below." },
    { done: summary.totalCards > 0, label: "Place loci and attach cards", hint: "Open a palace → Edit room." },
    { done: reviewedTotal > 0, label: "Complete your first study loop", hint: "Continue below, or walk a room in 3D." },
  ];
  const showTour = !onboarded && steps.some((s) => !s.done);

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <p className="text-sm text-muted-foreground">
        {greeting} {firstName}.{weekday ? ` ${weekday} — ` : " "}
        {dueLine}
      </p>
      <h1 className="mb-6 mt-1 text-3xl font-semibold">Home</h1>

      {showTour && (
        <div className="card-base mb-8 border-primary/40 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">Guided tour</p>
              <p className="mt-1 text-xl font-semibold">Learn the palace loop</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Design → place loci → walk in 3D → reinforce with quizzes.
              </p>
            </div>
            <button onClick={dismissOnboarding} className="btn-ghost shrink-0 !px-3 !py-1.5 !text-xs">
              Dismiss
            </button>
          </div>
          <ol className="mt-4 space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    s.done ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <span className={s.done ? "text-muted-foreground line-through" : ""}>
                  {s.label} <span className="text-muted-foreground">— {s.hint}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

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
            Draw rooms on a 2D blueprint, place loci on the walls, and walk them in 3D. Use the form below to begin.
          </p>
        </div>
      )}

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">My Palaces</h2>
        <span className="text-sm text-muted-foreground">
          {summary.totalCards} card{summary.totalCards === 1 ? "" : "s"} total
        </span>
      </div>
      <form onSubmit={handleCreate} className="mb-6 flex gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New palace title"
          className="input-base flex-1"
        />
        <button className="btn-primary">Add</button>
      </form>
      {formError && <p className="mb-4 text-sm text-destructive">{formError}</p>}
      {summary.palaces.length === 0 ? (
        <p className="mb-8 text-sm text-muted-foreground">No palaces yet — raise the first one above.</p>
      ) : (
        <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.palaces.map((p) => (
            <div key={p.palaceId} className="card-base group p-4 hover:shadow-card-hover">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/palaces/${p.palaceId}`} className="font-medium transition-colors group-hover:text-link">
                  {p.title}
                </Link>
                <button
                  onClick={() => handleDelete(p.palaceId)}
                  className="btn-danger"
                  aria-label={`Delete ${p.title}`}
                >
                  Delete
                </button>
              </div>
              <Link href={`/palaces/${p.palaceId}`} className="mt-0.5 block text-xs text-muted-foreground">
                {p.rooms} room{p.rooms === 1 ? "" : "s"} · {p.cards} card{p.cards === 1 ? "" : "s"}
                {p.due > 0 ? ` · ${p.due} due` : ""}
              </Link>
            </div>
          ))}
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
