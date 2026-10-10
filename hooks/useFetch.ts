"use client";
import { useState, useEffect, useCallback } from "react";

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useFetch<T>(url: string | null): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  // A new URL never shows the previous URL's data (e.g. the palace tour moving
  // to the next room): reset during render, before anything reads it.
  const [prevUrl, setPrevUrl] = useState(url);
  if (url !== prevUrl) {
    setPrevUrl(url);
    setData(null);
    setError(null);
    setLoading(!!url);
  }

  const refetch = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          // Surface the server's message (and tell expired sessions apart)
          // instead of a bare "Request failed".
          let msg = res.status === 401 ? "Your session expired. Please log in again." : "Request failed";
          try {
            const body = await res.json();
            if (body && typeof body.error === "string" && res.status !== 401) msg = body.error;
          } catch {
            // non-JSON error body: keep the generic message
          }
          throw new Error(msg);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, refreshKey]);

  return { data, loading, error, refetch };
}