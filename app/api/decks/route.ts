import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getSupabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { normalizeTags } from "@/lib/deckLink";

/** Decks are standalone (palace = course): optional palace link + tags. */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const db = getSupabase();
  let query = db
    .from("decks")
    .select("*")
    .eq("owner", session.user.id)
    .order("created_at", { ascending: false });
  const palaceId = sp.get("palace");
  const tag = sp.get("tag")?.trim().toLowerCase();
  const q = sp.get("q")?.trim();
  const courseId = sp.get("course"); // legacy filter, kept for old callers
  if (palaceId) query = query.eq("palace_id", palaceId);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.ilike("title", `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
  if (courseId) query = query.eq("course_id", courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Per-deck card counts so the list can show size + how many are anchored.
  const ids = (data ?? []).map((d: { id: string }) => d.id);
  const counts = new Map<string, { card_count: number; linked_count: number }>();
  if (ids.length > 0) {
    const { data: cards } = await db.from("flashcards").select("deck_id, source_card_id").in("deck_id", ids);
    for (const c of (cards ?? []) as Array<{ deck_id: string; source_card_id: string | null }>) {
      const cur = counts.get(c.deck_id) ?? { card_count: 0, linked_count: 0 };
      cur.card_count += 1;
      if (c.source_card_id) cur.linked_count += 1;
      counts.set(c.deck_id, cur);
    }
  }
  return NextResponse.json(
    (data ?? []).map((d: { id: string }) => ({ ...d, ...(counts.get(d.id) ?? { card_count: 0, linked_count: 0 }) }))
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const palaceId: string | null = body.palace_id || null;
  if (palaceId) {
    const { data: palace } = await getSupabase().from("palaces").select("id, user_id").eq("id", palaceId).maybeSingle();
    if (!palace) return NextResponse.json({ error: "Palace not found" }, { status: 404 });
    if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await getSupabase()
    .from("decks")
    .insert({ title, palace_id: palaceId, tags: normalizeTags(body.tags), owner: session.user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
