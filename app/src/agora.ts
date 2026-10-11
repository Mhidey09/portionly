import { decodeFunctionData, encodeFunctionData, formatUnits, getAddress, isAddress, type Address } from "viem";
import type { PlannedCall } from "./aqqqProofPlan";

/**
 * Agora Instant Settlement on Monad TESTNET. Everything here is pure: no network, no storage.
 * Verified on chain against https://testnet-rpc.monad.xyz and Agora's stable-swap-examples.
 */
const TESTNET_CHAIN_ID = 10143;
const TESTNET_RPC_URL = "https://testnet-rpc.monad.xyz";
const TESTNET_EXPLORER_TX = "https://testnet.monadvision.com/tx/";
const TESTNET_FAUCET_URL = "https://faucet.monad.xyz";
const METRICS_URL = "https://api.agora.finance/v0/metrics";

const AGORA = {
  pair: "0x1Aa8958Aa34cEC8096EF4381cb335effe977b0ae",
  ctk: "0x7BEb5D9DB0d85cBEa543C04f0dE8c23c2176cd9D",
  ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  faucet: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
  // Agora's own Whitelister contract. Anyone may call setApprovedSwapper for an address (checked on a fork).
  whitelister: "0x7c10F56d6f04a51376393a1C3670e966863F6BD5",
} as const satisfies Record<string, Address>;

const AUSD_DECIMALS = 6;
const CTK_DECIMALS = 18;
const SWAPPER_ROLE = "APPROVED_SWAPPER";
const DEADLINE_SECONDS = 600n;
/**
 * Test MON kept for fees. Measured gas on a fork: enable 122k, approve 51k, swap 123k (about 296k in all).
 * At the 72 gwei seen today that is about 0.021 MON; 0.05 MON leaves room for the price to more than double.
 */
const MIN_TEST_MON = 50_000_000_000_000_000n;
/** Below this many test dollars the screen offers the faucet. */
const LOW_TEST_DOLLARS = 10_000_000n;
const MAX_RECENT = 10;

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

const pairAbi = [
  { type: "function", name: "getAmountsOut", stateMutability: "view", inputs: [{ name: "_amountIn", type: "uint256" }, { name: "_path", type: "address[]" }], outputs: [{ name: "_amounts", type: "uint256[]" }] },
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_amountIn", type: "uint256" },
      { name: "_amountOutMin", type: "uint256" },
      { name: "_path", type: "address[]" },
      { name: "_to", type: "address" },
      { name: "_deadline", type: "uint256" },
    ],
    outputs: [{ name: "_amounts", type: "uint256[]" }],
  },
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ name: "_role", type: "string" }, { name: "_address", type: "address" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "isPaused", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "reserve0", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "reserve1", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "token0PurchaseFee", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "token1PurchaseFee", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "FEE_PRECISION", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
] as const;

const faucetAbi = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ name: "_receiver", type: "address" }], outputs: [] },
] as const;

const whitelisterAbi = [
  { type: "function", name: "setApprovedSwapper", stateMutability: "nonpayable", inputs: [{ name: "swapper", type: "address" }], outputs: [] },
] as const;

type SettleInput = {
  account: Address;
  recipient: string;
  amountIn: bigint;
  /** The pair's own quote for amountIn, used as the minimum out. The price is fixed, so no slippage allowance. */
  quotedOut: bigint;
  ausdBalance: bigint;
  monBalance: bigint;
  nowMs: number;
  /** False adds the one time call that approves this account as a swapper. Defaults to approved. */
  swapperApproved?: boolean;
};

type SettlePlan = { account: Address; recipient: Address; amountIn: bigint; amountOut: bigint; deadline: bigint; calls: PlannedCall[] };

function buildSettleCalls(input: SettleInput): SettlePlan {
  if (input.amountIn <= 0n) throw new Error("Enter an amount above zero.");
  if (input.amountIn > input.ausdBalance) throw new Error("You do not have enough test dollars for that.");
  const trimmed = input.recipient.trim();
  if (!isAddress(trimmed, { strict: false })) throw new Error("Enter a valid address for who gets it.");
  const recipient = getAddress(trimmed);
  if (recipient.toLowerCase() === input.account.toLowerCase()) throw new Error("Pick someone other than yourself to settle with.");
  if (input.quotedOut <= 0n) throw new Error("The pool cannot settle that amount right now.");
  if (input.monBalance < MIN_TEST_MON) throw new Error("Your test fee balance is too low. Get test MON first.");

  const deadline = BigInt(Math.floor(input.nowMs / 1000)) + DEADLINE_SECONDS;
  const calls: PlannedCall[] = [];
  if (input.swapperApproved === false) {
    calls.push({
      label: "Turn on instant settle",
      to: AGORA.whitelister,
      data: encodeFunctionData({ abi: whitelisterAbi, functionName: "setApprovedSwapper", args: [input.account] }),
      value: 0n,
    });
  }
  calls.push(
    {
      label: "Approve test dollars",
      to: AGORA.ausd,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [AGORA.pair, input.amountIn] }),
      value: 0n,
    },
    {
      label: "Settle through Agora",
      to: AGORA.pair,
      data: encodeFunctionData({
        abi: pairAbi,
        functionName: "swapExactTokensForTokens",
        args: [input.amountIn, input.quotedOut, [AGORA.ausd, AGORA.ctk], recipient, deadline],
      }),
      value: 0n,
    },
  );
  return { account: input.account, recipient, amountIn: input.amountIn, amountOut: input.quotedOut, deadline, calls };
}

