"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FeatureSeries, SeriesPoint } from "./features";

export type Loaded<Data> = { data: Data | null; error: string | null; loading: boolean; refresh: () => void };

const URL_SEPARATOR = "\n";
const lastLoaded = new Map<string, unknown[]>();

async function fetchJson<Data>(url: string, signal: AbortSignal): Promise<Data> {
  const response = await fetch(url, { signal });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? response.statusText);
  return body as Data;
}

export function useJsonList<Data>(urls: string[]): Loaded<Data[]> {
  const key = urls.length ? urls.join(URL_SEPARATOR) : null;
  const [state, setState] = useState<{ key: string | null; data: Data[] | null; error: string | null }>(() => ({
    key: key && lastLoaded.has(key) ? key : null,
    data: key ? ((lastLoaded.get(key) as Data[] | undefined) ?? null) : null,
    error: null,
  }));
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  useEffect(() => {
    if (!key) return;
    const request = new AbortController();
    Promise.all(key.split(URL_SEPARATOR).map((url) => fetchJson<Data>(url, request.signal)))
      .then((data) => {
        lastLoaded.set(key, data);
        setState({ key, data, error: null });
      })
      .catch((error: Error) => {
        if (!request.signal.aborted)
          setState((previous) => ({ key, data: previous.key === key ? previous.data : null, error: error.message }));
      });
    return () => request.abort();
  }, [key, attempt]);

  const current = state.key === key;
  return {
    data: current ? state.data : null,
    error: current ? state.error : null,
    loading: key != null && !current,
    refresh,
  };
}

export function useJson<Data>(url: string | null): Loaded<Data> {
  const loaded = useJsonList<Data>(url ? [url] : []);
  return { ...loaded, data: loaded.data?.[0] ?? null };
}

export function useHeld<Data>(scope: string | null, data: Data | null): Data | null {
  const [held, setHeld] = useState({ scope, data });
  if (held.scope !== scope || (data != null && held.data !== data)) setHeld({ scope, data });
  return held.scope === scope ? (data ?? held.data) : data;
}

export type SeriesRequest = { table: string; name: string };
type HeldSeries = { window: string; points: SeriesPoint[] };
type SeriesCache = { symbol: string | null; held: Record<string, HeldSeries>; error: string | null };

const NOTHING_HELD: Record<string, HeldSeries> = {};
const TABLE_SEPARATOR = "/";

export const featureKey = (table: string, name: string) => table + TABLE_SEPARATOR + name;

export function useFeatureSeries(symbol: string | null, from: string | undefined, wanted: SeriesRequest[]) {
  const [cache, setCache] = useState<SeriesCache>({ symbol: null, held: NOTHING_HELD, error: null });
  const requested = useRef({ scope: "", inFlight: new Map<string, AbortController>() });
  const window = from ?? "";
  const held = cache.symbol === symbol ? cache.held : NOTHING_HELD;
  const missing = wanted
    .map((feature) => featureKey(feature.table, feature.name))
    .filter((key) => held[key]?.window !== window)
    .join(URL_SEPARATOR);

  useEffect(() => {
    const { inFlight } = requested.current;
    const scope = symbol + URL_SEPARATOR + window;
    if (requested.current.scope !== scope) {
      for (const request of inFlight.values()) request.abort();
      inFlight.clear();
      requested.current.scope = scope;
    }
    if (!symbol || !missing) return;
    const namesByTable = new Map<string, string[]>();
    for (const key of missing.split(URL_SEPARATOR)) {
      if (inFlight.has(key)) continue;
      const table = key.slice(0, key.indexOf(TABLE_SEPARATOR));
      namesByTable.set(table, [...(namesByTable.get(table) ?? []), key.slice(table.length + 1)]);
    }
    for (const [table, names] of namesByTable) {
      const request = new AbortController();
      const keys = names.map((name) => featureKey(table, name));
      for (const key of keys) inFlight.set(key, request);
      fetchJson<FeatureSeries>(
        `/api/features/${encodeURIComponent(table)}/series?symbol=${encodeURIComponent(symbol)}` +
          `&features=${names.map(encodeURIComponent).join(",")}` +
          (window ? `&from=${encodeURIComponent(window)}` : ""),
        request.signal,
      )
        .then((loaded) =>
          setCache((previous) => ({
            symbol,
            error: null,
            held: {
              ...(previous.symbol === symbol ? previous.held : NOTHING_HELD),
              ...Object.fromEntries(
                loaded.series.map((series) => [featureKey(table, series.feature), { window, points: series.points }]),
              ),
            },
          })),
        )
        .catch((error: Error) => {
          if (!request.signal.aborted)
            setCache((previous) => ({
              symbol,
              error: error.message,
              held: previous.symbol === symbol ? previous.held : NOTHING_HELD,
            }));
        })
        .finally(() => {
          for (const key of keys) if (inFlight.get(key) === request) inFlight.delete(key);
        });
    }
  }, [symbol, window, missing]);

  useEffect(() => {
    const { inFlight } = requested.current;
    return () => {
      for (const request of inFlight.values()) request.abort();
      inFlight.clear();
    };
  }, []);

  return { held, error: cache.symbol === symbol ? cache.error : null };
}
