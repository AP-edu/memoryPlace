import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { supabase } from "@/lib/supabase";
import { MIN_PASSWORD_LENGTH } from "@/lib/email";

/**
 * Authenticated password change. Body: { currentPassword, newPassword }.
 * Google-linked accounts have no password (stored as ""), so they get a clear
 * message instead of a silent failure. Passwords are never logged or returned.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { currentPassword, newPassword } = body;
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
    return NextResponse.json({ error: "Current and new password required" }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 });
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, password")
    .eq("id", session.user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Could not verify your account" }, { status: 500 });
  if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
  if (!user.password) {
    return NextResponse.json(
      { error: "This account signs in with Google and has no password. Use Continue with Google." },
      { status: 400 }
    );
  }

  const ok = await bcrypt.compare(currentPassword, user.password);
  if (!ok) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
  if (await bcrypt.compare(newPassword, user.password)) {
    return NextResponse.json({ error: "Choose a password different from your current one" }, { status: 400 });
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  const { error: updateError } = await supabase.from("users").update({ password: hashed }).eq("id", user.id);
  if (updateError) return NextResponse.json({ error: "Could not update your password" }, { status: 500 });

  // Any outstanding reset links are now moot.
  await supabase.from("password_reset_tokens").delete().eq("user_id", user.id).is("used_at", null);
  return NextResponse.json({ ok: true });
}
