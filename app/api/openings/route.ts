import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import type { OpeningKind, WallFace } from "@/types/database";
import { openingWidthFields, validTargetRoom } from "@/lib/openingFields";

const WALLS: WallFace[] = ["north", "south", "east", "west"];
const KINDS: OpeningKind[] = ["door", "archway"];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

async function roomOwner(roomId: string) {
  const { data: room } = await supabase
    .from("rooms")
    .select("id, user_id, palace_id, width, depth")
    .eq("id", roomId)
    .maybeSingle();
  return room ?? null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roomId = req.nextUrl.searchParams.get("room");
  const palaceId = req.nextUrl.searchParams.get("palace");
  let query = supabase.from("openings").select("*").order("wall_offset", { ascending: true });
  if (roomId) {
    const room = await roomOwner(roomId);
    if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (session.user.role !== "admin" && room.user_id !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    query = query.eq("room_id", roomId);
  } else if (palaceId) {
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("palace_id", palaceId)
      .eq("user_id", session.user.id);
    const ids = (rooms ?? []).map((r) => r.id);
    if (ids.length === 0) return NextResponse.json([]);
    query = query.in("room_id", ids);
  } else {
    const { data: rooms } = await supabase.from("rooms").select("id").eq("user_id", session.user.id);
    const ids = (rooms ?? []).map((r) => r.id);
    if (ids.length === 0) return NextResponse.json([]);
    query = query.in("room_id", ids);
  }

  const { data, error } = await query;
  if (error) {
    console.error("openings", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { room_id, wall, wall_offset, width, width_m, kind, target_room_id } = body as Record<string, unknown>;
  if (typeof room_id !== "string") return NextResponse.json({ error: "room_id required" }, { status: 400 });
  if (!room_id) return NextResponse.json({ error: "room_id required" }, { status: 400 });
  if (typeof wall !== "string" || !WALLS.includes(wall as WallFace)) {
    return NextResponse.json({ error: "wall must be north, south, east, or west" }, { status: 400 });
  }

  const room = await roomOwner(room_id);
  if (!room) return NextResponse.json({ error: "Room not found" }, { status: 404 });
  if (session.user.role !== "admin" && room.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const resolvedKind: OpeningKind = typeof kind === "string" && KINDS.includes(kind as OpeningKind) ? (kind as OpeningKind) : "door";
  const widths = openingWidthFields(wall as WallFace, room, { width, width_m }, resolvedKind);
  if ("error" in widths) return NextResponse.json({ error: widths.error }, { status: 400 });

  let target: string | null = null;
  if (target_room_id !== undefined && target_room_id !== null) {
    if (!(await validTargetRoom(target_room_id, room))) {
      return NextResponse.json({ error: "Invalid target room" }, { status: 400 });
    }
    target = target_room_id as string;
  }

  const { data, error } = await supabase
    .from("openings")
    .insert({
      room_id,
      wall: wall as WallFace,
      wall_offset: typeof wall_offset === "number" && Number.isFinite(wall_offset) ? clamp01(wall_offset) : 0.5,
      ...widths.fields,
      kind: resolvedKind,
      target_room_id: target,
    })
    .select()
    .single();

  if (error) {
    console.error("openings", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}