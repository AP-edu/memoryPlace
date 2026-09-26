import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

async function roomOwner(locusId: string): Promise<string | null> {
  const { data: locus } = await supabase.from("loci").select("room_id").eq("id", locusId).single();
  if (!locus) return null;
  const { data: room } = await supabase.from("rooms").select("user_id").eq("id", locus.room_id).single();
  return room?.user_id ?? null;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: locus, error } = await supabase.from("loci").select("*").eq("id", id).single();
  if (error || !locus) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const owner = await roomOwner(id);
  if (!owner || !canModify(session, owner)) {
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
  const owner = await roomOwner(id);
  if (!owner || !canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { label, x, y, z, tags, position } = await req.json();
  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (x !== undefined) updates.x = x;
  if (y !== undefined) updates.y = y;
  if (z !== undefined) updates.z = z;
  if (tags !== undefined) updates.tags = tags;
  if (position !== undefined) updates.position = position;
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
  const owner = await roomOwner(id);
  if (!owner || !canModify(session, owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("loci").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}
