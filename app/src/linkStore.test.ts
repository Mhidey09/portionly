import { describe, expect, it } from "vitest";
import { linkFromBytes } from "./linkPay";
import { addLink, parseLinks, removeLink, type StoredLink } from "./linkRecords";

const make = (seed: number, extra: Partial<StoredLink> = {}): StoredLink => {
  const link = linkFromBytes(Uint8Array.from({ length: 32 }, (_, i) => (i + seed) % 255 + 1));
  return { key: link.key, address: link.address, createdAt: 1_700_000_000_000 + seed, total: "200000000", ...extra };
};

describe("link records", () => {
  it("round trips through JSON", () => {
    const list = [make(1), make(2, { note: "For Ada", cur: "NGN" })];
    expect(parseLinks(JSON.stringify(list))).toEqual(list);
  });

  it("returns nothing for missing or broken storage", () => {
    expect(parseLinks(null)).toEqual([]);
    expect(parseLinks("")).toEqual([]);
    expect(parseLinks("{oops")).toEqual([]);
    expect(parseLinks('{"a":1}')).toEqual([]);
  });

  it("drops malformed entries and keeps good ones", () => {
    const good = make(3);
    const bad = [
      null,
      "x",
      { ...good, key: "0x1234" },
      { ...good, key: `0x${"0".repeat(64)}` },
      { ...good, address: "0x1111111111111111111111111111111111111111" },
      { ...good, address: "nope" },
      { ...good, createdAt: "yesterday" },
      { ...good, createdAt: -1 },
      { ...good, total: "12.5" },
      { ...good, total: "0" },
      { ...good, total: 200 },
    ];
    expect(parseLinks(JSON.stringify([bad[0], good, ...bad.slice(1)]))).toEqual([good]);
  });

  it("drops a repeated key and an unknown currency", () => {
    const good = make(4);
    const out = parseLinks(JSON.stringify([good, good, make(5, { cur: "ZZZ" })]));
    expect(out).toHaveLength(2);
    expect(out[1].cur).toBeUndefined();
  });

  it("adds newest first and ignores a repeat", () => {
    const a = make(6);
    const b = make(7);
    const list = addLink(addLink([], a), b);
    expect(list.map((item) => item.key)).toEqual([b.key, a.key]);
    expect(addLink(list, a)).toEqual(list);
    expect(() => addLink(list, { ...a, total: "0" })).toThrow();
  });

  it("removes only the named key", () => {
    const a = make(8);
    const b = make(9);
    expect(removeLink([a, b], a.key)).toEqual([b]);
    expect(removeLink([a], b.key)).toEqual([a]);
  });
});
