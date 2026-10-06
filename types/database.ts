
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Deck {
  id: string;
  title: string;
  course_id: string;
  owner: string;
  created_at: string;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  deck_id: string;
  owner: string;
  created_at: string;
}

export interface QuizResult {
  id: string;
  deck_id: string;
  user_id: string;
  score: number;
  total: number;
  created_at: string;
}

export interface PasswordResetToken {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

// Palace model (spatial rebuild). Palaces contain rooms, rooms contain loci,
// cards attach to loci. Deck/flashcard/quiz-result types remain only for the
// retained straight-quiz flow (/quiz/[deckId]); courses are gone.
export type PalaceVisibility = "private" | "shared" | "public";

export interface Palace {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  theme: Record<string, unknown>;
  visibility: PalaceVisibility;
  // Grid editor (migration 20261001160000): snap step in metres; unit is always "m".
  grid_snap: number;
  unit: "m";
  created_at: string;
}

// A floor of a palace. Rooms sit on a level at (pos_x, pos_z); levels stack
// by `idx` (0 = ground) and `elevation` (metres).
export interface Level {
  id: string;
  palace_id: string;
  idx: number;
  name: string;
  elevation: number;
  default_height: number;
  created_at: string;
}

export interface Room {
  id: string;
  palace_id: string;
  user_id: string;
  title: string;
  background: string | null;
  metadata: Record<string, unknown>;
  // Rect geometry (v2). World y-up: room spans x in [0,width], z in [0,depth],
  // y in [0,height]. See migration 20260916131701_palace_v2_geometry.sql.
  width: number;
  depth: number;
  height: number;
  // Placement on the level grid (metres). (pos_x, pos_z) is the room's min
  // corner; north = +z is drawn at the top of every 2D view.
  level_id: string | null;
  pos_x: number;
  pos_z: number;
  rotation: 0 | 90 | 180 | 270;
  // Reserved for future polygon rooms (room-local {x,z} vertices). Unused in v1.
  outline: Array<{ x: number; z: number }> | null;
  created_at: string;
}

export type WallFace = "north" | "south" | "east" | "west";

export interface Locus {
  id: string;
  room_id: string;
  x: number;
  y: number;
  z: number | null;
  label: string;
  tags: string[];
  position: number;
  // Wall anchoring (v2): wall_offset is 0..1 along the wall from its start
  // corner; height is absolute world units. Legacy x/y/z remain for compat.
  wall: WallFace | null;
  wall_offset: number | null;
  height: number | null;
  created_at: string;
}

export type OpeningKind = "door" | "archway";

export interface Opening {
  id: string;
  room_id: string;
  wall: WallFace;
  wall_offset: number;
  // Legacy: width as a fraction (0..1) of the wall length when written.
  width: number;
  // Authoritative absolute width in metres (null on rows written before the
  // grid-editor migration; use openingWidthM() from lib/geometry.ts).
  width_m: number | null;
  kind: OpeningKind;
  // Room on the other side of a shared wall (doors between adjacent rooms).
  target_room_id: string | null;
  created_at: string;
}

export interface CardReview {
  card_id: string;
  user_id: string;
  ease: number;
  interval_days: number;
  due_at: string;
  last_grade: number | null;
  reviews_count: number;
  created_at: string;
  updated_at: string;
}

export type CardType = "basic" | "cloze" | "image" | "audio";

export interface Card {
  id: string;
  locus_id: string;
  user_id: string;
  type: CardType;
  front: { text?: string; [key: string]: unknown };
  back: { text?: string; [key: string]: unknown };
  /** Authored MCQ distractors (wrong answers). Null/empty = auto-derive. */
  options?: string[] | null;
  /** Study order within the locus (0..n-1, mirrors loci.position). */
  position?: number | null;
  media_refs: unknown[];
  created_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  palace_id: string | null;
  room_id: string | null;
  scope: Record<string, unknown>;
  results: { score?: number; total?: number; [key: string]: unknown };
  created_at: string;
}

export function cardFront(card: Card): string {
  return typeof card.front?.text === "string" ? card.front.text : "";
}

export function cardBack(card: Card): string {
  return typeof card.back?.text === "string" ? card.back.text : "";
}

/** Authored distractors, normalized (non-empty strings, max 3). */
export function cardDistractors(card: Card): string[] {
  if (!Array.isArray(card.options)) return [];
  const correct = cardBack(card).trim().toLowerCase();
  const out: string[] = [];
  for (const o of card.options) {
    if (typeof o !== "string") continue;
    const t = o.trim();
    if (!t || t.toLowerCase() === correct) continue;
    if (!out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= 3) break;
  }
  return out;
}