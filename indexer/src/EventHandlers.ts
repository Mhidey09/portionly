import { indexer } from "envio";

indexer.onEvent({ contract: "PortionlySplitterV2", event: "PlanExecuted" }, async ({ event, context }) => {
  const p = event.params;
  const recipient = p.recipient.toLowerCase();
  context.Plan.set({
    id: `${event.transaction.hash}-${event.logIndex}`,
    planId: p.planId,
    sender: p.sender.toLowerCase(),
    recipient,
    nowAmount: p.nowAmount,
    growAmount: p.growAmount,
    growShares: p.growShares,
    investAmount: p.investAmount,
    investOut: p.investOut,
    usedFallback: p.usedFallback,
    blockNumber: event.block.number,
    timestamp: event.block.timestamp,
    txHash: event.transaction.hash,
  });
  const r = await context.Recipient.get(recipient);
  context.Recipient.set({
    id: recipient,
    totalNow: (r?.totalNow ?? 0n) + p.nowAmount,
    totalGrowAmount: (r?.totalGrowAmount ?? 0n) + p.growAmount,
    totalGrowShares: (r?.totalGrowShares ?? 0n) + p.growShares,
    totalInvestAmount: (r?.totalInvestAmount ?? 0n) + p.investAmount,
    totalInvestOut: (r?.totalInvestOut ?? 0n) + p.investOut,
    planCount: (r?.planCount ?? 0) + 1,
    lastPlanAt: event.block.timestamp,
  });
});

indexer.onEvent({ contract: "PortionlyFuture", event: "PositionLocked" }, async ({ event, context }) => {
  const p = event.params;
  context.Position.set({
    id: p.positionId,
    depositor: p.depositor.toLowerCase(),
    beneficiary: p.beneficiary.toLowerCase(),
    asset: p.asset.toLowerCase(),
    amount: p.amount,
    unlockAt: p.unlockAt,
    lockedAt: event.block.timestamp,
    lockTxHash: event.transaction.hash,
    claimed: false,
    claimedAt: undefined,
    claimTxHash: undefined,
  });
});

indexer.onEvent({ contract: "PortionlyFuture", event: "PositionClaimed" }, async ({ event, context }) => {
  const pos = await context.Position.get(event.params.positionId);
  if (!pos) {
    context.log.warn(`PositionClaimed for unknown position ${event.params.positionId}`);
    return;
  }
  context.Position.set({ ...pos, claimed: true, claimedAt: event.block.timestamp, claimTxHash: event.transaction.hash });
});
