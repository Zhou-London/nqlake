"use client";

import { useMemo } from "react";
import { Button, Menu, MenuItem, MenuSection, MenuTrigger } from "@nowquant/nqui";
import { ChevronDown } from "lucide-react";
import type { CatalogFeature } from "@/lib/market";
import { featureKey } from "@/lib/use-json";

export function FeatureMenu({
  catalog,
  chosen,
  onChange,
}: {
  catalog: CatalogFeature[];
  chosen: string[];
  onChange: (keys: string[]) => void;
}) {
  const sections = useMemo(() => {
    const tables = [...new Set(catalog.map((feature) => feature.table))];
    return tables.flatMap((table) =>
      [...new Set(catalog.filter((feature) => feature.table === table).map((feature) => feature.group))].map((group) => ({
        id: featureKey(table, group),
        title: tables.length > 1 ? `${table} · ${group}` : group,
        features: catalog.filter((feature) => feature.table === table && feature.group === group),
      })),
    );
  }, [catalog]);

  return (
    <MenuTrigger>
      <Button variant="outline" size="sm" isDisabled={!catalog.length} endContent={<ChevronDown />}>
        Features · {chosen.length}
      </Button>
      <Menu
        aria-label="Features"
        selectionMode="multiple"
        selectedKeys={chosen}
        onSelectionChange={(keys) => onChange(keys === "all" ? catalog.map((feature) => feature.key) : [...keys].map(String))}
        popoverProps={{ placement: "bottom end" }}
      >
        {sections.map((section) => (
          <MenuSection key={section.id} title={section.title}>
            {section.features.map((feature) => (
              <MenuItem key={feature.key} id={feature.key}>
                {feature.term}
              </MenuItem>
            ))}
          </MenuSection>
        ))}
      </Menu>
    </MenuTrigger>
  );
}
