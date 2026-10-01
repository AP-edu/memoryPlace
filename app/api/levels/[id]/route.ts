import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { isFiniteNum, isInt, isPosNum } from "@/lib/validate";

type RouteContext = { params: Promise<{ id: string }> };

/** Level + its palace owner, or null when either is missing. */
async function levelWithOwner(id: string) {
  const { data: level } = await supabase.from("levels").select("*").eq("id", id).maybeSingle();
  if (!level) return null;
  const { data: palace } = await supabase.from("palaces").select("user_id").eq("id", level.palace_id).maybeSingle();
  if (!palace) return null;
  return { level, owner: palace.user_id as string };
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await levelWithOwner(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, ctx.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(ctx.level);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await levelWithOwner(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, ctx.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, idx, elevation, default_height } = body as Record<string, unknown>;

  const updates: Record<string, unknown> = {};
  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim() || name.length > 80) {
      return NextResponse.json({ error: "Invalid name" }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (idx !== undefined) {
    if (!isInt(idx)) return NextResponse.json({ error: "Invalid idx" }, { status: 400 });
    updates.idx = idx;
  }
  if (elevation !== undefined) {
    if (!isFiniteNum(elevation)) return NextResponse.json({ error: "Invalid elevation" }, { status: 400 });
    updates.elevation = elevation;
  }
  if (default_height !== undefined) {
    if (!isPosNum(default_height)) return NextResponse.json({ error: "Invalid default_height" }, { status: 400 });
    updates.default_height = default_height;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("levels").update(updates).eq("id", id).select().single();
  if (error) {
    console.error("levels PUT", error);
    return NextResponse.json({ error: "Failed to update level" }, { status: 500 });
  }
  return NextResponse.json(data);
}

// Deleting a level deletes the rooms on it (and, via FK cascades, their loci,
// cards and openings). The editor confirms this with the user first.
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ctx = await levelWithOwner(id);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, ctx.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { count } = await supabase
    .from("levels")
    .select("id", { count: "exact", head: true })
    .eq("palace_id", ctx.level.palace_id);
  if ((count ?? 0) <= 1) return NextResponse.json({ error: "A palace needs at least one level" }, { status: 409 });

  const { error: roomsError } = await supabase.from("rooms").delete().eq("level_id", id);
  if (roomsError) {
    console.error("levels DELETE rooms", roomsError);
    return NextResponse.json({ error: "Failed to delete level" }, { status: 500 });
  }
  const { error } = await supabase.from("levels").delete().eq("id", id);
  if (error) {
    console.error("levels DELETE", error);
    return NextResponse.json({ error: "Failed to delete level" }, { status: 500 });
  }
  return NextResponse.json({ message: "Deleted" });
}
