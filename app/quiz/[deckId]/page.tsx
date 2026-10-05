"use client";
import Link from "next/link";

// Phase D: the legacy deck quiz is replaced by spatial walk-and-answer tours.
// This route now points at the palace flow; the file itself is deleted in Phase G.
export default function QuizPage() {
  return (
    <div className="mx-auto max-w-lg p-6 text-center">
      <p className="mb-2 text-lg font-semibold">Deck quizzes have moved</p>
      <p className="mb-4 text-sm text-muted-foreground">
        Quizzes now happen as walk-and-answer tours inside your palace — glide to each
        locus, pick the answer, and your reviews are saved the same way.
      </p>
      <Link href="/palaces" className="btn-primary">
        Open my palaces
      </Link>
    </div>
  );
}
