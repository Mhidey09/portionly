import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/envio-response.json";
import { buildHistory, explorerTx, formatDate, parsePlans, parsePositions, trimAmount } from "./history";

describe("history parsing (recorded fixtures)", () => {
  const history = buildHistory(fixtures.plans, fixtures.positions);

  it("formats amounts from number and string BigInts", () => {
    const [a, b] = history.plans;
    expect(a.nowAusd).toBe("1");
    expect(a.growAusd).toBe("0.5");
    expect(a.growShares).toBe("0.47787");
    expect(a.investAusd).toBe("0.25");
    expect(a.investOutAqqq).toBe("1.23");
    expect(b.nowAusd).toBe("2");
    expect(b.usedFallback).toBe(true);
  });

  it("links a plan to its time lock by lock tx hash, case insensitively", () => {
    const [a, b] = history.plans;
    expect(a.position?.unlockAt).toBe(1770000000);
    expect(a.position?.claimed).toBe(false);
    expect(a.position?.shares).toBe("0.47787");
    expect(b.position).toBeNull();
  });

  it("parses positions", () => {
    const [p] = parsePositions(fixtures.positions);
    expect(p.claimedAt).toBeNull();
    expect(p.unlockAt).toBe(1770000000);
  });

  it("handles empty lists", () => {
    expect(parsePlans(fixtures.empty, [])).toEqual([]);
  });

  it("surfaces GraphQL errors", () => {
    expect(() => parsePlans(fixtures.graphqlError, [])).toThrow(/not found in type/);
  });

  it("rejects unreadable amounts", () => {
    const bad = { data: { Plan: [{ ...fixtures.plans.data.Plan[0], nowAmount: "abc" }] } };
    expect(() => parsePlans(bad, [])).toThrow(/nowAmount/);
  });

  it("formats helpers", () => {
    expect(formatDate(1770000000)).toBe("2 Feb 2026");
    expect(explorerTx("0xabc")).toBe("https://monadscan.com/tx/0xabc");
    expect(trimAmount("1.230000")).toBe("1.23");
    expect(trimAmount("2.000000")).toBe("2");
  });
});
