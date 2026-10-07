import { describe, expect, it } from "vitest";
import { LOCI_GOAL, ONBOARDING_STEPS, onboardingProgress, WALKED_STEP, type OnboardingFacts } from "./onboarding";

const base: OnboardingFacts = { palaces: 0, rooms: 0, loci: 0, cards: 0, hasSession: false, storedStep: null };

describe("onboardingProgress", () => {
  it("starts at build for a brand-new user", () => {
    const p = onboardingProgress(base);
    expect(p.current).toBe(0);
    expect(p.done).toEqual([false, false, false, false]);
    expect(p.complete).toBe(false);
  });
  it("needs a room, not just a palace", () => {
    expect(onboardingProgress({ ...base, palaces: 1 }).current).toBe(0);
    expect(onboardingProgress({ ...base, palaces: 1, rooms: 1 }).current).toBe(1);
  });
  it(`needs ${LOCI_GOAL} loci and a card to leave the place step`, () => {
    const f = { ...base, palaces: 1, rooms: 1 };
    expect(onboardingProgress({ ...f, loci: LOCI_GOAL - 1, cards: 3 }).current).toBe(1);
    expect(onboardingProgress({ ...f, loci: LOCI_GOAL, cards: 0 }).current).toBe(1);
    expect(onboardingProgress({ ...f, loci: LOCI_GOAL, cards: 1 }).current).toBe(2);
  });
  it("walk step relies on the acknowledged stored step", () => {
    const f = { ...base, palaces: 1, rooms: 1, loci: 5, cards: 5 };
    expect(onboardingProgress({ ...f, storedStep: WALKED_STEP - 1 }).current).toBe(2);
    expect(onboardingProgress({ ...f, storedStep: WALKED_STEP }).current).toBe(3);
  });
  it("completes once a session exists", () => {
    const p = onboardingProgress({ palaces: 1, rooms: 1, loci: 5, cards: 5, hasSession: true, storedStep: WALKED_STEP });
    expect(p.complete).toBe(true);
    expect(p.current).toBe(ONBOARDING_STEPS.length);
  });
  it("later steps can be done before earlier ones without skipping the earlier one", () => {
    const p = onboardingProgress({ ...base, hasSession: true });
    expect(p.current).toBe(0);
    expect(p.done[3]).toBe(true);
  });
});
