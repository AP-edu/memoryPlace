"use client";
import { useParams } from "next/navigation";
import StudySession from "@/components/StudySession";

// Deck quiz runs on the same engine as palace study: linked flashcards share
// their palace card's SRS schedule, unlinked ones stay always-due with an
// anchor nudge. (Route name kept; the old quiz_results flow is retired.)
export default function QuizPage() {
  const { deckId } = useParams<{ deckId: string }>();
  if (!deckId) return <p className="p-6">This quiz link is missing a deck id.</p>;
  return (
    <StudySession
      endpoint={`/api/reviews?deck=${deckId}`}
      backHref={`/decks/${deckId}`}
      backLabel="Back to deck"
      sessionMeta={{ deck_id: deckId }}
    />
  );
}
