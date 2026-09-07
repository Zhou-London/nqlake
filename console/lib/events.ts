"use client";

import { useEffect, useState } from "react";

// A change to the catalog (namespace or table created, dropped, renamed)
// bumps a version every list on screen folds into its resource key.
const target = typeof window === "undefined" ? null : new EventTarget();

export function emitCatalogChange() {
  target?.dispatchEvent(new Event("catalog"));
}

export function useCatalogVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    target?.addEventListener("catalog", bump);
    return () => target?.removeEventListener("catalog", bump);
  }, []);
  return version;
}
