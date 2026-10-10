import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { parseAnswers } from "@/lib/sessionSummary";
import { serverError } from "@/lib/apiError";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  const palaceId = req.nextUrl.searchParams.get("palace");
  const deckId = req.nextUrl.searchParams.get("deck");
  let query = supabase.from("study_sessions").select("*").order("created_at", { ascending: false });
  query = query.eq("user_id", session.user.id);
  if (roomId) query = query.eq("room_id", roomId);
  if (palaceId) query = query.eq("palace_id", palaceId);
  if (deckId) query = query.eq("deck_id", deckId);

  const { data, error } = await query;
  if (error) return serverError("api/study-sessions GET", error);

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, palace_id, deck_id, score, total, answers } = await req.json();
  // Scores feed streaks and averages, so they must be sane: whole numbers,
  // a positive total, and no more correct than asked. answers is advisory
  // (the summary tolerates junk via parseAnswers) but can't exceed the total.
  if (
    !Number.isInteger(score) ||
    !Number.isInteger(total) ||
    total <= 0 ||
    score < 0 ||
    score > total
  ) {
    return NextResponse.json({ error: "score/total must be integers with 0 <= score <= total" }, { status: 400 });
  }
  const parsedAnswers = parseAnswers(answers);
  if (parsedAnswers.length > total) {
    return NextResponse.json({ error: "More answers than the session total" }, { status: 400 });
  }
  if ([room_id, palace_id, deck_id].filter(Boolean).length !== 1) {
    return NextResponse.json({ error: "Provide exactly one of room_id, palace_id or deck_id" }, { status: 400 });
  }

  if (deck_id) {
    const { data: deck } = await supabase.from("decks").select("id, owner").eq("id", deck_id).maybeSingle();
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    if (!canModify(session, deck.owner)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else if (room_id) {
    const { data: room } = await supabase
      .from("rooms")
      .select("id, user_id, palace_id")
      .eq("id", room_id)
      .maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (!canModify(session, room.user_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const { data: palace } = await supabase
      .from("palaces")
      .select("id, user_id")
      .eq("id", palace_id)
      .maybeSingle();
    if (!palace) return NextResponse.json({ error: "Palace not found" }, { status: 404 });
    if (!canModify(session, palace.user_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      room_id: room_id ?? null,
      palace_id: palace_id ?? null,
      deck_id: deck_id ?? null,
      user_id: session.user.id,
      scope: { room_id: room_id ?? null, palace_id: palace_id ?? null, deck_id: deck_id ?? null },
      // answers feed the post-session summary (per-room mastery, weak cards).
      results: { score, total, answers: parsedAnswers },
    })
    .select()
    .single();

  if (error) return serverError("api/study-sessions POST", error);
  return NextResponse.json(data, { status: 201 });
}
