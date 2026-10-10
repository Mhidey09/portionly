import { describe, expect, it } from "vitest";
import { parseRecipientInput, receiveLink } from "./receive";

const checksummed = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";
const lower = checksummed.toLowerCase();

describe("receiveLink", () => {
  it("builds a checksummed pay link", () => {
    expect(receiveLink(lower)).toBe(`https://portionly-three.vercel.app/pay/${checksummed}`);
  });
  it("refuses an invalid address", () => {
    expect(() => receiveLink("0x123")).toThrow(/valid/i);
  });
});

describe("parseRecipientInput", () => {
  it("accepts raw addresses in any valid casing and trims", () => {
    expect(parseRecipientInput(checksummed)).toBe(checksummed);
    expect(parseRecipientInput(`  ${lower}\n`)).toBe(checksummed);
  });
  it("accepts pay links in all the shapes people paste", () => {
    for (const text of [
      `https://portionly-three.vercel.app/pay/${checksummed}`,
      `https://portionly-three.vercel.app/pay/${lower}/`,
      `portionly-three.vercel.app/pay/${checksummed}`,
      `HTTPS://PORTIONLY-THREE.VERCEL.APP/PAY/${lower}`,
      `http://portionly-three.vercel.app/pay/${checksummed}?x=1#top`,
      `Pay me here: https://portionly-three.vercel.app/pay/${checksummed}`,
    ]) expect(parseRecipientInput(text)).toBe(checksummed);
  });
  it("accepts ethereum: URIs", () => {
    expect(parseRecipientInput(`ethereum:${lower}`)).toBe(checksummed);
    expect(parseRecipientInput(`ethereum:${checksummed}@143?value=1`)).toBe(checksummed);
    expect(parseRecipientInput(`ethereum:pay-${lower}`)).toBe(checksummed);
  });
  it("rejects bad input with plain English", () => {
    for (const text of [
      "",
      "   ",
      "hello",
      "0x123",
      `0x${"g".repeat(40)}`,
      // mixed case with a wrong checksum
      "0x42E0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2",
      `https://evil.example/pay/${checksummed}`,
      "https://portionly-three.vercel.app/pay/0x123",
      `https://portionly-three.vercel.app/other/${checksummed}`,
      `ethereum:${lower}00`,
    ]) expect(() => parseRecipientInput(text), text).toThrow(/address|link/i);
  });
});
