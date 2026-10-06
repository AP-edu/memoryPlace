
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Admins may list every palace (?all=1) for the admin view; everyone
  // else sees only their own.
  const all = req.nextUrl.searchParams.get("all") === "1" && session.user.role === "admin";
  let query = supabase.from("palaces").select("*").order("created_at", { ascending: false });
  if (!all) query = query.eq("user_id", session.user.id);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, description, theme, visibility } = await req.json();
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
  if (visibility !== undefined && !["private", "shared", "public"].includes(visibility)) {
    return NextResponse.json({ error: "Invalid visibility" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("palaces")
    .insert({
      title,
      description: description ?? null,
      theme: theme ?? {},
      visibility: visibility ?? "private",
      user_id: session.user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Every palace starts with a ground floor for the grid editor (best effort).
  const { error: levelError } = await supabase
    .from("levels")
    .insert({ palace_id: data.id, idx: 0, name: "Ground", elevation: 0, default_height: 3 });
  if (levelError) console.error("palaces POST ground level", levelError);

  return NextResponse.json(data, { status: 201 });
}
