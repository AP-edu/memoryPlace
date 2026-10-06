"use client";
import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function Home() {
  const { status } = useSession();
  const router = useRouter();

  // Signed-in users get the dedicated homepage; this route stays the
  // logged-out landing.
  useEffect(() => {
    if (status === "authenticated") router.replace("/home");
  }, [status, router]);

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-28 text-center">
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-highlight">
        A memory palace for your studies
      </p>
      <h1 className="text-5xl font-semibold leading-tight sm:text-6xl">MemoryPlace</h1>
      <p className="mx-auto mb-10 mt-5 max-w-md text-muted-foreground">
        Organize your study material into courses, decks, and flashcards — then quiz yourself in the palace.
      </p>
      <div className="flex justify-center gap-4">
        <Link href="/login" className="btn-primary">
          Log In
        </Link>
        <Link href="/signup" className="btn-outline">
          Sign Up
        </Link>
      </div>
    </div>
  );
}
