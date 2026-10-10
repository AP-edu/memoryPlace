"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Footprints, Layers, Zap } from "lucide-react";
import { useFetch } from "@/hooks/useFetch";
import type { HomeSummary } from "@/lib/homeSummary";
import PlanThumb from "@/components/palaces/PlanThumb";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface DeckRow {
  id: string;
  title: string;
  card_count?: number;
}

/**
 * Practice: one place to review. Walking the palace is the method (due cards
 * first, in place); 2D quick review is the fast fallback; decks quiz as
 * flashcards.
 */
export default function PracticePage() {
  const { status } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);
  const { data: summary, loading, error } = useFetch<HomeSummary>(`/api/home/summary?tz=${new Date().getTimezoneOffset()}`);
  const { data: decks } = useFetch<DeckRow[]>("/api/decks");

  if (status === "loading" || loading) return <PageSkeleton label="Loading practice" />;
  if (error || !summary) return <p className="p-6 text-destructive">Failed to load practice: {error}</p>;

  const palaces = [...summary.palaces].filter((p) => p.cards > 0).sort((a, b) => b.due - a.due);
  const next = palaces[0] ?? null;
  const others = palaces.slice(1);
  const plans = summary.plans ?? {};

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="text-3xl font-semibold sm:text-4xl">Practice</h1>
      <p className="mt-1 text-muted-foreground">
        {summary.dueToday > 0
          ? `${summary.dueToday} card${summary.dueToday === 1 ? "" : "s"} waiting at their loci`
          : "Nothing due right now — walk a palace anyway to keep it vivid"}
        {summary.streakDays > 0 ? ` · ${summary.streakDays}-day streak` : ""}
      </p>

      {next ? (
        <section className="card-base mt-6 grid gap-5 overflow-hidden !p-0 md:grid-cols-[1fr_1.2fr]">
          <Link href={`/palaces/${next.palaceId}`} className="block bg-muted/40 p-5" aria-label={`Open ${next.title}`} tabIndex={-1}>
            {plans[next.palaceId] ? <PlanThumb plan={plans[next.palaceId]} className="h-44 w-full" /> : null}
          </Link>
          <div className="flex flex-col justify-center p-5 md:pl-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-highlight">{next.due > 0 ? "Due now" : "Keep it fresh"}</p>
            <h2 className="mt-1 text-2xl font-semibold">{next.title}</h2>
            <p className="text-sm text-muted-foreground">
              {next.due > 0 ? `${next.due} due` : "All caught up"} · {next.reviewed} of {next.cards} reviewed · {next.rooms} room{next.rooms === 1 ? "" : "s"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/walk/palace/${next.palaceId}?tour=1`} className="btn-primary">
                <Footprints className="h-4 w-4" aria-hidden /> Walk your {next.due > 0 ? "due " : ""}loci
              </Link>
              <Link href={`/study/palace/${next.palaceId}`} className="btn-outline">
                <Zap className="h-4 w-4" aria-hidden /> Quick review
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The walk tours due cards in place, room by room — that is the method. Quick review shows them as flashcards with
              their locus on the map, for when you only have a minute.
            </p>
          </div>
        </section>
      ) : (
        <section className="card-base mt-6 p-6 text-center">
          <p className="text-lg font-semibold">Nothing to practise yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Build a palace and hang a few cards on its walls first.</p>
          <Link href="/palaces" className="btn-primary mt-4">
            Go to your palaces
          </Link>
        </section>
      )}

      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Other palaces</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {others.map((p) => (
              <li key={p.palaceId} className="card-base flex items-center gap-4 p-4">
                {plans[p.palaceId] && <PlanThumb plan={plans[p.palaceId]} className="h-14 w-20 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{p.due > 0 ? <span className="font-medium text-highlight">{p.due} due</span> : "All caught up"}</p>
                </div>
                <Link href={`/walk/palace/${p.palaceId}?tour=1`} className="btn-primary !px-3 !py-1.5" aria-label={`Walk ${p.title}`}>
                  <Footprints className="h-4 w-4" aria-hidden />
                </Link>
                <Link href={`/study/palace/${p.palaceId}`} className="btn-outline !px-3 !py-1.5" aria-label={`Quick review ${p.title}`}>
                  <Zap className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {decks && decks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">Quiz a deck</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {decks.map((d) => (
              <li key={d.id}>
                <Link href={`/quiz/${d.id}`} className="card-base flex items-center gap-3 p-3 hover:shadow-card-hover">
                  <Layers className="h-5 w-5 text-link" aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                  {typeof d.card_count === "number" && <span className="text-xs text-muted-foreground">{d.card_count} cards</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
