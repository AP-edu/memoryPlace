import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

async function cardOwner(cardId: string): Promise<string | null> {
  const { data: card } = await supabase.from("cards").select("locus_id").eq("id", cardId).single();
  if (!card) return null;
  const { data: locus } = await supabase.from("loci").select("room_id").eq("id", card.locus_id).single();
  if (!locus) return null;
  const { data: room } = await supabase.from("rooms").select("user_id").eq("id", locus.room_id).single();
  return room?.user_id ?? null;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card, error } = await supabase.from("cards").select("*").eq("id", id).single();
  if (error || !card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await cardOwner(id);
  if (!owner || !canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(card);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await supabase.from("cards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await cardOwner(id);
  if (!owner || !canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { front, back, type } = await req.json();
  if (type !== undefined && !["basic", "cloze", "image", "audio"].includes(type)) {
    return NextResponse.json({ error: "Invalid card type" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (front !== undefined) updates.front = typeof front === "string" ? { text: front } : front;
  if (back !== undefined) updates.back = typeof back === "string" ? { text: back } : back;
  if (type !== undefined) updates.type = type;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("cards").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await supabase.from("cards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await cardOwner(id);
  if (!owner || !canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("cards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}
