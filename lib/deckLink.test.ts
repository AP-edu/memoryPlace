import { describe, expect, it } from "vitest";
import {
  cardToFlashcardContent,
  flashcardToCardContent,
  locusLabelFrom,
  MAX_TAGS,
  normalizeTags,
  parseTagInput,
  planLocusAnchors,
} from "./deckLink";
import type { Card, Opening } from "@/types/database";
import { anchorInOpening } from "./scene3d";

describe("normalizeTags", () => {
  it("trims, lowercases, dedupes, drops non-strings", () => {
    expect(normalizeTags([" Bio ", "bio", "Chem", 3, "", null])).toEqual(["bio", "chem"]);
  });
  it("caps count and tolerates junk input", () => {
    expect(normalizeTags(Array.from({ length: 30 }, (_, i) => `t${i}`))).toHaveLength(MAX_TAGS);
    expect(normalizeTags("nope")).toEqual([]);
    expect(normalizeTags(undefined)).toEqual([]);
  });
  it("parses comma text", () => {
    expect(parseTagInput("a, B ,, a")).toEqual(["a", "b"]);
  });
});

describe("content mapping", () => {
  it("maps flashcard <-> card text both ways", () => {
    expect(flashcardToCardContent({ question: "Q", answer: "A" })).toEqual({ front: { text: "Q" }, back: { text: "A" } });
    const card = { front: { text: "F" }, back: { text: "B" } } as Pick<Card, "front" | "back">;
    expect(cardToFlashcardContent(card)).toEqual({ question: "F", answer: "B" });
  });
  it("labels loci from question text", () => {
    expect(locusLabelFrom("  hello   world ")).toBe("hello world");
    expect(locusLabelFrom("")).toBe("From deck");
    expect(locusLabelFrom("x".repeat(100)).length).toBe(60);
  });
});

describe("planLocusAnchors", () => {
  it("round-robins walls and spreads offsets inside 0.15..0.85", () => {
    const plan = planLocusAnchors(8);
    expect(plan.map((p) => p.wall)).toEqual(["north", "east", "south", "west", "north", "east", "south", "west"]);
    expect(plan[0].wall_offset).toBe(0.15);
    expect(plan[4].wall_offset).toBe(0.85);
  });
  it("centres a lone locus per wall and rotates by startIndex", () => {
    const plan = planLocusAnchors(2, 3);
    expect(plan.map((p) => p.wall)).toEqual(["west", "north"]);
    expect(plan.every((p) => p.wall_offset === 0.5)).toBe(true);
  });
  it("keeps imported loci out of doorways (with clearance)", () => {
    const room = { width: 8, depth: 6 };
    const door = { id: "d", room_id: "r", wall: "north", wall_offset: 0.5, width_m: 1.2, kind: "door" } as Opening;
    for (const n of [1, 4, 5, 8, 12]) {
      const plan = planLocusAnchors(n, 0, room, [door]);
      expect(plan).toHaveLength(n);
      for (const a of plan) expect(anchorInOpening(a, room, [door])).toBe(false);
    }
    // A lone locus on that wall keeps half a metre from the jamb (door spans 3.4..4.6 m).
    const lone = planLocusAnchors(1, 0, room, [door])[0];
    expect(lone.wall).toBe("north");
    expect(Math.min(Math.abs(lone.wall_offset * 8 - 3.4), Math.abs(lone.wall_offset * 8 - 4.6))).toBeGreaterThanOrEqual(0.49);
    // No openings: identical to the plain plan.
    expect(planLocusAnchors(8, 1, room, [])).toEqual(planLocusAnchors(8, 1));
  });
  it("skips walls that are all opening (a corridor's archway end)", () => {
    const corridor = { width: 1.2, depth: 8 };
    const arch = { id: "a", room_id: "r", wall: "north", wall_offset: 0.5, width_m: 1.2, kind: "archway" } as Opening;
    const plan = planLocusAnchors(6, 0, corridor, [arch]);
    expect(plan).toHaveLength(6);
    expect(plan.some((a) => a.wall === "north")).toBe(false);
    for (const a of plan) expect(anchorInOpening(a, corridor, [arch])).toBe(false);
  });
  it("handles zero", () => {
    expect(planLocusAnchors(0)).toEqual([]);
  });
});
