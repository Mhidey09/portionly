import { describe, expect, it } from "vitest";
import { isPayable, NO_RECIPIENT, parsePeople, setPersonName, setPersonRecipient, type Person } from "./people";
import { hasHistory, restorePeople, restoreSummary, scanPlan, type WalletActivity } from "./restore";

const addr = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as `0x${string}`;
const empty = (index: number): WalletActivity => ({ address: addr(index), ausd: 0n, earn: 0n, aqqq: 0n, mon: 0n, nonce: 0 });
const reader = (history: Record<number, Partial<WalletActivity>>, seen: number[] = []) => async (index: number) => {
  seen.push(index);
  return { ...empty(index), ...(history[index] ?? {}) };
};

const MUM = "0x52908400098527886E0F7030069857D2E4169EE7" as const;
const SIS = "0x8617E340B3D01FA5F11F306F4090FD50E238070D" as const;
const JAMES = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2" as const;

describe("hasHistory", () => {
  it("counts AUSD, savings shares, stocks or a sent transaction", () => {
    expect(hasHistory({ ...empty(1), ausd: 1n })).toBe(true);
    expect(hasHistory({ ...empty(1), earn: 1n })).toBe(true);
    expect(hasHistory({ ...empty(1), aqqq: 1n })).toBe(true);
    expect(hasHistory({ ...empty(1), nonce: 1 })).toBe(true);
    expect(hasHistory({ ...empty(1), nonce: 2n })).toBe(true);
  });
  it("does not count MON alone: a wallet only topped up for fees was never used", () => {
    expect(hasHistory({ ...empty(1), mon: 10n ** 18n })).toBe(false);
    expect(hasHistory(empty(1))).toBe(false);
  });
});

describe("scanPlan", () => {
  it("finds history at 1, 2 and 4 with 3 empty, then stops after 5 empties", async () => {
    const seen: number[] = [];
    const found = await scanPlan(reader({ 1: { ausd: 5n }, 2: { nonce: 3 }, 4: { earn: 9n } }, seen));
    expect(found.map((f) => f.index)).toEqual([1, 2, 4]);
    expect(found[2].address).toBe(addr(4));
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
  it("stops after exactly 5 empties in a row and never reads further", async () => {
    const seen: number[] = [];
    const found = await scanPlan(reader({ 7: { ausd: 1n } }, seen));
    expect(found).toEqual([]);
    expect(seen).toEqual([1, 2, 3, 4, 5]);
  });
  it("a gap of 4 empties does not stop the scan", async () => {
    const found = await scanPlan(reader({ 1: { ausd: 1n }, 6: { ausd: 1n } }));
    expect(found.map((f) => f.index)).toEqual([1, 6]);
  });
  it("respects the hard cap of 50", async () => {
    const seen: number[] = [];
    const all = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [i + 1, { ausd: 1n }]));
    const found = await scanPlan(reader(all, seen));
    expect(found).toHaveLength(50);
    expect(Math.max(...seen)).toBe(50);
    const small = await scanPlan(reader(all), { maxIndex: 3 });
    expect(small).toHaveLength(3);
  });
  it("reports progress and lets a failed read stop the scan rather than reading as empty", async () => {
    const progress: number[] = [];
    await scanPlan(reader({}), { onProgress: (i) => progress.push(i) });
    expect(progress).toEqual([1, 2, 3, 4, 5]);
    await expect(scanPlan(async () => { throw new Error("rpc down"); })).rejects.toThrow("rpc down");
  });
});

