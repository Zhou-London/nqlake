"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  AppShell,
  Breadcrumb,
  Breadcrumbs,
  Button,
  CardIcon,
  CardRow,
  CardStack,
  Chip,
  CommandItem,
  CommandPalette,
  CommandSection,
  Dialog,
  DialogBody,
  DialogHeader,
  IconButton,
  Kbd,
  Link,
  Modal,
  Navbar,
  NavbarContent,
  NquiProvider,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarItem,
  SidebarTrigger,
  StatusDot,
  useCommandShortcut,
  useTheme,
} from "@nowquant/nqui";
import {
  Activity,
  BookOpen,
  Database,
  FolderOpen,
  LayoutDashboard,
  Layers,
  Moon,
  Search,
  Sun,
  TerminalSquare,
  Upload,
} from "lucide-react";
import { useLake } from "@/components/lake-provider";
import { tableHref } from "@/lib/api";

const links = [
  { href: "/", title: "Overview", icon: LayoutDashboard },
  { href: "/catalog", title: "Data catalog", icon: FolderOpen },
  { href: "/query", title: "SQL workspace", icon: TerminalSquare },
  { href: "/imports", title: "Import data", icon: Upload },
  { href: "/services", title: "Services", icon: Activity },
];

const guide = [
  {
    icon: <FolderOpen />,
    title: "Organize your data",
    text: "Create a namespace in the catalog to organize tables by domain.",
  },
  {
    icon: <Upload />,
    title: "Import Parquet",
    text: "Choose a namespace and table, inspect the schema, then import the file.",
  },
  {
    icon: <TerminalSquare />,
    title: "Explore with SQL",
    text: "Query lake.<namespace>.<table> in the SQL workspace and export your results.",
  },
];

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { status, tables, loading } = useLake();
  const { resolved, toggle } = useTheme();
  const [search, setSearch] = useState(false);
  const [help, setHelp] = useState(false);
  const current =
    links.find((link) =>
      link.href === "/" ? pathname === "/" : pathname.startsWith(link.href),
    ) || links[0];
  useCommandShortcut(() => setSearch((value) => !value));

  const health = loading
    ? { status: "pending" as const, label: "Connecting" }
    : status?.ok
      ? { status: "healthy" as const, label: "Systems operational" }
      : status
        ? { status: "degraded" as const, label: "Service issue" }
        : { status: "down" as const, label: "Disconnected" };

  return (
    <NquiProvider
      locale="en-US"
      navigate={(path) => router.push(path)}
      useHref={(href) => href}
    >
      <AppShell
        sidebar={
          <Sidebar>
            <SidebarHeader>
              <Link
                href="/"
                variant="foreground"
                className="gap-2 font-semibold"
              >
                <CardIcon size="sm" color="primary">
                  <Layers />
                </CardIcon>
                NQ Lake
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup title="Workspace">
                {links.map((link) => (
                  <SidebarItem
                    key={link.href}
                    href={link.href}
                    icon={<link.icon />}
                    isActive={current.href === link.href}
                    badge={
                      link.href === "/catalog" && tables.length > 0 ? (
                        <Chip size="sm" color="neutral">
                          {tables.length}
                        </Chip>
                      ) : undefined
                    }
                  >
                    {link.title}
                  </SidebarItem>
                ))}
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <CardRow
                variant="ghost"
                size="sm"
                icon={<Database />}
                title={status?.warehouse || "Local lakehouse"}
                description="Local workspace"
                showChevron={false}
              />
              <SidebarItem icon={<BookOpen />} onPress={() => setHelp(true)}>
                User guide
              </SidebarItem>
            </SidebarFooter>
          </Sidebar>
        }
        header={
          <Navbar variant="transparent" position="static">
            <SidebarTrigger />
            <Breadcrumbs>
              <Breadcrumb href="/">Workspace</Breadcrumb>
              <Breadcrumb>{current.title}</Breadcrumb>
            </Breadcrumbs>
            <NavbarContent justify="end">
              <Button
                variant="outline"
                color="neutral"
                startContent={<Search />}
                endContent={
                  <Kbd size="sm" keys={["cmd"]}>
                    K
                  </Kbd>
                }
                onPress={() => setSearch(true)}
              >
                <span className="max-sm:hidden">Search workspace…</span>
              </Button>
              <Link href="/services" className="max-lg:hidden">
                <StatusDot
                  status={health.status}
                  pulse={loading}
                  label={health.label}
                />
              </Link>
              <IconButton
                aria-label={
                  resolved === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
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
        isOpen={search}
        onOpenChange={setSearch}
        placeholder="Search tables or jump to a page…"
        onAction={(key) => router.push(String(key))}
      >
        <CommandSection title="Tables">
          {tables.map((table) => (
            <CommandItem
              key={`${table.namespace}.${table.name}`}
              id={tableHref(table.namespace, table.name)}
              textValue={`${table.namespace}.${table.name}`}
              icon={<Database />}
              description={table.namespace}
            >
              {table.name}
            </CommandItem>
          ))}
        </CommandSection>
        <CommandSection title="Pages">
          {links.map((link) => (
            <CommandItem
              key={link.href}
              id={link.href}
              textValue={link.title}
              icon={<link.icon />}
            >
              {link.title}
            </CommandItem>
          ))}
        </CommandSection>
      </CommandPalette>

      <Modal isOpen={help} onOpenChange={setHelp} size="md">
        <Dialog>
          <DialogHeader
            title="From data to insights"
            description="NQ Lake manages data with Apache Iceberg and runs read-only SQL with DuckDB."
            showClose
          />
          <DialogBody className="flex flex-col gap-4">
            <CardStack gap="sm">
              {guide.map((item, index) => (
                <CardRow
                  key={item.title}
                  variant="flat"
                  icon={item.icon}
                  iconColor="primary"
                  title={`0${index + 1} · ${item.title}`}
                  description={item.text}
                  showChevron={false}
                />
              ))}
            </CardStack>
            <p className="flex flex-wrap items-center gap-2 text-muted text-xs">
              Shortcuts:
              <Kbd size="sm" keys={["cmd"]}>
                K
              </Kbd>
              search
              <Kbd size="sm" keys={["cmd"]}>
                ↵
              </Kbd>
              run SQL
            </p>
          </DialogBody>
        </Dialog>
      </Modal>
    </NquiProvider>
  );
}
