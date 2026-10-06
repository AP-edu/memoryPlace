import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { cardRoomOwner, linkPair, pushContent, unlinkPair } from "@/lib/links";

// Card <-> flashcard live link. Manual only: link, push content one way, unlink.
//   GET    ?card_id= | ?flashcard_id=           -> twin summary (for badges / jump links)
//   POST   { flashcard_id, card_id }            -> link (409 if either side already linked elsewhere)
//   PUT    { flashcard_id, card_id, direction } -> push text "to-card" | "to-flashcard"
//   DELETE ?card_id= | ?flashcard_id=           -> unlink (both sides cleared)

async function authorize(session: Session, flashcardId?: string | null, cardId?: string | null) {
  if (flashcardId) {
    const { data: f } = await supabase.from("flashcards").select("owner").eq("id", flashcardId).maybeSingle();
    if (!f) return { status: 404, error: "Flashcard not found" };
    if (!canModify(session, f.owner)) return { status: 403, error: "Forbidden" };
  }
  if (cardId) {
    const owner = await cardRoomOwner(cardId);
    if (!owner) return { status: 404, error: "Card not found" };
    if (!canModify(session, owner)) return { status: 403, error: "Forbidden" };
  }
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cardId = req.nextUrl.searchParams.get("card_id");
  const flashcardId = req.nextUrl.searchParams.get("flashcard_id");
  if (!cardId && !flashcardId) return NextResponse.json({ error: "card_id or flashcard_id required" }, { status: 400 });
  const denied = await authorize(session, flashcardId, cardId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  if (cardId) {
    const { data: card } = await supabase.from("cards").select("source_flashcard_id").eq("id", cardId).maybeSingle();
    if (!card?.source_flashcard_id) return NextResponse.json({ linked: false });
    const { data: f } = await supabase
      .from("flashcards")
      .select("id, question, deck_id")
      .eq("id", card.source_flashcard_id)
      .maybeSingle();
    if (!f) return NextResponse.json({ linked: false });
    const { data: deck } = await supabase.from("decks").select("id, title").eq("id", f.deck_id).maybeSingle();
    return NextResponse.json({ linked: true, flashcard: { ...f, deck_title: deck?.title ?? "Deck" } });
  }

  const { data: f } = await supabase.from("flashcards").select("source_card_id").eq("id", flashcardId!).maybeSingle();
  if (!f?.source_card_id) return NextResponse.json({ linked: false });
  const { data: card } = await supabase.from("cards").select("id, locus_id").eq("id", f.source_card_id).maybeSingle();
  if (!card) return NextResponse.json({ linked: false });
  const { data: locus } = await supabase.from("loci").select("id, room_id, label").eq("id", card.locus_id).maybeSingle();
  const { data: room } = locus
    ? await supabase.from("rooms").select("id, title, palace_id").eq("id", locus.room_id).maybeSingle()
    : { data: null };
  return NextResponse.json({
    linked: true,
    card: { id: card.id, locus_id: card.locus_id, locus_label: locus?.label ?? "", room_id: room?.id, room_title: room?.title, palace_id: room?.palace_id },
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flashcard_id, card_id } = await req.json().catch(() => ({}));
  if (!flashcard_id || !card_id) return NextResponse.json({ error: "flashcard_id and card_id required" }, { status: 400 });
  const denied = await authorize(session, flashcard_id, card_id);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const r = await linkPair(flashcard_id, card_id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ linked: true }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { flashcard_id, card_id, direction } = await req.json().catch(() => ({}));
  if (!flashcard_id || !card_id || !["to-card", "to-flashcard"].includes(direction)) {
    return NextResponse.json({ error: "flashcard_id, card_id and direction (to-card|to-flashcard) required" }, { status: 400 });
  }
  const denied = await authorize(session, flashcard_id, card_id);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  // Only push across a real, mutual link: both FK sides must agree, so a
  // half-linked row (crashed import, concurrent unlink) can never mistarget.
  const [{ data: f }, { data: c }] = await Promise.all([
    supabase.from("flashcards").select("source_card_id").eq("id", flashcard_id).maybeSingle(),
    supabase.from("cards").select("source_flashcard_id").eq("id", card_id).maybeSingle(),
  ]);
  if (f?.source_card_id !== card_id || c?.source_flashcard_id !== flashcard_id) {
    return NextResponse.json({ error: "These are not linked" }, { status: 409 });
  }

  const r = await pushContent(flashcard_id, card_id, direction);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ pushed: direction });
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const cardId = req.nextUrl.searchParams.get("card_id");
  const flashcardId = req.nextUrl.searchParams.get("flashcard_id");
  if (!cardId && !flashcardId) return NextResponse.json({ error: "card_id or flashcard_id required" }, { status: 400 });

  // Resolve the twin first, then authorize BOTH sides: unlinking clears both
  // FK columns, so the caller must own each side they touch.
  let twinCardId = cardId;
  let twinFlashcardId = flashcardId;
  if (flashcardId && !cardId) {
    const { data } = await supabase.from("flashcards").select("source_card_id").eq("id", flashcardId).maybeSingle();
    twinCardId = data?.source_card_id ?? null;
  } else if (cardId && !flashcardId) {
    const { data } = await supabase.from("cards").select("source_flashcard_id").eq("id", cardId).maybeSingle();
    twinFlashcardId = data?.source_flashcard_id ?? null;
  }
  const denied = await authorize(session, twinFlashcardId, twinCardId);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const r = await unlinkPair({ flashcardId: twinFlashcardId ?? undefined, cardId: twinCardId ?? undefined });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ linked: false });
}
