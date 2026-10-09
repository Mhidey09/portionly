import { describe, expect, it } from "vitest";
import { ADDRESSES } from "./aqqqProofPlan";

describe("pinned addresses", () => {
  // Read from mainnet on 2026-10-09: vault.lpTokenAddress() == earnAUSD. The vault has no balanceOf,
  // so reading Grow shares from the vault address reverts on device.
  it("reads Grow shares from earnAUSD, not the Upshift vault", () => {
    expect(ADDRESSES.growShare).toBe("0x103222f020e98Bba0AD9809A011FDF8e6F067496");
    expect(ADDRESSES.growShare.toLowerCase()).not.toBe(ADDRESSES.growVault.toLowerCase());
  });
});