describe("restorePeople", () => {
  it("restores the spec case: indexes 1, 2 and 4 with their recipients", () => {
    const { people, added } = restorePeople([], [
      { index: 1, recipient: MUM },
      { index: 2, recipient: SIS },
      { index: 4, recipient: JAMES },
    ]);
    expect(people.map((p) => [p.index, p.name, p.recipient])).toEqual([
      [1, "Person 1", MUM],
      [2, "Person 2", SIS],
      [4, "Person 3", JAMES],
    ]);
    expect(added).toHaveLength(3);
    expect(people.every(isPayable)).toBe(true);
  });
  it("leaves existing people untouched and does not duplicate an index or a recipient", () => {
    const existing: Person[] = [{ index: 1, name: "Mum", recipient: MUM, currency: "NGN" }];
    const { people, added } = restorePeople(existing, [{ index: 1, recipient: SIS }, { index: 2, recipient: MUM }, { index: 3, recipient: JAMES }]);
    expect(people[0]).toBe(existing[0]);
    expect(people.filter((p) => p.index === 1)).toHaveLength(1);
    // Index 2 points at a recipient that is already someone else, so it is kept but cannot be paid.
    expect(people.find((p) => p.index === 2)).toEqual({ index: 2, name: "Person 1", recipient: NO_RECIPIENT, needsRecipient: true });
    expect(people.find((p) => p.index === 3)).toEqual({ index: 3, name: "Person 2", recipient: JAMES });
    expect(added.map((p) => p.index)).toEqual([2, 3]);
    expect(new Set(people.filter(isPayable).map((p) => p.recipient)).size).toBe(2);
  });
  it("uses the lowest unused Person number", () => {
    const existing: Person[] = [{ index: 1, name: "Person 2", recipient: MUM }, { index: 2, name: "Person 4", recipient: SIS }];
    const { added } = restorePeople(existing, [{ index: 5, recipient: JAMES }, { index: 6 }]);
    expect(added.map((p) => p.name)).toEqual(["Person 1", "Person 3"]);
  });
  it("is idempotent", () => {
    const first = restorePeople([], [{ index: 1, recipient: MUM }, { index: 2 }]);
    const second = restorePeople(first.people, [{ index: 1, recipient: MUM }, { index: 2 }]);
    expect(second.people).toEqual(first.people);
    expect(second.added).toEqual([]);
  });
  it("marks a wallet with an unknown recipient as needing one", () => {
    const { people } = restorePeople([], [{ index: 3 }]);
    expect(people[0]).toEqual({ index: 3, name: "Person 1", recipient: NO_RECIPIENT, needsRecipient: true });
    expect(isPayable(people[0])).toBe(false);
  });
  it("writes the result line in plain words", () => {
    expect(restoreSummary([])).toBe("Nothing to restore");
    const two = restorePeople([], [{ index: 1, recipient: MUM }, { index: 2, recipient: SIS }]).added;
    expect(restoreSummary(two)).toBe("Found 2 people");
    const one = restorePeople([], [{ index: 1 }]).added;
    expect(restoreSummary(one)).toBe("Found 1 person. 1 needs an address before you can send.");
    expect(/[-–—]/.test(restoreSummary(one))).toBe(false);
  });
});

describe("people with no known address", () => {
  it("survive a save and load, and stay unpayable", () => {
    const { people } = restorePeople([], [{ index: 1, recipient: MUM }, { index: 2 }, { index: 3 }]);
    const loaded = parsePeople(JSON.stringify(people));
    expect(loaded).toEqual(people);
    expect(loaded.filter(isPayable).map((p) => p.index)).toEqual([1]);
  });
  it("an old entry without the flag still loads, and a zero address without the flag becomes unpayable", () => {
    const loaded = parsePeople(JSON.stringify([{ index: 1, name: "Mum", recipient: MUM }, { index: 2, name: "Zero", recipient: NO_RECIPIENT }, { index: 3, name: "Fake", recipient: SIS, needsRecipient: true }]));
    expect(loaded[0]).toEqual({ index: 1, name: "Mum", recipient: MUM });
    expect(loaded[1]).toMatchObject({ index: 2, needsRecipient: true, recipient: NO_RECIPIENT });
    // A flag wins over a stored address, so a hand edited entry cannot become payable by accident.
    expect(loaded[2]).toMatchObject({ index: 3, needsRecipient: true, recipient: NO_RECIPIENT });
  });
  it("setPersonRecipient makes them payable and refuses a repeat or the zero address", () => {
    const { people } = restorePeople([{ index: 1, name: "Mum", recipient: MUM }], [{ index: 2 }]);
    expect(() => setPersonRecipient(people, 2, MUM.toLowerCase())).toThrow(/already/);
    expect(() => setPersonRecipient(people, 2, NO_RECIPIENT)).toThrow();
    expect(() => setPersonRecipient(people, 2, "nope")).toThrow();
    const next = setPersonRecipient(people, 2, JAMES.toLowerCase());
    expect(next[1]).toEqual({ index: 2, name: "Person 1", recipient: JAMES });
    expect(isPayable(next[1])).toBe(true);
  });
  it("setPersonName renames only that person and validates", () => {
    const people: Person[] = [{ index: 1, name: "A", recipient: MUM }, { index: 2, name: "B", recipient: SIS }];
    expect(setPersonName(people, 2, "  James ")[1].name).toBe("James");
    expect(setPersonName(people, 2, "James")[0].name).toBe("A");
    expect(() => setPersonName(people, 2, "   ")).toThrow();
  });
});
