import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { validateOptionsInput } from "@/lib/quiz";

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

  const { front, back, type, options, position, locus_id } = await req.json();
  if (type !== undefined && !["basic", "cloze", "image", "audio"].includes(type)) {
    return NextResponse.json({ error: "Invalid card type" }, { status: 400 });
  }
  if (position !== undefined && (!Number.isInteger(position) || position < 0)) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (front !== undefined) updates.front = typeof front === "string" ? { text: front } : front;
  if (back !== undefined) updates.back = typeof back === "string" ? { text: back } : back;
  if (type !== undefined) updates.type = type;
  if (position !== undefined) updates.position = position;
  if (options !== undefined) {
    const merged = {
      front: back !== undefined ? back : card.front,
      back: back !== undefined ? back : card.back,
    };
    const backText =
      typeof merged.back === "string"
        ? merged.back
        : typeof merged.back?.text === "string"
          ? merged.back.text
          : "";
    const opt = validateOptionsInput(options, backText);
    if (!opt.ok) return NextResponse.json({ error: opt.error }, { status: 400 });
    updates.options = opt.value.length > 0 ? opt.value : null;
  }
  if (locus_id !== undefined && locus_id !== card.locus_id) {
    // Move between loci (keeps the card id, so SRS history + links survive).
    // The caller must be able to modify the destination room too.
    const { data: target } = await supabase.from("loci").select("id, room_id").eq("id", locus_id).maybeSingle();
    if (!target) return NextResponse.json({ error: "Target locus not found" }, { status: 404 });
    const { data: targetRoom } = await supabase.from("rooms").select("user_id").eq("id", target.room_id).maybeSingle();
    if (!targetRoom || !canModify(session, targetRoom.user_id)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    updates.locus_id = locus_id;
    if (position === undefined) {
      const { data: last } = await supabase
        .from("cards")
        .select("position")
        .eq("locus_id", locus_id)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      updates.position = typeof last?.position === "number" ? last.position + 1 : 0;
    }
  }
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
