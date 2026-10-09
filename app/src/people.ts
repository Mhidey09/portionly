import { getAddress, isAddress, type Address } from "viem";

type Person = { index: number; name: string; recipient: Address };

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

function addPerson(people: readonly Person[], name: string, recipient: string): Person[] {
  const cleanName = validateName(name);
  const address = validateRecipient(recipient);
  if (people.some((person) => person.recipient === address)) throw new Error("That recipient is already added");
  return [...people, { index: nextIndex(people), name: cleanName, recipient: address }];
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
    const { index, name, recipient } = entry as Record<string, unknown>;
    if (typeof index !== "number" || !Number.isInteger(index) || index < 1 || index > MAX_INDEX) continue;
    if (typeof name !== "string" || typeof recipient !== "string") continue;
    try {
      const clean = { index, name: validateName(name), recipient: validateRecipient(recipient) };
      if (people.some((p) => p.index === clean.index || p.recipient === clean.recipient)) continue;
      people.push(clean);
    } catch {
      continue;
    }
  }
  return people;
}

export { addPerson, nextIndex, parsePeople, validateName, validateRecipient };
export type { Person };