/** Decodes a planned settle call back into its arguments. Used by tests and by the final guard before signing. */
function decodeSwapCall(data: `0x${string}`) {
  const decoded = decodeFunctionData({ abi: pairAbi, data });
  if (decoded.functionName !== "swapExactTokensForTokens") throw new Error("That is not a settle call.");
  const [amountIn, amountOutMin, path, to, deadline] = decoded.args;
  return { amountIn, amountOutMin, path, to, deadline };
}

// ---- Agora public metrics ----

type MonadSupply = { circulating: number; total: number };
type Metrics = { monad?: MonadSupply; allChains: number; totalCirculating: number };

function toNumber(value: unknown): number | undefined {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Tolerant of shape changes: anything unexpected yields undefined, never a guess. */
function parseMetrics(payload: unknown): Metrics | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const chains = (payload as { chains?: unknown }).chains;
  if (!Array.isArray(chains)) return undefined;
  let monad: MonadSupply | undefined;
  let allChains = 0;
  let totalCirculating = 0;
  for (const entry of chains as unknown[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const { chainId, network, circulatingSupply, totalSupply } = entry as Record<string, unknown>;
    const circulating = toNumber(circulatingSupply);
    const total = toNumber(totalSupply);
    if (circulating === undefined || total === undefined) continue;
    allChains += 1;
    totalCirculating += circulating;
    if (monad === undefined && (chainId === "eip155:143" || network === "monad")) monad = { circulating, total };
  }
  if (allChains === 0) return undefined;
  return { ...(monad ? { monad } : {}), allChains, totalCirculating };
}

// ---- Local record of settled transfers ----

type Leg = { kind: "debit" | "settle" | "credit"; asset: "ausd" | "ctk"; amount: string };
/** Shaped after Agora's transaction and legs model: per currency amounts as decimal strings. Kept on this phone only. */
type SettledTransfer = { hash: `0x${string}`; at: number; recipient: Address; amountIn: string; amountOut: string; seconds?: number; legs: Leg[] };

function toRecord(input: { hash: `0x${string}`; at: number; recipient: Address; amountIn: bigint; amountOut: bigint; seconds?: number }): SettledTransfer {
  const paid = formatUnits(input.amountIn, AUSD_DECIMALS);
  const received = formatUnits(input.amountOut, CTK_DECIMALS);
  return {
    hash: input.hash,
    at: input.at,
    recipient: input.recipient,
    amountIn: paid,
    amountOut: received,
    ...(input.seconds !== undefined ? { seconds: input.seconds } : {}),
    legs: [
      { kind: "debit", asset: "ausd", amount: paid },
      { kind: "settle", asset: "ausd", amount: paid },
      { kind: "credit", asset: "ctk", amount: received },
    ],
  };
}

const DECIMAL = /^\d{1,30}(\.\d{1,18})?$/;

function validRecord(value: unknown): value is SettledTransfer {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.hash !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(v.hash)) return false;
  if (typeof v.at !== "number" || !Number.isFinite(v.at) || v.at <= 0) return false;
  if (typeof v.recipient !== "string" || !isAddress(v.recipient, { strict: false })) return false;
  if (typeof v.amountIn !== "string" || !DECIMAL.test(v.amountIn)) return false;
  if (typeof v.amountOut !== "string" || !DECIMAL.test(v.amountOut)) return false;
  if (v.seconds !== undefined && (typeof v.seconds !== "number" || !Number.isFinite(v.seconds) || v.seconds < 0)) return false;
  if (!Array.isArray(v.legs) || v.legs.length !== 3) return false;
  const kinds = ["debit", "settle", "credit"];
  return v.legs.every((leg, i) => {
    if (typeof leg !== "object" || leg === null) return false;
    const l = leg as Record<string, unknown>;
    return l.kind === kinds[i] && (l.asset === "ausd" || l.asset === "ctk") && typeof l.amount === "string" && DECIMAL.test(l.amount);
  });
}

/** Fail closed: unreadable data is an empty list; bad entries and repeats are dropped; newest first, at most 10. */
function parseSettledList(raw: string | null): SettledTransfer[] {
  if (raw === null) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: SettledTransfer[] = [];
  for (const entry of value as unknown[]) {
    if (!validRecord(entry)) continue;
    const key = entry.hash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    list.push(entry);
  }
  return list.sort((a, b) => b.at - a.at).slice(0, MAX_RECENT);
}

/** Adds one record to the front and keeps the last 10. */
function addSettled(list: readonly SettledTransfer[], record: SettledTransfer): SettledTransfer[] {
  return [record, ...list.filter((entry) => entry.hash.toLowerCase() !== record.hash.toLowerCase())].slice(0, MAX_RECENT);
}

export {
  addSettled,
  AGORA,
  AUSD_DECIMALS,
  buildSettleCalls,
  CTK_DECIMALS,
  decodeSwapCall,
  erc20Abi,
  faucetAbi,
  LOW_TEST_DOLLARS,
  MAX_RECENT,
  METRICS_URL,
  MIN_TEST_MON,
  pairAbi,
  parseMetrics,
  parseSettledList,
  SWAPPER_ROLE,
  TESTNET_CHAIN_ID,
  TESTNET_EXPLORER_TX,
  TESTNET_FAUCET_URL,
  TESTNET_RPC_URL,
  toRecord,
  whitelisterAbi,
};
export type { Leg, Metrics, SettledTransfer, SettleInput, SettlePlan };
