import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { cardToFlashcardContent } from "@/lib/deckLink";
import { tourOrder } from "@/lib/scene3d";
import type { Card } from "@/types/database";

const MAX_EXPORT = 500;

/**
 * Port palace cards into a deck (the reverse of /api/imports).
 *
 * Body: { room_id? | locus_id? | card_ids?: string[], deck_id?, title? }
 * - Source: a whole room (loci in tour order, cards in position order), one
 *   locus, or explicit card ids.
 * - Target: an existing deck (deck_id) or a new deck (title defaults to the
 *   room title; palace_id set from the room).
 * Every created flashcard is live-linked to its card (both FK sides).
 * Already-linked cards are skipped, so retries are idempotent.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, locus_id, card_ids, deck_id, title } = await req.json().catch(() => ({}));
  if (!room_id && !locus_id && !(Array.isArray(card_ids) && card_ids.length)) {
    return NextResponse.json({ error: "room_id, locus_id or card_ids required" }, { status: 400 });
  }

  // Resolve the ordered source cards + the rooms they live in (ownership).
  type LocusRow = { id: string; room_id: string; position: number; created_at: string };
  type CardRow = Card & { source_flashcard_id: string | null };
  let lociRows: LocusRow[] = [];
  let cardRows: CardRow[] = [];

  if (Array.isArray(card_ids) && card_ids.length) {
    const { data } = await supabase.from("cards").select("*").in("id", card_ids);
    cardRows = (data ?? []) as CardRow[];
    const lids = [...new Set(cardRows.map((c) => c.locus_id))];
    const { data: l } = await supabase.from("loci").select("id, room_id, position, created_at").in("id", lids);
    lociRows = (l ?? []) as LocusRow[];
  } else if (locus_id) {
    const { data: l } = await supabase.from("loci").select("id, room_id, position, created_at").eq("id", locus_id);
    lociRows = (l ?? []) as LocusRow[];
    const { data } = await supabase.from("cards").select("*").eq("locus_id", locus_id);
    cardRows = (data ?? []) as CardRow[];
  } else {
    const { data: l } = await supabase.from("loci").select("id, room_id, position, created_at").eq("room_id", room_id);
    lociRows = (l ?? []) as LocusRow[];
    const ids = lociRows.map((x) => x.id);
    if (ids.length) {
      const { data } = await supabase.from("cards").select("*").in("locus_id", ids);
      cardRows = (data ?? []) as CardRow[];
    }
  }
  if (lociRows.length === 0 || cardRows.length === 0) {
    return NextResponse.json({ error: "No cards to export" }, { status: 400 });
  }

  const roomIds = [...new Set(lociRows.map((l) => l.room_id))];
  const { data: rooms } = await supabase.from("rooms").select("id, user_id, title, palace_id").in("id", roomIds);
  for (const r of rooms ?? []) {
    if (!canModify(session, r.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const primaryRoom = (rooms ?? [])[0];

  // Spatial order: loci by tour order, then cards by position within a locus.
  const locusRank = new Map(tourOrder(lociRows as never[]).map((l: { id: string }, i: number) => [l.id, i]));
  cardRows.sort(
    (a, b) =>
      (locusRank.get(a.locus_id) ?? 0) - (locusRank.get(b.locus_id) ?? 0) ||
      (a.position ?? 0) - (b.position ?? 0) ||
      a.created_at.localeCompare(b.created_at) ||
      a.id.localeCompare(b.id)
  );
  const fresh = cardRows.filter((c) => !c.source_flashcard_id);
  const skipped = cardRows.length - fresh.length;
  if (fresh.length === 0) return NextResponse.json({ deck_id: deck_id ?? null, flashcards: [], skipped });
  if (fresh.length > MAX_EXPORT) {
    return NextResponse.json({ error: `Export up to ${MAX_EXPORT} cards at a time` }, { status: 400 });
  }

  // Target deck: existing (owner-checked) or brand new.
  let targetDeckId: string = deck_id;
  let createdDeck = false;
  if (targetDeckId) {
    const { data: deck } = await supabase.from("decks").select("id, owner").eq("id", targetDeckId).maybeSingle();
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else {
    const deckTitle = (typeof title === "string" && title.trim()) || primaryRoom?.title || "Palace deck";
    const { data: created, error } = await supabase
      .from("decks")
      .insert({ title: deckTitle, palace_id: primaryRoom?.palace_id ?? null, tags: [], owner: session.user.id })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: error?.message ?? "Could not create deck" }, { status: 500 });
    targetDeckId = created.id;
    createdDeck = true;
  }

  const createdIds: string[] = [];
  try {
    // Explicit, strictly increasing created_at preserves the spatial order
    // (deck order is created_at ascending).
    const { data: last } = await supabase
      .from("flashcards")
      .select("created_at")
      .eq("deck_id", targetDeckId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base = Math.max(Date.now(), last?.created_at ? new Date(last.created_at).getTime() + 1 : 0);
    const rows = fresh.map((c, i) => ({
      deck_id: targetDeckId,
      owner: session.user.id,
      ...cardToFlashcardContent(c),
      source_card_id: c.id,
      created_at: new Date(base + i).toISOString(),
    }));
    const { data: flashcards, error } = await supabase.from("flashcards").insert(rows).select();
    if (error || !flashcards) throw new Error(error?.message ?? "Could not create flashcards");
    flashcards.forEach((f: { id: string }) => createdIds.push(f.id));

    const sorted = [...flashcards].sort((a: { created_at: string }, b: { created_at: string }) =>
      a.created_at.localeCompare(b.created_at)
    );
    const results = await Promise.all(
      fresh.map((c, i) => supabase.from("cards").update({ source_flashcard_id: sorted[i].id }).eq("id", c.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return NextResponse.json({ deck_id: targetDeckId, flashcards: sorted, skipped }, { status: 201 });
  } catch (err) {
    await supabase.from("cards").update({ source_flashcard_id: null }).in("id", fresh.map((c) => c.id));
    if (createdIds.length) await supabase.from("flashcards").delete().in("id", createdIds);
    if (createdDeck) await supabase.from("decks").delete().eq("id", targetDeckId);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 500 });
  }
}
