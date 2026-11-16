import { formatCompact, formatDelta, formatFixed } from "@nowquant/nqui";

const MOST_FIXED_DECIMALS = 6;
const EXPONENT_DIGITS = 2;

const utcMinutes = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export const utc = (instant: string) => `${utcMinutes.format(new Date(instant))} UTC`;

export const utcSeconds = (epochSeconds: number) => utc(new Date(epochSeconds * 1000).toISOString());

export const compact = (value: number | null | undefined) => (value == null ? "—" : formatCompact(value));

export const decimalsFor = (spread: number | null | undefined) =>
  spread ? Math.max(0, 2 - Math.floor(Math.log10(spread))) : 2;

export function scaled(value: number | null | undefined, decimals: number): string {
  if (value == null) return "—";
  return decimals > MOST_FIXED_DECIMALS ? value.toExponential(EXPONENT_DIGITS) : formatFixed(value, decimals);
}

export function signed(value: number | null | undefined, decimals: number): string {
  if (value == null) return "—";
  if (decimals > MOST_FIXED_DECIMALS) return `${value > 0 ? "+" : ""}${value.toExponential(EXPONENT_DIGITS)}`;
  return formatDelta(value, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
