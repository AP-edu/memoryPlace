"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { initialPlacement, storedSize, type UnderlayPlacement } from "@/lib/underlay";

// A tracing image per palace level, kept in this browser (IndexedDB): it's a
// drawing aid, not palace data, so it never leaves the device.

const DB = "memoryplace";
const STORE = "underlays";


function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}

/** Downscale a photo for storage (white behind transparency: plans are drawn on paper). */
async function shrink(file: Blob): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const { w, h } = storedSize(bmp.width, bmp.height);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", 0.9));
  return { blob, w, h };
}

export interface UnderlayState {
  /** Object URL of the image, or null. */
  url: string | null;
  place: UnderlayPlacement | null;
  /** Pick a file: stored downscaled, placed over the current view. */
  load: (file: File, view: { cx: number; cz: number; widthM: number; heightM: number }) => Promise<void>;
  /** Change the placement (saved). */
  update: (place: UnderlayPlacement) => void;
  remove: () => void;
  error: string | null;
}

export function useUnderlay(palaceId: string, levelId: string | null | undefined): UnderlayState {
  const key = levelId ? `${palaceId}:${levelId}` : null;
  const [state, setState] = useState<{ key: string | null; url: string | null; blob: Blob | null; place: UnderlayPlacement | null }>({
    key: null,
    url: null,
    blob: null,
    place: null,
  });
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const show = useCallback((k: string | null, blob: Blob | null, place: UnderlayPlacement | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = blob ? URL.createObjectURL(blob) : null;
    urlRef.current = url;
    setState({ key: k, url, blob, place });
  }, []);

  useEffect(() => {
    if (!key || typeof indexedDB === "undefined") return;
    let cancelled = false;
    // The image and its placement are stored apart: moving or fading it
    // rewrites a few numbers, not the picture.
    Promise.all([tx<Blob | undefined>("readonly", (s) => s.get(key)), tx<UnderlayPlacement | undefined>("readonly", (s) => s.get(`${key}#place`))])
      .then(([blob, place]) => !cancelled && show(key, blob && place ? blob : null, blob && place ? place : null))
      .catch(() => !cancelled && show(key, null, null));
    return () => {
      cancelled = true;
    };
  }, [key, show]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const load = useCallback(
    async (file: File, view: { cx: number; cz: number; widthM: number; heightM: number }) => {
      if (!key) return;
      setError(null);
      try {
        const { blob, w, h } = await shrink(file);
        const place = initialPlacement(w, h, view);
        await tx("readwrite", (s) => s.put(blob, key));
        await tx("readwrite", (s) => s.put(place, `${key}#place`));
        show(key, blob, place);
      } catch {
        setError("Couldn't read that image. Try a PNG or JPEG.");
      }
    },
    [key, show]
  );

  const update = useCallback(
    (place: UnderlayPlacement) => {
      if (!key || !state.blob || state.key !== key) return;
      setState((s) => ({ ...s, place }));
      void tx("readwrite", (s) => s.put(place, `${key}#place`)).catch(() => undefined);
    },
    [key, state.blob, state.key]
  );

  const remove = useCallback(() => {
    if (!key) return;
    void tx("readwrite", (s) => s.delete(key)).catch(() => undefined);
    void tx("readwrite", (s) => s.delete(`${key}#place`)).catch(() => undefined);
    show(key, null, null);
  }, [key, show]);

  const current = state.key === key;
  return { url: current ? state.url : null, place: current ? state.place : null, load, update, remove, error };
}
