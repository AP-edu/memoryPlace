
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { serverError } from "@/lib/apiError";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = req.nextUrl.searchParams.get("deck");
  let query = getSupabase().from("flashcards").select("*").order("created_at", { ascending: false });
  if (deckId) {
    // Decks are private: only the owner (or an admin) reads their flashcards.
    const { data: deck } = await getSupabase().from("decks").select("id, owner").eq("id", deckId).maybeSingle();
    if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    query = query.eq("deck_id", deckId);
  } else {
    query = query.eq("owner", session.user.id);
  }

  const { data, error } = await query;
  if (error) return serverError("api/flashcards GET", error);

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, answer, deck_id } = await req.json().catch(() => ({}));
  if (!deck_id || typeof question !== "string" || typeof answer !== "string" || !question.trim() || !answer.trim()) {
    return NextResponse.json({ error: "Question, answer (non-empty strings), and deck_id required" }, { status: 400 });
  }

  const { data: deck } = await getSupabase()
    .from("decks")
    .select("id, owner")
    .eq("id", deck_id)
    .maybeSingle();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  if (session.user.role !== "admin" && deck.owner !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getSupabase()
    .from("flashcards")
    .insert({ question, answer, deck_id, owner: session.user.id })
    .select()
    .single();

  if (error) return serverError("api/flashcards POST", error);
  return NextResponse.json(data, { status: 201 });
}