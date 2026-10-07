import { describe, expect, it } from "vitest";
import { parseAnswers, summarizeSession } from "./sessionSummary";
import type { SessionAnswer } from "./reviewTypes";

const a = (over: Partial<SessionAnswer>): SessionAnswer => ({
  id: "x",
  kind: "card",
  cardId: "x",
  correct: true,
  roomId: "r1",
  roomTitle: "Hall",
  locusId: "l1",
  locusLabel: "Door",
  label: "Q",
  ...over,
});

describe("summarizeSession", () => {
  it("scores, groups by room (worst first) and lists weak cards", () => {
    const s = summarizeSession([
      a({ id: "1" }),
      a({ id: "2", correct: false }),
      a({ id: "3", roomId: "r2", roomTitle: "Study", correct: false }),
      a({ id: "4", roomId: "r2", roomTitle: "Study", correct: false }),
    ]);
    expect(s.score).toBe(1);
    expect(s.total).toBe(4);
    expect(s.pct).toBe(0.25);
    expect(s.rooms.map((r) => r.roomId)).toEqual(["r2", "r1"]);
    expect(s.rooms[0].mastery).toBe(0);
    expect(s.rooms[1].mastery).toBe(0.5);
    expect(s.weak.map((w) => w.id)).toEqual(["2", "3", "4"]);
  });
  it("counts unanchored deck flashcards", () => {
    const s = summarizeSession([
      a({ id: "f1", kind: "flashcard", cardId: null, roomId: "", roomTitle: "" }),
      a({ id: "f2", kind: "flashcard", cardId: "c2" }),
    ]);
    expect(s.unanchored).toBe(1);
    expect(s.rooms.find((r) => r.roomId === "")?.roomTitle).toBe("Not in a palace");
  });
  it("handles empty", () => {
    expect(summarizeSession([])).toMatchObject({ score: 0, total: 0, pct: 0, rooms: [], weak: [] });
  });
});

describe("parseAnswers", () => {
  it("drops junk and defaults missing fields", () => {
    const out = parseAnswers([{ id: "a", correct: true }, null, { id: 3 }, "x", { id: "b", correct: false, kind: "flashcard" }]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "a", kind: "card", cardId: null, roomTitle: "" });
    expect(out[1].kind).toBe("flashcard");
    expect(parseAnswers(undefined)).toEqual([]);
  });
});
