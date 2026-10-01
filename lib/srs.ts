// SM-2-lite binary spaced repetition (Phase C). Pure / headless-testable.
//
// A card with no card_reviews row is a "new" card: due immediately, ease 2.5.
// Binary grade only:
//   pass -> ease +0.05 (cap 2.8); interval 1d on first pass, then
//          round(prev_interval * ease0), capped at 90d; due in `interval` days.
//   fail -> ease -0.20 (floor 1.3); interval 0; due now.
// All times are epoch milliseconds; the DB stores timestamptz strings.

export interface ReviewSnapshot {
  ease: number;
  intervalDays: number;
  dueAt: number;
  lastGrade: number | null;
  reviewsCount: number;
}

export const SRS = {
  startEase: 2.5,
  maxEase: 2.8,
  minEase: 1.3,
  passEaseDelta: 0.05,
  failEaseDelta: 0.2,
  firstPassIntervalDays: 1,
  maxIntervalDays: 90,
  DAY_MS: 86_400_000,
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function gradeReview(
  prev: ReviewSnapshot | null,
  correct: boolean,
  now: number = Date.now()
): ReviewSnapshot {
  const ease0 = prev?.ease ?? SRS.startEase;
  const reviewsCount = (prev?.reviewsCount ?? 0) + 1;

  if (!correct) {
    return {
      ease: round2(Math.max(SRS.minEase, ease0 - SRS.failEaseDelta)),
      intervalDays: 0,
      dueAt: now,
      lastGrade: 0,
      reviewsCount,
    };
  }

  const prevInterval = prev?.intervalDays ?? 0;
  const intervalDays =
    prevInterval === 0
      ? SRS.firstPassIntervalDays
      : Math.min(SRS.maxIntervalDays, Math.round(prevInterval * ease0));

  return {
    ease: round2(Math.min(SRS.maxEase, ease0 + SRS.passEaseDelta)),
    intervalDays,
    dueAt: now + intervalDays * SRS.DAY_MS,
    lastGrade: 1,
    reviewsCount,
  };
}

// Canonical traversal order: room creation order across the palace, then
// loci.position inside a room (the single authority for spatial order) and
// card id as a stable tiebreaker when a locus holds several cards.
export function compareCanonical(a: QueueItem, b: QueueItem): number {
  return (
    a.roomOrder - b.roomOrder ||
    a.position - b.position ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export interface QueueItem {
  id: string;
  roomOrder: number;
  position: number;
  // Due time in epoch ms; null means this is a brand-new card (due now).
  dueAt: number | null;
}

export function effectiveDueAt(item: QueueItem, now: number): number {
  return item.dueAt ?? now;
}

export function isDue(item: QueueItem, now: number): boolean {
  return effectiveDueAt(item, now) <= now;
}

// Builds the play queue. "walk" respects traversal order and includes every
// card. "due" puts due cards first (most overdue first, ties by traversal
// order) and any later-due cards after, also in traversal order.
export function sortPlayQueue<T extends QueueItem>(
  items: T[],
  mode: "walk" | "due",
  now: number = Date.now()
): T[] {
  if (mode === "walk") return [...items].sort(compareCanonical);

  const due: T[] = [];
  const later: T[] = [];
  for (const item of items) {
    (effectiveDueAt(item, now) <= now ? due : later).push(item);
  }
  due.sort(
    (a, b) => effectiveDueAt(a, now) - effectiveDueAt(b, now) || compareCanonical(a, b)
  );
  later.sort(compareCanonical);
  return [...due, ...later];
}