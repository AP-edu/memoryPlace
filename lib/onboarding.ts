// Guided onboarding (pure logic). The overlay walks the spatial loop from the
// wireframes: build -> place 5 loci -> walk in 3D -> first session -> done.
// Progress is derived from real data wherever possible; the 3D walk can't be
// observed from the DB, so it relies on the stored step the user acknowledged.

export const LOCI_GOAL = 5;
/** Stored step value meaning "the user has opened the 3D walk". */
export const WALKED_STEP = 3;

export interface OnboardingFacts {
  palaces: number;
  rooms: number;
  loci: number;
  cards: number;
  /** At least one recorded study session. */
  hasSession: boolean;
  /** users.onboarding_step (null = never advanced). */
  storedStep: number | null;
}

export interface OnboardingStep {
  id: "build" | "place" | "walk" | "study";
  title: string;
  body: string;
  cta: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "build",
    title: "Raise your palace",
    body: "Name a palace, then add your first room. A palace is the place you will walk to remember.",
    cta: "Build a room",
  },
  {
    id: "place",
    title: `Place ${LOCI_GOAL} loci on the walls`,
    body: `Click a wall in the room editor to drop a locus, then attach a card to it. Aim for ${LOCI_GOAL} spots you can picture clearly.`,
    cta: "Place loci",
  },
  {
    id: "walk",
    title: "Walk it in 3D",
    body: "Step into the room and tour your loci in order. Seeing each card at its place is what makes it stick.",
    cta: "Walk the palace",
  },
  {
    id: "study",
    title: "Finish your first session",
    body: "Answer a few cards at their loci. Recall is spaced automatically, so what you miss comes back sooner.",
    cta: "Start studying",
  },
];

/** Largest storable users.onboarding_step: one per step, 1-indexed (0 = none acknowledged). */
export const MAX_STEP = ONBOARDING_STEPS.length;

export interface OnboardingProgress {
  done: boolean[];
  /** Index of the first unfinished step; ONBOARDING_STEPS.length when all done. */
  current: number;
  complete: boolean;
}

export function onboardingProgress(f: OnboardingFacts): OnboardingProgress {
  const done = [
    f.palaces > 0 && f.rooms > 0,
    f.loci >= LOCI_GOAL && f.cards > 0,
    (f.storedStep ?? 0) >= WALKED_STEP,
    f.hasSession,
  ];
  const first = done.findIndex((d) => !d);
  return { done, current: first === -1 ? done.length : first, complete: first === -1 };
}
