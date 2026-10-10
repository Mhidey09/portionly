import { getAddress, isAddress, type Address } from "viem";

/** Accepts a raw address or a Portionly pay link and returns the checksummed address. */
export function parseRecipientLink(text: string): Address {
  const trimmed = text.trim();
  const fromLink = /\/pay\/(0x[0-9a-fA-F]{40})\b/.exec(trimmed)?.[1];
  const candidate = fromLink ?? trimmed;
  if (!isAddress(candidate, { strict: false })) throw new Error("That doesn't look like a Portionly link or address.");
  return getAddress(candidate.toLowerCase());
}

/**
 * If pasted text holds a money link (/claim#<64 hex>, optionally with ?cur=XXX before the #), returns the
 * path to open on this site. The key stays in the part after #, so it is never sent to a server. Null otherwise.
 */
export function claimTarget(text: string): string | null {
  const match = /\/claim\/?(\?[^#\s]*)?#(?:0x)?([0-9a-fA-F]{64})(?![0-9a-fA-F])/.exec(text.trim());
  if (!match || /^0+$/.test(match[2])) return null;
  const cur = /(?:^|[?&])cur=([A-Za-z]{3})(?![A-Za-z])/.exec(match[1] ?? "")?.[1]?.toUpperCase();
  return `/claim${cur ? `?cur=${cur}` : ""}#${match[2].toLowerCase()}`;
}
