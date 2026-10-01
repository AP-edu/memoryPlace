
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { locusPercent, wallPoint } from "@/lib/geometry";
import type { WallFace } from "@/types/database";

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

  const { room_id, label, x, y, z, tags, wall, wall_offset, height, position } = await req.json();
  if (!room_id) return NextResponse.json({ error: "room_id required" }, { status: 400 });

  const { data: room } = await supabase
    .from("rooms")
    .select("id, user_id, width, depth")
    .eq("id", room_id)
    .maybeSingle();
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const walls: WallFace[] = ["north", "south", "east", "west"];
  const validWall = typeof wall === "string" && walls.includes(wall as WallFace);
  const wallOffset =
    typeof wall_offset === "number" && Number.isFinite(wall_offset) ? Math.min(1, Math.max(0, wall_offset)) : null;

  // Derive legacy floorplan percentages (x,y) whenever we know the anchor.
  const size = { width: room.width, depth: room.depth };
  const percent =
    validWall && wallOffset !== null
      ? locusPercent({ wall: wall as WallFace, wall_offset: wallOffset, x: 0, y: 0 }, size)
      : { x: typeof x === "number" ? x : 0, y: typeof y === "number" ? y : 0 };
  const placedAt = validWall && wallOffset !== null ? wallPoint(wall as WallFace, wallOffset, size) : null;

  const { count } = await supabase.from("loci").select("*", { count: "exact", head: true }).eq("room_id", room_id);

  const { data, error } = await supabase
    .from("loci")
    .insert({
      room_id,
      label: label ?? "",
      x: Math.round(percent.x * 100) / 100,
      y: Math.round(percent.y * 100) / 100,
      z: typeof z === "number" ? z : (validWall && wallOffset !== null && placedAt ? Math.round(placedAt.z * 100) / 100 : null),
      tags: Array.isArray(tags) ? tags : [],
      wall: validWall ? (wall as WallFace) : null,
      wall_offset: validWall ? wallOffset : null,
      height: typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 1.5,
      position: typeof position === "number" ? position : (count ?? 0),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
