import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { buildPortionlyPlan, portionlySplitterAbi } from "./portionlyPlan";

const account = "0x1111111111111111111111111111111111111111";
const recipient = "0x2222222222222222222222222222222222222222";
const splitter = "0x3333333333333333333333333333333333333333";

function input() {
  return {
    chainId: 143,
    account,
    recipient,
    splitter,
    ausdBalance: 100_000_000n,
    monBalance: 120_000_000_000_000_000n,
    amountIn: 100_000_000n,
    nowBps: 5_000,
    growBps: 3_000,
    investBps: 2_000,
    quote: { amountOut: 25_000_000_000_000_000_000n, observedAtMs: 1_000_000 },
    nowMs: 1_000_000,
    slippageBps: 100,
  } as const;
}

describe("buildPortionlyPlan", () => {
  it("reconciles exact bucket amounts and encodes one bounded splitter call", () => {
    const plan = buildPortionlyPlan(input());

    expect(plan.nowAmount).toBe(50_000_000n);
    expect(plan.growAmount).toBe(30_000_000n);
    expect(plan.investAmount).toBe(20_000_000n);
    expect(plan.nowAmount + plan.growAmount + plan.investAmount).toBe(plan.amountIn);
    expect(plan.investMinimumOut).toBe(24_750_000_000_000_000_000n);
    expect(plan.calls).toHaveLength(2);

    const decoded = decodeFunctionData({ abi: portionlySplitterAbi, data: plan.calls[1].data });
    expect(decoded.functionName).toBe("execute");
    const encodedPlan = decoded.args[0];
    expect(encodedPlan.recipient).toBe(recipient);
    expect(encodedPlan.nowAmount).toBe(plan.nowAmount);
    expect(encodedPlan.growAmount).toBe(plan.growAmount);
    expect(encodedPlan.investAmount).toBe(plan.investAmount);
    expect(encodedPlan.investMinimumOut).toBe(plan.investMinimumOut);
    expect(encodedPlan.fallbackInvestToGrow).toBe(true);
  });

  it("rejects allocations that do not total 100%", () => {
    expect(() => buildPortionlyPlan({ ...input(), nowBps: 4_900 })).toThrow("Allocations must sum to 100%");
  });

  it("rejects stale quotes", () => {
    expect(() => buildPortionlyPlan({ ...input(), nowMs: 1_060_001 })).toThrow("Quote is stale");
  });

  it("rejects a plan above the live AUSD balance", () => {
    expect(() => buildPortionlyPlan({ ...input(), ausdBalance: 99_999_999n })).toThrow("AUSD balance is below the plan total");
  });

  it("assigns integer-division dust to Invest so the exact total reconciles", () => {
    const plan = buildPortionlyPlan({
      ...input(),
      amountIn: 1_000_001n,
      ausdBalance: 1_000_001n,
      nowBps: 3_333,
      growBps: 3_333,
      investBps: 3_334,
    });
    expect(plan.nowAmount + plan.growAmount + plan.investAmount).toBe(1_000_001n);
    expect(plan.investAmount).toBe(333_401n);
  });
});
