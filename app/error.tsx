"use client";
import { useEffect } from "react";
import Link from "next/link";

// Route-level error boundary. In this Next version the recovery callback is
// `retry` (not `reset`): it re-fetches and re-renders the segment.
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto max-w-lg px-6 pb-24 pt-24 text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-highlight">Something cracked</p>
      <h1 className="text-4xl font-semibold">That didn&apos;t load</h1>
      <div aria-hidden className="meander-rule mx-auto mt-5 max-w-xs" />
      <p className="mt-5 text-muted-foreground">
        Something went wrong on our side. Your palaces and cards are safe — try again, or head back.
      </p>
      {error.digest && <p className="mt-2 text-xs text-muted-foreground">Reference: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-3">
        <button onClick={() => retry()} className="btn-primary">
          Try again
        </button>
        <Link href="/palaces" className="btn-outline">
          Your palaces
        </Link>
      </div>
    </div>
  );
}
