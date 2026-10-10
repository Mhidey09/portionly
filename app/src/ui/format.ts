/** Small pure formatting helpers for user facing text. */

/** Smallest units (6 decimals) as dollars, rounded down to cents, with commas: 1234500000n gives "$1,234.50". */
export function formatUsd(micro: bigint): string {
  const negative = micro < 0n;
  const abs = negative ? -micro : micro;
  const cents = abs / 10_000n;
  const whole = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (cents % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${whole}.${fraction}`;
}

/** Cut a decimal string to at most `max` places and drop trailing zeros: "1.2300000" gives "1.23". */
export function trimDecimals(value: string, max: number): string {
  const [whole, fraction = ""] = value.split(".");
  const cut = fraction.slice(0, max).replace(/0+$/, "");
  return cut === "" ? whole : `${whole}.${cut}`;
}

/** 0x1234…abcd. Only for the Account details area. */
export function shortAddress(value: string): string {
  return value.length <= 12 ? value : `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export function lockLabel(days: number): string {
  if (days === 0) return "No lock";
  if (days === 365) return "1 year";
  const months = days / 30;
  return `${months} month${months === 1 ? "" : "s"}`;
}

/** Keep only digits and one dot, at most 2 decimals, for the amount field. */
export function cleanAmountInput(text: string): string {
  const stripped = text.replace(/[^0-9.]/g, "");
  const dot = stripped.indexOf(".");
  if (dot === -1) return stripped.slice(0, 9);
  const whole = stripped.slice(0, dot).slice(0, 9);
  const fraction = stripped.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  return `${whole}.${fraction}`;
}

export function initialOf(name: string): string {
  const first = name.trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}
