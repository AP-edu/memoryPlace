import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

async function openingOwner(openingId: string): Promise<string | null> {
  const { data: opening } = await supabase.from("openings").select("room_id").eq("id", openingId).single();
  if (!opening) return null;
  const { data: room } = await supabase.from("rooms").select("user_id").eq("id", opening.room_id).single();
  return room?.user_id ?? null;
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const owner = await openingOwner(id);
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { wall, wall_offset, width, kind } = await req.json();
  const updates: Record<string, unknown> = {};
  if (wall !== undefined) {
    if (!["north", "south", "east", "west"].includes(wall)) {
      return NextResponse.json({ error: "Invalid wall" }, { status: 400 });
    }
    updates.wall = wall;
  }
  if (wall_offset !== undefined) updates.wall_offset = wall_offset;
  if (width !== undefined) updates.width = width;
  if (kind !== undefined) {
    if (!["door", "archway"].includes(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    updates.kind = kind;
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

  const owner = await openingOwner(id);
  if (!owner) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("openings").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ message: "Deleted" });
}
