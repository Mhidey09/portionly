import { describe, expect, it } from "vitest";
import { claimUrl, linkFromBytes, parseClaimInput } from "./linkPay";
import { addressOfLink, currencyOfLink, linkStatus, lockPhrase, parseMoneyLink, parseSendInputs, shareMessage, shareUrl } from "./linkShare";

const link = linkFromBytes(Uint8Array.from({ length: 32 }, (_, i) => i + 1));

describe("share url and parsing", () => {
  it("puts the currency before the # and keeps the key in the fragment", () => {
    const url = shareUrl(link.key, "NGN");
    expect(url).toBe(`https://portionly-three.vercel.app/claim?cur=NGN#${link.key.slice(2)}`);
    expect(shareUrl(link.key)).toBe(claimUrl(link.key));
    expect(shareUrl(link.key, "ZZZ")).toBe(claimUrl(link.key));
  });

  it("parseClaimInput alone does not accept a query before the #, so the helper strips it", () => {
    const url = shareUrl(link.key, "NGN");
    expect(() => parseClaimInput(url)).toThrow();
    expect(parseMoneyLink(url)).toBe(link.key);
    expect(parseMoneyLink(`I sent you $200. Open this to collect it: ${url} thanks`)).toBe(link.key);
    expect(parseMoneyLink(claimUrl(link.key))).toBe(link.key);
    expect(addressOfLink(url)).toBe(link.address);
  });

  it("reads the currency back out and rejects a non link", () => {
    expect(currencyOfLink(shareUrl(link.key, "GHS"))).toBe("GHS");
    expect(currencyOfLink(claimUrl(link.key))).toBeUndefined();
    expect(() => parseMoneyLink("hello")).toThrow();
  });
});

describe("wording and inputs", () => {
  it("phrases lock lengths", () => {
    expect(lockPhrase(0)).toBe("");
    expect(lockPhrase(30)).toBe("1 month");
    expect(lockPhrase(90)).toBe("3 months");
    expect(lockPhrase(180)).toBe("6 months");
    expect(lockPhrase(365)).toBe("1 year");
  });

  it("writes the share message without dashes", () => {
    expect(shareMessage("$200.00")).toBe("I sent you $200.00 on Portionly. Open this to collect it:");
    expect(shareMessage("$1")).not.toMatch(/[–—-]/);
  });

  it("parses amount and portions like the normal review", () => {
    expect(parseSendInputs("200", { now: "50", grow: "30", invest: "20" })).toEqual({ total: 200_000_000n, percentages: [50, 30, 20] });
    expect(() => parseSendInputs("0", { now: "100", grow: "0", invest: "0" })).toThrow("greater than zero");
    expect(() => parseSendInputs("5", { now: "50", grow: "30", invest: "10" })).toThrow("100%");
    expect(() => parseSendInputs("5", { now: "50.5", grow: "29.5", invest: "20" })).toThrow("whole numbers");
  });

  it("maps on chain state to a status", () => {
    expect(linkStatus({ open: true })).toBe("waiting");
    expect(linkStatus({ open: false })).toBe("closed");
    expect(linkStatus(undefined)).toBe("unfunded");
    expect(linkStatus("error")).toBe("unknown");
  });
});
