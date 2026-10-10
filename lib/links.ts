// Server-side helpers for the card <-> flashcard live link.
// Invariant: a link is a PAIR — cards.source_flashcard_id and
// flashcards.source_card_id always point at each other, 1:1 (partial unique
// indexes, migration 20261007000001). Deletes never cascade (FKs are
// ON DELETE SET NULL). Manual push syncs content in one direction on demand.
import { supabase } from "@/lib/supabase";
import { cardToFlashcardContent, flashcardToCardContent } from "@/lib/deckLink";
import type { Card } from "@/types/database";

export type LinkResult = { ok: true } | { ok: false; status: number; error: string };

/** Log the DB error; callers only ever see a generic 500 (no PG message leakage). */
function dbFail(where: string, error: unknown): LinkResult {
  console.error(where, error);
  return { ok: false, status: 500, error: "Request failed" };
}

/** Malformed ids (PG 22P02) mean "no such row"; any other DB error throws (Next answers a bare 500). */
function rowOrThrow<R extends { data: unknown; error: { code?: string } | null }>(r: R): R["data"] {
  if (r.error && r.error.code !== "22P02") throw r.error;
  return r.data;
}

/** Room owner for a card (cards are owned through locus -> room). */
export async function cardRoomOwner(cardId: string): Promise<string | null> {
  const card = rowOrThrow(await supabase.from("cards").select("locus_id").eq("id", cardId).maybeSingle());
  if (!card) return null;
  const locus = rowOrThrow(await supabase.from("loci").select("room_id").eq("id", card.locus_id).maybeSingle());
  if (!locus) return null;
  const room = rowOrThrow(await supabase.from("rooms").select("user_id").eq("id", locus.room_id).maybeSingle());
  return room?.user_id ?? null;
}

export async function linkPair(flashcardId: string, cardId: string): Promise<LinkResult> {
  const { data: f } = await supabase.from("flashcards").select("id, source_card_id").eq("id", flashcardId).maybeSingle();
  const { data: c } = await supabase.from("cards").select("id, source_flashcard_id").eq("id", cardId).maybeSingle();
  if (!f) return { ok: false, status: 404, error: "Flashcard not found" };
  if (!c) return { ok: false, status: 404, error: "Card not found" };
  if (f.source_card_id === cardId && c.source_flashcard_id === flashcardId) return { ok: true };
  if (f.source_card_id && f.source_card_id !== cardId) {
    return { ok: false, status: 409, error: "Flashcard is already linked to another card" };
  }
  if (c.source_flashcard_id && c.source_flashcard_id !== flashcardId) {
    return { ok: false, status: 409, error: "Card is already linked to another flashcard" };
  }

  const first = await supabase.from("flashcards").update({ source_card_id: cardId }).eq("id", flashcardId);
  if (first.error) {
    return first.error.code === "23505"
      ? { ok: false, status: 409, error: "Card is already linked to another flashcard" }
      : dbFail("linkPair", first.error);
  }
  const second = await supabase.from("cards").update({ source_flashcard_id: flashcardId }).eq("id", cardId);
  if (second.error) {
    // Roll the first half back so we never leave a one-sided link.
    await supabase.from("flashcards").update({ source_card_id: null }).eq("id", flashcardId);
    return second.error.code === "23505"
      ? { ok: false, status: 409, error: "Flashcard is already linked to another card" }
      : dbFail("linkPair", second.error);
  }
  return { ok: true };
}

/** Clear both sides of whichever pair the given id belongs to. Idempotent. */
export async function unlinkPair(ids: { flashcardId?: string; cardId?: string }): Promise<LinkResult> {
  let flashcardId = ids.flashcardId ?? null;
  let cardId = ids.cardId ?? null;
  if (flashcardId && !cardId) {
    const { data } = await supabase.from("flashcards").select("source_card_id").eq("id", flashcardId).maybeSingle();
    cardId = data?.source_card_id ?? null;
  } else if (cardId && !flashcardId) {
    const { data } = await supabase.from("cards").select("source_flashcard_id").eq("id", cardId).maybeSingle();
    flashcardId = data?.source_flashcard_id ?? null;
  }
  if (flashcardId) {
    const r = await supabase.from("flashcards").update({ source_card_id: null }).eq("id", flashcardId);
    if (r.error) return dbFail("unlinkPair", r.error);
  }
  if (cardId) {
    const r = await supabase.from("cards").update({ source_flashcard_id: null }).eq("id", cardId);
    if (r.error) return dbFail("unlinkPair", r.error);
  }
  return { ok: true };
}

/** Manual push: copy text one way across an existing link. */
export async function pushContent(
  flashcardId: string,
  cardId: string,
  direction: "to-card" | "to-flashcard"
): Promise<LinkResult> {
  if (direction === "to-card") {
    const { data: f } = await supabase.from("flashcards").select("question, answer").eq("id", flashcardId).maybeSingle();
    if (!f) return { ok: false, status: 404, error: "Flashcard not found" };
    const r = await supabase.from("cards").update(flashcardToCardContent(f)).eq("id", cardId);
    return r.error ? dbFail("pushContent", r.error) : { ok: true };
  }
  const { data: c } = await supabase.from("cards").select("front, back").eq("id", cardId).maybeSingle();
  if (!c) return { ok: false, status: 404, error: "Card not found" };
  const r = await supabase
    .from("flashcards")
    .update(cardToFlashcardContent(c as Pick<Card, "front" | "back">))
    .eq("id", flashcardId);
  return r.error ? dbFail("pushContent", r.error) : { ok: true };
}
