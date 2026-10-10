import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { placementUpdates } from "@/lib/roomPlacement";
import { MAX_ROOM_SIZE } from "@/lib/validate";
import { lookupFailed, serverError } from "@/lib/apiError";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room, error } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
  if (error) return lookupFailed("api/rooms/[id] GET", error);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(room);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room, error: lookupError } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
  if (lookupError) return lookupFailed("api/rooms/[id] PUT", lookupError);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { title, background, metadata, width, depth, height } = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (title !== undefined) {
    if (typeof title !== "string" || !title.trim() || title.length > 120) {
      return NextResponse.json({ error: "Invalid title" }, { status: 400 });
    }
    updates.title = title.trim();
  }
  if (background !== undefined) updates.background = background;
  if (metadata !== undefined) updates.metadata = metadata;
  const isPosNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0 && n <= MAX_ROOM_SIZE;
  if (width !== undefined) {
    if (!isPosNum(width)) return NextResponse.json({ error: "width must be a positive number" }, { status: 400 });
    updates.width = width;
  }
  if (depth !== undefined) {
    if (!isPosNum(depth)) return NextResponse.json({ error: "depth must be a positive number" }, { status: 400 });
    updates.depth = depth;
  }
  if (height !== undefined) {
    if (!isPosNum(height)) return NextResponse.json({ error: "height must be a positive number" }, { status: 400 });
    updates.height = height;
  }
  const placement = await placementUpdates(body as Record<string, unknown>, room.palace_id);
  if ("error" in placement) return NextResponse.json({ error: placement.error }, { status: 400 });
  Object.assign(updates, placement.updates);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("rooms").update(updates).eq("id", id).select().single();
  if (error) return serverError("api/rooms/[id] PUT", error);

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: room, error: lookupError } = await supabase.from("rooms").select("*").eq("id", id).maybeSingle();
  if (lookupError) return lookupFailed("api/rooms/[id] DELETE", lookupError);
  if (!room) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, room.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("rooms").delete().eq("id", id);
  if (error) return serverError("api/rooms/[id] DELETE", error);

  return NextResponse.json({ message: "Deleted" });
}
