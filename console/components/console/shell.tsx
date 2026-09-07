"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  CommandPalette,
  useCommandPalette,
} from "@/components/console/command-palette";
import { NAV } from "@/components/console/nav";
import { ThemeToggle } from "@/components/console/theme-toggle";
import { HealthDot } from "@/components/console/health-dot";
import { cn } from "@/lib/utils";

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const palette = useCommandPalette();

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground md:flex">
        <Link href="/" className="flex h-14 items-center gap-2.5 border-b px-4">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Layers className="size-4" />
          </span>
          <span className="font-heading text-sm font-semibold tracking-tight">
            NQ Lake
          </span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                  active
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t p-2">
          <HealthDot />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Layers className="size-4" />
            </span>
          </Link>
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-2 py-1 text-sm",
                  item.match(pathname)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-56 justify-start text-muted-foreground"
              onClick={palette.open}
            >
              <Search data-icon="inline-start" />
              <span className="flex-1 text-left">Search tables</span>
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex h-[calc(100dvh-3.5rem)] min-w-0 flex-1 flex-col overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette open={palette.isOpen} onOpenChange={palette.setOpen} />
    </div>
  );
}
