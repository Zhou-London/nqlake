"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, className: "h-4 w-4" };

const NAV = [
  {
    href: "/",
    label: "Overview",
    icon: (
      <svg viewBox="0 0 20 20" {...STROKE}>
        <rect x="3" y="3" width="6" height="6" rx="1.5" />
        <rect x="11" y="3" width="6" height="6" rx="1.5" />
        <rect x="3" y="11" width="6" height="6" rx="1.5" />
        <rect x="11" y="11" width="6" height="6" rx="1.5" />
      </svg>
    ),
  },
  {
    href: "/tables",
    label: "Tables",
    icon: (
      <svg viewBox="0 0 20 20" {...STROKE}>
        <rect x="3" y="4" width="14" height="12" rx="1.5" />
        <path d="M3 8h14M3 12h14M8 8v8" />
      </svg>
    ),
  },
  {
    href: "/sql",
    label: "SQL",
    icon: (
      <svg viewBox="0 0 20 20" {...STROKE}>
        <path d="M4 6l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 15h6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: "/ports",
    label: "Ports",
    icon: (
      <svg viewBox="0 0 20 20" {...STROKE}>
        <path d="M3 6h14M3 10h14M3 14h14" strokeLinecap="round" />
        <circle cx="7" cy="6" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="13" cy="10" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="8.5" cy="14" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 flex w-56 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2.5 px-5 pb-4 pt-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-sky-400 text-[11px] font-bold tracking-tight text-white">
          NQ
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold text-ink">NQ Lake</div>
          <div className="text-[11px] text-ink-3">Lakehouse Console</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                active ? "bg-accent-weak text-accent-strong" : "text-ink-2 hover:bg-background hover:text-ink"
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">
        MinIO · Lakekeeper
        <br />
        Iceberg · Parquet · DuckDB
      </div>
    </aside>
  );
}
