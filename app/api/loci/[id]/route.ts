import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { locusPercent } from "@/lib/geometry";
import type { WallFace } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

async function roomOwnerAndSize(locusId: string) {
  const { data: locus } = await supabase.from("loci").select("room_id").eq("id", locusId).single();
  if (!locus) return null;
  const { data: room } = await supabase
    .from("rooms")
    .select("user_id, width, depth")
    .eq("id", locus.room_id)
    .single();
  return { owner: room?.user_id ?? null, size: room ? { width: room.width, depth: room.depth } : null };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: locus, error } = await supabase.from("loci").select("*").eq("id", id).single();
  if (error || !locus) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await roomOwnerAndSize(id);
  if (!owner?.owner || !canModify(session, owner.owner)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(locus);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: locus } = await supabase.from("loci").select("*").eq("id", id).single();
  if (!locus) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await roomOwnerAndSize(id);
  if (!owner?.owner || !canModify(session, owner.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { label, x, y, z, tags, position, wall, wall_offset, height } = await req.json();
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (x !== undefined) updates.x = x;
  if (y !== undefined) updates.y = y;
  if (z !== undefined) updates.z = z;
  if (tags !== undefined) updates.tags = tags;
  if (position !== undefined) updates.position = position;
  if (height !== undefined) {
    if (typeof height !== "number" || !Number.isFinite(height) || height <= 0) {
      return NextResponse.json({ error: "height must be a positive number" }, { status: 400 });
    }
    updates.height = height;
  }

  const walls: WallFace[] = ["north", "south", "east", "west"];
  const validWall = typeof wall === "string" && walls.includes(wall as WallFace);
  const changedWall = validWall ? (wall as WallFace) : locus.wall;
  const wallOffset =
    typeof wall_offset === "number" && Number.isFinite(wall_offset)
      ? Math.min(1, Math.max(0, wall_offset))
      : locus.wall_offset;

  if (validWall) updates.wall = wall as WallFace;
  if (wall_offset !== undefined) updates.wall_offset = wallOffset;

  // When the wall anchor moves, keep the legacy x/y percentages in sync.
  if (owner.size && (validWall || wall_offset !== undefined) && changedWall && typeof wallOffset === "number") {
    const percent = locusPercent({ wall: changedWall, wall_offset: wallOffset, x: locus.x, y: locus.y }, owner.size);
    updates.x = Math.round(percent.x * 100) / 100;
    updates.y = Math.round(percent.y * 100) / 100;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("loci").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: locus } = await supabase.from("loci").select("*").eq("id", id).single();
  if (!locus) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await roomOwnerAndSize(id);
  if (!owner?.owner || !canModify(session, owner.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("loci").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}
