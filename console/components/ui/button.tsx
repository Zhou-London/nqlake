"use client";

import { Button as HeroButton, type ButtonProps } from "@heroui/react";
import { cn } from "@/lib/utils";

export function Button({ className, size = "md", ...props }: ButtonProps) {
  return (
    <HeroButton
      size={size}
      className={(state) =>
        cn(
          "gap-2 text-xs font-medium [&_svg]:size-4 [&_svg]:shrink-0",
          size === "sm" ? "h-8" : size === "md" ? "h-9" : "h-11",
          typeof className === "function" ? className(state) : className,
        )
      }
      {...props}
    />
  );
}
