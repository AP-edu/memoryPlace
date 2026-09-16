
export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  created_at: string;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  owner: string;
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
// cards attach to loci. Legacy courses/decks/flashcards/quiz_results remain.
export type PalaceVisibility = "private" | "shared" | "public";

export interface Palace {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  theme: Record<string, unknown>;
  visibility: PalaceVisibility;
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
  width: number;
  kind: OpeningKind;
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