"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  CardIcon,
  CommandPalette,
  IconButton,
  Link,
  MenuItem,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NquiProvider,
  useCommandShortcut,
  useTheme,
} from "@nowquant/nqui";
import { Moon, Search, Sun, Waypoints } from "lucide-react";
import { marketHref, useMarketEntries } from "@/lib/market";

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { resolved, toggle } = useTheme();
  const entries = useMarketEntries();
  const [searching, setSearching] = useState(false);
  useCommandShortcut(() => setSearching((open) => !open));

  return (
    <NquiProvider locale="en-US" navigate={(path) => router.push(path)} useHref={(href) => href}>
      <AppShell
        header={
          <Navbar variant="transparent" position="static">
            <NavbarBrand>
              <Link href="/" variant="foreground" className="gap-2 font-semibold">
                <CardIcon size="sm" color="primary">
                  <Waypoints />
                </CardIcon>
                NQLake MCP
              </Link>
            </NavbarBrand>
            <NavbarContent justify="end">
              <IconButton aria-label="Search" onPress={() => setSearching(true)}>
                <Search />
              </IconButton>
              <IconButton
                aria-label={resolved === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onPress={toggle}
              >
                {resolved === "dark" ? <Sun /> : <Moon />}
              </IconButton>
            </NavbarContent>
          </Navbar>
        }
      >
        {children}
      </AppShell>
      <CommandPalette
        isOpen={searching}
        onOpenChange={setSearching}
        placeholder="Search symbols and tables"
        onAction={(symbol) => {
          setSearching(false);
          router.push(marketHref(String(symbol)));
        }}
      >
        {(entries.data ?? []).map((entry) => (
          <MenuItem
            key={entry.symbol}
            id={entry.symbol}
            textValue={[entry.symbol, ...entry.tables].join(" ")}
            description={entry.tables.join(" · ")}
          >
            {entry.symbol}
          </MenuItem>
        ))}
      </CommandPalette>
    </NquiProvider>
  );
}
