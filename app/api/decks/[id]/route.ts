import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(deck);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title } = await req.json();
  if (title === undefined) {
    return NextResponse.json({ error: "Title required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("decks")
    .update({ title })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: deck } = await supabase.from("decks").select("*").eq("id", id).single();
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("decks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}