import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabase } from "@/lib/supabase";

const GENERIC = "If an account exists for that email, a reset link is on its way.";

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
  const email = rawEmail.trim();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  // Always respond the same way so callers can't enumerate accounts.
  if (!user) return NextResponse.json({ message: GENERIC });

  // Invalidate older unused tokens, then issue a single-use 1-hour token.
  await supabase.from("password_reset_tokens").delete().eq("user_id", user.id).is("used_at", null);

  const token = randomBytes(32).toString("hex");
  const token_hash = createHash("sha256").update(token).digest("hex");
  const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("password_reset_tokens")
    .insert({ user_id: user.id, token_hash, expires_at });
  if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });

  // TODO: send the link by email once a mail provider is configured.
  // Until then, disclosure mode hands the link back directly (dev default:
  // on outside production). Set ALLOW_PASSWORD_RESET_DISCLOSURE=false in
  // production or anyone can reset anyone's password from this endpoint.
  if (disclosureEnabled()) {
    const base =
      process.env.NEXTAUTH_URL ??
      req.nextUrl.origin ??
      "http://localhost:3000";
    return NextResponse.json({ message: GENERIC, resetUrl: `${base}/reset-password/${token}` });
  }

  return NextResponse.json({ message: GENERIC });
}
