import {
  Activity,
  Database,
  FolderTree,
  Terminal,
  Upload,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
};

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: Activity, match: (p) => p === "/" },
  {
    href: "/tables",
    label: "Tables",
    icon: Database,
    match: (p) => p.startsWith("/tables"),
  },
  {
    href: "/namespaces",
    label: "Namespaces",
    icon: FolderTree,
    match: (p) => p.startsWith("/namespaces"),
  },
  {
    href: "/import",
    label: "Import",
    icon: Upload,
    match: (p) => p.startsWith("/import"),
  },
  {
    href: "/sql",
    label: "SQL",
    icon: Terminal,
    match: (p) => p.startsWith("/sql"),
  },
];

export function tableHref(namespace: string, table: string): string {
  return `/tables/${encodeURIComponent(namespace)}/${encodeURIComponent(table)}`;
}
