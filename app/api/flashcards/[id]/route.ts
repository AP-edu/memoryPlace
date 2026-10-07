import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await getSupabase().from("flashcards").select("*").eq("id", id).maybeSingle();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(card);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await getSupabase().from("flashcards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Partial updates allowed; link changes go through /api/links.
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, string> = {};
  if (body.question !== undefined) updates.question = String(body.question);
  if (body.answer !== undefined) updates.answer = String(body.answer);
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Question or answer required" }, { status: 400 });
  }
  if ("question" in updates && !updates.question.trim()) {
    return NextResponse.json({ error: "Question cannot be empty" }, { status: 400 });
  }
  if ("answer" in updates && !updates.answer.trim()) {
    return NextResponse.json({ error: "Answer cannot be empty" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("flashcards")
    .update(updates)
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

  const { data: card } = await getSupabase().from("flashcards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await getSupabase().from("flashcards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}