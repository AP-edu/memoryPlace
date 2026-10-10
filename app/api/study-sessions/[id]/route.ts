import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { lookupFailed } from "@/lib/apiError";

type RouteContext = { params: Promise<{ id: string }> };

/** One saved session (feeds the /results summary). Owner or admin only. */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.from("study_sessions").select("*").eq("id", id).maybeSingle();
  if (error) return lookupFailed("api/study-sessions/[id] GET", error);
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, data.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json(data);
}
