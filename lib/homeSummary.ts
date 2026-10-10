// Home-screen aggregation (pure logic, no React/supabase).
// The /api/home/summary route fetches flat rows; everything below rolls them
// into the summary and is unit-tested here. Due semantics mirror lib/srs.ts:
// a card with no review row is brand-new and due now.
import type { Blueprint } from "./blueprint";

export interface SummaryPalace {
  id: string;
  title: string;
}

export interface SummaryRoom {
  id: string;
  palace_id: string;
}

export interface SummaryLocus {
  id: string;
  room_id: string;
}

export interface SummaryCard {
  id: string;
  locus_id: string;
}

export interface SummaryReview {
  card_id: string;
  due_at: string;
}

export interface SummarySession {
  created_at: string;
  results: { score?: number; total?: number; [key: string]: unknown };
}

export interface SummaryFlashcard {
  deck_id: string;
  source_card_id: string | null;
}

export interface DeckCounts {
  decks: number;
  flashcards: number;
  /** Flashcards with no live-linked palace card (no SRS schedule yet). */
  unanchored: number;
  /** Deck with the most unanchored flashcards (deep link target for "Port them"); null when none. */
  portDeckId: string | null;
}

export interface PalaceCounts {
  palaceId: string;
  title: string;
  rooms: number;
  cards: number;
  reviewed: number;
  due: number;
}

export interface ContinueTarget {
  palaceId: string;
  title: string;
  due: number;
  total: number;
  reviewed: number;
}

export interface HomeSummary {
  now: number;
  dueToday: number;
  totalCards: number;
  totalLoci: number;
  palaces: PalaceCounts[];
  continueTarget: ContinueTarget | null;
  streakDays: number;
  /** 0..1, null when no scored sessions yet. */
  avgScore: number | null;
  decks: DeckCounts;
  /** Ground-level plan per palace id, for card thumbnails (route-level). */
  plans?: Record<string, Blueprint>;
  /** Guided-onboarding state (route-level; not part of the pure rollups). */
  onboarding?: {
    onboardedAt: string | null;
    step: number | null;
    /** A room to deep-link the tour into (the one with the most loci). */
    firstRoomId: string | null;
    hasSession: boolean;
  };
}

export function rollupPalaces(
  palaces: SummaryPalace[],
  rooms: SummaryRoom[],
  loci: SummaryLocus[],
  cards: SummaryCard[],
  reviews: SummaryReview[],
  now: number
): PalaceCounts[] {
  const roomsByPalace = new Map<string, number>();
  for (const r of rooms) roomsByPalace.set(r.palace_id, (roomsByPalace.get(r.palace_id) ?? 0) + 1);
  const roomToPalace = new Map(rooms.map((r) => [r.id, r.palace_id]));
  const locusToPalace = new Map<string, string>();
  for (const l of loci) {
    const p = roomToPalace.get(l.room_id);
    if (p) locusToPalace.set(l.id, p);
  }
  const dueAtByCard = new Map(reviews.map((r) => [r.card_id, Date.parse(r.due_at)]));
  const counts = new Map<string, PalaceCounts>();
  for (const p of palaces) {
    counts.set(p.id, { palaceId: p.id, title: p.title, rooms: roomsByPalace.get(p.id) ?? 0, cards: 0, reviewed: 0, due: 0 });
  }
  for (const c of cards) {
    const pid = locusToPalace.get(c.locus_id);
    const entry = pid ? counts.get(pid) : undefined;
    if (!entry) continue;
    entry.cards += 1;
    const dueAt = dueAtByCard.get(c.id);
    if (dueAt === undefined) {
      entry.due += 1; // brand-new card: due now
    } else {
      entry.reviewed += 1;
      if (dueAt <= now) entry.due += 1;
    }
  }
  return [...counts.values()];
}

/** Palace with the most due cards (ties: most cards). Null when nothing to study. */
export function pickContinue(palaces: PalaceCounts[]): ContinueTarget | null {
  let best: PalaceCounts | null = null;
  for (const p of palaces) {
    if (p.cards === 0) continue;
    if (!best || p.due > best.due || (p.due === best.due && p.cards > best.cards)) best = p;
  }
  if (!best) return null;
  return { palaceId: best.palaceId, title: best.title, due: best.due, total: best.cards, reviewed: best.reviewed };
}

const DAY_MS = 86_400_000;

// Day boundaries follow the learner's local time: tzOffsetMin is
// Date#getTimezoneOffset() (minutes UTC is ahead of local; 0 = UTC).
function dayKey(ms: number, tzOffsetMin: number): string {
  return new Date(ms - tzOffsetMin * 60_000).toISOString().slice(0, 10);
}

/** Consecutive local-day streak ending today (or yesterday if today is quiet). */
export function streakDays(sessionDates: string[], nowMs: number, tzOffsetMin = 0): number {
  const days = new Set(sessionDates.map((d) => dayKey(Date.parse(d), tzOffsetMin)));
  let cursor = dayKey(nowMs, tzOffsetMin);
  if (!days.has(cursor)) {
    cursor = dayKey(nowMs - DAY_MS, tzOffsetMin);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  // Walk back one day at a time from the cursor's local midday (DST-safe).
  let ms = Date.parse(cursor + "T12:00:00.000Z") + tzOffsetMin * 60_000;
  while (days.has(dayKey(ms, tzOffsetMin))) {
    streak += 1;
    ms -= DAY_MS;
  }
  return streak;
}

export function rollupDecks(deckCount: number, flashcards: SummaryFlashcard[]): DeckCounts {
  const loose = new Map<string, number>();
  for (const f of flashcards) if (!f.source_card_id) loose.set(f.deck_id, (loose.get(f.deck_id) ?? 0) + 1);
  let portDeckId: string | null = null;
  let most = 0;
  for (const [deckId, n] of loose) {
    if (n > most) {
      most = n;
      portDeckId = deckId;
    }
  }
  return {
    decks: deckCount,
    flashcards: flashcards.length,
    unanchored: flashcards.filter((f) => !f.source_card_id).length,
    portDeckId,
  };
}

/** Score-weighted average over sessions that recorded a total. */
export function averageScore(sessions: SummarySession[]): number | null {
  let score = 0;
  let total = 0;
  for (const s of sessions) {
    const sc = s.results?.score;
    const t = s.results?.total;
    if (typeof sc !== "number" || typeof t !== "number" || t <= 0) continue;
    score += sc;
    total += t;
  }
  return total > 0 ? score / total : null;
}

export function buildHomeSummary(input: {
  palaces: SummaryPalace[];
  rooms: SummaryRoom[];
  loci: SummaryLocus[];
  cards: SummaryCard[];
  reviews: SummaryReview[];
  sessions: SummarySession[];
  now: number;
  tzOffsetMin?: number;
  deckCount?: number;
  flashcards?: SummaryFlashcard[];
}): HomeSummary {
  const palaces = rollupPalaces(input.palaces, input.rooms, input.loci, input.cards, input.reviews, input.now);
  return {
    now: input.now,
    dueToday: palaces.reduce((n, p) => n + p.due, 0),
    totalCards: palaces.reduce((n, p) => n + p.cards, 0),
    totalLoci: input.loci.length,
    palaces,
    continueTarget: pickContinue(palaces),
    streakDays: streakDays(
      input.sessions.map((s) => s.created_at),
      input.now,
      input.tzOffsetMin ?? 0
    ),
    avgScore: averageScore(input.sessions),
    decks: rollupDecks(input.deckCount ?? 0, input.flashcards ?? []),
  };
}
