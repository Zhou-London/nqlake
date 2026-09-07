"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/api";

export type Resource<T> = {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  /** True while a reload runs after data has been shown once. */
  refreshing: boolean;
  reload: () => void;
};

/**
 * Loads a value on mount and whenever `key` changes. Keeps the last value
 * while reloading, so a refresh does not flash an empty page; the caller
 * decides how to show `error` next to stale data.
 */
export function useResource<T>(
  fetcher: () => Promise<T>,
  key: string,
  options: { enabled?: boolean; interval?: number } = {},
): Resource<T> {
  const { enabled = true, interval } = options;
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [refreshing, setRefreshing] = useState(false);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasData = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    fetcherRef
      .current()
      .then((value) => {
        if (cancelled) return;
        hasData.current = true;
        setData(value);
        setError(null);
      })
      .catch((cause) => {
        if (!cancelled) setError(errorMessage(cause));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick, enabled]);

  useEffect(() => {
    if (!interval || !enabled) return;
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [interval, enabled]);

  // A key change starts from scratch: the old value belongs to another resource.
  useEffect(() => {
    hasData.current = false;
    setData(undefined);
    setError(null);
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refreshing, reload };
}
