"use client";
import { AlertCircle, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
      <div>
        {eyebrow.toLowerCase() !== title.toLowerCase() && (
          <p className="eyebrow mb-2.5">{eyebrow}</p>
        )}
        <h1 className="text-[26px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200/70 bg-amber-50/60 px-4 py-3 text-xs text-amber-800"
    >
      <AlertCircle size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 break-words">{message}</span>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-1.5 font-medium"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      )}
    </div>
  );
}
export function EmptyState({
  icon: Icon = Database,
  title,
  description,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[230px] flex-col items-center justify-center px-5 py-9 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl border bg-[#f8faff] text-primary">
        <Icon size={23} strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mb-5 mt-2 max-w-sm text-xs leading-6 text-muted-foreground">
        {description}
      </p>
      {children}
    </div>
  );
}
export function LoadingState() {
  return (
    <div role="status" aria-label="Loading" className="space-y-4 p-5">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
export function RefreshButton({
  loading,
  onClick,
}: {
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button variant="outline" disabled={loading} onClick={onClick}>
      <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
      Refresh
    </Button>
  );
}
