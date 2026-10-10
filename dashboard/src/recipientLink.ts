import { getAddress, isAddress, type Address } from "viem";

/** Accepts a raw address or a Portionly pay link and returns the checksummed address. */
export function parseRecipientLink(text: string): Address {
  const trimmed = text.trim();
  const fromLink = /\/pay\/(0x[0-9a-fA-F]{40})\b/.exec(trimmed)?.[1];
  const candidate = fromLink ?? trimmed;
  if (!isAddress(candidate, { strict: false })) throw new Error("That doesn't look like a Portionly link or address.");
  return getAddress(candidate.toLowerCase());
}
