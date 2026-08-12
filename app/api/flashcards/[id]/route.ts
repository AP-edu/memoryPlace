import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await supabase.from("flashcards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { question, answer } = await req.json();
  if (question === undefined || answer === undefined) {
    return NextResponse.json({ error: "Question and answer required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("flashcards")
    .update({ question, answer })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: card } = await supabase.from("flashcards").select("*").eq("id", id).single();
  if (!card) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, card.owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase.from("flashcards").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ message: "Deleted" });
}