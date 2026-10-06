import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { MAX_STEP } from "@/lib/onboarding";

// The signed-in user's own settings. Today: guided-onboarding state, stored
// server-side so it follows the user across devices (replaces localStorage).

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("users")
    .select("onboarded_at, onboarding_step")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    onboarded_at: data?.onboarded_at ?? null,
    onboarding_step: data?.onboarding_step ?? null,
  });
}

/**
 * Body (all optional):
 *   onboarding_step: integer 0..5  — furthest step acknowledged (only ever increases unless reset)
 *   onboarded: true | false        — true stamps onboarded_at=now(); false replays the tour (clears both)
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.onboarded === false) {
    updates.onboarded_at = null;
    updates.onboarding_step = 0;
  } else {
    if (body.onboarded === true) updates.onboarded_at = new Date().toISOString();
    if (body.onboarding_step !== undefined) {
      const n = body.onboarding_step;
      if (!Number.isInteger(n) || n < 0 || n > MAX_STEP) {
        return NextResponse.json({ error: `onboarding_step must be an integer 0..${MAX_STEP}` }, { status: 400 });
      }
      const { data: cur } = await supabase.from("users").select("onboarding_step").eq("id", session.user.id).maybeSingle();
      updates.onboarding_step = Math.max(n, cur?.onboarding_step ?? 0);
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("id", session.user.id)
    .select("onboarded_at, onboarding_step")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
