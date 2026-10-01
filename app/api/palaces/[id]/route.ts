import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: palace, error } = await supabase.from("palaces").select("*").eq("id", id).single();
  if (error || !palace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(palace);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: palace } = await supabase.from("palaces").select("*").eq("id", id).single();
  if (!palace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description, theme, visibility, grid_snap, unit } = await req.json();
  if (grid_snap !== undefined && !(typeof grid_snap === "number" && Number.isFinite(grid_snap) && grid_snap > 0 && grid_snap <= 10)) {
    return NextResponse.json({ error: "Invalid grid_snap" }, { status: 400 });
  }
  if (unit !== undefined && unit !== "m") return NextResponse.json({ error: "Invalid unit" }, { status: 400 });
  if (visibility !== undefined && !["private", "shared", "public"].includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (theme !== undefined) updates.theme = theme;
  if (visibility !== undefined) updates.visibility = visibility;
  if (grid_snap !== undefined) updates.grid_snap = grid_snap;
  if (unit !== undefined) updates.unit = unit;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const { data, error } = await supabase.from("palaces").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: palace } = await supabase.from("palaces").select("*").eq("id", id).single();
  if (!palace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("palaces").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}
