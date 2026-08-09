
import { NextRequest, NextResponse } from "next/server";
import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { Deck } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

function canModify(session: Session | null, deck: Deck): boolean {
  if (!session) return false;
  return session.user.role === "admin" || deck.owner === session.user.id;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(deck);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates = await req.json();
  const { data, error } = await supabase.from("decks").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("decks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}