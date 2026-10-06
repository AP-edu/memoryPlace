import { describe, expect, it } from "vitest";
import {
  averageScore,
  buildHomeSummary,
  pickContinue,
  rollupPalaces,
  streakDays,
  type SummaryCard,
  type SummaryLocus,
  type SummaryPalace,
  type SummaryReview,
  type SummaryRoom,
} from "./homeSummary";

const NOW = Date.parse("2026-10-05T12:00:00.000Z");
const PAST = new Date(NOW - 86_400_000).toISOString();
const FUTURE = new Date(NOW + 86_400_000).toISOString();

const palaces: SummaryPalace[] = [
  { id: "p1", title: "Biology" },
  { id: "p2", title: "Empty" },
];
const rooms: SummaryRoom[] = [
  { id: "r1", palace_id: "p1" },
  { id: "r2", palace_id: "p1" },
];
const loci: SummaryLocus[] = [
  { id: "l1", room_id: "r1" },
  { id: "l2", room_id: "r2" },
];
const cards: SummaryCard[] = [
  { id: "c1", locus_id: "l1" }, // overdue review
  { id: "c2", locus_id: "l1" }, // future review
  { id: "c3", locus_id: "l2" }, // brand-new (no review row)
  { id: "c4", locus_id: "ghost" }, // orphan locus: ignored
];
const reviews: SummaryReview[] = [
  { card_id: "c1", due_at: PAST },
  { card_id: "c2", due_at: FUTURE },
];

describe("rollupPalaces", () => {
  it("counts rooms/cards/reviewed/due per palace, skipping orphans", () => {
    const out = rollupPalaces(palaces, rooms, loci, cards, reviews, NOW);
    expect(out).toEqual([
      { palaceId: "p1", title: "Biology", rooms: 2, cards: 3, reviewed: 2, due: 2 },
      { palaceId: "p2", title: "Empty", rooms: 0, cards: 0, reviewed: 0, due: 0 },
    ]);
  });
});

describe("pickContinue", () => {
  it("picks the palace with the most due, null when nothing to study", () => {
    const out = rollupPalaces(palaces, rooms, loci, cards, reviews, NOW);
    expect(pickContinue(out)).toEqual({ palaceId: "p1", title: "Biology", due: 2, total: 3, reviewed: 2 });
    expect(pickContinue([{ palaceId: "p2", title: "Empty", rooms: 0, cards: 0, reviewed: 0, due: 0 }])).toBeNull();
    expect(pickContinue([])).toBeNull();
  });
});

describe("streakDays", () => {
  const day = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString();
  it("counts consecutive days ending today", () => {
    expect(streakDays([day(0), day(1), day(2)], NOW)).toBe(3);
  });
  it("starts from yesterday when today is quiet", () => {
    expect(streakDays([day(1), day(2)], NOW)).toBe(2);
  });
  it("stops at gaps and returns 0 when stale", () => {
    expect(streakDays([day(0), day(2)], NOW)).toBe(1);
    expect(streakDays([day(2)], NOW)).toBe(0);
    expect(streakDays([], NOW)).toBe(0);
  });
});

describe("averageScore", () => {
  it("weights by total and ignores unscored sessions", () => {
    expect(
      averageScore([
        { created_at: PAST, results: { score: 8, total: 10 } },
        { created_at: PAST, results: { score: 1, total: 2 } },
        { created_at: PAST, results: {} },
      ])
    ).toBeCloseTo(9 / 12);
    expect(averageScore([])).toBeNull();
    expect(averageScore([{ created_at: PAST, results: {} }])).toBeNull();
  });
});

describe("buildHomeSummary", () => {
  it("rolls everything up", () => {
    const out = buildHomeSummary({
      palaces,
      rooms,
      loci,
      cards,
      reviews,
      sessions: [{ created_at: PAST, results: { score: 4, total: 5 } }],
      now: NOW,
    });
    expect(out.dueToday).toBe(2);
    expect(out.totalCards).toBe(3);
    expect(out.continueTarget?.palaceId).toBe("p1");
    expect(out.streakDays).toBe(1);
    expect(out.avgScore).toBeCloseTo(0.8);
  });
});
