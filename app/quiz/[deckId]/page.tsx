"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Deck, Flashcard } from "@/types/database";

const ROMAN: [number, string][] = [
  [50, "L"],
  [40, "XL"],
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];

function toRoman(n: number) {
  let out = "";
  let v = n;
  for (const [k, s] of ROMAN) {
    while (v >= k) {
      out += s;
      v -= k;
    }
  }
  return out;
}

export default function QuizPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const { data: cards, loading, error } = useFetch<Flashcard[]>(
    deckId ? `/api/flashcards?deck=${deckId}` : null
  );
  const { data: deck, loading: loadingDeck, error: deckError } = useFetch<Deck>(
    deckId ? `/api/decks/${deckId}` : null
  );
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);

  if (!deckId) return <p className="p-6">This quiz link is missing a deck id.</p>;
  if (loading || loadingDeck) return <p className="p-6 text-muted-foreground">Loading quiz...</p>;

  if (!deck) {
    return (
      <p className="p-6">
        This deck could not be found{deckError ? ` (${deckError})` : ""}.
      </p>
    );
  }

  if (error) return <p className="p-6 text-destructive">Failed to load quiz: {error}</p>;

  if (!cards?.length) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center">
        <p className="mb-2 text-sm text-muted-foreground">{deck.title}</p>
        <p className="text-lg">This deck has no flashcards yet.</p>
      </div>
    );
  }

  const card = cards[index];
  const isLast = index === cards.length - 1;

  async function handleAnswer(correct: boolean) {
    if (!deckId || !cards) return;
    const nextScore = correct ? score + 1 : score;
    setScore(nextScore);

    if (isLast) {
      try {
        const res = await fetch("/api/quiz-results", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deck_id: deckId, score: nextScore, total: cards.length }),
        });
        if (!res.ok) console.error("Failed to save quiz result");
      } catch {
        console.error("Failed to save quiz result");
      }
      router.push(`/results?score=${nextScore}&total=${cards.length}`);
    } else {
      setIndex(index + 1);
      setShowAnswer(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg p-4 sm:p-6">
      <p className="mb-1 text-center text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {deck.title}
      </p>
      <p className="mb-5 text-center font-display text-lg text-accent">
        Chamber {toRoman(index + 1)} of {toRoman(cards.length)}
      </p>

      <div className="card-base relative overflow-hidden p-10 text-center">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-linear-to-r from-primary via-accent to-primary" />
        <div className="flex min-h-40 items-center justify-center">
          <p className="text-xl font-medium leading-relaxed">
            {showAnswer ? card.answer : card.question}
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-center">
        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} className="btn-primary">
            Show Answer
          </button>
        ) : (
          <div className="flex gap-3">
            <button
              onClick={() => handleAnswer(false)}
              className="rounded-lg bg-destructive px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-destructive/90"
            >
              Got it wrong
            </button>
            <button
              onClick={() => handleAnswer(true)}
              className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700"
            >
              Got it right
            </button>
          </div>
        )}
      </div>
    </div>
  );
}