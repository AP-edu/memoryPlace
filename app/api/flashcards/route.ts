
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = req.nextUrl.searchParams.get("deck");
  let query = getSupabase().from("flashcards").select("*").order("created_at", { ascending: false });
  if (deckId) {
    query = query.eq("deck_id", deckId);
  } else {
    query = query.eq("owner", session.user.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { question, answer, deck_id } = await req.json();
  if (!question || !answer || !deck_id) {
    return NextResponse.json({ error: "Question, answer, and deck_id required" }, { status: 400 });
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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}