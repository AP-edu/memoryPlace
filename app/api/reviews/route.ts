import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { gradeReview, isDue, type ReviewSnapshot } from "@/lib/srs";
import type { ReviewItem } from "@/lib/reviewTypes";
import type { Card, CardReview, Locus, Room } from "@/types/database";
import { serverError } from "@/lib/apiError";

async function requireOwner(
  kind: "room" | "palace",
  id: string,
  session: Session
): Promise<
  | { ok: true; value: { id: string; user_id: string; title: string } }
  | { ok: false; response: NextResponse }
> {
  const table = kind === "room" ? "rooms" : "palaces";
  const { data } = await supabase
    .from(table)
    .select("id, user_id, title")
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, response: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (!canModify(session, data.user_id)) {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, value: data };
}

function toSnapshot(row: CardReview): ReviewSnapshot {
  return {
    ease: row.ease,
    intervalDays: row.interval_days,
    dueAt: Date.parse(row.due_at),
    lastGrade: row.last_grade,
    reviewsCount: row.reviews_count,
  };
}

/**
 * Deck quiz queue. Flashcards live-linked to a palace card share that card's
 * card_reviews row (so deck practice moves due/streak/mastery everywhere);
 * unlinked flashcards have no SRS state and always show as due.
 */
async function deckQueue(deckId: string, session: Session) {
  const { data: deck } = await supabase.from("decks").select("id, title, owner").eq("id", deckId).maybeSingle();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: flashcards, error } = await supabase
    .from("flashcards")
    .select("*")
    .eq("deck_id", deckId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return serverError("api/reviews", error);
  const cards = (flashcards ?? []) as Array<{
    id: string; question: string; answer: string; owner: string; source_card_id: string | null; created_at: string;
  }>;

  const linkedIds = cards.map((f) => f.source_card_id).filter((x): x is string => !!x);
  const reviewByCard = new Map<string, CardReview>();
  const cardById = new Map<string, Card>();
  const locusById = new Map<string, Locus>();
  const roomById = new Map<string, Room>();
  if (linkedIds.length > 0) {
    const [{ data: reviews }, { data: linkedCards }] = await Promise.all([
      supabase.from("card_reviews").select("*").eq("user_id", session.user.id).in("card_id", linkedIds),
      supabase.from("cards").select("*").in("id", linkedIds),
    ]);
    for (const r of (reviews ?? []) as CardReview[]) reviewByCard.set(r.card_id, r);
    for (const c of (linkedCards ?? []) as Card[]) cardById.set(c.id, c);
    const locusIds = [...new Set([...cardById.values()].map((c) => c.locus_id))];
    if (locusIds.length > 0) {
      const { data: loci } = await supabase.from("loci").select("*").in("id", locusIds);
      for (const l of (loci ?? []) as Locus[]) locusById.set(l.id, l);
      const roomIds = [...new Set([...locusById.values()].map((l) => l.room_id))];
      if (roomIds.length > 0) {
        const { data: rooms } = await supabase.from("rooms").select("*").in("id", roomIds);
        for (const r of (rooms ?? []) as Room[]) roomById.set(r.id, r);
      }
    }
  }

  const now = Date.now();
  const items: ReviewItem[] = cards.map((f, i) => {
    const linkedCard = f.source_card_id ? cardById.get(f.source_card_id) : undefined;
    const locus = linkedCard ? locusById.get(linkedCard.locus_id) : undefined;
    const room = locus ? roomById.get(locus.room_id) : undefined;
    const review = f.source_card_id ? (reviewByCard.get(f.source_card_id) ?? null) : null;
    return {
      id: f.id,
      flashcardId: f.id,
      linked: !!linkedCard,
      // Synthetic card so the shared study UI renders deck + palace the same way.
      card: {
        id: linkedCard?.id ?? f.id,
        locus_id: linkedCard?.locus_id ?? "",
        user_id: f.owner,
        type: "basic",
        front: { text: f.question },
        back: { text: f.answer },
        media_refs: [],
        created_at: f.created_at,
      },
      locusId: linkedCard?.locus_id ?? "",
      locusLabel: locus?.label ?? "",
      roomId: locus?.room_id ?? "",
      roomTitle: room?.title ?? "",
      roomOrder: 0,
      position: i,
      review,
      dueAt: review ? Date.parse(review.due_at) : null,
    };
  });

  return NextResponse.json({
    scope: "deck",
    title: deck.title,
    deckId,
    now,
    due: items.filter((i) => isDue(i, now)).length,
    total: items.length,
    items,
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  const palaceId = req.nextUrl.searchParams.get("palace");
  const deckId = req.nextUrl.searchParams.get("deck");
  if (deckId) return deckQueue(deckId, session);
  if (!roomId && !palaceId) {
    return NextResponse.json({ error: "Provide room, palace or deck" }, { status: 400 });
  }

  const scope = palaceId ? "palace" : "room";
  const id = palaceId ?? roomId;
  const owned = await requireOwner(scope, id!, session);
  if (!owned.ok) return owned.response;

  // Rooms in canonical palace traversal order (creation order).
  let rooms: Room[];
  if (scope === "palace") {
    const { data, error } = await supabase
      .from("rooms")
      .select("*")
      .eq("palace_id", id)
      .order("created_at", { ascending: true });
    if (error) return serverError("api/reviews GET", error);
    rooms = data ?? [];
  } else {
    const { data, error } = await supabase.from("rooms").select("*").eq("id", id).single();
    if (error) return serverError("api/reviews GET", error);
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    rooms = [data];
  }

  const roomOrder = new Map(rooms.map((r, i) => [r.id, i]));
  const roomIds = rooms.map((r) => r.id);
  const roomById = new Map(rooms.map((r) => [r.id, r]));

  const { data: loci, error: lociError } = await supabase
    .from("loci")
    .select("*")
    .in("room_id", roomIds)
    .order("position", { ascending: true });
  if (lociError) return serverError("api/reviews GET", lociError);

  const lociList: Locus[] = loci ?? [];
  const locusIds = lociList.map((l) => l.id);
  const locusById = new Map(lociList.map((l) => [l.id, l]));

  let cards: Card[] = [];
  if (locusIds.length > 0) {
    const { data, error } = await supabase.from("cards").select("*").in("locus_id", locusIds);
    if (error) return serverError("api/reviews GET", error);
    cards = data ?? [];
  }

  let reviews: CardReview[] = [];
  if (cards.length > 0) {
    const { data, error } = await supabase
      .from("card_reviews")
      .select("*")
      .eq("user_id", session.user.id)
      .in("card_id", cards.map((c) => c.id));
    if (error) return serverError("api/reviews GET", error);
    reviews = data ?? [];
  }
  const reviewByCard = new Map(reviews.map((r) => [r.card_id, r]));

  const now = Date.now();
  const items: ReviewItem[] = cards.map((card) => {
    const locus = locusById.get(card.locus_id);
    const room = locus ? roomById.get(locus.room_id) : undefined;
    const review = reviewByCard.get(card.id) ?? null;
    return {
      id: card.id,
      card,
      locusId: card.locus_id,
      locusLabel: locus?.label ?? "",
      roomId: locus?.room_id ?? "",
      roomTitle: room?.title ?? "",
      roomOrder: locus ? (roomOrder.get(locus.room_id) ?? 0) : 0,
      position: locus?.position ?? 0,
      review,
      dueAt: review ? Date.parse(review.due_at) : null,
    };
  });

  return NextResponse.json({
    scope,
    title: owned.value.title,
    now,
    due: items.filter((i) => isDue(i, now)).length,
    total: items.length,
    items,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { correct } = body;
  let card_id: unknown = body.card_id;
  if (typeof correct !== "boolean") {
    return NextResponse.json({ error: "correct is required" }, { status: 400 });
  }

  // Deck quiz grade: resolve the flashcard to its linked palace card. An
  // unlinked flashcard is gradable but unscheduled — nothing to persist.
  if (typeof body.flashcard_id === "string") {
    const { data: f } = await supabase
      .from("flashcards")
      .select("id, owner, source_card_id")
      .eq("id", body.flashcard_id)
      .maybeSingle();
    if (!f) return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });
    if (!canModify(session, f.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!f.source_card_id) return NextResponse.json({ scheduled: false });
    card_id = f.source_card_id;
  }
  if (typeof card_id !== "string") {
    return NextResponse.json({ error: "card_id or flashcard_id is required" }, { status: 400 });
  }

  const { data: card } = await supabase
    .from("cards")
    .select("id, locus_id")
    .eq("id", card_id)
    .maybeSingle();
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  const { data: locus } = await supabase.from("loci").select("id, room_id").eq("id", card.locus_id).maybeSingle();
  if (!locus) return NextResponse.json({ error: "Locus not found" }, { status: 404 });
  const { data: room } = await supabase.from("rooms").select("id, user_id").eq("id", locus.room_id).maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (!canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: existing } = await supabase
    .from("card_reviews")
    .select("*")
    .eq("card_id", card_id)
    .maybeSingle();

  const next = gradeReview(existing ? toSnapshot(existing) : null, correct);
  const nowIso = new Date().toISOString();
  const { data: saved, error } = await supabase
    .from("card_reviews")
    .upsert(
      {
        card_id,
        user_id: session.user.id,
        ease: next.ease,
        interval_days: next.intervalDays,
        due_at: new Date(next.dueAt).toISOString(),
        last_grade: next.lastGrade,
        reviews_count: next.reviewsCount,
        updated_at: nowIso,
      },
      { onConflict: "card_id" }
    )
    .select()
    .single();

  if (error) return serverError("api/reviews POST", error);
  return NextResponse.json(saved);
}
/**
 * Reschedule a card (session summary "snooze"): sets when it is next due.
 * Body: { card_id | flashcard_id, days } with days an integer 0..90
 * (0 = due now). Works on the card's single card_reviews row, so a linked
 * flashcard and its palace card reschedule together.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const days = body.days;
  if (!Number.isInteger(days) || days < 0 || days > 90) {
    return NextResponse.json({ error: "days must be an integer 0..90" }, { status: 400 });
  }

  let cardId: string | null = typeof body.card_id === "string" ? body.card_id : null;
  if (!cardId && typeof body.flashcard_id === "string") {
    const { data: f } = await supabase.from("flashcards").select("owner, source_card_id").eq("id", body.flashcard_id).maybeSingle();
    if (!f) return NextResponse.json({ error: "Flashcard not found" }, { status: 404 });
    if (!canModify(session, f.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!f.source_card_id) return NextResponse.json({ scheduled: false });
    cardId = f.source_card_id;
  }
  if (!cardId) return NextResponse.json({ error: "card_id or flashcard_id required" }, { status: 400 });

  const { data: card } = await supabase.from("cards").select("id, locus_id").eq("id", cardId).maybeSingle();
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
  const { data: locus } = await supabase.from("loci").select("room_id").eq("id", card.locus_id).maybeSingle();
  const { data: room } = locus
    ? await supabase.from("rooms").select("user_id").eq("id", locus.room_id).maybeSingle()
    : { data: null };
  if (!room || !canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dueAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data: existing } = await supabase.from("card_reviews").select("*").eq("card_id", cardId).maybeSingle();
  const row = existing
    ? { ...existing, due_at: dueAt, updated_at: new Date().toISOString() }
    : {
        card_id: cardId,
        user_id: session.user.id,
        ease: 2.5,
        interval_days: days,
        due_at: dueAt,
        last_grade: null,
        reviews_count: 0,
      };
  const { data: saved, error } = await supabase
    .from("card_reviews")
    .upsert(row, { onConflict: "card_id" })
    .select()
    .single();
  if (error) return serverError("api/reviews PUT", error);
  return NextResponse.json(saved);
}
