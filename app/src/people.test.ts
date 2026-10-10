import { describe, expect, it } from "vitest";
import { addPerson, nextIndex, parsePeople, setPersonCurrency, validateName } from "./people";

const a = "0x52908400098527886E0F7030069857D2E4169EE7";
const b = "0x8617E340B3D01FA5F11F306F4090FD50E238070D";

describe("people", () => {
  it("next index is max+1, starting at 1", () => {
    expect(nextIndex([])).toBe(1);
    expect(nextIndex([{ index: 5, name: "x", recipient: a }])).toBe(6);
  });
  it("adds a trimmed, checksummed person", () => {
    const people = addPerson([], "  Mum ", a.toLowerCase());
    expect(people).toEqual([{ index: 1, name: "Mum", recipient: a }]);
    expect(addPerson(people, "Sis", b)[1].index).toBe(2);
  });
  it("rejects bad names, addresses and duplicate recipients", () => {
    expect(() => addPerson([], "   ", a)).toThrow();
    expect(() => addPerson([], "x".repeat(33), a)).toThrow();
    expect(() => addPerson([], "Mum", "0x123")).toThrow();
    const people = addPerson([], "Mum", a);
    expect(() => addPerson(people, "Other", a.toLowerCase())).toThrow(/already/);
    expect(validateName(" ok ")).toBe("ok");
  });
  it("parsePeople drops malformed, duplicate index and duplicate recipient entries", () => {
    const raw = JSON.stringify([
      { index: 1, name: "Mum", recipient: a },
      { index: 1, name: "Dup index", recipient: b },
      { index: 2, name: "Dup recipient", recipient: a.toLowerCase() },
      { index: 0, name: "Main", recipient: b },
      { index: 3, name: "", recipient: b },
      { index: 4, name: "Bad", recipient: "nope" },
      { index: 2.5, name: "Frac", recipient: b },
      null,
      { index: 7, name: " Sis ", recipient: b.toLowerCase() },
    ]);
    expect(parsePeople(raw)).toEqual([
      { index: 1, name: "Mum", recipient: a },
      { index: 7, name: "Sis", recipient: b },
    ]);
  });
  it("parsePeople fails closed to empty on junk", () => {
    expect(parsePeople(null)).toEqual([]);
    expect(parsePeople("{")).toEqual([]);
    expect(parsePeople("{}")).toEqual([]);
  });

  it("stores an optional, validated currency", () => {
    const people = addPerson([], "Mum", a, "NGN");
    expect(people[0]).toEqual({ index: 1, name: "Mum", recipient: a, currency: "NGN" });
    expect("currency" in addPerson([], "Mum", a)[0]).toBe(false);
    expect("currency" in addPerson([], "Mum", a, "")[0]).toBe(false);
    expect(() => addPerson([], "Mum", a, "XYZ")).toThrow(/currency/);
  });
  it("changes and clears a person's currency", () => {
    const people = addPerson(addPerson([], "Mum", a), "Sis", b, "PHP");
    const set = setPersonCurrency(people, 1, "GHS");
    expect(set[0].currency).toBe("GHS");
    expect(set[1].currency).toBe("PHP");
    const cleared = setPersonCurrency(set, 2, undefined);
    expect("currency" in cleared[1]).toBe(false);
    expect(() => setPersonCurrency(people, 1, "nope")).toThrow();
    expect(setPersonCurrency(people, 9, "GHS")).toEqual(people);
  });
  it("parsePeople keeps stored people without a currency and only drops a bad currency", () => {
    const c = "0x0000000000000000000000000000000000000001";
    const raw = JSON.stringify([
      { index: 1, name: "Old", recipient: a },
      { index: 2, name: "New", recipient: b, currency: "KES" },
      { index: 3, name: "Junk", recipient: c, currency: "XYZ" },
    ]);
    expect(parsePeople(raw)).toEqual([
      { index: 1, name: "Old", recipient: a },
      { index: 2, name: "New", recipient: b, currency: "KES" },
      { index: 3, name: "Junk", recipient: c },
    ]);
  });
});
