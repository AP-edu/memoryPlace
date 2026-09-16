"use client";
import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage(null);
    setResetUrl(null);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Something went wrong");
    setMessage(json.message);
    if (json.resetUrl) setResetUrl(json.resetUrl);
  }

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">Reset Password</h1>
        <p className="mb-5 text-sm text-muted-foreground">Enter your account email.</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        {message && <p className="mb-3 text-sm text-foreground">{message}</p>}
        {resetUrl && (
          <p className="mb-3 text-sm">
            <Link href={resetUrl} className="font-medium text-primary hover:underline">
              Continue to set a new password →
            </Link>
          </p>
        )}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            className="input-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="btn-primary w-full">Send reset link</button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
