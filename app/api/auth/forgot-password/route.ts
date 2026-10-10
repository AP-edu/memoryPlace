import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import { normalizeEmail } from "@/lib/email";
import { emailConfigured, resetEmail, sendEmail } from "@/lib/mailer";

const GENERIC = "If an account exists for that email, a reset link is on its way.";
const UNAVAILABLE = "Password reset by email isn't set up on this site yet. Ask the site's owner to reset your password.";

function disclosureEnabled(): boolean {
  const flag = process.env.ALLOW_PASSWORD_RESET_DISCLOSURE;
  if (flag !== undefined) return flag === "true";
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: NextRequest) {
  let rawEmail: unknown;
  try {
    ({ email: rawEmail } = await req.json());
  } catch {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  if (typeof rawEmail !== "string" || !rawEmail.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  const email = normalizeEmail(rawEmail);
  if (!email) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  // No way to deliver a link: say so up front, for every address alike
  // (before the lookup, so the answer never reveals whether an account exists).
  if (!emailConfigured() && !disclosureEnabled()) {
    return NextResponse.json({ message: UNAVAILABLE, delivery: "unavailable" });
  }

  const { data: user, error: lookupError } = await supabase
    .from("users")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  // Always respond the same way so callers can't enumerate accounts.
  // (A lookup error is treated as unknown — never leak DB state here.)
  if (lookupError || !user) return NextResponse.json({ message: GENERIC });

  // Invalidate older unused tokens, then issue a single-use 1-hour token.
  await supabase.from("password_reset_tokens").delete().eq("user_id", user.id).is("used_at", null);

  const token = randomBytes(32).toString("hex");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("password_reset_tokens")
    .insert({ user_id: user.id, token_hash, expires_at });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin ?? "http://localhost:3000";
  const resetUrl = `${base}/reset-password/${token}`;

  // Email when configured (lib/mailer: RESEND_API_KEY + EMAIL_FROM). The
  // answer is the same whether or not sending worked (no account probing).
  if (emailConfigured()) {
    await sendEmail({ to: email, ...resetEmail(resetUrl) });
    return NextResponse.json({ message: GENERIC });
  }

  // Disclosure mode hands the link back directly (dev default: on outside
  // production). Never enable it in production: anyone could reset anyone's
  // password from this endpoint.
  return NextResponse.json({ message: GENERIC, resetUrl });
}
