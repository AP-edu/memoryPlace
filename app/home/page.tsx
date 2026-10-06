"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import OnboardingOverlay from "@/components/OnboardingOverlay";
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

// Legacy (pre-server) dismissal flag. If a browser still has it we migrate it
// to users.onboarded_at once, so nobody sees the tour twice.
function getLegacyOnboarded(): boolean {
  try {
    return window.localStorage.getItem("mp.onboarded") === "1";
  } catch {
    return false;
  }
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: summary, loading, error, refetch } = useFetch<HomeSummary>(
    `/api/home/summary?tz=${new Date().getTimezoneOffset()}`
  );
  const today = useSyncExternalStore(subscribeNoop, getToday, () => null);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  // Guided tour: server-side state (users.onboarded_at / onboarding_step).
  const legacyOnboarded = useSyncExternalStore(subscribeNoop, getLegacyOnboarded, () => false);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  // One-time migration of the old localStorage dismissal to the server.
  const migrated = summary?.onboarding && !summary.onboarding.onboardedAt && legacyOnboarded;
  useEffect(() => {
    if (!migrated) return;
    void fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarded: true }),
    }).then(() => {
      try {
        window.localStorage.removeItem("mp.onboarded");
      } catch {
        // ignore
      }
      refetch();
    });
  }, [migrated, refetch]);

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
  const ob = summary.onboarding;
  const showTour = !!ob && !ob.onboardedAt && !legacyOnboarded;
  const firstPalaceId = summary.palaces[0]?.palaceId ?? null;

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
      <form onSubmit={handleCreate} data-tour="palace-form" className="mb-6 flex gap-2 rounded-2xl">
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

      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xl font-semibold">Decks</h2>
        <Link href="/decks" className="text-sm text-link hover:underline">
          Manage decks →
        </Link>
      </div>
      <div className="card-base mb-8 p-4 text-sm">
        {summary.decks.decks === 0 ? (
          <p className="text-muted-foreground">
            No decks yet. Make one to quiz Quizlet-style, then port it into a palace.{" "}
            <Link href="/decks" className="text-link underline">
              Create a deck
            </Link>
          </p>
        ) : (
          <p>
            {summary.decks.decks} deck{summary.decks.decks === 1 ? "" : "s"} · {summary.decks.flashcards} flashcard
            {summary.decks.flashcards === 1 ? "" : "s"}
            {summary.decks.unanchored > 0 && (
              <span className="text-highlight">
                {" "}
                · {summary.decks.unanchored} not anchored to a palace yet{" "}
                <Link href="/decks" className="underline">
                  Port them
                </Link>
              </span>
            )}
          </p>
        )}
      </div>

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

      {showTour && ob && (
        <OnboardingOverlay
          facts={{
            palaces: summary.palaces.length,
            rooms: summary.palaces.reduce((n, p) => n + p.rooms, 0),
            loci: summary.totalLoci,
            cards: summary.totalCards,
            hasSession: ob.hasSession,
            storedStep: ob.step,
          }}
          firstPalaceId={firstPalaceId}
          firstRoomId={ob.firstRoomId}
          studyHref={cont ? `/study/palace/${cont.palaceId}` : null}
          onChanged={refetch}
        />
      )}
    </div>
  );
}
