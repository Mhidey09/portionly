import { decodeFunctionData } from "viem";
import { describe, expect, it } from "vitest";
import { canClaim, claimCallData, parseLocks } from "./locks";

const key = `0x${"ab".repeat(32)}` as const;
const tx = `0x${"cd".repeat(32)}` as const;

describe("locked savings", () => {
  it("parses indexer rows whether big numbers arrive as strings or numbers", () => {
    const locks = parseLocks({ data: { Position: [{ id: key, amount: "286722", unlockAt: 1_800_000_000, claimed: false, lockTxHash: tx }] } });
    expect(locks).toEqual([{ key, amount: 286_722n, unlockAt: 1_800_000_000n, claimed: false, lockTxHash: tx }]);
  });

  it("fails closed on indexer errors or malformed rows", () => {
    expect(() => parseLocks({ errors: [{ message: "down" }] })).toThrow("down");
    expect(() => parseLocks({ data: {} })).toThrow(/Position/);
    expect(() => parseLocks({ data: { Position: [{ id: "0x12", amount: "1", unlockAt: "1", claimed: false, lockTxHash: tx }] } })).toThrow(/position id/);
  });

  it("allows a claim only once unlocked and not yet claimed", () => {
    const lock = { key, amount: 1n, unlockAt: 100n, claimed: false, lockTxHash: tx };
    expect(canClaim(lock, 99n)).toBe(false);
    expect(canClaim(lock, 100n)).toBe(true);
    expect(canClaim({ ...lock, claimed: true }, 200n)).toBe(false);
  });

  it("encodes PortionlyFuture.claim for the position key", () => {
    const decoded = decodeFunctionData({
      abi: [{ type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "bytes32" }], outputs: [] }],
      data: claimCallData(key),
    });
    expect(decoded.args[0]).toBe(key);
  });
});
