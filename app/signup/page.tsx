"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Signup failed");
      return;
    }

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (result?.ok) router.push("/dashboard");
    else setError("Account created, but login failed. Try logging in manually.");
  }

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">Sign Up</h1>
        <p className="mb-5 text-sm text-muted-foreground">Choose your chamber, and begin.</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Name"
            className="input-base"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email"
            className="input-base"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password"
            className="input-base"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button className="btn-primary w-full">Create Account</button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}