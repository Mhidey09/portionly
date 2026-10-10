import { describe, expect, it } from "vitest";
import { keyFromHash, lockText } from "./Claim";
import { claimTarget } from "./recipientLink";

const hex = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";

describe("keyFromHash", () => {
  it("reads a 64 digit key with or without # and 0x, in any case", () => {
    expect(keyFromHash(`#${hex}`)).toBe(`0x${hex}`);
    expect(keyFromHash(hex)).toBe(`0x${hex}`);
    expect(keyFromHash(`#0x${hex}`)).toBe(`0x${hex}`);
    expect(keyFromHash(`#${hex.toUpperCase()}`)).toBe(`0x${hex}`);
    expect(keyFromHash(`  #${hex}  `)).toBe(`0x${hex}`);
  });
  it("rejects anything that is not a whole key", () => {
    expect(keyFromHash("")).toBeNull();
    expect(keyFromHash("#")).toBeNull();
    expect(keyFromHash(`#${hex.slice(0, 63)}`)).toBeNull();
    expect(keyFromHash(`#${hex}0`)).toBeNull();
    expect(keyFromHash(`#${hex.slice(0, 63)}g`)).toBeNull();
    expect(keyFromHash(`#${"0".repeat(64)}`)).toBeNull();
    expect(keyFromHash(`#key=${hex}`)).toBeNull();
  });
});

describe("lockText", () => {
  it("words the lock from the day they collect", () => {
    expect(lockText(0)).toBe("");
    expect(lockText(30)).toBe("locked for 1 month from the day you collect");
    expect(lockText(90)).toBe("locked for 3 months from the day you collect");
    expect(lockText(180)).toBe("locked for 6 months from the day you collect");
    expect(lockText(365)).toBe("locked for 1 year from the day you collect");
  });
});

describe("claimTarget", () => {
  it("finds a money link in pasted text and keeps the key after the #", () => {
    expect(claimTarget(`https://portionly-three.vercel.app/claim#${hex}`)).toBe(`/claim#${hex}`);
    expect(claimTarget(`I sent you $200. Open this: https://x.test/claim?cur=ngn#${hex} thanks`)).toBe(`/claim?cur=NGN#${hex}`);
    expect(claimTarget(`/claim/#0x${hex.toUpperCase()}`)).toBe(`/claim#${hex}`);
  });
  it("ignores pay links, addresses and broken keys", () => {
    expect(claimTarget("https://portionly-three.vercel.app/pay/0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2")).toBeNull();
    expect(claimTarget("0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2")).toBeNull();
    expect(claimTarget(`/claim#${hex.slice(0, 60)}`)).toBeNull();
    expect(claimTarget(`/claim#${hex}ab`)).toBeNull();
    expect(claimTarget(`/claim#${"0".repeat(64)}`)).toBeNull();
    expect(claimTarget(`${hex}`)).toBeNull();
  });
});
