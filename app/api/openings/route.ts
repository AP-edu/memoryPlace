import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  let query = supabase.from("openings").select("*").order("created_at", { ascending: true });
  if (roomId) {
    query = query.eq("room_id", roomId);
  } else {
    const { data: rooms } = await supabase.from("rooms").select("id").eq("user_id", session.user.id);
    const ids = (rooms ?? []).map((r: { id: string }) => r.id);
    if (ids.length === 0) return NextResponse.json([]);
    query = query.in("room_id", ids);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { room_id, wall, wall_offset, width, kind } = await req.json();
  if (!room_id || !wall) return NextResponse.json({ error: "room_id and wall required" }, { status: 400 });
  if (!["north", "south", "east", "west"].includes(wall)) {
    return NextResponse.json({ error: "Invalid wall" }, { status: 400 });
  }
  if (kind !== undefined && !["door", "archway"].includes(kind)) {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("id, user_id")
    .eq("id", room_id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("openings")
    .insert({
      room_id,
      wall,
      wall_offset: typeof wall_offset === "number" ? wall_offset : 0.5,
      width: typeof width === "number" ? width : 0.2,
      kind: kind ?? "door",
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
