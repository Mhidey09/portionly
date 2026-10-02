import { describe, expect, it } from "vitest";
import {
  ADDRESSES,
  buildAqqqProofPlan,
  type AqqqProofPlanInput,
} from "./aqqqProofPlan";
import routerVector from "./aqqq-router-vector.json";

const validInput = (): AqqqProofPlanInput => ({
  chainId: 143,
  account: "0x1111111111111111111111111111111111111111",
  ausdBalance: 1_000_000n,
  monBalance: 120_000_000_000_000_000n,
  amountIn: 1_000_000n,
  quote: {
    amountOut: 1_388_310_340_022_417n,
    observedAtMs: 1_000_000,
  },
  nowMs: 1_030_000,
  slippageBps: 100,
});

describe("buildAqqqProofPlan", () => {
  it("builds the exact three-call bounded proof", () => {
    const plan = buildAqqqProofPlan(validInput());

    expect(plan.chainId).toBe(143);
    expect(plan.amountIn).toBe(1_000_000n);
    expect(plan.minimumOut).toBe(1_374_427_236_622_192n);
    expect(plan.deadlineSeconds).toBe(1_630n);
    expect(plan.calls.map((call) => call.to)).toEqual([
      ADDRESSES.ausd,
      ADDRESSES.permit2,
      ADDRESSES.universalRouter,
    ]);
    expect(plan.calls.every((call) => call.value === 0n)).toBe(true);
  });

  it("matches the official Universal Router SDK calldata vector", () => {
    const plan = buildAqqqProofPlan(validInput());

    expect(plan.calls[0]?.data.startsWith("0x095ea7b3")).toBe(true);
    expect(plan.calls[1]?.data).not.toBe("0x");
    expect(plan.calls[2]?.data).toBe(routerVector.calldata);
  });

  it("rejects a chain other than Monad mainnet", () => {
    expect(() => buildAqqqProofPlan({ ...validInput(), chainId: 1 })).toThrow(
      "Monad mainnet chain ID 143 is required",
    );
  });

  it("rejects a quote older than sixty seconds", () => {
    const input = validInput();
    input.nowMs = input.quote.observedAtMs + 60_001;
    expect(() => buildAqqqProofPlan(input)).toThrow("Quote is stale");
  });

  it("rejects any amount other than exactly one AUSD", () => {
    expect(() =>
      buildAqqqProofPlan({ ...validInput(), amountIn: 1_000_001n }),
    ).toThrow("Proof amount must equal exactly 1 AUSD");
  });

  it("rejects insufficient AUSD or gas funding before producing calls", () => {
    expect(() =>
      buildAqqqProofPlan({ ...validInput(), ausdBalance: 999_999n }),
    ).toThrow("At least 1 AUSD is required");
    expect(() =>
      buildAqqqProofPlan({ ...validInput(), monBalance: 119_999_999_999_999_999n }),
    ).toThrow("At least 0.12 MON is required");
  });

  it("rejects slippage outside the one-percent proof bound", () => {
    expect(() =>
      buildAqqqProofPlan({ ...validInput(), slippageBps: 101 }),
    ).toThrow("Slippage cannot exceed 1%");
  });
});
