import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  let query = supabase.from("study_sessions").select("*").order("created_at", { ascending: false });
  query = query.eq("user_id", session.user.id);
  if (roomId) query = query.eq("room_id", roomId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, palace_id, score, total } = await req.json();
  if (typeof score !== "number" || typeof total !== "number") {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }
  if ((room_id && palace_id) || (!room_id && !palace_id)) {
    return NextResponse.json({ error: "Provide exactly one of room_id or palace_id" }, { status: 400 });
  }

  if (room_id) {
    const { data: room } = await supabase
      .from("rooms")
      .select("id, user_id, palace_id")
      .eq("id", room_id)
      .maybeSingle();
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (room.user_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const { data: palace } = await supabase
      .from("palaces")
      .select("id, user_id")
      .eq("id", palace_id)
      .maybeSingle();
    if (!palace) return NextResponse.json({ error: "Palace not found" }, { status: 404 });
    if (palace.user_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from("study_sessions")
    .insert({
      room_id: room_id ?? null,
      palace_id: palace_id ?? null,
      user_id: session.user.id,
      scope: { room_id: room_id ?? null, palace_id: palace_id ?? null },
      results: { score, total },
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
