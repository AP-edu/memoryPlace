"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const result = await signIn("credentials", {
      email: form.email,
      password: form.password,
      redirect: false,
    });

    if (result?.ok) router.push("/dashboard");
    else setError("Invalid email or password");
  }

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">Log In</h1>
        <p className="mb-5 text-sm text-muted-foreground">Welcome back to the palace.</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
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
          <button className="btn-primary w-full">Log In</button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}