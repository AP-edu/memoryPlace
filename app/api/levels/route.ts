import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { canModify } from "@/lib/ownership";
import { isFiniteNum, isInt, isPosNum } from "@/lib/validate";

// Levels belong to a palace; ownership is the palace owner's (or admin).
// Errors on these routes are deliberately generic; details go to the server log.

async function ownedPalace(palaceId: unknown) {
  if (typeof palaceId !== "string" || !palaceId) return null;
  const { data } = await supabase.from("palaces").select("id, user_id").eq("id", palaceId).maybeSingle();
  return data ?? null;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const palace = await ownedPalace(req.nextUrl.searchParams.get("palace"));
  if (!palace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supabase
    .from("levels")
    .select("*")
    .eq("palace_id", palace.id)
    .order("idx", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    console.error("levels GET", error);
    return NextResponse.json({ error: "Failed to load levels" }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { palace_id, name, idx, elevation, default_height } = body as Record<string, unknown>;

  const palace = await ownedPalace(palace_id);
  if (!palace) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canModify(session, palace.user_id)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (name !== undefined && (typeof name !== "string" || !name.trim() || name.length > 80)) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  if (idx !== undefined && !isInt(idx)) return NextResponse.json({ error: "Invalid idx" }, { status: 400 });
  if (elevation !== undefined && !isFiniteNum(elevation)) {
    return NextResponse.json({ error: "Invalid elevation" }, { status: 400 });
  }
  if (default_height !== undefined && !isPosNum(default_height)) {
    return NextResponse.json({ error: "Invalid default_height" }, { status: 400 });
  }

  let nextIdx: number;
  if (isInt(idx)) {
    nextIdx = idx;
  } else {
    const { data: top } = await supabase
      .from("levels")
      .select("idx")
      .eq("palace_id", palace.id)
      .order("idx", { ascending: false })
      .limit(1)
      .maybeSingle();
    nextIdx = top ? top.idx + 1 : 0;
  }

  const { data, error } = await supabase
    .from("levels")
    .insert({
      palace_id: palace.id,
      idx: nextIdx,
      name: typeof name === "string" ? name.trim() : nextIdx === 0 ? "Ground" : `Level ${nextIdx}`,
      elevation: isFiniteNum(elevation) ? elevation : nextIdx * 3,
      default_height: isPosNum(default_height) ? default_height : 3,
    })
    .select()
    .single();
  if (error) {
    console.error("levels POST", error);
    return NextResponse.json({ error: "Failed to create level" }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
