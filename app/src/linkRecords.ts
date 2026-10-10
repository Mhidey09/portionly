import { isAddress, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { isCurrencyCode } from "./currency";

/** A money link this phone made. `total` is whole micro dollars as a decimal string. */
type StoredLink = { key: Hex; address: Address; createdAt: number; total: string; note?: string; cur?: string };

const MAX_NOTE = 80;
const KEY_PATTERN = /^0x[0-9a-f]{64}$/;

function addressOfKey(key: Hex): Address {
  return privateKeyToAddress(key);
}

function readEntry(value: unknown): StoredLink | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.key !== "string" || !KEY_PATTERN.test(v.key) || /^0x0+$/.test(v.key)) return undefined;
  if (typeof v.address !== "string" || !isAddress(v.address, { strict: false })) return undefined;
  let derived: Address;
  try {
    derived = addressOfKey(v.key as Hex);
  } catch {
    return undefined;
  }
  // An address that does not belong to the key would show the wrong payment, so such a record is dropped.
  if (derived.toLowerCase() !== v.address.toLowerCase()) return undefined;
  if (typeof v.createdAt !== "number" || !Number.isSafeInteger(v.createdAt) || v.createdAt < 0) return undefined;
  if (typeof v.total !== "string" || !/^[1-9]\d{0,24}$/.test(v.total)) return undefined;
  const entry: StoredLink = { key: v.key as Hex, address: derived, createdAt: v.createdAt, total: v.total };
  if (typeof v.note === "string" && v.note.trim() !== "") entry.note = v.note.trim().slice(0, MAX_NOTE);
  if (typeof v.cur === "string" && isCurrencyCode(v.cur)) entry.cur = v.cur;
  return entry;
}

/** Reads what was saved. Anything malformed is dropped, and so is a repeated key. */
function parseLinks(raw: string | null | undefined): StoredLink[] {
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: StoredLink[] = [];
  for (const item of list) {
    const entry = readEntry(item);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}

/** Newest first. Adding a key that is already there changes nothing. */
function addLink(list: readonly StoredLink[], entry: StoredLink): StoredLink[] {
  const valid = readEntry(entry);
  if (!valid) throw new Error("That money link could not be saved");
  if (list.some((item) => item.key === valid.key)) return [...list];
  return [valid, ...list];
}

function removeLink(list: readonly StoredLink[], key: Hex): StoredLink[] {
  return list.filter((item) => item.key !== key);
}

export { addLink, addressOfKey, parseLinks, removeLink }; 
export type { StoredLink };
