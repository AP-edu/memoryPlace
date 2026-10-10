"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Footprints, House, Landmark, Layers, LogOut, Palette, Shield, UserRound } from "lucide-react";
import AppearancePicker from "./AppearancePicker";
import Menu from "./ui/Menu";

const TABS = [
  { href: "/home", label: "Home", icon: House, match: (p: string) => p.startsWith("/home") },
  { href: "/practice", label: "Practice", icon: Footprints, match: (p: string) => p.startsWith("/practice") || p.startsWith("/study") || p.startsWith("/walk") },
  { href: "/palaces", label: "Palaces", icon: Landmark, match: (p: string) => p.startsWith("/palaces") || p.startsWith("/rooms") },
  { href: "/decks", label: "Decks", icon: Layers, match: (p: string) => p.startsWith("/decks") || p.startsWith("/quiz") },
] as const;

/** Full-screen routes on phones: no bottom bar over the 3D view. */
const IMMERSIVE = (p: string) => p.startsWith("/walk");

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  // Signed-out / landing pages have no navbar; keep appearance reachable.
  if (!session || pathname === "/" || pathname === "/login" || pathname === "/signup") {
    return (
      <div className="fixed right-4 top-4 z-50">
        <Menu label="Appearance" trigger={<Palette className="h-4 w-4" aria-hidden />} panelClassName="w-72">
          {() => <AppearancePicker compact />}
        </Menu>
      </div>
    );
  }

  const initial = (session.user.name ?? session.user.email ?? "?").trim().charAt(0).toUpperCase();

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur transition-colors print:hidden">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/home" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-foreground" aria-label="MemoryPlace home">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground">
                M
              </span>
              <span className="hidden sm:inline">MemoryPlace</span>
            </Link>
            <div className="hidden items-center gap-1 text-sm sm:flex">
              {TABS.map((t) => {
                const active = t.match(pathname);
                return (
                  <Link
                    key={t.href}
                    href={t.href}
                    aria-current={active ? "page" : undefined}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-colors ${
                      active ? "bg-primary/10 font-semibold text-link" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <t.icon className="h-4 w-4" aria-hidden />
                    {t.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Menu label="Appearance" trigger={<Palette className="h-4 w-4" aria-hidden />} panelClassName="w-72">
              {() => <AppearancePicker compact />}
            </Menu>
            <Menu
              label="Account"
              trigger={
                <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-foreground" aria-hidden>
                  {initial}
                </span>
              }
              panelClassName="w-56"
            >
              {(close) => (
                <div className="text-sm">
                  <p className="truncate px-2 pb-2 pt-1 font-semibold">{session.user.name}</p>
                  <Link href="/profile" onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                    <UserRound className="h-4 w-4" aria-hidden /> Profile &amp; stats
                  </Link>
                  {session.user.role === "admin" && (
                    <Link href="/admin" onClick={close} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted">
                      <Shield className="h-4 w-4" aria-hidden /> Admin
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-destructive hover:bg-destructive/10"
                  >
                    <LogOut className="h-4 w-4" aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </Menu>
          </div>
        </div>
        <div aria-hidden className="meander-rule" />
      </nav>

      {/* Phones: thumb-reach tab bar (hidden in full-screen walk mode). */}
      {!IMMERSIVE(pathname) && (
        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden print:hidden"
        >
          <div className="grid grid-cols-5">
            {[...TABS, { href: "/profile", label: "Profile", icon: UserRound, match: (p: string) => p.startsWith("/profile") }].map((t) => {
              const active = t.match(pathname);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? "text-link" : "text-muted-foreground"}`}
                >
                  <t.icon className={`h-5 w-5 ${active ? "stroke-[2.4]" : ""}`} aria-hidden />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
