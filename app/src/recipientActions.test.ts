import { decodeAbiParameters, decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./aqqqProofPlan";
import { buildClaimWithdrawalCall, buildSellStocksCalls, buildWithdrawSavingsCalls } from "./recipientActions";

const account = "0x1111111111111111111111111111111111111111";
const mon = 200_000_000_000_000_000n;
const upshiftAbi = [
  { type: "function", name: "instantRedeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [] },
  { type: "function", name: "requestRedeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [] },
] as const;
const routerAbi = [{ type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "commands", type: "bytes" }, { name: "inputs", type: "bytes[]" }, { name: "deadline", type: "uint256" }], outputs: [] }] as const;

describe("withdraw savings", () => {
  it("approves exactly the shares, then redeems to the recipient instantly or by request", () => {
    for (const kind of ["instant", "standard"] as const) {
      const calls = buildWithdrawSavingsCalls({ account, shares: 477_870n, shareBalance: 477_870n, monBalance: mon, kind });
      expect(calls[0].to).toBe(ADDRESSES.growShare);
      expect(calls[1].to).toBe(ADDRESSES.growVault);
      const redeem = decodeFunctionData({ abi: upshiftAbi, data: calls[1].data });
      expect(redeem.functionName).toBe(kind === "instant" ? "instantRedeem" : "requestRedeem");
      expect(redeem.args).toEqual([477_870n, account]);
    }
  });

  it("refuses more than the balance, zero, or too little gas", () => {
    expect(() => buildWithdrawSavingsCalls({ account, shares: 2n, shareBalance: 1n, monBalance: mon, kind: "instant" })).toThrow(/more than/);
    expect(() => buildWithdrawSavingsCalls({ account, shares: 0n, shareBalance: 1n, monBalance: mon, kind: "instant" })).toThrow();
    expect(() => buildWithdrawSavingsCalls({ account, shares: 1n, shareBalance: 1n, monBalance: 1n, kind: "instant" })).toThrow(/MON/);
  });

  it("builds a claim for a valid date only", () => {
    expect(buildClaimWithdrawalCall({ account, year: 2026, month: 10, day: 13 }).to).toBe(ADDRESSES.growVault);
    expect(() => buildClaimWithdrawalCall({ account, year: 2026, month: 13, day: 1 })).toThrow();
  });
});

describe("sell stocks", () => {
  const base = { account, amountIn: 686_925_658_185_242n, aqqqBalance: 686_925_658_185_242n, monBalance: mon, quote: { amountOut: 498_000n, observedAtMs: 1_000_000 }, nowMs: 1_000_000, slippageBps: 100 } as const;

  it("pulls exact aQQQ, swaps over the reversed pinned path, and sweeps at least the signed minimum to the seller", () => {
    const { calls, minimumOut } = buildSellStocksCalls(base);
    expect(minimumOut).toBe(493_020n);
    expect(calls.map((c) => c.to)).toEqual([ADDRESSES.aqqq, ADDRESSES.permit2, ADDRESSES.universalRouter]);
    const decoded = decodeFunctionData({ abi: routerAbi, data: calls[2].data });
    expect(decoded.args[0]).toBe("0x021004");
    const [token, to, min] = decodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], decoded.args[1][2]);
    expect([token, to, min]).toEqual([ADDRESSES.ausd, account, 493_020n]);
  });

  it("refuses stale quotes, oversized sells and loose slippage", () => {
    expect(() => buildSellStocksCalls({ ...base, nowMs: 1_070_000 })).toThrow(/stale/);
    expect(() => buildSellStocksCalls({ ...base, amountIn: base.aqqqBalance + 1n })).toThrow(/more than/);
    expect(() => buildSellStocksCalls({ ...base, slippageBps: 500 })).toThrow(/Slippage/);
  });
});
