"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Chip, Kbd } from "@heroui/react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  ChevronRight,
  Database,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Menu,
  Search,
  TerminalSquare,
  Upload,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLake } from "@/components/lake-provider";
import { cn } from "@/lib/utils";
import { tableHref } from "@/lib/api";

const links = [
  { href: "/", title: "Overview", icon: LayoutDashboard },
  { href: "/catalog", title: "Data catalog", icon: FolderOpen },
  { href: "/query", title: "SQL workspace", icon: TerminalSquare },
  { href: "/imports", title: "Import data", icon: Upload },
  { href: "/services", title: "Services", icon: Activity },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, tables, loading } = useLake();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [term, setTerm] = useState("");
  const [help, setHelp] = useState(false);
  const current =
    links.find((link) =>
      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href),
    ) || links[0];
  const matchingTables = tables
    .filter((t) =>
      `${t.namespace}.${t.name}`.toLowerCase().includes(term.toLowerCase()),
    )
    .slice(0, 12);
  const matchingPages = links.filter((link) =>
    link.title.toLowerCase().includes(term.toLowerCase()),
  );

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearch((value) => !value);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);

  function navigate(href: string) {
    router.push(href);
    setSearch(false);
    setTerm("");
    setMenu(false);
  }

  const navigation = (
    <nav aria-label="Main navigation" className="space-y-1.5">
      {links.map((link, index) => (
        <Link
          key={link.href}
          href={link.href}
          onClick={() => setMenu(false)}
          aria-current={current.href === link.href ? "page" : undefined}
          className={cn(
            "group flex h-11 items-center gap-3 rounded-xl px-3.5 text-[13px] transition-colors",
            index === 4 && "mt-6",
            current.href === link.href
              ? "bg-accent-soft font-semibold text-primary"
              : "text-muted-foreground hover:bg-surface-secondary hover:text-foreground",
          )}
        >
          <link.icon size={18} strokeWidth={1.8} />
          {link.title}
          {link.href === "/catalog" && tables.length > 0 && (
            <Chip
              size="sm"
              variant="soft"
              color={current.href === link.href ? "accent" : "default"}
              className="ml-auto h-5 text-[10px]"
            >
              {tables.length}
            </Chip>
          )}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-primary p-3 text-white focus:not-sr-only"
      >
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r bg-surface lg:flex">
        <Link href="/" className="flex h-24 items-center gap-3 px-6">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white shadow-md shadow-blue-500/20">
            <Layers size={24} strokeWidth={1.8} />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            NQ Lake<span className="text-primary">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-8 flex items-center gap-3 rounded-xl border bg-background/70 p-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-surface text-primary">
            <Database size={17} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {status?.warehouse || "Local lakehouse"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Local workspace
            </p>
          </div>
        </div>
        <p className="eyebrow px-7 pb-3">Workspace</p>
        <div className="px-4">{navigation}</div>
        <div className="mt-auto p-4">
          <div className="rounded-xl border bg-background/70 p-4">
            <BookOpen size={18} className="mb-3 text-muted-foreground" />
            <p className="text-xs font-medium">Make yourself at home</p>
            <p className="mt-1.5 text-[11px] leading-5 text-muted-foreground">
              A quick guide to your lakehouse.
            </p>
            <Button
              variant="ghost"
              className="mt-2 h-8 w-full justify-between px-0 text-primary"
              onPress={() => setHelp(true)}
            >
              User guide <ArrowUpRight />
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col lg:ml-[248px]">
        <header className="sticky top-0 z-20 flex h-[72px] shrink-0 items-center justify-between gap-3 border-b bg-surface/90 px-4 backdrop-blur-xl sm:px-6 lg:px-9">
          <div className="flex min-w-0 items-center gap-3 text-xs">
            <Button
              variant="ghost"
              isIconOnly
              className="lg:hidden"
              aria-label="Open navigation"
              onPress={() => setMenu(true)}
            >
              <Menu />
            </Button>
            <span className="hidden text-muted-foreground sm:inline">
              Workspace
            </span>
            <ChevronRight
              size={13}
              className="hidden text-muted-foreground sm:inline"
            />
            <span className="truncate font-medium">{current.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="tertiary"
              aria-label="Search workspace"
              onPress={() => setSearch(true)}
              className="justify-start text-muted-foreground sm:w-60"
            >
              <Search />
              <span className="hidden sm:inline">Search workspace…</span>
              <Kbd className="ml-auto hidden h-5 min-h-0 px-1.5 text-[10px] sm:inline-flex">
                ⌘ K
              </Kbd>
            </Button>
            <Link href="/services" className="hidden xl:block">
              <Chip
                size="sm"
                variant="soft"
                color={loading ? "default" : status?.ok ? "success" : "warning"}
              >
                <span
                  className={cn(
                    "mr-1.5 size-1.5 rounded-full",
                    loading
                      ? "bg-slate-400"
                      : status?.ok
                        ? "bg-emerald-500"
                        : "bg-amber-500",
                  )}
                />
                {loading
                  ? "Connecting"
                  : status?.ok
                    ? "Systems operational"
                    : status
                      ? "Service issue"
                      : "Disconnected"}
              </Chip>
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="page-enter mx-auto w-full max-w-[1600px] flex-1 px-4 py-7 outline-none sm:px-6 lg:px-9 lg:py-9"
        >
          {children}
        </main>
        <footer className="mx-4 mt-6 flex flex-wrap items-center justify-between gap-3 border-t py-5 text-[10px] text-muted-foreground sm:mx-6 lg:mx-9">
          <span className="flex items-center gap-2">
            <Layers size={13} />
            NQ Lake Console
          </span>
          <span>
            Apache Iceberg <span className="mx-2 text-border">/</span> DuckDB
          </span>
        </footer>
      </div>

      <Dialog isOpen={menu} onOpenChange={setMenu}>
        <DialogContent>
          <DialogTitle>Workspace navigation</DialogTitle>
          {navigation}
          <Button
            variant="tertiary"
            onPress={() => {
              setMenu(false);
              setHelp(true);
            }}
          >
            <BookOpen />
            User guide
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog isOpen={search} onOpenChange={setSearch}>
        <DialogContent>
          <DialogTitle>Search workspace</DialogTitle>
          <DialogDescription>Find tables or jump to a page.</DialogDescription>
          <Input
            aria-label="Search tables"
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Enter a table or namespace…"
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {matchingTables.map((table) => (
              <Button
                key={`${table.namespace}.${table.name}`}
                variant="ghost"
                onPress={() => navigate(tableHref(table.namespace, table.name))}
                className="h-12 w-full justify-start"
              >
                <Database className="text-primary" />
                <span className="truncate">
                  {table.name}
                  <small className="ml-3 text-muted-foreground">
                    {table.namespace}
                  </small>
                </span>
                <ChevronRight className="ml-auto" />
              </Button>
            ))}
            {matchingPages.map((link) => (
              <Button
                key={link.href}
                variant="ghost"
                onPress={() => navigate(link.href)}
                className="h-12 w-full justify-start"
              >
                <link.icon className="text-muted-foreground" />
                {link.title}
                <ArrowUpRight className="ml-auto text-muted-foreground" />
              </Button>
            ))}
            {!matchingTables.length && !matchingPages.length && (
              <p className="py-8 text-center text-muted-foreground">
                No matching results
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog isOpen={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>From data to insights</DialogTitle>
          <DialogDescription>
            NQ Lake manages data with Apache Iceberg and runs read-only SQL with
            DuckDB.
          </DialogDescription>
          <div className="space-y-5 py-3">
            {[
              {
                title: "01 · Organize your data",
                text: "Create a namespace in the catalog to organize tables by domain.",
              },
              {
                title: "02 · Import Parquet",
                text: "Choose a namespace and table, inspect the schema, then import the file.",
              },
              {
                title: "03 · Explore with SQL",
                text: "Query lake.<namespace>.<table> in the SQL workspace and export your results.",
              },
            ].map((item) => (
              <div key={item.title}>
                <h3 className="mb-1 text-sm font-medium">{item.title}</h3>
                <p className="text-xs leading-6 text-muted-foreground">
                  {item.text}
                </p>
              </div>
            ))}
            <p className="rounded-xl bg-surface-secondary p-3 text-xs leading-6 text-muted-foreground">
              Shortcuts: Cmd/Ctrl + K to search; Cmd/Ctrl + Enter to run SQL.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
