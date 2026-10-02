import {
  encodeFunctionData,
  encodePacked,
  keccak256,
  type Address,
  type Hex,
} from "viem";
import { ADDRESSES } from "./aqqqProofPlan";

const BPS = 10_000n;
const MAX_QUOTE_AGE_MS = 60_000;
const MIN_MON_BALANCE = 120_000_000_000_000_000n;
const DEADLINE_SECONDS = 600n;

const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const portionlySplitterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "plan",
        type: "tuple",
        components: [
          { name: "recipient", type: "address" },
          { name: "nowAmount", type: "uint256" },
          { name: "growAmount", type: "uint256" },
          { name: "investAmount", type: "uint256" },
          { name: "investMinimumOut", type: "uint256" },
          { name: "fallbackInvestToGrow", type: "bool" },
          { name: "unlockAt", type: "uint64" },
          { name: "deadline", type: "uint256" },
          { name: "planId", type: "bytes32" },
        ],
      },
    ],
    outputs: [
      { name: "growShares", type: "uint256" },
      { name: "investOut", type: "uint256" },
      { name: "usedFallback", type: "bool" },
    ],
  },
  {
    type: "event",
    name: "PlanExecuted",
    anonymous: false,
    inputs: [
      { name: "planId", type: "bytes32", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "nowAmount", type: "uint256", indexed: false },
      { name: "growAmount", type: "uint256", indexed: false },
      { name: "growShares", type: "uint256", indexed: false },
      { name: "investAmount", type: "uint256", indexed: false },
      { name: "investOut", type: "uint256", indexed: false },
      { name: "usedFallback", type: "bool", indexed: false },
    ],
  },
] as const;

type PlannedCall = { label: string; to: Address; data: Hex; value: bigint };
type PortionlyPlanInput = {
  chainId: number;
  account: Address;
  recipient: Address;
  splitter: Address;
  ausdBalance: bigint;
  monBalance: bigint;
  amountIn: bigint;
  nowBps: number;
  growBps: number;
  investBps: number;
  quote: { amountOut: bigint; observedAtMs: number };
  nowMs: number;
  slippageBps: number;
};
type PortionlyPlan = {
  chainId: 143;
  account: Address;
  recipient: Address;
  amountIn: bigint;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  investMinimumOut: bigint;
  deadline: bigint;
  planId: Hex;
  calls: readonly PlannedCall[];
};

function buildPortionlyPlan(input: PortionlyPlanInput): PortionlyPlan {
  if (input.chainId !== 143) throw new Error("Monad mainnet chain ID 143 is required");
  if (input.recipient.toLowerCase() === "0x0000000000000000000000000000000000000000") throw new Error("Recipient cannot be zero");
  if (input.amountIn <= 0n) throw new Error("Amount must be positive");
  if (input.ausdBalance < input.amountIn) throw new Error("AUSD balance is below the plan total");
  if (input.monBalance < MIN_MON_BALANCE) throw new Error("At least 0.12 MON is required");
  if (![input.nowBps, input.growBps, input.investBps, input.slippageBps].every(Number.isSafeInteger)) throw new Error("Allocations must be integers");
  if (input.nowBps < 0 || input.growBps < 0 || input.investBps < 0 || input.nowBps + input.growBps + input.investBps !== 10_000) throw new Error("Allocations must sum to 100%");
  if (input.slippageBps < 0 || input.slippageBps > 100) throw new Error("Slippage cannot exceed 1%");
  if (!Number.isSafeInteger(input.nowMs) || !Number.isSafeInteger(input.quote.observedAtMs) || input.nowMs < input.quote.observedAtMs || input.nowMs - input.quote.observedAtMs > MAX_QUOTE_AGE_MS) throw new Error("Quote is stale");

  const nowAmount = input.amountIn * BigInt(input.nowBps) / BPS;
  const growAmount = input.amountIn * BigInt(input.growBps) / BPS;
  const investAmount = input.amountIn - nowAmount - growAmount;
  if (investAmount <= 0n || input.quote.amountOut <= 0n) throw new Error("Invest allocation and quote must be positive");
  const investMinimumOut = input.quote.amountOut * (BPS - BigInt(input.slippageBps)) / BPS;
  const deadline = BigInt(Math.floor(input.nowMs / 1_000)) + DEADLINE_SECONDS;
  const planId = keccak256(encodePacked(
    ["address", "address", "uint256", "uint256"],
    [input.account, input.recipient, input.amountIn, BigInt(input.nowMs)],
  ));
  const plan = {
    recipient: input.recipient,
    nowAmount,
    growAmount,
    investAmount,
    investMinimumOut,
    fallbackInvestToGrow: true,
    unlockAt: 0n,
    deadline,
    planId,
  } as const;

  return {
    chainId: 143,
    account: input.account,
    recipient: input.recipient,
    amountIn: input.amountIn,
    nowAmount,
    growAmount,
    investAmount,
    investMinimumOut,
    deadline,
    planId,
    calls: [
      {
        label: "Approve exact AUSD total",
        to: ADDRESSES.ausd,
        data: encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [input.splitter, input.amountIn] }),
        value: 0n,
      },
      {
        label: "Execute Portionly plan",
        to: input.splitter,
        data: encodeFunctionData({ abi: portionlySplitterAbi, functionName: "execute", args: [plan] }),
        value: 0n,
      },
    ],
  };
}

export { buildPortionlyPlan, portionlySplitterAbi };
export type { PortionlyPlan, PortionlyPlanInput, PlannedCall };
