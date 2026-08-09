
"use client";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function ResultsPage() {
  const params = useSearchParams();
  const score = params.get("score");
  const total = params.get("total");

  return (
    <div className="max-w-md mx-auto p-6 text-center mt-10">
      <h1 className="text-2xl font-bold mb-2">Quiz Complete!</h1>
      <p className="text-lg mb-6">
        You scored {score} / {total}
      </p>
      <Link href="/dashboard" className="text-blue-600 hover:underline">
        Back to Dashboard
      </Link>
    </div>
  );
}