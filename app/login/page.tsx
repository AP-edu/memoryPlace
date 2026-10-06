"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { normalizeEmail } from "@/lib/email";

// NextAuth OAuth failures land here as ?error=... (pages.signIn = "/login").
// Surface them instead of failing silently when the provider is misconfigured.
const OAUTH_ERRORS: Record<string, string> = {
  OAuthSignin: "Could not start Google sign-in. Try again.",
  OAuthCallback: "Google sign-in failed. The account may not be linked.",
  OAuthAccountNotLinked: "That Google account is not linked. Log in another way first.",
  AccessDenied: "Sign-in was denied. Try again or use email login.",
  Configuration: "Google sign-in is not configured yet. Use email login for now.",
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const oauthError = params.get("error");
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const email = normalizeEmail(form.email);
    if (!email) return setError("Enter your email address");
    if (!form.password) return setError("Enter your password");
    setError("");
    setSending(true);

    try {
      const result = await signIn("credentials", {
        email,
        password: form.password,
        redirect: false,
      });

      if (result?.ok) router.push("/home");
      else if (result?.error === "CredentialsSignin") {
        setError("Invalid email or password. Google-only accounts must use Continue with Google.");
      } else setError("Invalid email or password");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-sm px-4">
      <div className="card-base p-6 sm:p-8">
        <h1 className="mb-1 text-3xl font-semibold">Log In</h1>
        <p className="mb-5 text-sm text-muted-foreground">Welcome back to the palace.</p>
        {oauthError && !error && (
          <p className="mb-3 text-sm text-destructive">
            {OAUTH_ERRORS[oauthError] ?? "External sign-in failed. Try email login."}
          </p>
        )}
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
          <button className="btn-primary w-full" disabled={sending}>
            {sending ? "Logging in…" : "Log In"}
          </button>
        </form>
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
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot-password" className="text-muted-foreground hover:text-foreground hover:underline">
            Forgot password?
          </Link>
        </p>
      </div>
      <p className="mt-5 text-center text-sm text-muted-foreground">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-link hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}

// useSearchParams needs a Suspense boundary for static prerendering.
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}