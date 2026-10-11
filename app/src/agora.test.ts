import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import {
  addSettled,
  AGORA,
  buildSettleCalls,
  decodeSwapCall,
  erc20Abi,
  MAX_RECENT,
  MIN_TEST_MON,
  parseMetrics,
  parseSettledList,
  toRecord,
  whitelisterAbi,
  type SettleInput,
} from "./agora";
import metricsFixture from "./fixtures/agora-metrics.json";

const ME = "0x1111111111111111111111111111111111111111";
const THEM = "0x2222222222222222222222222222222222222222";
const NOW = 1_800_000_000_000;

const valid = (): SettleInput => ({
  account: ME,
  recipient: THEM,
  amountIn: 2_500_000n,
  quotedOut: 2_500_000_000_000_000_000n,
  ausdBalance: 10_000_000n,
  monBalance: MIN_TEST_MON,
  nowMs: NOW,
});

describe("buildSettleCalls", () => {
  it("builds an exact approve then a swap that pays the recipient the quote", () => {
    const plan = buildSettleCalls(valid());
    expect(plan.calls).toHaveLength(2);
    expect(plan.calls.every((call) => call.value === 0n)).toBe(true);

    const [approve, swap] = plan.calls;
    expect(approve.to).toBe(AGORA.ausd);
    const a = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    expect(a.functionName).toBe("approve");
    expect(a.args).toEqual([AGORA.pair, 2_500_000n]);

    expect(swap.to).toBe(AGORA.pair);
    const s = decodeSwapCall(swap.data);
    expect(s.amountIn).toBe(2_500_000n);
    expect(s.amountOutMin).toBe(2_500_000_000_000_000_000n);
    expect(s.path).toEqual([AGORA.ausd, AGORA.ctk]);
    expect(s.to).toBe(THEM);
    expect(s.deadline).toBe(BigInt(NOW / 1000 + 600));
    expect(plan.deadline).toBe(s.deadline);
  });

  it("adds the one time swapper approval first when the account is not approved", () => {
    const plan = buildSettleCalls({ ...valid(), swapperApproved: false });
    expect(plan.calls).toHaveLength(3);
    expect(plan.calls[0].to).toBe(AGORA.whitelister);
    const decoded = decodeFunctionData({ abi: whitelisterAbi, data: plan.calls[0].data });
    expect(decoded.functionName).toBe("setApprovedSwapper");
    expect(decoded.args).toEqual([ME]);
  });

  it("checksums a lower case recipient", () => {
    const plan = buildSettleCalls({ ...valid(), recipient: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" });
    expect(plan.recipient).toBe("0x70997970C51812dc3A010C7d01b50e0d17dc79C8");
  });

  it("refuses bad input with plain sentences", () => {
    expect(() => buildSettleCalls({ ...valid(), amountIn: 0n })).toThrow("Enter an amount above zero.");
    expect(() => buildSettleCalls({ ...valid(), amountIn: 10_000_001n })).toThrow("You do not have enough test dollars for that.");
    expect(() => buildSettleCalls({ ...valid(), recipient: "nope" })).toThrow("Enter a valid address for who gets it.");
    expect(() => buildSettleCalls({ ...valid(), recipient: ME.toUpperCase().replace("0X", "0x") })).toThrow("someone other than yourself");
    expect(() => buildSettleCalls({ ...valid(), quotedOut: 0n })).toThrow("The pool cannot settle that amount right now.");
    expect(() => buildSettleCalls({ ...valid(), monBalance: MIN_TEST_MON - 1n })).toThrow("test fee balance is too low");
  });

  it("keeps every message free of dashes and hyphens", () => {
    const bad: Partial<SettleInput>[] = [{ amountIn: 0n }, { amountIn: 99_000_000n }, { recipient: "x" }, { recipient: ME }, { quotedOut: 0n }, { monBalance: 0n }];
    for (const change of bad) {
      try {
        buildSettleCalls({ ...valid(), ...change });
      } catch (error) {
        expect((error as Error).message).not.toMatch(/[-–—]/);
      }
    }
  });
});

describe("parseMetrics", () => {
  it("reads the recorded live payload", () => {
    const metrics = parseMetrics(metricsFixture);
    expect(metrics).toBeDefined();
    expect(metrics!.monad).toEqual({ circulating: 93202071.108455, total: 99894974.552392 });
    expect(metrics!.allChains).toBe(metricsFixture.chains.length);
    expect(metrics!.totalCirculating).toBeGreaterThan(metrics!.monad!.circulating);
  });

  it("omits Monad when the payload has no Monad entry", () => {
    const metrics = parseMetrics({ chains: [{ chainId: "eip155:1", network: "ethereum", circulatingSupply: "5", totalSupply: "6" }] });
    expect(metrics).toEqual({ allChains: 1, totalCirculating: 5 });
  });

  it("fails closed on anything unexpected", () => {
    expect(parseMetrics(null)).toBeUndefined();
    expect(parseMetrics("x")).toBeUndefined();
    expect(parseMetrics({})).toBeUndefined();
    expect(parseMetrics({ chains: [] })).toBeUndefined();
    expect(parseMetrics({ chains: [{ network: "monad", circulatingSupply: "abc", totalSupply: "1" }] })).toBeUndefined();
    expect(parseMetrics({ chains: [{ network: "monad", circulatingSupply: "-4", totalSupply: "1" }, 7, null] })).toBeUndefined();
  });
});

describe("toRecord", () => {
  const hash = `0x${"ab".repeat(32)}` as const;
  it("builds a debit, settle and credit record with decimal strings", () => {
    const record = toRecord({ hash, at: 5, recipient: THEM, amountIn: 2_500_000n, amountOut: 2_500_000_000_000_000_000n, seconds: 1.4 });
    expect(record.amountIn).toBe("2.5");
    expect(record.amountOut).toBe("2.5");
    expect(record.seconds).toBe(1.4);
    expect(record.legs).toEqual([
      { kind: "debit", asset: "ausd", amount: "2.5" },
      { kind: "settle", asset: "ausd", amount: "2.5" },
      { kind: "credit", asset: "ctk", amount: "2.5" },
    ]);
  });
});

describe("parseSettledList", () => {
  const rec = (n: number) => toRecord({ hash: `0x${n.toString(16).padStart(64, "0")}`, at: n, recipient: THEM, amountIn: 1_000_000n, amountOut: 10n ** 18n });

  it("round trips a saved list, newest first", () => {
    const list = parseSettledList(JSON.stringify([rec(1), rec(3), rec(2)]));
    expect(list.map((r) => r.at)).toEqual([3, 2, 1]);
  });

  it("fails closed on junk", () => {
    expect(parseSettledList(null)).toEqual([]);
    expect(parseSettledList("not json")).toEqual([]);
    expect(parseSettledList("{}")).toEqual([]);
  });

  it("drops bad entries and repeats but keeps good ones", () => {
    const good = rec(7);
    const list = parseSettledList(
      JSON.stringify([
        good,
        good,
        { ...rec(8), hash: "0x12" },
        { ...rec(9), recipient: "nope" },
        { ...rec(10), amountIn: "1e6" },
        { ...rec(11), legs: [] },
        { ...rec(12), seconds: -1 },
        null,
        5,
      ]),
    );
    expect(list).toHaveLength(1);
    expect(list[0].at).toBe(7);
  });

  it("keeps only the last 10", () => {
    const many = Array.from({ length: 14 }, (_, i) => rec(i + 1));
    const list = parseSettledList(JSON.stringify(many));
    expect(list).toHaveLength(MAX_RECENT);
    expect(list[0].at).toBe(14);
    let added = addSettled(list, rec(20));
    expect(added).toHaveLength(MAX_RECENT);
    expect(added[0].at).toBe(20);
    added = addSettled(added, rec(20));
    expect(added.filter((r) => r.at === 20)).toHaveLength(1);
  });
});
