"use client";

import { Input as HeroInput, type InputProps } from "@heroui/react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputProps) {
  return (
    <HeroInput
      className={(state) =>
        cn(
          "h-9 w-full min-w-0 text-sm",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}
