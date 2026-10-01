import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import type { OpeningKind, WallFace } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

const WALLS: WallFace[] = ["north", "south", "east", "west"];
const KINDS: OpeningKind[] = ["door", "archway"];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

async function roomOwnerOfOpening(openingId: string) {
  const { data: opening } = await supabase.from("openings").select("room_id").eq("id", openingId).single();
  if (!opening) return null;
  const { data: room } = await supabase.from("rooms").select("user_id").eq("id", opening.room_id).single();
  return { opening, owner: room?.user_id ?? null };
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await roomOwnerOfOpening(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.owner || !canModify(session, ctx.owner)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { wall, wall_offset, width, kind } = await req.json();
  const updates: Record<string, unknown> = {};
  if (wall !== undefined) {
    if (typeof wall !== "string" || !WALLS.includes(wall as WallFace)) {
      return NextResponse.json({ error: "wall must be north, south, east, or west" }, { status: 400 });
    }
    updates.wall = wall as WallFace;
  }
  if (wall_offset !== undefined) {
    if (typeof wall_offset !== "number" || !Number.isFinite(wall_offset)) {
      return NextResponse.json({ error: "wall_offset must be a number" }, { status: 400 });
    }
    updates.wall_offset = clamp01(wall_offset);
  }
  if (width !== undefined) {
    if (typeof width !== "number" || !Number.isFinite(width) || width <= 0) {
      return NextResponse.json({ error: "width must be a positive number" }, { status: 400 });
    }
    updates.width = Math.min(1, width);
  }
  if (kind !== undefined) {
    if (typeof kind !== "string" || !KINDS.includes(kind as OpeningKind)) {
      return NextResponse.json({ error: "kind must be door or archway" }, { status: 400 });
    }
    updates.kind = kind as OpeningKind;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("openings").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await roomOwnerOfOpening(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!ctx.owner || !canModify(session, ctx.owner)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("openings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Deleted" });
}