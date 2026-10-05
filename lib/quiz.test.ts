import { describe, expect, it } from "vitest";
import { buildChoices, sanitizeDistractors, validateOptionsInput, type QuizCardLike } from "./quiz";

const card = (id: string, back: string, options?: unknown): QuizCardLike => ({
  id,
  front: { text: "q" },
  back: { text: back },
  options,
});

// Deterministic rand: always picks index 0 swaps — stable for assertions.
const zero = () => 0;

describe("sanitizeDistractors", () => {
  it("keeps at most 3 clean strings", () => {
    expect(sanitizeDistractors(["a", "b", "c", "d"], "correct")).toEqual(["a", "b", "c"]);
  });
  it("drops blanks, non-strings, dupes of correct (case-insensitive)", () => {
    expect(sanitizeDistractors([" Paris ", "", 42, "paris", "PARIS", "Lyon"], "Paris")).toEqual([
      "Lyon",
    ]);
  });
  it("returns [] for non-arrays", () => {
    expect(sanitizeDistractors(null, "x")).toEqual([]);
    expect(sanitizeDistractors("nope", "x")).toEqual([]);
  });
});

describe("validateOptionsInput", () => {
  it("accepts null/undefined as empty", () => {
    expect(validateOptionsInput(null, "x")).toEqual({ ok: true, value: [] });
    expect(validateOptionsInput(undefined, "x")).toEqual({ ok: true, value: [] });
  });
  it("rejects non-arrays, too many, blanks", () => {
    expect(validateOptionsInput("a", "x").ok).toBe(false);
    expect(validateOptionsInput(["a", "b", "c", "d"], "x").ok).toBe(false);
    expect(validateOptionsInput(["", "b"], "x").ok).toBe(false);
  });
});

describe("buildChoices", () => {
  it("uses authored distractors first", () => {
    const c = card("1", "Paris", ["Lyon", "Nice"]);
    const r = buildChoices(c, [card("2", "Berlin"), card("3", "Rome")], zero);
    expect(r.fallback).toBe(false);
    expect(r.choices).toHaveLength(4);
    expect(r.choices[r.answerIndex]).toBe("Paris");
    expect(r.choices).toContain("Lyon");
  });
  it("auto-derives from siblings when none authored", () => {
    const c = card("1", "Paris");
    const r = buildChoices(c, [card("2", "Berlin"), card("3", "Rome"), card("4", "Madrid")], zero);
    expect(r.choices).toHaveLength(4);
    expect(r.choices[r.answerIndex]).toBe("Paris");
  });
  it("falls back with fewer than 2 choices", () => {
    expect(buildChoices(card("1", "Paris"), [], zero).fallback).toBe(true);
    expect(buildChoices(card("1", ""), [card("2", "Berlin")], zero).fallback).toBe(true);
  });
  it("skips self and duplicate sibling answers", () => {
    const c = card("1", "Paris");
    const r = buildChoices(c, [card("1", "Paris"), card("2", "paris"), card("3", "Berlin")], zero);
    expect(r.fallback).toBe(false); // Paris + Berlin = 2 valid choices
    expect(r.choices).toHaveLength(2);
    expect(r.choices[r.answerIndex]).toBe("Paris");
  });
  it("caps at 4 choices", () => {
    const c = card("1", "Paris", ["A", "B", "C"]);
    const r = buildChoices(c, [card("2", "D"), card("3", "E")], zero);
    expect(r.choices).toHaveLength(4);
  });
});
