import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./aqqqProofPlan";
import {
  buildCancelCall,
  buildClaimCall,
  buildCreateLinkCalls,
  claimUrl,
  LINK_CONTRACT,
  LINK_FEE_MON,
  linkAbi,
  linkFromBytes,
  parseClaimInput,
  portionAmounts,
  sweepAmount,
} from "./linkPay";
import { buildPortionlyPlan } from "./portionlyPlan";

const account = "0x1111111111111111111111111111111111111111";
const bytes = Uint8Array.from({ length: 32 }, (_, i) => i + 1);

describe("link key", () => {
  it("derives the same address from the same bytes and round trips through a claim link", () => {
    const link = linkFromBytes(bytes);
    expect(link.key).toBe("0x0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20");
    expect(linkFromBytes(bytes).address).toBe(link.address);
    const url = claimUrl(link.key);
    expect(url).toBe(`https://portionly-three.vercel.app/claim#${link.key.slice(2)}`);
    expect(parseClaimInput(url)).toBe(link.key);
    expect(parseClaimInput(`  Here you go: ${url}  `)).toBe(link.key);
    expect(parseClaimInput(link.key)).toBe(link.key);
  });

  it("refuses anything that is not a money link", () => {
    expect(() => linkFromBytes(new Uint8Array(8))).toThrow();
    for (const bad of ["", "hello", "https://portionly-three.vercel.app/pay/0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2", `0x${"0".repeat(64)}`, "0x1234"]) {
      expect(() => parseClaimInput(bad)).toThrow(/money link/);
    }
  });
});

describe("portions", () => {
  it("matches the direct payment builder exactly, including rounding dust", () => {
    const cases: [bigint, number, number, number][] = [
      [200_000_000n, 5_000, 3_000, 2_000],
      [1_000_001n, 3_333, 3_333, 3_334],
      [1_000_001n, 3_333, 6_667, 0],
      [7n, 10_000, 0, 0],
    ];
    for (const [total, nowBps, growBps, investBps] of cases) {
      const plan = buildPortionlyPlan({
        chainId: 143,
        account,
        recipient: "0x2222222222222222222222222222222222222222",
        splitter: "0x3333333333333333333333333333333333333333",
        ausdBalance: total,
        monBalance: 10n ** 18n,
        amountIn: total,
        nowBps,
        growBps,
        investBps,
        quote: investBps > 0 ? { amountOut: 10n ** 18n, observedAtMs: 1_000 } : undefined,
        nowMs: 1_000,
        slippageBps: 100,
      });
      const mine = portionAmounts(total, nowBps, growBps, investBps);
      expect(mine).toEqual({ nowAmount: plan.nowAmount, growAmount: plan.growAmount, investAmount: plan.investAmount });
      expect(mine.nowAmount + mine.growAmount + mine.investAmount).toBe(total);
    }
  });

  it("refuses portions that do not total 100%", () => {
    expect(() => portionAmounts(1n, 5_000, 4_000, 0)).toThrow();
    expect(() => portionAmounts(0n, 10_000, 0, 0)).toThrow();
  });
});

describe("sending by link", () => {
  const link = linkFromBytes(bytes).address;
  const base = { account, link, portions: { nowAmount: 100n, growAmount: 60n, investAmount: 40n }, lockDays: 0, ausdBalance: 200n, monBalance: 10n ** 18n } as const;

  it("allows the exact total, parks it under the link, then gives the link its fee", () => {
    const calls = buildCreateLinkCalls(base);
    expect(calls.map((c) => c.to)).toEqual([ADDRESSES.ausd, LINK_CONTRACT, link]);
    expect(calls[2].value).toBe(LINK_FEE_MON);
    const create = decodeFunctionData({ abi: linkAbi, data: calls[1].data });
    expect(create.functionName).toBe("create");
    expect(create.args).toEqual([link, 100n, 60n, 40n, 0]);
  });

  it("fails closed on a short balance, a bad lock or a lock with no savings", () => {
    expect(() => buildCreateLinkCalls({ ...base, ausdBalance: 199n })).toThrow(/AUSD balance/);
    expect(() => buildCreateLinkCalls({ ...base, monBalance: LINK_FEE_MON })).toThrow(/MON/);
    expect(() => buildCreateLinkCalls({ ...base, lockDays: 7 })).toThrow(/lock/);
    expect(() => buildCreateLinkCalls({ ...base, lockDays: 30, portions: { nowAmount: 200n, growAmount: 0n, investAmount: 0n } })).toThrow(/savings/);
    expect(() => buildCreateLinkCalls({ ...base, link: account })).toThrow(/own account/);
  });
});

describe("claiming and cancelling", () => {
  it("needs a stock minimum exactly when stock is part of the payment", () => {
    const call = buildClaimCall({ recipient: account, investAmount: 40n, investMinimumOut: 5n, deadline: 99n });
    expect(decodeFunctionData({ abi: linkAbi, data: call.data }).args).toEqual([account, 5n, 99n]);
    expect(() => buildClaimCall({ recipient: account, investAmount: 40n, investMinimumOut: 0n, deadline: 99n })).toThrow(/quote/);
    expect(() => buildClaimCall({ recipient: account, investAmount: 0n, investMinimumOut: 5n, deadline: 99n })).toThrow();
    expect(buildClaimCall({ recipient: account, investAmount: 0n, investMinimumOut: 0n, deadline: 99n }).to).toBe(LINK_CONTRACT);
  });

  it("cancels by link address and sweeps only what is safe", () => {
    expect(decodeFunctionData({ abi: linkAbi, data: buildCancelCall(account).data }).functionName).toBe("cancel");
    expect(sweepAmount(10n ** 18n)).toBe(10n ** 18n - 30_000_000_000_000_000n);
    expect(sweepAmount(1n)).toBe(0n);
  });
});
