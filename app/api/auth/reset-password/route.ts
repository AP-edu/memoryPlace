import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  let token: unknown, password: unknown;
  try {
    ({ token, password } = await req.json());
  } catch {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  }
  if (!token || typeof token !== "string" || !password || typeof password !== "string") {
    return NextResponse.json({ error: "Token and password required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const token_hash = createHash("sha256").update(token).digest("hex");
  const { data: record } = await supabase
    .from("password_reset_tokens")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", token_hash)
    .maybeSingle();

  if (!record || record.used_at || new Date(record.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const { error: updateError } = await supabase
    .from("users")
    .update({ password: hashedPassword })
    .eq("id", record.user_id);
  if (updateError) return NextResponse.json({ error: "Server error" }, { status: 500 });

  // Single-use: mark this token used and clear any other unused ones.
  await supabase.from("password_reset_tokens").update({ used_at: new Date().toISOString() }).eq("id", record.id);
  await supabase.from("password_reset_tokens").delete().eq("user_id", record.user_id).is("used_at", null);

  return NextResponse.json({ message: "Password updated — you can now log in." });
}
