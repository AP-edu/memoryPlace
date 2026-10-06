// Home-screen aggregation (pure logic, no React/supabase).
// The /api/home/summary route fetches flat rows; everything below rolls them
// into the summary and is unit-tested here. Due semantics mirror lib/srs.ts:
// a card with no review row is brand-new and due now.

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
  palaces: PalaceCounts[];
  continueTarget: ContinueTarget | null;
  streakDays: number;
  /** 0..1, null when no scored sessions yet. */
  avgScore: number | null;
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

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Consecutive-day streak ending today (or yesterday if today is quiet). */
export function streakDays(sessionDates: string[], nowMs: number): number {
  const days = new Set(sessionDates.map((d) => dayKey(Date.parse(d))));
  let cursor = dayKey(nowMs);
  if (!days.has(cursor)) {
    cursor = dayKey(nowMs - DAY_MS);
    if (!days.has(cursor)) return 0;
  }
  let streak = 0;
  let ms = Date.parse(cursor + "T00:00:00.000Z");
  while (days.has(dayKey(ms))) {
    streak += 1;
    ms -= DAY_MS;
  }
  return streak;
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
}): HomeSummary {
  const palaces = rollupPalaces(input.palaces, input.rooms, input.loci, input.cards, input.reviews, input.now);
  return {
    now: input.now,
    dueToday: palaces.reduce((n, p) => n + p.due, 0),
    totalCards: palaces.reduce((n, p) => n + p.cards, 0),
    palaces,
    continueTarget: pickContinue(palaces),
    streakDays: streakDays(
      input.sessions.map((s) => s.created_at),
      input.now
    ),
    avgScore: averageScore(input.sessions),
  };
}
