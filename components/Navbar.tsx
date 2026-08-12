"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

export default function Navbar() {
  const { data: session } = useSession();
  const pathname = usePathname();

  if (!session) return null;
  if (pathname === "/" || pathname === "/login" || pathname === "/signup") return null;

  const linkClass = (active: boolean) =>
    `hover:text-blue-600 ${active ? "text-blue-600 font-medium" : "text-gray-700"}`;

  return (
    <nav className="border-b bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="font-bold text-lg text-gray-900">
            MemoryPlace
          </Link>
          <div className="flex gap-4 text-sm">
            <Link href="/dashboard" className={linkClass(pathname.startsWith("/dashboard"))}>
              My Courses
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
          <span className="text-gray-600">{session.user.name}</span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-red-600 hover:underline"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}