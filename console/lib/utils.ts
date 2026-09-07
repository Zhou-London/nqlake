import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const number = (value: number | null | undefined) =>
  value == null ? "—" : new Intl.NumberFormat("en-US").format(value);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "No snapshots";
