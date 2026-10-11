import { describe, expect, it } from "vitest";
import { mergeChainLinks, type ChainLink } from "./linkRestore";

const A = "0x00000000000000000000000000000000000000aA" as const;
const B = "0x00000000000000000000000000000000000000bB" as const;
const C = "0x00000000000000000000000000000000000000cC" as const;
const chain = (link: `0x${string}`, over: Partial<ChainLink> = {}): ChainLink => ({ link, nowAmount: 1_000_000n, growAmount: 2_000_000n, investAmount: 3_000_000n, lockDays: 30, createdAt: 1_700_000_000, open: true, ...over });

describe("mergeChainLinks", () => {
  it("lists open links the phone does not have, with totals and a milliseconds date", () => {
    const out = mergeChainLinks([], [chain(A)]);
    expect(out).toEqual([{ address: A, createdAt: 1_700_000_000_000, total: "6000000", nowAmount: 1_000_000n, growAmount: 2_000_000n, investAmount: 3_000_000n, lockDays: 30 }]);
  });
  it("skips links the phone already has, whatever the address case", () => {
    expect(mergeChainLinks([{ address: A.toLowerCase() }], [chain(A), chain(B)]).map((l) => l.address)).toEqual([B]);
  });
  it("does not list closed links", () => {
    expect(mergeChainLinks([], [chain(A, { open: false }), chain(B)]).map((l) => l.address)).toEqual([B]);
  });
  it("keeps the chain order and drops repeats", () => {
    expect(mergeChainLinks([], [chain(C), chain(A), chain(C)]).map((l) => l.address)).toEqual([C, A]);
  });
  it("returns nothing for an empty chain", () => {
    expect(mergeChainLinks([{ address: A }], [])).toEqual([]);
  });
});
