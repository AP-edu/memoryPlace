import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-28 text-center">
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.25em] text-accent">
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