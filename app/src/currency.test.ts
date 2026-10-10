import { describe, expect, it } from "vitest";
import fixture from "./fixtures/er-api-usd.json";
import { aboutLocal, convert, CURRENCIES, currencyOf, formatLocal, isCurrencyCode, isFresh, MAX_AGE_MS, parseRates } from "./currency";

const updated = fixture.time_last_update_unix * 1000;
const now = updated + 60 * 60 * 1000;

describe("currency list", () => {
  it("has about thirty five unique, well formed entries", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(CURRENCIES.map((c) => c.code)).size).toBe(CURRENCIES.length);
    for (const c of CURRENCIES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.flag.length).toBeGreaterThan(0);
    }
  });
  it("validates codes against the list", () => {
    expect(isCurrencyCode("NGN")).toBe(true);
    expect(isCurrencyCode("ngn")).toBe(false);
    expect(isCurrencyCode("XYZ")).toBe(false);
    expect(isCurrencyCode(5)).toBe(false);
    expect(currencyOf("PHP")?.name).toBe("Philippine peso");
    expect(currencyOf(undefined)).toBeUndefined();
  });
  it("every listed currency has a rate in the recorded fixture", () => {
    const parsed = parseRates(fixture, now)!;
    for (const c of CURRENCIES) expect(parsed.rates[c.code], c.code).toBeGreaterThan(0);
  });
});

describe("parseRates", () => {
  it("reads the recorded response", () => {
    const parsed = parseRates(fixture, now);
    expect(parsed?.fetchedAt).toBe(now);
    expect(parsed?.rates.NGN).toBe(fixture.rates.NGN);
    expect(parsed?.rates.USD).toBeUndefined();
  });
  it("rejects bad shapes", () => {
    expect(parseRates(null, now)).toBeNull();
    expect(parseRates("x", now)).toBeNull();
    expect(parseRates({ ...fixture, result: "error" }, now)).toBeNull();
    expect(parseRates({ ...fixture, rates: undefined }, now)).toBeNull();
    expect(parseRates({ ...fixture, rates: [] }, now)).toBeNull();
    expect(parseRates({ ...fixture, rates: { NGN: "1500" } }, now)).toBeNull();
    expect(parseRates({ ...fixture, time_last_update_unix: "now" }, now)).toBeNull();
  });
  it("drops zero, negative and non finite rates but keeps the good ones", () => {
    const parsed = parseRates({ ...fixture, rates: { NGN: 1500, GHS: 0, KES: -3, PHP: null, ZZZ: 4 } }, now);
    expect(parsed?.rates).toEqual({ NGN: 1500 });
  });
  it("refuses an answer the provider itself has not refreshed for over 36 hours", () => {
    expect(parseRates(fixture, updated + 35 * 3_600_000)).not.toBeNull();
    expect(parseRates(fixture, updated + 37 * 3_600_000)).toBeNull();
  });
});

describe("isFresh", () => {
  it("is fresh up to 12 hours and not after", () => {
    expect(isFresh(1000, 1000)).toBe(true);
    expect(isFresh(0, MAX_AGE_MS)).toBe(true);
    expect(isFresh(0, MAX_AGE_MS + 1)).toBe(false);
  });
  it("is not fresh from the future or for junk", () => {
    expect(isFresh(10 * 60_000, 0)).toBe(false);
    expect(isFresh(NaN, 0)).toBe(false);
  });
});

describe("convert and formatLocal", () => {
  it("converts micro dollars", () => {
    expect(convert(200_000_000n, 1500)).toBe(300_000);
    expect(convert(500_000n, 2)).toBe(1);
    expect(convert(0n, 1500)).toBe(0);
    expect(Number.isNaN(convert(1n, 0))).toBe(true);
    expect(Number.isNaN(convert(1n, Infinity))).toBe(true);
  });
  it("shows no decimals for small unit currencies and two for others", () => {
    expect(formatLocal(310000.4, "NGN")).toBe("₦310,000");
    expect(formatLocal(1234567, "IDR")).toMatch(/1,234,567$/);
    expect(formatLocal(12.5, "EUR")).toBe("€12.50");
    expect(formatLocal(1234.5, "PHP")).toBe("₱1,234.50");
  });
  it("falls back when Intl does not know the currency", () => {
    expect(formatLocal(1234.5, "XX")).toBe("XX 1,234.50");
    expect(formatLocal(NaN, "NGN")).toBe("");
  });
});

describe("aboutLocal", () => {
  const rates = parseRates(fixture, now)!;
  it("labels the amount as approximate", () => {
    const text = aboutLocal(200_000_000n, "NGN", rates, now);
    expect(text).toMatch(/^about ₦\d{1,3}(,\d{3})+$/);
    expect(text).toBe(`about ${formatLocal(200 * fixture.rates.NGN, "NGN")}`);
  });
  it("is null with no currency, no rate for it, or a stale rate", () => {
    expect(aboutLocal(1_000_000n, undefined, rates, now)).toBeNull();
    expect(aboutLocal(1_000_000n, "NGN", null, now)).toBeNull();
    expect(aboutLocal(1_000_000n, "XYZ", rates, now)).toBeNull();
    expect(aboutLocal(1_000_000n, "NGN", rates, now + MAX_AGE_MS + 1)).toBeNull();
  });
});
