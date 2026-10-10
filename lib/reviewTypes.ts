// Shapes shared by /api/reviews, StudySession and the results summary.
import type { Card, CardReview } from "@/types/database";

export interface ReviewItem {
  /** Palace items: card id. Deck items: flashcard id. */
  id: string;
  card: Card;
  locusId: string;
  locusLabel: string;
  roomId: string;
  roomTitle: string;
  /** Palace the locus's room belongs to (null for unanchored deck cards). */
  palaceId: string | null;
  /** The room's theme colour (#rrggbb) — the study screen takes it as its accent. */
  roomColor: string | null;
  roomOrder: number;
  position: number;
  review: CardReview | null;
  dueAt: number | null;
  /** Deck items only: the flashcard being quizzed. */
  flashcardId?: string;
  /** Deck items only: true when live-linked to a palace card (SRS scheduled). */
  linked?: boolean;
}

export interface ReviewPayload {
  scope: "room" | "palace" | "deck";
  title: string;
  /** Deck scope only. */
  deckId?: string;
  now: number;
  due: number;
  total: number;
  items: ReviewItem[];
}

/** One graded answer, stored in study_sessions.results.answers for the summary. */
export interface SessionAnswer {
  /** card id (palace) or flashcard id (deck). */
  id: string;
  kind: "card" | "flashcard";
  /** Linked palace card id when known (edit/reassign target). */
  cardId: string | null;
  correct: boolean;
  roomId: string;
  roomTitle: string;
  locusId: string;
  locusLabel: string;
  /** Question text, for weak-card lists. */
  label: string;
}
