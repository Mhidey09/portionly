import { getAddress, isAddress, type Address } from "viem";

export type PayRoute = { address: Address } | { error: string };

/** Reads /pay/<address>. Null means this is not a pay page. A malformed address is an error, never a guess. */
export function parsePayPath(pathname: string): PayRoute | null {
  const match = /^\/pay(?:\/([^/]*))?\/?$/i.exec(pathname);
  if (!match) return null;
  const raw = match[1] ?? "";
  if (!isAddress(raw, { strict: true })) return { error: "This pay link does not contain a valid address." };
  return { address: getAddress(raw) };
}

/** Only an explicitly configured https URL is shown. Nothing is invented. */
export function apkLink(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
