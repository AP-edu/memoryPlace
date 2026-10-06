"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useFetch } from "@/hooks/useFetch";
import ThemeToggle from "@/components/ThemeToggle";
import { isValidEmail, MIN_PASSWORD_LENGTH, normalizeEmail } from "@/lib/email";
import type { HomeSummary } from "@/lib/homeSummary";
import { PageSkeleton } from "@/components/ui/Skeleton";

interface ProfileData {
  name: string;
  email: string;
  has_password: boolean;
}

type Notice = { kind: "ok" | "error"; text: string } | null;

function NoticeLine({ n }: { n: Notice }) {
  if (!n) return null;
  return (
    <p role={n.kind === "error" ? "alert" : "status"} className={`mt-2 text-sm ${n.kind === "error" ? "text-destructive" : "text-success"}`}>
      {n.text}
    </p>
  );
}

/** Name + email editor. Email is locked for Google-linked accounts. */
function AccountForm({ profile, onSaved }: { profile: ProfileData; onSaved: () => void }) {
  const { update } = useSession();
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const dirty = name.trim() !== profile.name || normalizeEmail(email) !== profile.email;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !dirty) return;
    const body: Record<string, string> = {};
    if (name.trim() !== profile.name) {
      if (!name.trim()) return setNotice({ kind: "error", text: "Name can't be empty." });
      body.name = name.trim();
    }
    if (normalizeEmail(email) !== profile.email) {
      if (!isValidEmail(normalizeEmail(email))) return setNotice({ kind: "error", text: "Enter a valid email address." });
      body.email = normalizeEmail(email);
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNotice({ kind: "error", text: data.error ?? "Could not save your changes." });
      await update(); // server re-reads name/email into the session
      setNotice({ kind: "ok", text: "Saved." });
      onSaved();
    } catch {
      setNotice({ kind: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card-base mt-6 p-4">
      <h2 className="text-lg font-semibold">Account</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="profile-name" className="mb-1 block text-xs font-medium text-muted-foreground">
            Name
          </label>
          <input id="profile-name" className="input-base" value={name} maxLength={80} autoComplete="name" onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label htmlFor="profile-email" className="mb-1 block text-xs font-medium text-muted-foreground">
            Email
          </label>
          <input
            id="profile-email"
            type="email"
            className="input-base disabled:opacity-60"
            value={email}
            autoComplete="email"
            disabled={!profile.has_password}
            onChange={(e) => setEmail(e.target.value)}
          />
          {!profile.has_password && (
            <p className="mt-1 text-xs text-muted-foreground">Signed in with Google, so your email is managed there.</p>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !dirty}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </div>
      <NoticeLine n={notice} />
    </form>
  );
}

/** Authenticated password change (current -> new -> confirm). */
function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.length < MIN_PASSWORD_LENGTH) {
      return setNotice({ kind: "error", text: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (next !== confirmPw) return setNotice({ kind: "error", text: "The new passwords don't match." });
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setNotice({ kind: "error", text: data.error ?? "Could not change your password." });
      setCurrent("");
      setNext("");
      setConfirmPw("");
      setNotice({ kind: "ok", text: "Password updated." });
    } catch {
      setNotice({ kind: "error", text: "Network error. Try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card-base mt-6 p-4">
      <h2 className="text-lg font-semibold">Change password</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="pw-current" className="mb-1 block text-xs font-medium text-muted-foreground">
            Current password
          </label>
          <input id="pw-current" type="password" className="input-base" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-new" className="mb-1 block text-xs font-medium text-muted-foreground">
            New password
          </label>
          <input id="pw-new" type="password" className="input-base" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pw-confirm" className="mb-1 block text-xs font-medium text-muted-foreground">
            Confirm new password
          </label>
          <input id="pw-confirm" type="password" className="input-base" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary mt-3" disabled={busy || !current || !next || !confirmPw}>
        {busy ? "Updating…" : "Update password"}
      </button>
      <NoticeLine n={notice} />
    </form>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { data: summary } = useFetch<HomeSummary>(`/api/home/summary?tz=${new Date().getTimezoneOffset()}`);
  const { data: profile, refetch: refetchProfile } = useFetch<ProfileData>("/api/profile");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [status, router]);

  async function replayTour() {
    const res = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboarded: false }),
    });
    if (res.ok) {
      try {
        window.localStorage.removeItem("mp.onboarded");
      } catch {
        // ignore
      }
      router.push("/home");
    }
  }

  if (status === "loading") return <PageSkeleton label="Loading profile" cards={2} />;
  if (!session) return <p className="p-6 text-muted-foreground">Redirecting to login...</p>;

  const cont = summary?.continueTarget ?? null;
  const weakest = summary
    ? [...summary.palaces].sort((a, b) => b.due - a.due || b.cards - a.cards)[0] ?? null
    : null;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-5 text-3xl font-semibold">Profile</h1>

      <div className="card-base mb-6 flex items-center justify-between p-6">
        <div>
          <p className="font-display text-xl font-medium">{session.user.name}</p>
          <p className="text-sm text-muted-foreground">{session.user.email}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            session.user.role === "admin"
              ? "bg-accent/15 text-highlight"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {session.user.role === "admin" ? "Admin" : "User"}
        </span>
      </div>

      {profile && (
        // key remounts the form when saved values change so its fields resync.
        <AccountForm key={`${profile.name}|${profile.email}`} profile={profile} onSaved={refetchProfile} />
      )}
      {profile?.has_password && <PasswordForm />}

      <div className="card-base mt-6 flex items-center justify-between gap-3 p-4">
        <div>
          <h2 className="text-lg font-semibold">Appearance</h2>
          <p className="text-sm text-muted-foreground">Blue sky by day, starry night after dark — or follow your device.</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.palaces.length : "–"}</p>
          <p className="text-sm text-muted-foreground">Palaces</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.totalCards : "–"}</p>
          <p className="text-sm text-muted-foreground">Cards</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold">{summary ? summary.dueToday : "–"}</p>
          <p className="text-sm text-muted-foreground">Due today</p>
        </div>
        <div className="card-base p-4 text-center">
          <p className="font-display text-2xl font-semibold text-link">
            {summary ? (summary.avgScore === null ? "–" : `${Math.round(summary.avgScore * 100)}%`) : "–"}
          </p>
          <p className="text-sm text-muted-foreground">Avg score</p>
        </div>
      </div>

      <div className="card-base mt-6 p-4">
        <p className="mb-1 text-sm text-muted-foreground">Day streak</p>
        <p className="font-display text-lg font-medium">
          {summary ? `${summary.streakDays} day${summary.streakDays === 1 ? "" : "s"}` : "–"}
        </p>
      </div>

      {cont && (
        <div className="card-base mt-6 flex items-center justify-between p-4">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Continue</p>
            <p className="font-display text-lg font-medium">{cont.title}</p>
            <p className="text-sm text-muted-foreground">
              {cont.reviewed} of {cont.total} reviewed{cont.due > 0 ? ` · ${cont.due} due` : ""}
            </p>
          </div>
          <Link href={`/study/palace/${cont.palaceId}`} className="btn-primary">
            Study now →
          </Link>
        </div>
      )}

      <div className="card-base mt-6 flex items-center justify-between p-4">
        <div>
          <p className="font-display text-lg font-medium">Guided tour</p>
          <p className="text-sm text-muted-foreground">
            {summary?.onboarding?.onboardedAt ? "Completed. Replay it any time." : "In progress on your home page."}
          </p>
        </div>
        <button onClick={replayTour} className="btn-outline">
          Replay tour
        </button>
      </div>

      {weakest && weakest.due > 0 && (!cont || weakest.palaceId !== cont.palaceId) && (
        <div className="card-base mt-6 flex items-center justify-between p-4">
          <div>
            <p className="mb-1 text-sm text-muted-foreground">Needs reinforcement</p>
            <p className="font-display text-lg font-medium">{weakest.title}</p>
            <p className="text-sm text-muted-foreground">{weakest.due} due</p>
          </div>
          <Link href={`/study/palace/${weakest.palaceId}`} className="btn-outline">
            Review →
          </Link>
        </div>
      )}
    </div>
  );
}
