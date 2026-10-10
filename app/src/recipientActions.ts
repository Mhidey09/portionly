import { encodeAbiParameters, encodeFunctionData, type Address, type Hex } from "viem";
import { ADDRESSES, type PlannedCall } from "./aqqqProofPlan";

// What a recipient can do with what arrived: turn savings back into AUSD, or sell the stock part.

const BPS = 10_000n;
const MAX_SLIPPAGE_BPS = 100;
const MAX_QUOTE_AGE_MS = 60_000;
const DEADLINE_SECONDS = 600n;
const MIN_MON_BALANCE = 120_000_000_000_000_000n;
const ROUTER_AS_RECIPIENT = "0x0000000000000000000000000000000000000002";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const erc20ApproveAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;
const permit2ApproveAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "token", type: "address" }, { name: "spender", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }], outputs: [] },
] as const;
const routerAbi = [
  { type: "function", name: "execute", stateMutability: "payable", inputs: [{ name: "commands", type: "bytes" }, { name: "inputs", type: "bytes[]" }, { name: "deadline", type: "uint256" }], outputs: [] },
] as const;
const upshiftAbi = [
  { type: "function", name: "instantRedeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [] },
  { type: "function", name: "requestRedeem", stateMutability: "nonpayable", inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "year", type: "uint256" }, { name: "month", type: "uint256" }, { name: "day", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [] },
] as const;

type Withdrawal = "instant" | "standard";

/** Savings back to AUSD. Instant pays now minus the vault fee; standard pays in full after the vault's lag, then needs a claim. */
function buildWithdrawSavingsCalls(input: { account: Address; shares: bigint; shareBalance: bigint; monBalance: bigint; kind: Withdrawal }): PlannedCall[] {
  if (input.shares <= 0n) throw new Error("Choose an amount of savings to withdraw");
  if (input.shares > input.shareBalance) throw new Error("That is more than your savings");
  if (input.monBalance < MIN_MON_BALANCE) throw new Error("At least 0.12 MON is required for network fees");
  return [
    { label: "Approve savings", to: ADDRESSES.growShare, data: encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [ADDRESSES.growVault, input.shares] }), value: 0n },
    {
      label: input.kind === "instant" ? "Withdraw savings now" : "Request withdrawal",
      to: ADDRESSES.growVault,
      data: encodeFunctionData({ abi: upshiftAbi, functionName: input.kind === "instant" ? "instantRedeem" : "requestRedeem", args: [input.shares, input.account] }),
      value: 0n,
    },
  ];
}

/** Collect a standard withdrawal on or after its claim date (from the vault's withdrawal epoch at request time). */
function buildClaimWithdrawalCall(input: { account: Address; year: number; month: number; day: number }): PlannedCall {
  const parts = [input.year, input.month, input.day];
  if (!parts.every(Number.isSafeInteger) || input.month < 1 || input.month > 12 || input.day < 1 || input.day > 31) throw new Error("Invalid claim date");
  return {
    label: "Collect withdrawal",
    to: ADDRESSES.growVault,
    data: encodeFunctionData({ abi: upshiftAbi, functionName: "claim", args: [BigInt(input.year), BigInt(input.month), BigInt(input.day), input.account] }),
    value: 0n,
  };
}

/** Sell aQQQ back to AUSD over the same pinned pools as the buy (aQQQ to USDC to AUSD), with a signed minimum. */
function buildSellStocksCalls(input: {
  account: Address;
  amountIn: bigint;
  aqqqBalance: bigint;
  monBalance: bigint;
  quote: { amountOut: bigint; observedAtMs: number };
  nowMs: number;
  slippageBps: number;
}): { calls: PlannedCall[]; minimumOut: bigint; deadline: bigint } {
  if (input.amountIn <= 0n) throw new Error("Choose an amount to sell");
  if (input.amountIn > input.aqqqBalance) throw new Error("That is more than you hold");
  if (input.amountIn >= 2n ** 128n) throw new Error("Amount is too large");
  if (input.monBalance < MIN_MON_BALANCE) throw new Error("At least 0.12 MON is required for network fees");
  if (!Number.isSafeInteger(input.slippageBps) || input.slippageBps < 0 || input.slippageBps > MAX_SLIPPAGE_BPS) throw new Error("Slippage cannot exceed 1%");
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < input.quote.observedAtMs || input.nowMs - input.quote.observedAtMs > MAX_QUOTE_AGE_MS) throw new Error("Quote is stale");
  if (input.quote.amountOut <= 0n) throw new Error("Quote output must be positive");

  const minimumOut = input.quote.amountOut * (BPS - BigInt(input.slippageBps)) / BPS;
  const deadline = BigInt(Math.floor(input.nowMs / 1_000)) + DEADLINE_SECONDS;
  const swap = encodeAbiParameters(
    [{
      type: "tuple",
      components: [
        { name: "currencyIn", type: "address" },
        { name: "path", type: "tuple[]", components: [{ name: "intermediateCurrency", type: "address" }, { name: "fee", type: "uint256" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" }, { name: "hookData", type: "bytes" }] },
        { name: "minHopPriceX36", type: "uint256[]" },
        { name: "amountIn", type: "uint128" },
        { name: "amountOutMinimum", type: "uint128" },
      ],
    }],
    [{
      currencyIn: ADDRESSES.aqqq,
      path: [
        { intermediateCurrency: ADDRESSES.usdc, fee: 9_000n, tickSpacing: 90, hooks: ZERO_ADDRESS, hookData: "0x" },
        { intermediateCurrency: ADDRESSES.ausd, fee: 50n, tickSpacing: 1, hooks: ZERO_ADDRESS, hookData: "0x" },
      ],
      minHopPriceX36: [],
      amountIn: input.amountIn,
      amountOutMinimum: 0n,
    }],
  );
  const settle = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "bool" }], [ADDRESSES.aqqq, input.amountIn, false]);
  const take = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [ADDRESSES.ausd, ROUTER_AS_RECIPIENT, 0n]);
  const v4 = encodeAbiParameters([{ type: "bytes" }, { type: "bytes[]" }], ["0x070b0e", [swap, settle, take]]);
  const pull = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint160" }], [ADDRESSES.aqqq, ROUTER_AS_RECIPIENT, input.amountIn]);
  // The sweep enforces the signed minimum: the router reverts unless at least minimumOut AUSD reaches the seller.
  const sweep = encodeAbiParameters([{ type: "address" }, { type: "address" }, { type: "uint256" }], [ADDRESSES.ausd, input.account, minimumOut]);

  const calls: PlannedCall[] = [
    { label: "Approve Permit2", to: ADDRESSES.aqqq, data: encodeFunctionData({ abi: erc20ApproveAbi, functionName: "approve", args: [ADDRESSES.permit2, input.amountIn] }), value: 0n },
    { label: "Approve Universal Router", to: ADDRESSES.permit2, data: encodeFunctionData({ abi: permit2ApproveAbi, functionName: "approve", args: [ADDRESSES.aqqq, ADDRESSES.universalRouter, input.amountIn, Number(deadline)] }), value: 0n },
    { label: "Sell aQQQ for AUSD", to: ADDRESSES.universalRouter, data: encodeFunctionData({ abi: routerAbi, functionName: "execute", args: ["0x021004" as Hex, [pull, v4, sweep], deadline] }), value: 0n },
  ];
  return { calls, minimumOut, deadline };
}

export { buildClaimWithdrawalCall, buildSellStocksCalls, buildWithdrawSavingsCalls };
export type { Withdrawal };
