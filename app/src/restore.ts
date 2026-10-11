import type { Address } from "viem";
import { NO_RECIPIENT, type Person } from "./people";

/** The scan never looks past this index. */
const SCAN_MAX_INDEX = 50;
/** The scan stops once this many indexes in a row have no history. */
const SCAN_STOP_AFTER = 5;

/** What the chain says about one budget wallet. MON is kept for display only; it never decides history. */
type WalletActivity = { address: Address; ausd: bigint; earn: bigint; aqqq: bigint; mon: bigint; nonce: bigint | number };

/**
 * A budget wallet has history when it holds digital dollars, savings shares or stocks, or has ever sent
 * a transaction (nonce above zero). MON alone does not count: a wallet that only got a little MON for
 * fees was topped up and never used.
 */
function hasHistory(activity: WalletActivity): boolean {
  return activity.ausd > 0n || activity.earn > 0n || activity.aqqq > 0n || BigInt(activity.nonce) > 0n;
}

type FoundWallet = { index: number; address: Address };
type ScanOptions = { stopAfter?: number; maxIndex?: number; onProgress?: (index: number) => void };

/**
 * Walks indexes 1, 2, 3 and so on, reading each one, and stops after `stopAfter` empty indexes in a row
 * or at `maxIndex`. Returns the indexes that have history, in order. A read that throws stops the scan
 * with that error, so a network failure is never mistaken for an empty wallet.
 */
async function scanPlan(read: (index: number) => Promise<WalletActivity>, options: ScanOptions = {}): Promise<FoundWallet[]> {
  const stopAfter = options.stopAfter ?? SCAN_STOP_AFTER;
  const maxIndex = Math.min(options.maxIndex ?? SCAN_MAX_INDEX, SCAN_MAX_INDEX);
  const found: FoundWallet[] = [];
  let emptyRun = 0;
  for (let index = 1; index <= maxIndex && emptyRun < stopAfter; index += 1) {
    options.onProgress?.(index);
    const activity = await read(index);
    if (hasHistory(activity)) {
      found.push({ index, address: activity.address });
      emptyRun = 0;
    } else {
      emptyRun += 1;
    }
  }
  return found;
}

/** A found wallet plus who it pays, when the chain told us. */
type FoundPerson = { index: number; recipient?: Address };

/** Lowest unused number among names like "Person 3". */
function nextPlaceholderName(people: readonly Person[]): string {
  const used = new Set<number>();
  for (const person of people) {
    const match = /^Person (\d+)$/.exec(person.name);
    if (match) used.add(Number(match[1]));
  }
  let n = 1;
  while (used.has(n)) n += 1;
  return `Person ${n}`;
}

/**
 * Adds found wallets to the list. Existing people are never changed, an index is never added twice, and
 * a recipient is never stored twice: a wallet whose recipient is unknown (or already belongs to someone
 * else) comes back marked `needsRecipient`, so its money is still visible but it cannot be paid yet.
 */
function restorePeople(existing: readonly Person[], found: readonly FoundPerson[]): { people: Person[]; added: Person[] } {
  const people = [...existing];
  const added: Person[] = [];
  const ordered = [...found].sort((a, b) => a.index - b.index);
  for (const wallet of ordered) {
    if (!Number.isInteger(wallet.index) || wallet.index < 1) continue;
    if (people.some((person) => person.index === wallet.index)) continue;
    const taken = wallet.recipient !== undefined && people.some((person) => person.recipient.toLowerCase() === wallet.recipient?.toLowerCase());
    const known = wallet.recipient !== undefined && wallet.recipient !== NO_RECIPIENT && !taken;
    const name = nextPlaceholderName(people);
    const person: Person = known && wallet.recipient ? { index: wallet.index, name, recipient: wallet.recipient } : { index: wallet.index, name, recipient: NO_RECIPIENT, needsRecipient: true };
    people.push(person);
    added.push(person);
  }
  return { people, added };
}

/** The line shown after a scan. */
function restoreSummary(added: readonly Person[]): string {
  if (added.length === 0) return "Nothing to restore";
  const base = `Found ${added.length} ${added.length === 1 ? "person" : "people"}`;
  const unknown = added.filter((person) => person.needsRecipient).length;
  if (unknown === 0) return base;
  return `${base}. ${unknown === 1 ? "1 needs" : `${unknown} need`} an address before you can send.`;
}

export { hasHistory, nextPlaceholderName, restorePeople, restoreSummary, scanPlan, SCAN_MAX_INDEX, SCAN_STOP_AFTER };
export type { FoundPerson, FoundWallet, ScanOptions, WalletActivity };
