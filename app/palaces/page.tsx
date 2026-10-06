"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Palace list has moved into /home (Phase E: Palace Overview becomes home).
// Keep this route as a redirect shim for bookmarks.
export default function PalacesRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/home");
  }, [router]);
  return <p className="p-6 text-muted-foreground">Palaces moved home…</p>;
}
