import { getAddress, isAddress, type Address } from "viem";
import { isCurrencyCode } from "./currency";

/** `currency` is the ISO code of what they spend, used only to show a reference amount. Optional. */
type Person = { index: number; name: string; recipient: Address; currency?: string };

const MAX_INDEX = 2 ** 31 - 1;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 32) throw new Error("Name must be 1 to 32 characters");
  return trimmed;
}

function validateRecipient(value: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) throw new Error("Enter a valid EVM address");
  return getAddress(trimmed);
}

function nextIndex(people: readonly Person[]): number {
  const next = people.reduce((max, person) => Math.max(max, person.index), 0) + 1;
  if (next > MAX_INDEX) throw new Error("No account indexes left");
  return next;
}

function validateCurrency(code: string | undefined): string | undefined {
  if (code === undefined || code === "") return undefined;
  if (!isCurrencyCode(code)) throw new Error("Pick a currency from the list");
  return code;
}

function addPerson(people: readonly Person[], name: string, recipient: string, currency?: string): Person[] {
  const cleanName = validateName(name);
  const address = validateRecipient(recipient);
  if (people.some((person) => person.recipient === address)) throw new Error("That recipient is already added");
  const code = validateCurrency(currency);
  return [...people, { index: nextIndex(people), name: cleanName, recipient: address, ...(code ? { currency: code } : {}) }];
}

/** Sets or clears one person's currency. Unknown people are left alone. */
function setPersonCurrency(people: readonly Person[], index: number, currency: string | undefined): Person[] {
  const code = validateCurrency(currency);
  return people.map((person) => {
    if (person.index !== index) return person;
    const { currency: _old, ...rest } = person;
    return code ? { ...rest, currency: code } : rest;
  });
}

/** Fail closed: anything unparseable yields no people; malformed entries are dropped. */
function parsePeople(raw: string | null): Person[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const people: Person[] = [];
  for (const entry of value as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { index, name, recipient, currency } = entry as Record<string, unknown>;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > MAX_INDEX) continue;
    if (typeof name !== "string" || typeof recipient !== "string") continue;
    try {
      // An old entry has no currency; an unknown one is dropped without dropping the person.
      const clean: Person = { index, name: validateName(name), recipient: validateRecipient(recipient), ...(isCurrencyCode(currency) ? { currency } : {}) };
      if (people.some((p) => p.index === clean.index || p.recipient === clean.recipient)) continue;
      people.push(clean);
    } catch {
      continue;
    }
  }
  return people;
}

export { addPerson, nextIndex, parsePeople, setPersonCurrency, validateCurrency, validateName, validateRecipient };
export type { Person };
