
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  let query = supabase.from("loci").select("*").order("position", { ascending: true });
  if (roomId) {
    // Any authenticated user with a room id can read its loci (walkthrough needs this).
    query = query.eq("room_id", roomId);
  } else {
    // Bare list stays owner-scoped via parent rooms.
    const { data: rooms } = await supabase.from("rooms").select("id").eq("user_id", session.user.id);
    const ids = (rooms ?? []).map((r) => r.id);
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

  const { room_id, label, x, y, z, tags } = await req.json();
  if (!room_id) return NextResponse.json({ error: "room_id required" }, { status: 400 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, user_id")
    .eq("id", room_id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { count } = await supabase.from("loci").select("*", { count: "exact", head: true }).eq("room_id", room_id);

  const { data, error } = await supabase
    .from("loci")
    .insert({
      room_id,
      label: label ?? "",
      x: typeof x === "number" ? x : 0,
      y: typeof y === "number" ? y : 0,
      z: typeof z === "number" ? z : null,
      tags: Array.isArray(tags) ? tags : [],
      position: count ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
