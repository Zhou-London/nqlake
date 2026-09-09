"use client";
import { Alert, Skeleton } from "@heroui/react";
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
        {!!eyebrow && eyebrow.toLowerCase() !== title.toLowerCase() && (
          <p className="eyebrow mb-2.5">{eyebrow}</p>
        )}
        <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      )}
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
    <Alert
      status="warning"
      role="alert"
      className="mb-5 items-center rounded-xl text-xs"
    >
      <Alert.Indicator>
        <AlertCircle size={17} />
      </Alert.Indicator>
      <Alert.Content>
        <Alert.Description className="break-words text-xs leading-5">
          {message}
        </Alert.Description>
      </Alert.Content>
      {onRetry && (
        <Button variant="ghost" size="sm" onPress={onRetry}>
          <RefreshCw />
          Retry
        </Button>
      )}
    </Alert>
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
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-blue-100 bg-accent-soft text-primary">
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
        <Skeleton key={i} className="h-10 rounded-lg" />
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
    <Button variant="tertiary" isDisabled={loading} onPress={onClick}>
      <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
      Refresh
    </Button>
  );
}
