import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import type { OpeningKind, WallFace } from "@/types/database";
import { openingWidthFields, validTargetRoom } from "@/lib/openingFields";

type RouteContext = { params: Promise<{ id: string }> };

const WALLS: WallFace[] = ["north", "south", "east", "west"];
const KINDS: OpeningKind[] = ["door", "archway"];

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

async function roomOwnerOfOpening(openingId: string) {
  const { data: opening } = await supabase.from("openings").select("*").eq("id", openingId).single();
  if (!opening) return null;
  const { data: room } = await supabase
    .from("rooms")
    .select("id, user_id, palace_id, width, depth")
    .eq("id", opening.room_id)
    .single();
  return { opening, room, owner: room?.user_id ?? null };
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

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { wall, wall_offset, width, width_m, kind, target_room_id } = body as Record<string, unknown>;
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
  if (width !== undefined || width_m !== undefined || wall !== undefined) {
    if (!ctx.room) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Keep width_m (metres) authoritative and the legacy fraction in sync with
    // the (possibly new) wall's length.
    const nextWall = (updates.wall as WallFace | undefined) ?? (ctx.opening.wall as WallFace);
    const input =
      width_m !== undefined || width !== undefined
        ? { width, width_m }
        : { width_m: ctx.opening.width_m ?? undefined, width: ctx.opening.width };
    const widths = openingWidthFields(nextWall, ctx.room, input, (ctx.opening.kind as OpeningKind) ?? "door");
    if ("error" in widths) return NextResponse.json({ error: widths.error }, { status: 400 });
    Object.assign(updates, widths.fields);
  }
  if (target_room_id !== undefined) {
    if (target_room_id === null) {
      updates.target_room_id = null;
    } else {
      if (!ctx.room || !(await validTargetRoom(target_room_id, ctx.room))) {
        return NextResponse.json({ error: "Invalid target room" }, { status: 400 });
      }
      updates.target_room_id = target_room_id;
    }
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
  if (error) {
    console.error("openings", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
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
  if (error) {
    console.error("openings", error);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
  return NextResponse.json({ message: "Deleted" });
}