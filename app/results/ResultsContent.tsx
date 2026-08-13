"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResultsContent() {
  const params = useSearchParams();
  const score = params.get("score");
  const total = params.get("total");

  return (
    <div className="mx-auto max-w-md p-6 pb-20 text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-accent">
        The chamber has been visited
      </p>
      <h1 className="text-4xl font-semibold">Quiz Complete!</h1>
      <p className="mt-6 font-display text-6xl text-primary">
        {score} <span className="text-3xl text-muted-foreground">/ {total}</span>
      </p>
      <p className="mt-6">
        <Link href="/dashboard" className="btn-outline">
          Back to Dashboard
        </Link>
      </p>
    </div>
  );
}