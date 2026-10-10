import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { cardToFlashcardContent } from "@/lib/deckLink";
import { tourOrder } from "@/lib/scene3d";
import type { Card } from "@/types/database";
import { serverError } from "@/lib/apiError";

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
    const { data, error } = await supabase.from("cards").select("*").in("id", card_ids);
    if (error) return serverError("api/exports POST", error);
    cardRows = (data ?? []) as CardRow[];
    if (cardRows.length !== new Set(card_ids).size) {
      return NextResponse.json({ error: "Some cards were not found" }, { status: 404 });
    }
    const lids = [...new Set(cardRows.map((c) => c.locus_id))];
    const { data: l, error: lociError } = await supabase
      .from("loci")
      .select("id, room_id, position, created_at")
      .in("id", lids);
    if (lociError) return serverError("api/exports POST", lociError);
    lociRows = (l ?? []) as LocusRow[];
  } else if (locus_id) {
    const { data: l, error: lociError } = await supabase
      .from("loci")
      .select("id, room_id, position, created_at")
      .eq("id", locus_id);
    if (lociError) return serverError("api/exports POST", lociError);
    lociRows = (l ?? []) as LocusRow[];
    if (lociRows.length === 0) return NextResponse.json({ error: "Locus not found" }, { status: 404 });
    const { data, error } = await supabase.from("cards").select("*").eq("locus_id", locus_id);
    if (error) return serverError("api/exports POST", error);
    cardRows = (data ?? []) as CardRow[];
  } else {
    const { data: l, error: lociError } = await supabase
      .from("loci")
      .select("id, room_id, position, created_at")
      .eq("room_id", room_id);
    if (lociError) return serverError("api/exports POST", lociError);
    lociRows = (l ?? []) as LocusRow[];
    const ids = lociRows.map((x) => x.id);
    if (ids.length) {
      const { data, error } = await supabase.from("cards").select("*").in("locus_id", ids);
      if (error) return serverError("api/exports POST", error);
      cardRows = (data ?? []) as CardRow[];
    }
  }
  if (lociRows.length === 0 || cardRows.length === 0) {
    return NextResponse.json({ error: "No cards to export" }, { status: 400 });
  }

  const roomIds = [...new Set(lociRows.map((l) => l.room_id))];
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, user_id, title, palace_id")
    .in("id", roomIds);
  if (roomsError) return serverError("api/exports POST", roomsError);
  if (!rooms || rooms.length !== roomIds.length) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  for (const r of rooms) {
    if (!canModify(session, r.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const primaryRoom = rooms[0];

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
    if (error || !created) return serverError("api/exports POST", error, "Could not create deck");
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

    // Map each new flashcard back to its card via the link column we just
    // wrote — never by timestamp order, which concurrent exports can interleave.
    const { data: linked, error: linkError } = await supabase
      .from("flashcards")
      .select("id, source_card_id")
      .in(
        "source_card_id",
        fresh.map((c) => c.id)
      );
    if (linkError || !linked || linked.length !== fresh.length) {
      throw new Error(linkError?.message ?? "Could not verify the new links");
    }
    const flashcardByCard = new Map(
      (linked as Array<{ id: string; source_card_id: string }>).map((f) => [f.source_card_id, f.id])
    );
    const results = await Promise.all(
      fresh.map((c) => {
        const fid = flashcardByCard.get(c.id);
        if (!fid) return Promise.resolve({ error: { message: "Link target missing" } });
        return supabase.from("cards").update({ source_flashcard_id: fid }).eq("id", c.id);
      })
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      const err = failed.error as { code?: string; message?: string };
      if (err.code === "23505") throw Object.assign(new Error("One of these cards was linked meanwhile"), { status: 409 });
      throw new Error(err.message ?? "Could not link the new cards");
    }

    const sorted = [...flashcards].sort((a: { created_at: string }, b: { created_at: string }) =>
      a.created_at.localeCompare(b.created_at)
    );
    return NextResponse.json({ deck_id: targetDeckId, flashcards: sorted, skipped }, { status: 201 });
  } catch (err) {
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 500;
    if (status === 500) console.error("api/exports POST", err);
    await supabase.from("cards").update({ source_flashcard_id: null }).in("id", fresh.map((c) => c.id));
    if (createdIds.length) await supabase.from("flashcards").delete().in("id", createdIds);
    if (createdDeck) await supabase.from("decks").delete().eq("id", targetDeckId);
    return NextResponse.json(
      { error: status !== 500 && err instanceof Error ? err.message : "Export failed" },
      { status }
    );
  }
}
