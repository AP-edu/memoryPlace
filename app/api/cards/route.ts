
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { validateOptionsInput } from "@/lib/quiz";
import { serverError } from "@/lib/apiError";

async function locusRoom(locusId: string) {
  const { data: locus, error } = await supabase.from("loci").select("id, room_id").eq("id", locusId).maybeSingle();
  if (error && error.code !== "22P02") throw error;
  if (!locus) return null;
  const { data: room, error: roomError } = await supabase
    .from("rooms")
    .select("id, user_id")
    .eq("id", locus.room_id)
    .maybeSingle();
  if (roomError) throw roomError;
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
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return serverError("api/cards GET", error);
    return NextResponse.json(data);
  }
  if (roomId) {
    const { data: loci, error: lociError } = await supabase.from("loci").select("id").eq("room_id", roomId);
    if (lociError) return serverError("api/cards GET", lociError);
    const ids = (loci ?? []).map((l: { id: string }) => l.id);
    if (ids.length === 0) return NextResponse.json([]);
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .in("locus_id", ids)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) return serverError("api/cards GET", error);
    return NextResponse.json(data);
  }

  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  if (error) return serverError("api/cards GET", error);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { locus_id, front, back, type, options } = await req.json();
  if (!locus_id || !front || !back) {
    return NextResponse.json({ error: "locus_id, front, and back required" }, { status: 400 });
  }
  if (type !== undefined && !["basic", "cloze", "image", "audio"].includes(type)) {
    return NextResponse.json({ error: "Invalid card type" }, { status: 400 });
  }
  const backText = typeof back === "string" ? back : typeof back?.text === "string" ? back.text : "";
  const opt = validateOptionsInput(options, backText);
  if (!opt.ok) return NextResponse.json({ error: opt.error }, { status: 400 });

  const room = await locusRoom(locus_id);
  if (!room) return NextResponse.json({ error: "Locus not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Append to the end of the locus study order (mirrors loci POST).
  const { data: last } = await supabase
    .from("cards")
    .select("position")
    .eq("locus_id", locus_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = typeof last?.position === "number" ? last.position + 1 : 0;

  const { data, error } = await supabase
    .from("cards")
    .insert({
      locus_id,
      user_id: session.user.id,
      type: type ?? "basic",
      front: typeof front === "string" ? { text: front } : front,
      back: typeof back === "string" ? { text: back } : back,
      options: opt.value.length > 0 ? opt.value : null,
      position: nextPosition,
    })
    .select()
    .single();

  if (error) return serverError("api/cards POST", error);
  return NextResponse.json(data, { status: 201 });
}
