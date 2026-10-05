// Phase D: spatial-quiz choice building (pure logic — no scene code here).
//
// Hybrid MCQ per roadmap: stored distractors when authored on the card,
// else auto-derive distractors from sibling cards' answers.

export const MAX_DISTRACTORS = 3;
export const MAX_CHOICES = 4;

/** Minimal card shape needed for choice building. */
export interface QuizCardLike {
  id: string;
  front: { text?: string; [key: string]: unknown } | null;
  back: { text?: string; [key: string]: unknown } | null;
  options?: unknown;
}

export function answerText(card: QuizCardLike): string {
  const t = card.back && typeof card.back.text === "string" ? card.back.text.trim() : "";
  return t;
}

/** Normalize authored `options` into clean distractor strings. */
export function sanitizeDistractors(options: unknown, correct: string): string[] {
  if (!Array.isArray(options)) return [];
  const seen = new Set<string>([correct.trim().toLowerCase()]);
  const out: string[] = [];
  for (const o of options) {
    if (typeof o !== "string") continue;
    const t = o.trim();
    if (!t || t.length > 200) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_DISTRACTORS) break;
  }
  return out;
}

/** Validate raw `options` from a request body. Returns error or clean array. */
export function validateOptionsInput(
  options: unknown,
  correct: string
): { ok: true; value: string[] } | { ok: false; error: string } {
  if (options === null || options === undefined) return { ok: true, value: [] };
  if (!Array.isArray(options)) return { ok: false, error: "options must be an array of strings" };
  if (options.length > MAX_DISTRACTORS)
    return { ok: false, error: `options holds at most ${MAX_DISTRACTORS} distractors` };
  for (const o of options) {
    if (typeof o !== "string" || !o.trim())
      return { ok: false, error: "options must be non-empty strings" };
    if (o.trim().length > 200) return { ok: false, error: "option too long (max 200 chars)" };
  }
  return { ok: true, value: sanitizeDistractors(options, correct) };
}

export interface BuiltChoices {
  /** Shuffled choice strings, correct included. */
  choices: string[];
  /** Index of the correct answer inside choices. */
  answerIndex: number;
  /** True when fewer than 2 choices exist — caller should self-grade instead. */
  fallback: boolean;
}

/** Fisher–Yates with injectable randomness (deterministic in tests). */
export function shuffled<T>(arr: T[], rand: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build MCQ choices for `card`: correct answer + authored distractors,
 * topped up with sibling cards' answers (same room first — caller orders
 * `siblings` accordingly). Dedupes case-insensitively, caps at 4.
 */
export function buildChoices(
  card: QuizCardLike,
  siblings: QuizCardLike[],
  rand: () => number = Math.random
): BuiltChoices {
  const correct = answerText(card);
  if (!correct) return { choices: [], answerIndex: -1, fallback: true };
  const seen = new Set<string>([correct.toLowerCase()]);
  const distractors: string[] = [...sanitizeDistractors(card.options, correct)];
  for (const s of siblings) {
    if (distractors.length >= MAX_DISTRACTORS) break;
    if (s.id === card.id) continue;
    const t = answerText(s);
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    distractors.push(t);
  }
  const choices = shuffled([correct, ...distractors], rand);
  if (choices.length < 2) return { choices, answerIndex: 0, fallback: true };
  return { choices, answerIndex: choices.indexOf(correct), fallback: false };
}
