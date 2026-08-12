"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFetch } from "@/hooks/useFetch";
import type { Flashcard } from "@/types/database";

export default function QuizPage() {
  const { deckId } = useParams<{ deckId: string }>();
  const router = useRouter();
  const { data: cards, loading, error } = useFetch<Flashcard[]>(
    deckId ? `/api/flashcards?deck=${deckId}` : null
  );
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [score, setScore] = useState(0);

  if (loading) return <p className="p-6">Loading quiz...</p>;
  if (error) return <p className="p-6 text-red-600">Failed to load quiz: {error}</p>;
  if (!cards?.length) return <p className="p-6">This deck has no flashcards yet.</p>;

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
    <div className="max-w-lg mx-auto p-6 text-center">
      <p className="text-sm text-gray-500 mb-2">
        Card {index + 1} of {cards.length}
      </p>
      <div className="border rounded-xl p-8 mb-6 min-h-[150px] flex items-center justify-center">
        <p className="text-lg">{showAnswer ? card.answer : card.question}</p>
      </div>
      {!showAnswer ? (
        <button onClick={() => setShowAnswer(true)} className="bg-blue-600 text-white px-5 py-2 rounded-lg">
          Show Answer
        </button>
      ) : (
        <div className="flex gap-3 justify-center">
          <button onClick={() => handleAnswer(false)} className="bg-red-500 text-white px-5 py-2 rounded-lg">
            Got it wrong
          </button>
          <button onClick={() => handleAnswer(true)} className="bg-green-600 text-white px-5 py-2 rounded-lg">
            Got it right
          </button>
        </div>
      )}
    </div>
  );
}