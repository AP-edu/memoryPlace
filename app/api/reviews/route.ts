import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { gradeReview, isDue, type ReviewSnapshot } from "@/lib/srs";
import type { Card, CardReview, Locus, Room } from "@/types/database";

interface ReviewItem {
  id: string;
  card: Card;
  locusId: string;
  locusLabel: string;
  roomId: string;
  roomTitle: string;
  roomOrder: number;
  position: number;
  review: CardReview | null;
  dueAt: number | null;
}

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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  const palaceId = req.nextUrl.searchParams.get("palace");
  if (!roomId && !palaceId) {
    return NextResponse.json({ error: "Provide either room or palace" }, { status: 400 });
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
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rooms = data ?? [];
  } else {
    const { data, error } = await supabase.from("rooms").select("*").eq("id", id).single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  if (lociError) return NextResponse.json({ error: lociError.message }, { status: 500 });

  const lociList: Locus[] = loci ?? [];
  const locusIds = lociList.map((l) => l.id);
  const locusById = new Map(lociList.map((l) => [l.id, l]));

  let cards: Card[] = [];
  if (locusIds.length > 0) {
    const { data, error } = await supabase.from("cards").select("*").in("locus_id", locusIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    cards = data ?? [];
  }

  let reviews: CardReview[] = [];
  if (cards.length > 0) {
    const { data, error } = await supabase
      .from("card_reviews")
      .select("*")
      .eq("user_id", session.user.id)
      .in("card_id", cards.map((c) => c.id));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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

  const { card_id, correct } = await req.json();
  if (typeof card_id !== "string" || typeof correct !== "boolean") {
    return NextResponse.json({ error: "card_id and correct are required" }, { status: 400 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(saved);
}