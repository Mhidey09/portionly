import { describe, expect, it } from "vitest";
import { judgeStockQuote } from "./stockPrice";

// Quotes read from the mainnet pool on 19 Oct 2026: one cent of AUSD bought 0.000013644 aQQQ.
const ref = 13_644_000_000_000n;

describe("judgeStockQuote", () => {
  it("passes a buy that gets the margin price", () => {
    expect(judgeStockQuote(1_000_000n, 1_364_339_327_090_754n, ref).thin).toBe(false);
  });
  it("stops a buy that pays far more than the margin price", () => {
    expect(judgeStockQuote(2_000_000n, 2_355_170_000_000_000n, ref).thin).toBe(true);
    expect(judgeStockQuote(10_000_000n, 2_456_250_000_000_000n, ref).thin).toBe(true);
  });
  it("allows up to 2% below the margin price", () => {
    const fair = (ref * 5_000_000n) / 10_000n;
    expect(judgeStockQuote(5_000_000n, (fair * 9_801n) / 10_000n, ref).thin).toBe(false);
    expect(judgeStockQuote(5_000_000n, (fair * 9_790n) / 10_000n, ref).thin).toBe(true);
  });
  it("scales the fair amount from the reference buy", () => {
    expect(judgeStockQuote(1_000_000n, 1n, ref).fairOut).toBe(ref * 100n);
  });
});
