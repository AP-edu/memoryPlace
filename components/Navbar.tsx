"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import ThemeToggle from "./ThemeToggle";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Signed-out / landing pages have no navbar; keep the theme switch reachable.
  if (!session || pathname === "/" || pathname === "/login" || pathname === "/signup") {
    return <ThemeToggle className="fixed right-4 top-4 z-50 shadow-card" />;
  }

  const linkClass = (active: boolean) =>
    `transition-colors ${active ? "font-semibold text-link" : "text-muted-foreground hover:text-foreground"}`;

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur transition-colors print:hidden">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-6">
          <Link href="/home" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground" aria-label="MemoryPlace home">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">M</span>
            <span className="hidden sm:inline">MemoryPlace</span>
          </Link>
          <div className="flex gap-3 text-sm sm:gap-4">
            <Link href="/home" className={linkClass(pathname.startsWith("/home"))}>
              Home
            </Link>
            <Link
              href="/palaces"
              className={linkClass(
                pathname.startsWith("/palaces") ||
                  pathname.startsWith("/rooms") ||
                  pathname.startsWith("/study") ||
                  pathname.startsWith("/walk")
              )}
            >
              Palaces
            </Link>
            <Link href="/decks" className={linkClass(pathname.startsWith("/decks") || pathname.startsWith("/quiz"))}>
              Decks
            </Link>
            <Link href="/profile" className={linkClass(pathname.startsWith("/profile"))}>
              Profile
            </Link>
            {session.user.role === "admin" && (
              <Link href="/admin" className={linkClass(pathname.startsWith("/admin"))}>
                Admin
              </Link>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm sm:gap-3">
          {/* Phones: the switch lives on the Profile page so the bar fits. */}
          <div className="hidden sm:block">
            <ThemeToggle />
          </div>
          <span className="hidden text-muted-foreground md:inline">{session.user.name}</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="font-medium text-destructive hover:underline">
            Sign out
          </button>
        </div>
      </div>
      <div aria-hidden className="meander-rule" />
    </nav>
  );
}