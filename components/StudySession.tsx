"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import { sortPlayQueue } from "@/lib/srs";
import type { Card, CardReview } from "@/types/database";
import { cardBack, cardFront } from "@/types/database";

type Mode = "due" | "walk";

interface ReviewItem {
  id: string;
  card: Card;
  locusId: string;
  locusLabel: string;
  roomId: string;
  roomTitle: string;
  roomOrder: number;
  position: number;
  review: CardReview | null;
  dueAt: number | null;
}

interface ReviewPayload {
  scope: "room" | "palace";
  title: string;
  now: number;
  due: number;
  total: number;
  items: ReviewItem[];
}

export default function StudySession({
  endpoint,
  backHref,
  backLabel,
  sessionMeta,
}: {
  endpoint: string;
  backHref: string;
  backLabel: string;
  sessionMeta: { room_id?: string; palace_id?: string };
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("due");
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, loading, error } = useFetch<ReviewPayload>(endpoint);

  const queue = useMemo(() => {
    if (!data) return [];
    return sortPlayQueue(data.items, mode, data.now);
  }, [data, mode]);

  const card = queue[index];
  const isLast = index === queue.length - 1;

  function switchMode(next: Mode) {
    setMode(next);
    setIndex(0);
    setShowAnswer(false);
    setScore(0);
    setSaveError(null);
  }

  async function handleAnswer(correct: boolean) {
    if (!data || !card || saving) return;
    // Count the answer only once it is saved, so retrying after a failed save
    // can't double-count (previously the score was bumped before the POST).
    const nextScore = correct ? score + 1 : score;
    setSaving(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card_id: card.id, correct }),
      });
      if (!res.ok) {
        setSaveError("Failed to save your review. Try again.");
        setSaving(false);
        return;
      }
    } catch {
      setSaveError("Failed to save your review. Try again.");
      setSaving(false);
      return;
    }
    setSaveError(null);
    setScore(nextScore);

    if (isLast) {
      try {
        await fetch("/api/study-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sessionMeta, score: nextScore, total: data.total }),
        });
      } catch {
        // Summary is informational; don't block navigation on it.
      }
      router.push(`/results?score=${nextScore}&total=${data.total}`);
    } else {
      setIndex(index + 1);
      setShowAnswer(false);
    }
    setSaving(false);
  }

  // Keyboard: Space/Enter shows the answer, 1 = right, 2 = wrong.
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON")) return;
      if (!showAnswer && (e.code === "Space" || e.code === "Enter")) {
        e.preventDefault();
        setShowAnswer(true);
      } else if (showAnswer && (e.key === "1" || e.key === "2")) {
        void handleAnswer(e.key === "1");
      }
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) return <p className="p-6 text-muted-foreground">Loading study...</p>;
  if (error || !data) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load study{error ? `: ${error}` : ""}.</p>
        <Link href={backHref} className="btn-ghost mt-3">
          {"\u2190 "}{backLabel}
        </Link>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="mb-2 text-sm text-muted-foreground">{data.title}</p>
        <p className="text-lg">No cards here yet. Add loci and cards first.</p>
        <Link href={backHref} className="btn-primary mt-4">
          {"\u2190 "}{backLabel}
        </Link>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="text-lg">Something went wrong building the queue.</p>
        <Link href={backHref} className="btn-primary mt-4">
          {"\u2190 "}{backLabel}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Link href={backHref} className="btn-ghost !px-3 !py-1.5 !text-xs">
          {"\u2190 "}{backLabel}
        </Link>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-medium ${
            data.due === 0 ? "border-success/50 text-success" : "border-accent/50 text-highlight"
          }`}
        >
          {data.due === 0
            ? "All caught up"
            : `${data.due} due`}
          {" · "}
          {data.total} total
        </span>
      </div>

      {data.due === 0 && (
        <p className="mb-4 text-center text-sm text-muted-foreground">
          Nothing is due right now — reviewing anyway keeps it fresh.
        </p>
      )}

      <p className="mb-1 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {data.title}
      </p>
      <p className="mb-3 text-center font-display text-lg text-highlight">
        Card {index + 1} of {queue.length}
      </p>
      <div className="mb-5 flex justify-center gap-2 text-sm">
        <button
          onClick={() => switchMode("due")}
          className={mode === "due" ? "btn-primary !px-3 !py-1.5" : "btn-ghost"}
        >
          Due first
        </button>
        <button
          onClick={() => switchMode("walk")}
          className={mode === "walk" ? "btn-primary !px-3 !py-1.5" : "btn-ghost"}
        >
          Walkthrough
        </button>
      </div>

      <p className="mb-3 text-center text-xs text-muted-foreground">
        {card.locusLabel || "Unlabelled locus"}
        {data.scope === "palace" && card.roomTitle ? ` \u00b7 ${card.roomTitle}` : ""}
      </p>

      <div className="card-base relative overflow-hidden p-10 text-center">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-primary via-accent to-primary" />
        <div className="flex min-h-40 items-center justify-center">
          <p className="text-xl font-medium leading-relaxed">
            {showAnswer ? cardBack(card.card) : cardFront(card.card)}
          </p>
        </div>
      </div>

      {saveError && <p className="mt-3 text-center text-sm text-destructive">{saveError}</p>}

      <div className="mt-6 flex justify-center">
        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="btn-primary">
            Show Answer
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer(false)}
              disabled={saving}
              className="rounded-xl bg-destructive px-5 py-2 text-sm font-semibold text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Got it wrong
            </button>
            <button
              onClick={() => handleAnswer(true)}
              disabled={saving}
              className="rounded-xl bg-success px-5 py-2 text-sm font-semibold text-success-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Got it right
            </button>
          </div>
        )}
      </div>
    </div>
  );
}