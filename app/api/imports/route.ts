import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { flashcardToCardContent, locusLabelFrom, planLocusAnchors } from "@/lib/deckLink";
import { locusPercent, wallPoint } from "@/lib/geometry";

const MAX_IMPORT = 200;

/**
 * Port flashcards from a deck into a palace room. One endpoint covers whole
 * deck and single card (flashcard_ids narrows the set).
 *
 * Body: { deck_id, room_id, strategy?: "new-loci" | "one-locus",
 *         locus_id?, flashcard_ids?: string[] }
 * - new-loci (default): one new locus per flashcard, spread across the walls,
 *   deck order preserved into loci.position.
 * - one-locus: all cards appended to an existing locus in the room.
 * Every created card is live-linked to its flashcard (both FK sides).
 * Already-linked flashcards are skipped, so retries are idempotent.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { deck_id, room_id, strategy, locus_id, flashcard_ids } = await req.json().catch(() => ({}));
  if (!deck_id || !room_id) return NextResponse.json({ error: "deck_id and room_id required" }, { status: 400 });
  const oneLocus = strategy === "one-locus";

  const { data: room } = await supabase.from("rooms").select("id, user_id, width, depth").eq("id", room_id).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (!canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: deck } = await supabase.from("decks").select("id, owner").eq("id", deck_id).maybeSingle();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let fq = supabase
    .from("flashcards")
    .select("id, question, answer, source_card_id")
    .eq("deck_id", deck_id)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (Array.isArray(flashcard_ids) && flashcard_ids.length > 0) fq = fq.in("id", flashcard_ids);
  const { data: all, error: fError } = await fq;
  if (fError) return NextResponse.json({ error: fError.message }, { status: 500 });
  if (!all || all.length === 0) return NextResponse.json({ error: "Nothing to import" }, { status: 400 });

  const fresh = all.filter((f: { source_card_id: string | null }) => !f.source_card_id);
  const skipped = all.length - fresh.length;
  if (fresh.length === 0) return NextResponse.json({ loci: [], cards: [], skipped, room_id });
  if (fresh.length > MAX_IMPORT) {
    return NextResponse.json({ error: `Import up to ${MAX_IMPORT} cards at a time` }, { status: 400 });
  }

  const createdLociIds: string[] = [];
  const createdCardIds: string[] = [];
  const rollback = async () => {
    if (createdCardIds.length) await supabase.from("cards").delete().in("id", createdCardIds);
    if (createdLociIds.length) await supabase.from("loci").delete().in("id", createdLociIds);
  };

  try {
    let locusForCard: string[] = [];
    let loci: unknown[] = [];
    let positionBase = 0;

    if (oneLocus) {
      if (!locus_id) return NextResponse.json({ error: "locus_id required for one-locus" }, { status: 400 });
      const { data: target } = await supabase.from("loci").select("id, room_id").eq("id", locus_id).maybeSingle();
      if (!target || target.room_id !== room_id) {
        return NextResponse.json({ error: "Locus not found in this room" }, { status: 404 });
      }
      const { data: last } = await supabase
        .from("cards")
        .select("position")
        .eq("locus_id", locus_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      positionBase = typeof last?.position === "number" ? last.position + 1 : 0;
      locusForCard = fresh.map(() => locus_id);
    } else {
      const { data: lastLocus } = await supabase
        .from("loci")
        .select("position")
        .eq("room_id", room_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const base = typeof lastLocus?.position === "number" ? lastLocus.position + 1 : 0;
      const { count: existing } = await supabase.from("loci").select("id", { count: "exact", head: true }).eq("room_id", room_id);
      const size = { width: room.width, depth: room.depth };
      const anchors = planLocusAnchors(fresh.length, existing ?? 0);
      const rows = fresh.map((f: { question: string }, i: number) => {
        const { wall, wall_offset } = anchors[i];
        const percent = locusPercent({ wall, wall_offset, x: 0, y: 0 }, size);
        const at = wallPoint(wall, wall_offset, size);
        return {
          room_id,
          label: locusLabelFrom(f.question),
          x: Math.round(percent.x * 100) / 100,
          y: Math.round(percent.y * 100) / 100,
          z: Math.round(at.z * 100) / 100,
          tags: [],
          wall,
          wall_offset,
          height: 1.5,
          position: base + i,
        };
      });
      const { data: created, error } = await supabase.from("loci").insert(rows).select();
      if (error || !created) throw new Error(error?.message ?? "Could not create loci");
      // Insert order is preserved; sort by position to be explicit.
      const ordered = [...created].sort((a: { position: number }, b: { position: number }) => a.position - b.position);
      ordered.forEach((l: { id: string }) => createdLociIds.push(l.id));
      loci = ordered;
      locusForCard = ordered.map((l: { id: string }) => l.id);
    }

    const cardRows = fresh.map((f: { id: string; question: string; answer: string }, i: number) => ({
      locus_id: locusForCard[i],
      user_id: session.user.id,
      type: "basic",
      ...flashcardToCardContent(f),
      options: null,
      position: oneLocus ? positionBase + i : 0,
      source_flashcard_id: f.id,
    }));
    const { data: cards, error: cardError } = await supabase.from("cards").insert(cardRows).select();
    if (cardError || !cards) throw new Error(cardError?.message ?? "Could not create cards");
    cards.forEach((c: { id: string }) => createdCardIds.push(c.id));

    // Second half of each link pair. cards[i] corresponds to fresh[i].
    const results = await Promise.all(
      fresh.map((f: { id: string }, i: number) =>
        supabase.from("flashcards").update({ source_card_id: cards[i].id }).eq("id", f.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);

    return NextResponse.json({ loci, cards, skipped, room_id }, { status: 201 });
  } catch (err) {
    // Clear any half-links before removing the cards (SET NULL would anyway).
    await supabase.from("flashcards").update({ source_card_id: null }).in("id", fresh.map((f: { id: string }) => f.id));
    await rollback();
    return NextResponse.json({ error: err instanceof Error ? err.message : "Import failed" }, { status: 500 });
  }
}
