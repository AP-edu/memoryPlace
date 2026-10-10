// Pure helpers for the deck <-> palace bridge (no DB, no scene code).
// Server routes in app/api/{imports,exports,links} compose these.
import { cardBack, cardFront, type Card, type Opening, type Room, type WallFace } from "@/types/database";
import { wallLength } from "./geometry";
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
 * Imported loci keep this far (metres) from door jambs. The editor only refuses
 * the doorway itself + 0.15 m; an auto-placed locus shouldn't hug the frame.
 */
const IMPORT_DOOR_CLEARANCE_M = 0.5;
/** Walls with less solid length than this (metres, after door clearance) get no imported loci. */
const MIN_SOLID_M = 0.3;

/**
 * Spread `count` new loci around the room: walls round-robin N/E/S/W (rotated
 * by `startIndex` so repeated imports don't all begin on the north wall),
 * offsets evenly spaced on each wall inside 0.15..0.85 of its SOLID length —
 * door/archway gaps (plus clearance) are skipped, so no locus lands in a
 * doorway, and walls that are all opening (a corridor's archway end) are skipped.
 */
export function planLocusAnchors(
  count: number,
  startIndex = 0,
  room?: Pick<Room, "width" | "depth">,
  openings: Opening[] = []
): Array<{ wall: WallFace; wall_offset: number }> {
  const spans = new Map(WALL_CYCLE.map((w) => [w, room ? wallSpans(room, w, openings, IMPORT_DOOR_CLEARANCE_M) : null]));
  const solidM = (w: WallFace) => (room ? (spans.get(w) ?? []).reduce((t, sp) => t + sp.to - sp.from, 0) * wallLength(w, room) : Infinity);
  const usable = WALL_CYCLE.filter((w) => solidM(w) >= MIN_SOLID_M);
  const cycle = usable.length > 0 ? usable : WALL_CYCLE;
  const perWall = Math.max(1, Math.ceil(count / cycle.length));
  const out: Array<{ wall: WallFace; wall_offset: number }> = [];
  for (let i = 0; i < count; i++) {
    const wall = cycle[(startIndex + i) % cycle.length];
    const group = Math.floor(i / cycle.length);
    const t = perWall <= 1 ? 0.5 : 0.15 + (0.7 * group) / (perWall - 1);
    const wallSpansHere = spans.get(wall);
    const wall_offset = wallSpansHere ? solidOffset(t, wallSpansHere) : t;
    out.push({ wall, wall_offset: Math.round(wall_offset * 1000) / 1000 });
  }
  return out;
}

/** Unlinked-card nudge text shared by deck quiz + study surfaces. */
export const ANCHOR_NUDGE = "Not anchored to a palace — port it to a locus to get spaced-repetition scheduling.";
