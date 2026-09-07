"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { useLake } from "@/components/lake-provider";
import { cn } from "@/lib/utils";
import { tableHref } from "@/lib/api";

const links = [
  { href: "/", title: "Overview", icon: LayoutDashboard },
  { href: "/catalog", title: "Data catalog", icon: FolderOpen },
  {
    href: "/query",
    title: "SQL workspace",
    icon: TerminalSquare,
  },
  { href: "/imports", title: "Import data", icon: Upload },
  {
    href: "/services",
    title: "Services",
    icon: Activity,
  },
];
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, tables, loading } = useLake();
  const [menu, setMenu] = useState(false);
  const [search, setSearch] = useState(false);
  const [term, setTerm] = useState("");
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const current =
    links.find((link) =>
      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href),
    ) || links[0];
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(false);
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
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
  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded bg-primary p-3 text-white focus:not-sr-only"
      >
        Skip to content
      </a>
      {menu && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/20 lg:hidden"
          onClick={() => setMenu(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[224px] flex-col border-r bg-[#f8f9fb] transition-transform lg:translate-x-0",
          menu ? "translate-x-0" : "invisible -translate-x-full lg:visible",
        )}
      >
        <Link
          href="/"
          onClick={() => setMenu(false)}
          className="flex h-[76px] items-center gap-2.5 px-6"
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-white">
            <Layers size={21} strokeWidth={1.8} />
          </span>
          <span className="text-xl font-semibold tracking-[-0.8px]">
            NQ Lake<span className="ml-1 text-primary">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-7 flex items-center gap-3 rounded-lg border bg-white px-3 py-3">
          <div className="flex size-8 items-center justify-center rounded-md bg-blue-50 text-primary">
            <Database size={16} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">
              {status?.warehouse || "Local lakehouse"}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              Local workspace
            </p>
          </div>
          <span className="size-1.5 rounded-full bg-primary" />
        </div>
        <div className="px-6 pb-3 eyebrow">Workspace</div>
        <nav aria-label="Main navigation" className="space-y-1 px-3">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenu(false)}
              aria-current={current.href === link.href ? "page" : undefined}
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-3 text-[13px] transition-colors",
                index === 4 && "mt-6",
                current.href === link.href
                  ? "bg-[#eaf0ff] font-medium text-primary"
                  : "text-[#687183] hover:bg-[#edf0f5] hover:text-foreground",
              )}
            >
              <link.icon size={17} strokeWidth={1.7} />
              {link.title}
              {link.href === "/catalog" && tables.length > 0 && (
                <span className="ml-auto text-[10px]">{tables.length}</span>
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-4 pb-4">
          <button
            onClick={() => setHelp(true)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-xs text-muted-foreground hover:bg-muted"
          >
            <BookOpen size={16} />
            User guide
            <ArrowUpRight className="ml-auto" size={13} />
          </button>
        </div>
      </aside>
      <div className="lg:ml-[224px]">
        <header className="sticky top-0 z-20 flex h-[64px] items-center justify-between gap-3 border-b bg-white/95 px-5 backdrop-blur-sm md:px-8">
          <div className="flex items-center gap-3 text-xs">
            <button
              className="lg:hidden"
              aria-label="Open navigation"
              onClick={() => setMenu(true)}
            >
              <Menu size={20} />
            </button>
            <span className="hidden text-muted-foreground sm:inline">
              Workspace
            </span>
            <ChevronRight
              size={13}
              className="hidden text-muted-foreground sm:inline"
            />
            <span>{current.title}</span>
            {pathname.split("/").length > 2 && (
              <ChevronRight size={13} className="text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              aria-label="Search workspace"
              onClick={() => setSearch(true)}
              className="flex h-8 items-center gap-2 rounded-md border bg-muted/50 px-2.5 text-xs text-muted-foreground sm:w-52"
            >
              <Search size={14} />
              <span className="hidden sm:inline">Search tables…</span>
              <kbd className="ml-auto hidden rounded border bg-white px-1 text-[10px] sm:inline">
                ⌘ K
              </kbd>
            </button>
            <Link
              href="/services"
              className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  loading
                    ? "bg-slate-300"
                    : status?.ok
                      ? "bg-emerald-500"
                      : "bg-amber-500",
                )}
              />
              {loading
                ? "Connecting"
                : status?.ok
                  ? "All systems operational"
                  : status
                    ? "Service issue"
                    : "Disconnected"}
            </Link>
          </div>
        </header>
        <main
          id="main-content"
          className="page-enter mx-auto max-w-[1600px] px-5 py-7 md:px-8 lg:px-9 lg:py-9"
        >
          {children}
        </main>
        <footer className="mx-5 mt-6 flex flex-wrap items-center justify-between gap-3 border-t py-5 text-[10px] text-muted-foreground md:mx-8 lg:mx-9">
          <span>NQ Lake Console</span>
          <span>
            Apache Iceberg <span className="mx-2 text-border">/</span> DuckDB{" "}
            <span className="mx-2 text-border">/</span> An open, lightweight
            lakehouse
          </span>
        </footer>
      </div>
      <Dialog open={search} onOpenChange={setSearch}>
        <DialogContent className="sm:max-w-lg">
          <DialogTitle>Search workspace</DialogTitle>
          <DialogDescription>Find tables or jump to a page.</DialogDescription>
          <Input
            ref={searchRef}
            aria-label="Search tables"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Enter a table or namespace…"
          />
          <div className="max-h-80 space-y-1 overflow-y-auto">
            {tables
              .filter((t) =>
                `${t.namespace}.${t.name}`
                  .toLowerCase()
                  .includes(term.toLowerCase()),
              )
              .slice(0, 12)
              .map((t) => (
                <button
                  key={`${t.namespace}.${t.name}`}
                  onClick={() => navigate(tableHref(t.namespace, t.name))}
                  className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-muted"
                >
                  <Database size={16} className="text-primary" />
                  <span>
                    {t.name}
                    <small className="ml-3 text-muted-foreground">
                      {t.namespace}
                    </small>
                  </span>
                  <ChevronRight size={14} className="ml-auto" />
                </button>
              ))}
            {links
              .filter((l) => l.title.toLowerCase().includes(term.toLowerCase()))
              .map((l) => (
                <button
                  key={l.href}
                  onClick={() => navigate(l.href)}
                  className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-muted"
                >
                  <l.icon size={16} className="text-muted-foreground" />
                  {l.title}
                  <ArrowUpRight
                    size={14}
                    className="ml-auto text-muted-foreground"
                  />
                </button>
              ))}
            {term &&
              !tables.some((t) =>
                `${t.namespace}.${t.name}`
                  .toLowerCase()
                  .includes(term.toLowerCase()),
              ) &&
              !links.some((l) =>
                l.title.toLowerCase().includes(term.toLowerCase()),
              ) && (
                <p className="py-8 text-center text-muted-foreground">
                  No matching results
                </p>
              )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
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
            <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
              Shortcuts: Cmd/Ctrl + K to search; Cmd/Ctrl + Enter to run SQL.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
