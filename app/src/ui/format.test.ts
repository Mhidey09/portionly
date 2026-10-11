import { describe, expect, it } from "vitest";
import { cleanAmountInput, formatUsd, initialOf, lockLabel, shortAddress, trimDecimals } from "./format";
import { plainMessage, stepLabel } from "./plain";

describe("format", () => {
  it("formats dollars rounded down to cents with commas", () => {
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(1_234_500_000n)).toBe("$1,234.50");
    expect(formatUsd(999_999n)).toBe("$0.99");
    expect(formatUsd(12_345_678_999_999n)).toBe("$12,345,678.99");
  });

  it("trims decimals", () => {
    expect(trimDecimals("1.2300000", 4)).toBe("1.23");
    expect(trimDecimals("3.141592", 3)).toBe("3.141");
    expect(trimDecimals("5.000", 3)).toBe("5");
    expect(trimDecimals("7", 2)).toBe("7");
  });

  it("shortens an address to 0x1234…abcd", () => {
    expect(shortAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe("0x1234…5678");
  });

  it("labels locks without hyphens", () => {
    expect([0, 30, 90, 180, 365].map(lockLabel)).toEqual(["No lock", "1 month", "3 months", "6 months", "1 year"]);
  });

  it("cleans amount input", () => {
    expect(cleanAmountInput("12a.345.6")).toBe("12.34");
    expect(cleanAmountInput("1,000")).toBe("1000");
    expect(cleanAmountInput("")).toBe("");
  });

  it("finds an initial", () => {
    expect(initialOf("  james")).toBe("J");
    expect(initialOf("")).toBe("?");
  });
});

describe("plain messages", () => {
  it("maps technical errors to plain sentences", () => {
    expect(plainMessage("Post-check failed: sender AUSD delta is wrong")).toMatch(/could not confirm/);
    expect(plainMessage("At least 0.12 MON is required")).toMatch(/fee balance/);
    expect(plainMessage("Quote is stale")).toMatch(/review again/);
  });

  it("fails closed on unreadable errors", () => {
    expect(plainMessage("ERR_SOMETHING: 0xdeadbeef reverted weirdly in a-b")).not.toMatch(/0xdeadbeef/);
    expect(plainMessage("")).toMatch(/Something went wrong/);
  });

  it("never returns dashes", () => {
    for (const raw of ["x-y", "a — b", "Network request failed", "random"]) expect(plainMessage(raw)).not.toMatch(/[–—-]/);
  });

  it("names the two payment steps", () => {
    expect(stepLabel("Approve exact AUSD total")).toBe("Allowing the amount");
    expect(stepLabel("Execute Portionly plan")).toBe("Sending");
  });
});

describe("stockBuyCost", () => {
  it("states the pool fee for the stock part in dollars", async () => {
    const { stockBuyCost } = await import("./format");
    expect(stockBuyCost(40_000_000n)).toBe("about $0.36");
    expect(stockBuyCost(200_000n)).toBe("less than $0.01");
  });
});
