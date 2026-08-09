
import { NextRequest, NextResponse } from "next/server";
import { getServerSession, Session } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { Course } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

function canModify(session: Session | null, course: Course): boolean {
  if (!session) return false;
  return session.user.role === "admin" || course.owner === session.user.id;
}

export async function GET(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: course, error } = await supabase.from("courses").select("*").eq("id", id).single();
  if (error || !course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(course);
}

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: course } = await supabase.from("courses").select("*").eq("id", id).single();
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const updates = await req.json();
  const { data, error } = await supabase.from("courses").update(updates).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  const { data: course } = await supabase.from("courses").select("*").eq("id", id).single();
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, course)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}