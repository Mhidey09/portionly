/**
 * The stock fund trades in one small pool, so a larger buy can move its price far past the pool fee.
 * A tiny reference buy gives the price at the margin; the real buy is compared against it.
 */
export const REFERENCE_IN = 10_000n; // one cent of AUSD, small enough to read the price at the margin
export const MAX_IMPACT_BPS = 200n; // 2% worse than the margin price, on top of the pool fee already in both quotes
export const THIN_POOL_MESSAGE = "The stock pool is too small for that amount right now. Lower the stock part or move it to savings, then review again.";

/** What the real buy would get at the margin price, and whether the actual quote falls too far short of it. */
export function judgeStockQuote(amountIn: bigint, amountOut: bigint, referenceOut: bigint): { fairOut: bigint; thin: boolean } {
  if (amountIn <= 0n || referenceOut <= 0n) throw new Error("A live stock quote is required to invest");
  const fairOut = (referenceOut * amountIn) / REFERENCE_IN;
  const thin = amountOut * 10_000n < fairOut * (10_000n - MAX_IMPACT_BPS);
  return { fairOut, thin };
}
