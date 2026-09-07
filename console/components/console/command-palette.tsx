"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Table2 } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { tableHref } from "@/components/console/nav";
import { loadCatalog } from "@/lib/api";
import { useResource } from "@/lib/use-resource";

export function useCommandPalette() {
  const [isOpen, setOpen] = useState(false);
  const open = useCallback(() => setOpen(true), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { isOpen, setOpen, open };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const catalog = useResource(loadCatalog, "catalog", { enabled: open });
  const tables = { ...catalog, data: catalog.data?.tables };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search tables"
      description="Jump to a table"
    >
      <Command>
        <CommandInput placeholder="Search tables…" />
        <CommandList>
          <CommandEmpty>
            {tables.loading
              ? "Loading…"
              : (tables.error ?? "No table matches.")}
          </CommandEmpty>
          {tables.data && tables.data.length > 0 && (
            <CommandGroup heading="Tables">
              {tables.data.map(({ namespace, table }) => (
                <CommandItem
                  key={`${namespace}.${table}`}
                  value={`${namespace}.${table}`}
                  onSelect={() => {
                    onOpenChange(false);
                    router.push(tableHref(namespace, table));
                  }}
                >
                  <Table2 />
                  <span className="text-muted-foreground">{namespace}.</span>
                  <span className="-ml-1.5">{table}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
