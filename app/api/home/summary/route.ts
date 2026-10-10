import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { buildHomeSummary } from "@/lib/homeSummary";
import { groundPlan, type Blueprint } from "@/lib/blueprint";
import type { Level, Locus, Opening, Room } from "@/types/database";
import { serverError } from "@/lib/apiError";

// Home-screen summary: due counts, continue target, palace card/room counts,
// streak and average score — one round trip for /home.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const { data: palaces, error: palacesError } = await supabase
    .from("palaces")
    .select("id, title")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (palacesError) return serverError("api/home/summary GET", palacesError);

  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("*")
    .eq("user_id", userId);
  if (roomsError) return serverError("api/home/summary GET", roomsError);
  const roomIds = (rooms ?? []).map((r) => r.id);

  let loci: Locus[] = [];
  let openings: Opening[] = [];
  if (roomIds.length > 0) {
    const [l, o] = await Promise.all([
      supabase.from("loci").select("*").in("room_id", roomIds),
      supabase.from("openings").select("*").in("room_id", roomIds),
    ]);
    if (l.error) return serverError("api/home/summary GET", l.error);
    if (o.error) return serverError("api/home/summary GET", o.error);
    loci = l.data ?? [];
    openings = o.data ?? [];
  }
  let levels: Level[] = [];
  const palaceIds = (palaces ?? []).map((p) => p.id);
  if (palaceIds.length > 0) {
    const { data, error } = await supabase.from("levels").select("*").in("palace_id", palaceIds);
    if (error) return serverError("api/home/summary GET", error);
    levels = data ?? [];
  }
  const locusIds = loci.map((l) => l.id);

  let cards: { id: string; locus_id: string }[] = [];
  if (locusIds.length > 0) {
    const { data, error } = await supabase.from("cards").select("id, locus_id").in("locus_id", locusIds);
    if (error) return serverError("api/home/summary GET", error);
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
    if (error) return serverError("api/home/summary GET", error);
    reviews = data ?? [];
  }

  // Deck world: counts + how many flashcards still lack a palace anchor.
  const { data: decks, error: decksError } = await supabase.from("decks").select("id").eq("owner", userId);
  if (decksError) return serverError("api/home/summary GET", decksError);
  let flashcards: { deck_id: string; source_card_id: string | null }[] = [];
  const deckIds = (decks ?? []).map((d) => d.id);
  if (deckIds.length > 0) {
    const { data, error } = await supabase.from("flashcards").select("deck_id, source_card_id").in("deck_id", deckIds);
    if (error) return serverError("api/home/summary GET", error);
    flashcards = data ?? [];
  }

  const { data: sessions, error: sessionsError } = await supabase
    .from("study_sessions")
    .select("created_at, results")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (sessionsError) return serverError("api/home/summary GET", sessionsError);

  // Onboarding state: persisted on the user row; the deep-link room is the one
  // with the most loci so the tour lands somewhere that already has content.
  const { data: me } = await supabase
    .from("users")
    .select("onboarded_at, onboarding_step")
    .eq("id", userId)
    .maybeSingle();
  const lociPerRoom = new Map<string, number>();
  for (const l of loci) lociPerRoom.set(l.room_id, (lociPerRoom.get(l.room_id) ?? 0) + 1);
  const firstRoomId =
    [...(rooms ?? [])].sort((a, b) => (lociPerRoom.get(b.id) ?? 0) - (lociPerRoom.get(a.id) ?? 0))[0]?.id ?? null;

  const summary = buildHomeSummary({
      palaces: palaces ?? [],
      rooms: rooms ?? [],
      loci,
      cards,
      reviews,
      sessions: sessions ?? [],
      now: Date.now(),
      // Client passes Date#getTimezoneOffset() so streak days are local days.
      tzOffsetMin: Number.isFinite(Number(req.nextUrl.searchParams.get("tz"))) ? Number(req.nextUrl.searchParams.get("tz")) : 0,
      deckCount: deckIds.length,
      flashcards,
    });
  // Ground-floor plan per palace for the card thumbnails.
  const plans: Record<string, Blueprint> = {};
  for (const p of palaces ?? []) {
    const pr = ((rooms ?? []) as Room[]).filter((r) => r.palace_id === p.id);
    const ids = new Set(pr.map((r) => r.id));
    const plan = groundPlan(
      pr,
      loci.filter((l) => ids.has(l.room_id)),
      openings.filter((o) => ids.has(o.room_id)),
      levels.filter((l) => l.palace_id === p.id)
    );
    if (plan) plans[p.id] = plan;
  }
  return NextResponse.json({
    ...summary,
    plans,
    onboarding: {
      onboardedAt: me?.onboarded_at ?? null,
      step: me?.onboarding_step ?? null,
      firstRoomId,
      hasSession: (sessions ?? []).length > 0,
    },
  });
}
