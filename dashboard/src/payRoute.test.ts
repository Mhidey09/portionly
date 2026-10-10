import { describe, expect, it } from "vitest";
import vercel from "../vercel.json";
import { apkLink, parsePayPath } from "./payRoute";

const checksummed = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";

describe("parsePayPath", () => {
  it("returns null for non pay paths", () => {
    expect(parsePayPath("/")).toBeNull();
    expect(parsePayPath("/other/" + checksummed)).toBeNull();
  });
  it("returns the checksummed address for a pay path, any case, trailing slash", () => {
    expect(parsePayPath(`/pay/${checksummed}`)).toEqual({ address: checksummed });
    expect(parsePayPath(`/PAY/${checksummed.toLowerCase()}/`)).toEqual({ address: checksummed });
  });
  it("reports an error for a malformed pay address", () => {
    const result = parsePayPath("/pay/0x123");
    expect(result && "error" in result && result.error).toMatch(/valid/i);
    expect(parsePayPath("/pay/")).toEqual({ error: expect.stringMatching(/valid/i) });
  });
});

describe("apkLink", () => {
  it("hides the link unless a real https URL is configured", () => {
    expect(apkLink(undefined)).toBeNull();
    expect(apkLink("  ")).toBeNull();
    expect(apkLink("javascript:alert(1)")).toBeNull();
    expect(apkLink("http://x.test/a.apk")).toBeNull();
    expect(apkLink("https://x.test/a.apk")).toBe("https://x.test/a.apk");
  });
});

describe("vercel.json", () => {
  const config: { rewrites: { source: string; destination: string }[] } = vercel;
  const matches = (path: string) =>
    config.rewrites.some(({ source }) => new RegExp(`^${source.replace(/:path\*/g, ".*")}$`).test(path));
  it("rewrites /pay/* to the SPA", () => {
    expect(matches(`/pay/${checksummed}`)).toBe(true);
    expect(matches("/proof")).toBe(true);
    expect(config.rewrites.every((r) => r.destination === "/index.html")).toBe(true);
  });
  it("never rewrites assetlinks.json or other static paths", () => {
    expect(matches("/.well-known/assetlinks.json")).toBe(false);
    expect(matches("/assets/index.js")).toBe(false);
  });
});
