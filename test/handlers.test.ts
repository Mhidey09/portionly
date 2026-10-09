import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";

const RECIPIENT: `0x${string}` = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";
const PLAN_ID: `0x${string}` = ("0x" + "11".repeat(32)) as `0x${string}`;
const POS_ID: `0x${string}` = ("0x" + "22".repeat(32)) as `0x${string}`;
const ASSET: `0x${string}` = "0x00000000000000000000000000000000000000AA";
const TX1: `0x${string}` = ("0x" + "a1".repeat(32)) as `0x${string}`;
const TX2: `0x${string}` = ("0x" + "a2".repeat(32)) as `0x${string}`;

describe("PlanExecuted", () => {
  it("creates Plans and accumulates Recipient totals across two plans", async () => {
    const indexer = createTestIndexer();
    const plan = (n: bigint, tx: `0x${string}`, ts: number, block: number) => ({
      contract: "PortionlySplitterV2" as const,
      event: "PlanExecuted" as const,
      block: { number: block, timestamp: ts },
      transaction: { hash: tx },
      params: {
        planId: PLAN_ID,
        sender: RECIPIENT,
        recipient: RECIPIENT,
        nowAmount: 500000n * n,
        growAmount: 500000n * n,
        growShares: 477870n * n,
        investAmount: 500000n * n,
        investOut: 686925658185242n * n,
        usedFallback: false,
      },
    });
    await indexer.process({
      chains: { 143: { simulate: [plan(1n, TX1, 1000, 111992690), plan(2n, TX2, 2000, 111992700)] } },
    });
    const plans = await indexer.Plan.getAll();
    expect(plans).toHaveLength(2);
    const r = await indexer.Recipient.getOrThrow(RECIPIENT.toLowerCase());
    expect(r.planCount).toBe(2);
    expect(r.totalNow).toBe(1500000n);
    expect(r.totalGrowAmount).toBe(1500000n);
    expect(r.totalGrowShares).toBe(477870n * 3n);
    expect(r.totalInvestAmount).toBe(1500000n);
    expect(r.totalInvestOut).toBe(686925658185242n * 3n);
    expect(r.lastPlanAt).toBe(2000);
  });
});

describe("Position lifecycle", () => {
  it("PositionLocked then PositionClaimed flips claimed", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        143: {
          simulate: [
            {
              contract: "PortionlyFuture",
              event: "PositionLocked",
              block: { number: 111992800, timestamp: 3000 },
              transaction: { hash: TX1 },
              params: { positionId: POS_ID, depositor: RECIPIENT, beneficiary: RECIPIENT, asset: ASSET, amount: 123n, unlockAt: 9999n },
            },
          ],
        },
      },
    });
    const locked = await indexer.Position.getOrThrow(POS_ID);
    expect(locked.claimed).toBe(false);
    expect(locked.lockTxHash).toBe(TX1);

    await indexer.process({
      chains: {
        143: {
          simulate: [
            {
              contract: "PortionlyFuture",
              event: "PositionClaimed",
              block: { number: 111992900, timestamp: 4000 },
              transaction: { hash: TX2 },
              params: { positionId: POS_ID, beneficiary: RECIPIENT, asset: ASSET, amount: 123n },
            },
          ],
        },
      },
    });
    const claimed = await indexer.Position.getOrThrow(POS_ID);
    expect(claimed.claimed).toBe(true);
    expect(claimed.claimedAt).toBe(4000);
    expect(claimed.claimTxHash).toBe(TX2);
    expect(claimed.amount).toBe(123n);
  });
});
