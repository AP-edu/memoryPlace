import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { buildHomeSummary } from "@/lib/homeSummary";

// Home-screen summary: due counts, continue target, palace card/room counts,
// streak and average score — one round trip for /home.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { data: palaces, error: palacesError } = await supabase
    .from("palaces")
    .select("id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (palacesError) return NextResponse.json({ error: palacesError.message }, { status: 500 });

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id, palace_id")
    .eq("user_id", userId);
  if (roomsError) return NextResponse.json({ error: roomsError.message }, { status: 500 });
  const roomIds = (rooms ?? []).map((r) => r.id);

  let loci: { id: string; room_id: string }[] = [];
  if (roomIds.length > 0) {
    const { data, error } = await supabase.from("loci").select("id, room_id").in("room_id", roomIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    loci = data ?? [];
  }
  const locusIds = loci.map((l) => l.id);

  let cards: { id: string; locus_id: string }[] = [];
  if (locusIds.length > 0) {
    const { data, error } = await supabase.from("cards").select("id, locus_id").in("locus_id", locusIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    cards = data ?? [];
  }
  const cardIds = cards.map((c) => c.id);

  let reviews: { card_id: string; due_at: string }[] = [];
  if (cardIds.length > 0) {
    const { data, error } = await supabase
      .from("card_reviews")
      .select("card_id, due_at")
      .eq("user_id", userId)
      .in("card_id", cardIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    reviews = data ?? [];
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("study_sessions")
    .select("created_at, results")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sessionsError) return NextResponse.json({ error: sessionsError.message }, { status: 500 });

  return NextResponse.json(
    buildHomeSummary({
      palaces: palaces ?? [],
      rooms: rooms ?? [],
      loci,
      cards,
      reviews,
      sessions: sessions ?? [],
      now: Date.now(),
    })
  );
}
