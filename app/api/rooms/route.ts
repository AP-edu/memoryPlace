
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { defaultLevelId, placementUpdates } from "@/lib/roomPlacement";
import { isPosNum, MAX_ROOM_SIZE } from "@/lib/validate";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const palaceId = req.nextUrl.searchParams.get("palace");
  let query = supabase.from("rooms").select("*").order("created_at", { ascending: false });
  query = query.eq("user_id", session.user.id);
  if (palaceId) query = query.eq("palace_id", palaceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { title, palace_id, background, width, depth, height } = body as Record<string, unknown>;
  if (!title || !palace_id) {
    return NextResponse.json({ error: "Title and palace_id required" }, { status: 400 });
  }

  const { data: palace } = await supabase
    .from("palaces")
    .select("id, user_id")
    .eq("id", palace_id)
    .maybeSingle();
  if (!palace) return NextResponse.json({ error: "Palace not found" }, { status: 404 });
  if (session.user.role !== "admin" && palace.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  for (const n of [width, depth, height]) {
    if (n !== undefined && (!isPosNum(n) || n > MAX_ROOM_SIZE)) {
      return NextResponse.json({ error: "Dimensions must be positive numbers" }, { status: 400 });
    }
  }
  const placement = await placementUpdates(body as Record<string, unknown>, palace.id);
  if ("error" in placement) return NextResponse.json({ error: placement.error }, { status: 400 });
  if (placement.updates.level_id === undefined) placement.updates.level_id = await defaultLevelId(palace.id);

  const { data, error } = await supabase
    .from("rooms")
    .insert({
      title,
      palace_id,
      background: background ?? null,
      user_id: session.user.id,
      width: isPosNum(width) ? width : 10,
      depth: isPosNum(depth) ? depth : 8,
      height: isPosNum(height) ? height : 3,
      ...placement.updates,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
