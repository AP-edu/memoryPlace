
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const courseId = req.nextUrl.searchParams.get("course");
  let query = supabase.from("decks").select("*").order("created_at", { ascending: false });
  if (session.user.role !== "admin") query = query.eq("owner", session.user.id);
  if (courseId) query = query.eq("course_id", courseId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, course_id } = await req.json();
  if (!title || !course_id) {
    return NextResponse.json({ error: "Title and course_id required" }, { status: 400 });
  }

  const { data: course } = await supabase
    .from("courses")
    .select("id, owner")
    .eq("id", course_id)
    .maybeSingle();
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });
  if (session.user.role !== "admin" && course.owner !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("decks")
    .insert({ title, course_id, owner: session.user.id })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}