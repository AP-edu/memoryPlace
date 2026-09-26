
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

async function locusRoom(locusId: string) {
  const { data: locus } = await supabase.from("loci").select("id, room_id").eq("id", locusId).single();
  if (!locus) return null;
  const { data: room } = await supabase.from("rooms").select("id, user_id").eq("id", locus.room_id).single();
  return room;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locusId = req.nextUrl.searchParams.get("locus");
  const roomId = req.nextUrl.searchParams.get("room");
  // Any authenticated user with a locus/room id can read its cards (study needs this).
  if (locusId) {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("locus_id", locusId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }
  if (roomId) {
    const { data: loci, error: lociError } = await supabase.from("loci").select("id").eq("room_id", roomId);
    if (lociError) return NextResponse.json({ error: lociError.message }, { status: 500 });
    const ids = (loci ?? []).map((l) => l.id);
    if (ids.length === 0) return NextResponse.json([]);
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .in("locus_id", ids)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { locus_id, front, back, type } = await req.json();
  if (!locus_id || !front || !back) {
    return NextResponse.json({ error: "locus_id, front, and back required" }, { status: 400 });
  }
  if (type !== undefined && !["basic", "cloze", "image", "audio"].includes(type)) {
    return NextResponse.json({ error: "Invalid card type" }, { status: 400 });
  }

  const room = await locusRoom(locus_id);
  if (!room) return NextResponse.json({ error: "Locus not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("cards")
    .insert({
      locus_id,
      user_id: session.user.id,
      type: type ?? "basic",
      front: typeof front === "string" ? { text: front } : front,
      back: typeof back === "string" ? { text: back } : back,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
