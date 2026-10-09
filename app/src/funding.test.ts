import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./aqqqProofPlan";
import { buildFundingCalls, GAS_TOPUP_MON, gasTopUpFor, GAS_THRESHOLD_MON } from "./funding";

const main = "0x1111111111111111111111111111111111111111" as const;
const person = "0x2222222222222222222222222222222222222222" as const;

describe("funding", () => {
  it("tops up gas whenever a send could fail the 0.12 MON plan minimum", () => {
    expect(gasTopUpFor(0n)).toBe(GAS_TOPUP_MON);
    expect(gasTopUpFor(GAS_THRESHOLD_MON - 1n)).toBe(GAS_TOPUP_MON);
    expect(gasTopUpFor(GAS_THRESHOLD_MON)).toBe(0n);
    const planMinimum = 120_000_000_000_000_000n;
    expect(GAS_THRESHOLD_MON).toBeGreaterThan(planMinimum);
    expect(GAS_TOPUP_MON).toBeGreaterThanOrEqual(2n * planMinimum);
  });
  it("builds an AUSD transfer then a MON transfer", () => {
    const calls = buildFundingCalls({ main, person, ausdAmount: 5_000_000n, monAmount: GAS_TOPUP_MON, ausdBalance: 10_000_000n, monBalance: 1n * 10n ** 18n });
    expect(calls).toHaveLength(2);
    expect(calls[0].to).toBe(ADDRESSES.ausd);
    const decoded = decodeFunctionData({ abi: [{ type: "function", name: "transfer", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }], data: calls[0].data });
    expect(decoded.args).toEqual([person, 5_000_000n]);
    expect(calls[0].value).toBe(0n);
    expect(calls[1]).toMatchObject({ to: person, data: "0x", value: GAS_TOPUP_MON });
  });
  it("skips zero legs and fails closed on bad input", () => {
    const base = { main, person, ausdAmount: 1n, monAmount: 0n, ausdBalance: 1n, monBalance: 10n ** 18n };
    expect(buildFundingCalls(base)).toHaveLength(1);
    expect(() => buildFundingCalls({ ...base, ausdAmount: 0n })).toThrow();
    expect(() => buildFundingCalls({ ...base, ausdAmount: 2n })).toThrow(/AUSD/);
    expect(() => buildFundingCalls({ ...base, monAmount: 10n ** 18n })).toThrow(/MON/);
    expect(() => buildFundingCalls({ ...base, person: main })).toThrow();
    expect(() => buildFundingCalls({ ...base, person: "0x12" as never })).toThrow();
  });
});
