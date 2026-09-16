"use client";
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) return setError("Passwords do not match");
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const json = await res.json();
    if (!res.ok) return setError(json.error ?? "Something went wrong");
    router.push("/login");
  }

  if (!token) return <p className="p-6">This reset link is missing its token.</p>;

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">New Password</h1>
        <p className="mb-5 text-sm text-muted-foreground">At least 8 characters.</p>
        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            placeholder="New password"
            className="input-base"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="input-base"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <button className="btn-primary w-full">Set password</button>
        </form>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to log in
        </Link>
      </p>
    </div>
  );
}
