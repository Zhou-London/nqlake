import { formatNumber } from "@nowquant/nqui";

export const number = (value: number | null | undefined) =>
  value == null ? "—" : formatNumber(value);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "No snapshots";
