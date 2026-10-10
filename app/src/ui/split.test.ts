import { describe, expect, it } from "vitest";
import { buildPortionlyPlan } from "../portionlyPlan";
import { amountsToSplit, isValidSplit, moveHandle, percentFromOffset, snap, splitAmounts, stepHandle, toAllocation, toSplit, type Split } from "./split";

const total = (s: Split) => s.home + s.save + s.stocks;

describe("snap", () => {
  it("rounds to steps of 5 and clamps", () => {
    expect(snap(12)).toBe(10);
    expect(snap(13)).toBe(15);
    expect(snap(-40)).toBe(0);
    expect(snap(180)).toBe(100);
    expect(snap(Number.NaN)).toBe(0);
  });
});

describe("moveHandle", () => {
  const start: Split = { home: 50, save: 30, stocks: 20 };

  it("handle 0 moves the home and savings line and leaves stocks alone", () => {
    expect(moveHandle(start, 0, 30)).toEqual({ home: 30, save: 50, stocks: 20 });
    expect(moveHandle(start, 0, 80)).toEqual({ home: 80, save: 0, stocks: 20 });
  });

  it("handle 0 cannot pass the savings and stocks line", () => {
    expect(moveHandle(start, 0, 100)).toEqual({ home: 80, save: 0, stocks: 20 });
  });

  it("handle 1 moves the savings and stocks line and leaves home alone", () => {
    expect(moveHandle(start, 1, 60)).toEqual({ home: 50, save: 10, stocks: 40 });
    expect(moveHandle(start, 1, 100)).toEqual({ home: 50, save: 50, stocks: 0 });
  });

  it("handle 1 cannot pass the home and savings line", () => {
    expect(moveHandle(start, 1, 10)).toEqual({ home: 50, save: 0, stocks: 50 });
  });

  it("snaps to 5 and clamps outside the bar", () => {
    expect(moveHandle(start, 0, 33)).toEqual({ home: 35, save: 45, stocks: 20 });
    expect(moveHandle(start, 0, -200)).toEqual({ home: 0, save: 80, stocks: 20 });
    expect(moveHandle(start, 1, 900)).toEqual({ home: 50, save: 50, stocks: 0 });
  });

  it("always totals 100 and stays valid across every position", () => {
    for (let at = -20; at <= 120; at += 1) {
      for (const handle of [0, 1] as const) {
        const next = moveHandle(start, handle, at);
        expect(total(next)).toBe(100);
        expect(isValidSplit(next)).toBe(true);
      }
    }
  });

  it("stepHandle nudges by 5 and respects the limits", () => {
    expect(stepHandle(start, 0, 1)).toEqual({ home: 55, save: 25, stocks: 20 });
    expect(stepHandle(start, 1, -1)).toEqual({ home: 50, save: 25, stocks: 25 });
    expect(stepHandle({ home: 0, save: 80, stocks: 20 }, 0, -1)).toEqual({ home: 0, save: 80, stocks: 20 });
  });
});

describe("percentFromOffset", () => {
  it("turns a touch position into a snapped percent", () => {
    expect(percentFromOffset(150, 300)).toBe(50);
    expect(percentFromOffset(-10, 300)).toBe(0);
    expect(percentFromOffset(999, 300)).toBe(100);
    expect(percentFromOffset(10, 0)).toBe(0);
  });
});

describe("splitAmounts", () => {
  it("splits cleanly when there is no dust", () => {
    expect(splitAmounts(100_000_000n, { home: 50, save: 30, stocks: 20 })).toEqual({ home: 50_000_000n, save: 30_000_000n, stocks: 20_000_000n });
  });

  it("gives dust to stocks when stocks is in use", () => {
    const out = splitAmounts(100n, { home: 33, save: 33, stocks: 34 });
    expect(out.home + out.save + out.stocks).toBe(100n);
    expect(out).toEqual({ home: 33n, save: 33n, stocks: 34n });
    const odd = splitAmounts(7n, { home: 50, save: 30, stocks: 20 });
    expect(odd).toEqual({ home: 3n, save: 2n, stocks: 2n });
  });

  it("gives dust to savings when stocks is unused", () => {
    expect(splitAmounts(7n, { home: 50, save: 50, stocks: 0 })).toEqual({ home: 3n, save: 4n, stocks: 0n });
  });

  it("gives everything to home when only home is used", () => {
    expect(splitAmounts(7n, { home: 100, save: 0, stocks: 0 })).toEqual({ home: 7n, save: 0n, stocks: 0n });
  });

  it("an unused portion is always exactly zero", () => {
    expect(splitAmounts(999_999n, { home: 0, save: 0, stocks: 100 })).toEqual({ home: 0n, save: 0n, stocks: 999_999n });
    expect(splitAmounts(999_999n, { home: 0, save: 100, stocks: 0 })).toEqual({ home: 0n, save: 999_999n, stocks: 0n });
  });

  it("matches buildPortionlyPlan for every 5 percent split", () => {
    const account = "0x1111111111111111111111111111111111111111" as const;
    const recipient = "0x2222222222222222222222222222222222222222" as const;
    const splitter = "0x3333333333333333333333333333333333333333" as const;
    const amountIn = 123_456_789n;
    for (let home = 0; home <= 100; home += 5) {
      for (let save = 0; home + save <= 100; save += 5) {
        const stocks = 100 - home - save;
        const mine = splitAmounts(amountIn, { home, save, stocks });
        const plan = buildPortionlyPlan({
          chainId: 143, account, recipient, splitter,
          ausdBalance: amountIn, monBalance: 10n ** 18n, amountIn,
          nowBps: home * 100, growBps: save * 100, investBps: stocks * 100,
          quote: stocks > 0 ? { amountOut: 1_000_000n, observedAtMs: 1_000 } : undefined,
          nowMs: 1_000, slippageBps: 100,
        });
        expect(mine).toEqual({ home: plan.nowAmount, save: plan.growAmount, stocks: plan.investAmount });
      }
    }
  });
});

describe("allocation conversion", () => {
  it("round trips and tolerates junk", () => {
    const split = { home: 70, save: 20, stocks: 10 };
    expect(toSplit(toAllocation(split))).toEqual(split);
    expect(toSplit({ now: "", grow: "abc", invest: "5" })).toEqual({ home: 0, save: 0, stocks: 5 });
  });
});

describe("amountsToSplit", () => {
  it("gives whole percentages that total 100", () => {
    const total = 123_456_789n;
    for (const split of [{ home: 50, save: 30, stocks: 20 }, { home: 33, save: 33, stocks: 34 }, { home: 100, save: 0, stocks: 0 }, { home: 0, save: 60, stocks: 40 }, { home: 70, save: 30, stocks: 0 }]) {
      const out = amountsToSplit(splitAmounts(total, split), total);
      expect(out.home + out.save + out.stocks).toBe(100);
      expect(isValidSplit(out)).toBe(true);
    }
  });

  it("shows a fallback as savings", () => {
    expect(amountsToSplit({ home: 50n, save: 50n, stocks: 0n }, 100n)).toEqual({ home: 50, save: 50, stocks: 0 });
  });

  it("handles a zero total", () => {
    expect(amountsToSplit({ home: 0n, save: 0n, stocks: 0n }, 0n)).toEqual({ home: 100, save: 0, stocks: 0 });
  });
});
