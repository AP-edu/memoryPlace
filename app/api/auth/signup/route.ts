
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const { name, email, password } = await req.json();
    if (!name || !email || !password) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const { data: existing } = await supabase
      .from("users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const { data: firstUser } = await supabase
      .from("users")
      .select("id")
      .limit(1)
      .maybeSingle();

    const role = firstUser ? "user" : "admin";
    const hashedPassword = await bcrypt.hash(password, 10);

    const { data: user, error } = await supabase
      .from("users")
      .insert({ name, email, password: hashedPassword, role })
      .select("id, name, email")
      .single();

    if (error) throw error;

    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    console.error("SIGNUP ERROR:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}