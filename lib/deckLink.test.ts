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
import type { Card } from "@/types/database";

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
  it("handles zero", () => {
    expect(planLocusAnchors(0)).toEqual([]);
  });
});
