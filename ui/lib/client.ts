"use client";

import { useCallback, useEffect, useState } from "react";

/** Polls a JSON endpoint; pass intervalMs 0 to fetch once. `refresh` fetches now. */
export function usePoll<T>(url: string, intervalMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      fetch(url, { cache: "no-store" })
        .then((res) => res.json())
        .then((body: T) => {
          if (alive) setData(body);
        })
        .catch(() => {
          /* the next tick retries */
        });
    tick();
    const id = intervalMs > 0 ? setInterval(tick, intervalMs) : null;
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [url, intervalMs, generation]);

  const refresh = useCallback(() => setGeneration((g) => g + 1), []);
  return { data, refresh };
}

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  return (await res.json()) as T;
}

export async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T;
}

/**
 * Sends a file as the raw request body. XMLHttpRequest rather than fetch
 * because only it reports upload progress.
 */
export function uploadFile<T>(url: string, file: File, onProgress: (fraction: number) => void): Promise<T> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText) as T);
      } catch {
        resolve({ ok: false, error: `upload failed (HTTP ${xhr.status})` } as T);
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "upload failed" } as T);
    xhr.send(file);
  });
}

export function formatBytes(n: number): string {
  if (n >= 1 << 30) return `${(n / (1 << 30)).toFixed(2)} GiB`;
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MiB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(1)} KiB`;
  return `${n} B`;
}
