// Pure rollups for the post-session summary (no DB, no React).
import type { SessionAnswer } from "@/lib/reviewTypes";

export interface RoomMastery {
  roomId: string;
  roomTitle: string;
  correct: number;
  total: number;
  /** 0..1 */
  mastery: number;
}

export interface SessionSummary {
  score: number;
  total: number;
  /** 0..1, 0 when empty. */
  pct: number;
  rooms: RoomMastery[];
  weak: SessionAnswer[];
  unanchored: number;
}

const NO_ROOM = "__none__";

/** Per-room mastery (worst first), weak cards (missed answers), unanchored count. */
export function summarizeSession(answers: SessionAnswer[]): SessionSummary {
  const byRoom = new Map<string, RoomMastery>();
  let score = 0;
  for (const a of answers) {
    if (a.correct) score += 1;
    const key = a.roomId || NO_ROOM;
    const cur =
      byRoom.get(key) ??
      { roomId: a.roomId, roomTitle: a.roomTitle || "Not in a palace", correct: 0, total: 0, mastery: 0 };
    cur.total += 1;
    if (a.correct) cur.correct += 1;
    byRoom.set(key, cur);
  }
  const rooms = [...byRoom.values()]
    .map((r) => ({ ...r, mastery: r.total ? r.correct / r.total : 0 }))
    .sort((a, b) => a.mastery - b.mastery || b.total - a.total || a.roomTitle.localeCompare(b.roomTitle));
  return {
    score,
    total: answers.length,
    pct: answers.length ? score / answers.length : 0,
    rooms,
    weak: answers.filter((a) => !a.correct),
    unanchored: answers.filter((a) => a.kind === "flashcard" && !a.cardId).length,
  };
}

/** Defensive parse of results.answers coming back from the DB. */
export function parseAnswers(raw: unknown): SessionAnswer[] {
  if (!Array.isArray(raw)) return [];
  const out: SessionAnswer[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.correct !== "boolean") continue;
    out.push({
      id: o.id,
      kind: o.kind === "flashcard" ? "flashcard" : "card",
      cardId: typeof o.cardId === "string" ? o.cardId : null,
      correct: o.correct,
      roomId: typeof o.roomId === "string" ? o.roomId : "",
      roomTitle: typeof o.roomTitle === "string" ? o.roomTitle : "",
      locusId: typeof o.locusId === "string" ? o.locusId : "",
      locusLabel: typeof o.locusLabel === "string" ? o.locusLabel : "",
      label: typeof o.label === "string" ? o.label : "",
    });
    if (out.length >= 500) break;
  }
  return out;
}
