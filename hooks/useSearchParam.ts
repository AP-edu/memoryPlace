"use client";
import { useSyncExternalStore } from "react";

// Read a query param on the client without useSearchParams (which forces a
// Suspense boundary on static pages). The server snapshot is null, so the
// hydrated markup matches the server and the real value applies right after.
const noop = () => () => {};

export function useSearchParam(name: string): string | null {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get(name),
    () => null
  );
}
