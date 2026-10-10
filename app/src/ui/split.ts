/** Pure math for the portion bar. No React in here so it can be tested. */

export type Split = { home: number; save: number; stocks: number };
export type Amounts = { home: bigint; save: bigint; stocks: bigint };
export type Handle = 0 | 1;

export const STEP = 5;

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** Snap any percentage to the nearest step of 5, kept inside 0 to 100. */
export function snap(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.round(clamp(percent, 0, 100) / STEP) * STEP;
}

/** Handle 0 is the line between home and savings. Handle 1 is the line between savings and stocks. */
export function moveHandle(split: Split, handle: Handle, percent: number): Split {
  const at = snap(percent);
  if (handle === 0) {
    const home = Math.min(at, split.home + split.save);
    return { home, save: split.home + split.save - home, stocks: split.stocks };
  }
  const edge = Math.max(at, split.home);
  return { home: split.home, save: edge - split.home, stocks: 100 - edge };
}

/** Keyboard and screen reader nudge: one step left (-1) or right (+1). */
export function stepHandle(split: Split, handle: Handle, direction: 1 | -1): Split {
  const current = handle === 0 ? split.home : split.home + split.save;
  return moveHandle(split, handle, current + direction * STEP);
}

export function percentFromOffset(offset: number, width: number): number {
  if (!(width > 0)) return 0;
  return snap((offset / width) * 100);
}

export function isValidSplit(split: Split): boolean {
  const parts = [split.home, split.save, split.stocks];
  return parts.every((value) => Number.isInteger(value) && value >= 0 && value <= 100) && parts[0] + parts[1] + parts[2] === 100;
}

/**
 * Dollars per portion in the smallest unit. Same rule as buildPortionlyPlan:
 * rounding dust goes to the last portion in use, so an unused portion is always exactly 0.
 */
export function splitAmounts(total: bigint, split: Split): Amounts {
  let home = (total * BigInt(split.home)) / 100n;
  let save = (total * BigInt(split.save)) / 100n;
  let stocks = 0n;
  if (split.stocks > 0) stocks = total - home - save;
  else if (split.save > 0) save = total - home;
  else home = total;
  return { home, save, stocks };
}

export type AllocationStrings = { now: string; grow: string; invest: string };

export function toSplit(allocation: AllocationStrings): Split {
  const read = (value: string): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };
  return { home: read(allocation.now), save: read(allocation.grow), stocks: read(allocation.invest) };
}

export function toAllocation(split: Split): AllocationStrings {
  return { now: String(split.home), grow: String(split.save), invest: String(split.stocks) };
}

/**
 * Turn real amounts back into whole percentages that total 100, for the bar shown after a send.
 * Rounding leftovers go to the last portion in use. A zero total gives all home.
 */
export function amountsToSplit(amounts: Amounts, total: bigint): Split {
  if (total <= 0n) return { home: 100, save: 0, stocks: 0 };
  const pct = (value: bigint): number => Number((value * 100n) / total);
  if (amounts.stocks > 0n) {
    const home = pct(amounts.home);
    const save = pct(amounts.save);
    return { home, save, stocks: 100 - home - save };
  }
  if (amounts.save > 0n) {
    const save = pct(amounts.save);
    return { home: 100 - save, save, stocks: 0 };
  }
  return { home: 100, save: 0, stocks: 0 };
}
