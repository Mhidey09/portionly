import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { deriveEvmPrivateKey } from "./hd";

const prf = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const hex = (b: Uint8Array) => bytesToHex(b);

describe("deriveEvmPrivateKey", () => {
  it("index 0 (default) matches the original m/44'/60'/0'/0/0 derivation", () => {
    expect(hex(deriveEvmPrivateKey(prf))).toBe("7c56100e187f2845a35ce856646662dfc2024be2b4a150b45ad1f62564617128");
    expect(hex(deriveEvmPrivateKey(prf, 0))).toBe(hex(deriveEvmPrivateKey(prf)));
  });
  it("derives distinct, deterministic keys per index", () => {
    const [k0, k1, k2] = [0, 1, 2].map((i) => hex(deriveEvmPrivateKey(prf, i)));
    expect(new Set([k0, k1, k2]).size).toBe(3);
    expect(hex(deriveEvmPrivateKey(prf, 1))).toBe(k1);
  });
  it("rejects invalid indexes and PRF lengths", () => {
    for (const bad of [-1, 1.5, 2 ** 31, Number.NaN, Infinity]) expect(() => deriveEvmPrivateKey(prf, bad)).toThrow();
    expect(() => deriveEvmPrivateKey(new Uint8Array(31))).toThrow();
  });
  it("accepts the maximum index", () => {
    expect(deriveEvmPrivateKey(prf, 2 ** 31 - 1)).toHaveLength(32);
  });
});
