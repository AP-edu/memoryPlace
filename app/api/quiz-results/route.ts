import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deckId = req.nextUrl.searchParams.get("deck");
  let query = getSupabase().from("quiz_results").select("*").order("created_at", { ascending: false });
  query = query.eq("user_id", session.user.id);
  if (deckId) query = query.eq("deck_id", deckId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { deck_id, score, total } = await req.json();
  if (!deck_id || typeof score !== "number" || typeof total !== "number") {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const { data: deck } = await getSupabase()
    .from("decks")
    .select("id, owner")
    .eq("id", deck_id)
    .maybeSingle();
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  if (deck.owner !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getSupabase()
    .from("quiz_results")
    .insert({ deck_id, user_id: session.user.id, score, total })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}