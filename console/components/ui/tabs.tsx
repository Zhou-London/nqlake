"use client";

import { Tabs as HeroTabs } from "@heroui/react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export const Tabs = HeroTabs;

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof HeroTabs.Panel>) {
  return <HeroTabs.Panel className={cn("mt-0 p-0", className)} {...props} />;
}

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof HeroTabs.List>) {
  return (
    <HeroTabs.ListContainer className={cn("w-fit max-w-full", className)}>
      <HeroTabs.List {...props} />
    </HeroTabs.ListContainer>
  );
}

export function TabsTrigger({
  children,
  className,
  ...props
}: ComponentProps<typeof HeroTabs.Tab>) {
  return (
    <HeroTabs.Tab
      className={cn("gap-2 whitespace-nowrap text-xs", className)}
      {...props}
    >
      {(state) => (
        <>
          {typeof children === "function" ? children(state) : children}
          <HeroTabs.Indicator />
        </>
      )}
    </HeroTabs.Tab>
  );
}
