import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { normalizeTags } from "@/lib/deckLink";
import { serverError } from "@/lib/apiError";

type RouteContext = { params: Promise<{ id: string }> };

async function loadDeck(id: string) {
  const { data } = await getSupabase().from("decks").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deck = await loadDeck(id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Decks are private study material: owner or admin only (same as PUT/DELETE).
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(deck);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deck = await loadDeck(id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
    updates.title = title;
  }
  if (body.tags !== undefined) updates.tags = normalizeTags(body.tags);
  if (body.palace_id !== undefined) {
    // null unlinks; a value re-links after an ownership check.
    if (body.palace_id === null || body.palace_id === "") {
      updates.palace_id = null;
    } else {
      const { data: palace } = await getSupabase().from("palaces").select("id, user_id").eq("id", body.palace_id).maybeSingle();
      if (!palace) return NextResponse.json({ error: "Palace not found" }, { status: 404 });
      if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      updates.palace_id = palace.id;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await getSupabase().from("decks").update(updates).eq("id", id).select().single();
  if (error) return serverError("api/decks/[id] PUT", error);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const deck = await loadDeck(id);
  if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, deck.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Legacy flashcards.deck_id may or may not cascade (DDL predates migrations):
  // try the plain delete, and only on an FK violation remove the flashcards
  // and retry. Linked palace cards survive either way (source link SET NULL).
  const db = getSupabase();
  let { error } = await db.from("decks").delete().eq("id", id);
  if (error?.code === "23503") {
    const f = await db.from("flashcards").delete().eq("deck_id", id);
    if (f.error) return serverError("api/decks/[id] DELETE", f.error);
    ({ error } = await db.from("decks").delete().eq("id", id));
  }
  if (error) return serverError("api/decks/[id] DELETE", error);

  return NextResponse.json({ message: "Deleted" });
}
