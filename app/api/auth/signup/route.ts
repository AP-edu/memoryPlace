
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getSupabase } from "@/lib/supabase";
import { isValidEmail, MIN_PASSWORD_LENGTH, normalizeEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail = normalizeEmail(email);
    if (!cleanName || !cleanEmail || typeof password !== "string" || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }
    if (!isValidEmail(cleanEmail)) {
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 }
      );
    }

    const db = getSupabase();
    // Exact match on normalized email: LIKE wildcards in input must never
    // match a different row (see lib/email.ts).
    const { data: existing, error: lookupError } = await db
      .from("users")
      .select("id")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const { data: firstUser, error: firstError } = await db
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (firstError) throw firstError;
    const role = firstUser ? "user" : "admin";
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await db
      .from("users")
      .insert({ name: cleanName, email: cleanEmail, password: hashedPassword, role })
      .select("id, name, email")
      .single();

    if (error) {
      // Race: two signups for the same email at once (unique index).
      if (error.code === "23505") {
        return NextResponse.json({ error: "Email already registered" }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}