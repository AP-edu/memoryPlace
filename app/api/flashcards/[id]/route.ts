import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { lookupFailed, serverError } from "@/lib/apiError";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card, error } = await getSupabase().from("flashcards").select("*").eq("id", id).maybeSingle();
  if (error) return lookupFailed("api/flashcards/[id] GET", error);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(card);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card, error: lookupError } = await getSupabase().from("flashcards").select("*").eq("id", id).maybeSingle();
  if (lookupError) return lookupFailed("api/flashcards/[id] PUT", lookupError);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Partial updates allowed; link changes go through /api/links.
  const body = await req.json().catch(() => ({}));
  const updates: Record<string, string> = {};
  for (const [field, label] of [["question", "Question"], ["answer", "Answer"]] as const) {
    const v = body[field];
    if (v === undefined) continue;
    if (typeof v !== "string") return NextResponse.json({ error: `${label} must be text` }, { status: 400 });
    if (!v.trim()) return NextResponse.json({ error: `${label} cannot be empty` }, { status: 400 });
    updates[field] = v;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Question or answer required" }, { status: 400 });
  }

  const { data, error } = await getSupabase()
    .from("flashcards")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) return serverError("api/flashcards/[id] PUT", error);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card, error: lookupError } = await getSupabase().from("flashcards").select("*").eq("id", id).maybeSingle();
  if (lookupError) return lookupFailed("api/flashcards/[id] DELETE", lookupError);
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await getSupabase().from("flashcards").delete().eq("id", id);
  if (error) return serverError("api/flashcards/[id] DELETE", error);

  return NextResponse.json({ message: "Deleted" });
}