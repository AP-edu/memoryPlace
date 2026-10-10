"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { isValidEmail, MIN_PASSWORD_LENGTH, normalizeEmail } from "@/lib/email";
import OAuthButtons from "@/components/OAuthButtons";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const email = normalizeEmail(form.email);
    if (!form.name.trim()) return setError("Enter your name");
    if (!isValidEmail(email)) return setError("Enter a valid email address");
    if (form.password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    setError("");
    setSending(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), email, password: form.password }),
      });

      let data: { error?: string } = {};
      try {
        data = await res.json();
      } catch {
        return setError("Signup failed (bad server response). Try again.");
      }

      if (!res.ok) {
        setError(data.error || "Signup failed");
        return;
      }

      const result = await signIn("credentials", {
        email,
        password: form.password,
        redirect: false,
      });

      if (result?.ok) router.push("/home");
      else setError("Account created, but login failed. Try logging in manually.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">Sign Up</h1>
        <p className="mb-5 text-sm text-muted-foreground">Choose your chamber, and begin.</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            placeholder="Name" aria-label="Name" autoComplete="name"
            className="input-base"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email" aria-label="Email" autoComplete="email"
            className="input-base"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            type="password"
            placeholder="Password" aria-label="Password" autoComplete="new-password"
            className="input-base"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <button className="btn-primary w-full" disabled={sending}>
            {sending ? "Creating account…" : "Create Account"}
          </button>
        </form>
        <OAuthButtons />
        <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" aria-hidden />
          or
          <span className="h-px flex-1 bg-border" aria-hidden />
        </div>
        <div className="space-y-2">
          <button onClick={() => signIn("google", { callbackUrl: "/home" })} className="btn-outline w-full">
            Continue with Google
          </button>
          <button disabled title="Apple sign-in arrives with the production domain" className="btn-outline w-full opacity-50">
            Continue with Apple (soon)
          </button>
        </div>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-link hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}