import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-6 pb-24 pt-24 text-center">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-highlight">Lost in the palace</p>
      <h1 className="text-5xl font-semibold">Page not found</h1>
      <div aria-hidden className="meander-rule mx-auto mt-5 max-w-xs" />
      <p className="mt-5 text-muted-foreground">
        That room doesn&apos;t exist, or it was removed. Head back to a place you know.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link href="/palaces" className="btn-primary">
          Your palaces
        </Link>
        <Link href="/home" className="btn-outline">
          Home
        </Link>
      </div>
    </div>
  );
}
