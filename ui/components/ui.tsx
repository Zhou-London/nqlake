import type { ReactNode } from "react";

export type Tone = "ok" | "warn" | "err" | "muted" | "accent";

const DOT: Record<Tone, string> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  muted: "bg-ink-3",
  accent: "bg-accent",
};

const BADGE: Record<Tone, string> = {
  ok: "bg-ok-weak text-ok",
  warn: "bg-warn-weak text-warn",
  err: "bg-err-weak text-err",
  muted: "bg-background text-ink-2",
  accent: "bg-accent-weak text-accent-strong",
};

export function StatusBadge({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${BADGE[tone]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[tone]}`} />
      {label}
    </span>
  );
}

export function Panel({
  title,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-[0_1px_2px_rgba(15,23,42,0.04)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "accent",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "err" ? "text-err" : "text-ink"}`}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-ink-3">{hint}</div>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  kind = "secondary",
  disabled = false,
  small = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  kind?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  small?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const size = small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm";
  const look = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "border border-line bg-surface text-ink-2 hover:border-accent hover:text-accent-strong",
    danger: "border border-line bg-surface text-err hover:border-err hover:bg-err-weak",
  }[kind];
  return (
    <button className={`${base} ${size} ${look}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function Spinner() {
  return (
    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent align-middle" />
  );
}
