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
    <nav className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur transition-colors">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <Link href="/home" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground">
            <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">M</span>
            MemoryPlace
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/home" className={linkClass(pathname === "/home" || pathname.startsWith("/home") || pathname.startsWith("/palaces") || pathname.startsWith("/rooms") || pathname.startsWith("/study") || pathname.startsWith("/walk"))}>
              Home
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
        <div className="flex items-center gap-3 text-sm">
          <ThemeToggle />
          <span className="text-muted-foreground">{session.user.name}</span>
          <button onClick={() => signOut({ callbackUrl: "/login" })} className="font-medium text-destructive hover:underline">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}