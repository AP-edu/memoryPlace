import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { MAX_STEP } from "@/lib/onboarding";
import { isValidEmail, normalizeEmail } from "@/lib/email";
import { serverError } from "@/lib/apiError";

// The signed-in user's own settings: display name, email, and guided-onboarding
// state (stored server-side so it follows the user across devices).

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("users")
    .select("name, email, password, onboarded_at, onboarding_step")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) return serverError("api/profile GET", error);
  return NextResponse.json({
    name: data?.name ?? "",
    email: data?.email ?? "",
    // OAuth-linked rows have no password: the UI hides password + email editing.
    has_password: !!data?.password,
    onboarded_at: data?.onboarded_at ?? null,
    onboarding_step: data?.onboarding_step ?? null,
  });
}

/**
 * Body (all optional):
 *   name: string                   — display name (1..80 chars)
 *   email: string                  — normalized + validated; 409 if taken; not allowed for Google-linked
 *                                    accounts (Google sign-in links by email)
 *   onboarding_step: integer 0..4  — furthest step acknowledged (only ever increases unless reset)
 *   onboarded: true | false        — true stamps onboarded_at=now(); false replays the tour (clears both)
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name || name.length > 80) {
      return NextResponse.json({ error: "Name must be 1-80 characters" }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.email !== undefined) {
    const email = normalizeEmail(body.email);
    if (!isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    const { data: me } = await supabase.from("users").select("email, password").eq("id", session.user.id).maybeSingle();
    if (me && email !== me.email) {
      if (!me.password) {
        return NextResponse.json(
          { error: "This account signs in with Google, so its email can't be changed here." },
          { status: 400 }
        );
      }
      updates.email = email;
    }
  }

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
    .select("name, email, onboarded_at, onboarding_step")
    .single();
  if (error) {
    // Unique index on lower(email): another account already uses it.
    if (error.code === "23505") return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    return serverError("api/profile PUT", error);
  }
  return NextResponse.json(data);
}
