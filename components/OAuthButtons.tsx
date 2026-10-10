"use client";
import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";

const LABELS: Record<string, string> = { google: "Continue with Google", apple: "Continue with Apple" };

/**
 * Social sign-in, shown only for providers the server actually has configured
 * (GOOGLE_* / APPLE_* env). With none configured this renders nothing, so
 * users never see a button that can only fail.
 */
export default function OAuthButtons({ callbackUrl = "/home" }: { callbackUrl?: string }) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    getProviders()
      .then((p) => {
        if (live && p) setIds(Object.keys(p).filter((id) => id in LABELS));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (ids.length === 0) return null;
  return (
    <>
      <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" aria-hidden />
        or
        <span className="h-px flex-1 bg-border" aria-hidden />
      </div>
      <div className="space-y-2">
        {ids.map((id) => (
          <button key={id} type="button" onClick={() => signIn(id, { callbackUrl })} className="btn-outline w-full">
            {LABELS[id]}
          </button>
        ))}
      </div>
    </>
  );
}
