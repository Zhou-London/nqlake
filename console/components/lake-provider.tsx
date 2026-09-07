"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { api, tablePath, type LakeTable, type Status } from "@/lib/api";

type LakeState = {
  status: Status | null;
  namespaces: string[];
  tables: LakeTable[];
  loading: boolean;
  error: string | null;
  statusError: string | null;
  updated: Date | null;
  refresh: () => Promise<void>;
};
const Context = createContext<LakeState | null>(null);
export function LakeProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [tables, setTables] = useState<LakeTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const active = useRef(false);
  const refresh = useCallback(async () => {
    if (active.current) return;
    active.current = true;
    setLoading(true);
    await Promise.allSettled([
      api<Status>("/status")
        .then((value) => {
          setStatus(value);
          setStatusError(null);
        })
        .catch((err) => {
          setStatus(null);
          setStatusError(err.message);
        }),
      (async () => {
        try {
          const ns = await api<string[]>("/namespaces");
          const entries: { namespace: string; name: string }[] = [];
          for (const namespace of ns) {
            const names = await api<string[]>(
              `/namespaces/${encodeURIComponent(namespace)}/tables`,
            );
            entries.push(...names.map((name) => ({ namespace, name })));
          }
          const records: LakeTable[] = [];
          for (let i = 0; i < entries.length; i += 8) {
            records.push(
              ...(await Promise.all(
                entries
                  .slice(i, i + 8)
                  .map(({ namespace, name }) =>
                    api<LakeTable>(tablePath(namespace, name)),
                  ),
              )),
            );
          }
          setNamespaces(ns);
          setTables(records);
          setError(null);
          setUpdated(new Date());
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Could not load the catalog.",
          );
        }
      })(),
    ]);
    setLoading(false);
    active.current = false;
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return (
    <Context.Provider
      value={{
        status,
        namespaces,
        tables,
        loading,
        error,
        statusError,
        updated,
        refresh,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLake() {
  const value = useContext(Context);
  if (!value) throw new Error("LakeProvider is required");
  return value;
}
