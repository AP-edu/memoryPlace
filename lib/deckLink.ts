// Pure helpers for the deck <-> palace bridge (no DB, no scene code).
// Server routes in app/api/{imports,exports,links} compose these.
import { cardBack, cardFront, type Card, type Opening, type Room, type WallFace } from "@/types/database";
import { OPENING_CLEARANCE_M } from "./scene3d";
import { solidOffset, wallSpans } from "./walk";

export const MAX_TAGS = 12;
export const MAX_TAG_LENGTH = 32;

/** Trim, lowercase, dedupe, cap. Non-arrays and non-strings are dropped. */
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().toLowerCase().slice(0, MAX_TAG_LENGTH);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

/** "a, b ,c" -> ["a","b","c"] for tag inputs. */
export function parseTagInput(text: string): string[] {
  return normalizeTags(text.split(","));
}

export function locusLabelFrom(text: string, max = 60): string {
  const t = text.replace(/\s+/g, " ").trim();
  return (t.length > max ? t.slice(0, max - 1) + "…" : t) || "From deck";
}

export function flashcardToCardContent(f: { question: string; answer: string }) {
  return { front: { text: f.question }, back: { text: f.answer } };
}

export function cardToFlashcardContent(card: Pick<Card, "front" | "back">) {
  return { question: cardFront(card as Card), answer: cardBack(card as Card) };
}

const WALL_CYCLE: WallFace[] = ["north", "east", "south", "west"];

/**
 * Spread `count` new loci around the room: walls round-robin N/E/S/W (rotated
 * by `startIndex` so repeated imports don't all begin on the north wall),
 * offsets evenly spaced on each wall inside 0.15..0.85 of its SOLID length —
 * door/archway gaps (plus clearance) are skipped, so no locus lands in a doorway.
 */
export function planLocusAnchors(
  count: number,
  startIndex = 0,
  room?: Pick<Room, "width" | "depth">,
  openings: Opening[] = []
): Array<{ wall: WallFace; wall_offset: number }> {
  const perWall = Math.max(1, Math.ceil(count / WALL_CYCLE.length));
  const out: Array<{ wall: WallFace; wall_offset: number }> = [];
  for (let i = 0; i < count; i++) {
    const wall = WALL_CYCLE[(startIndex + i) % WALL_CYCLE.length];
    const group = Math.floor(i / WALL_CYCLE.length);
    const t = perWall <= 1 ? 0.5 : 0.15 + (0.7 * group) / (perWall - 1);
    const wall_offset = room ? solidOffset(t, wallSpans(room, wall, openings, OPENING_CLEARANCE_M)) : t;
    out.push({ wall, wall_offset: Math.round(wall_offset * 1000) / 1000 });
  }
  return out;
}

/** Unlinked-card nudge text shared by deck quiz + study surfaces. */
export const ANCHOR_NUDGE = "Not anchored to a palace — port it to a locus to get spaced-repetition scheduling.";
