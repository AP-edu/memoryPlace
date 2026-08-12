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

  const { data: course, error } = await supabase.from("courses").select("*").eq("id", id).single();
  if (error || !course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(course);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: course } = await supabase.from("courses").select("*").eq("id", id).single();
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { title, description } = await req.json();
  if (title === undefined && description === undefined) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }
  const updates: { title?: string; description?: string } = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;

  const { data, error } = await supabase.from("courses").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: course } = await supabase.from("courses").select("*").eq("id", id).single();
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}