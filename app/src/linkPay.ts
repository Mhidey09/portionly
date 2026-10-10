import { encodeFunctionData, isHex, type Address, type Hex } from "viem";
import { privateKeyToAddress } from "viem/accounts";
import { ADDRESSES, type PlannedCall } from "./aqqqProofPlan";

// Send to a link: a portioned payment for someone who has no account yet.
// The link carries a one time key. Whoever opens it claims with that key, and the key's own
// fee balance pays for the claim, so the recipient needs nothing but the link and a fingerprint.

const LINK_CONTRACT: Address = "0x67BCA6463B917940199c322C4b5678044936EdC7";
const CLAIM_BASE = "https://portionly-three.vercel.app/claim";
/** What a link carries to pay for its own claim. A claim cost about 0.11 MON on mainnet; the rest goes to the recipient. */
const LINK_FEE_MON = 300_000_000_000_000_000n;
/** Left behind in the one time account so its last transfer can pay for itself. */
const SWEEP_RESERVE_MON = 30_000_000_000_000_000n;
const MIN_MON_BALANCE = 120_000_000_000_000_000n;
const BPS = 10_000n;
const LOCK_DAYS = [0, 30, 90, 180, 365] as const;

const linkAbi = [
  { type: "function", name: "create", stateMutability: "nonpayable", inputs: [{ name: "link", type: "address" }, { name: "nowAmount", type: "uint256" }, { name: "growAmount", type: "uint256" }, { name: "investAmount", type: "uint256" }, { name: "lockDays", type: "uint32" }], outputs: [] },
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "address" }, { name: "investMinimumOut", type: "uint256" }, { name: "deadline", type: "uint256" }], outputs: [] },
  { type: "function", name: "cancel", stateMutability: "nonpayable", inputs: [{ name: "link", type: "address" }], outputs: [] },
  { type: "function", name: "payments", stateMutability: "view", inputs: [{ name: "link", type: "address" }], outputs: [{ name: "sender", type: "address" }, { name: "nowAmount", type: "uint256" }, { name: "growAmount", type: "uint256" }, { name: "investAmount", type: "uint256" }, { name: "lockDays", type: "uint32" }, { name: "createdAt", type: "uint64" }, { name: "open", type: "bool" }] },
  { type: "function", name: "sentBy", stateMutability: "view", inputs: [{ name: "sender", type: "address" }], outputs: [{ name: "", type: "address[]" }] },
] as const;
const approveAbi = [
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
] as const;

type Portions = { nowAmount: bigint; growAmount: bigint; investAmount: bigint };

/** Same rule as the plan builder: rounding dust goes to the last portion in use, so a 0% portion gets exactly 0. */
function portionAmounts(total: bigint, nowBps: number, growBps: number, investBps: number): Portions {
  if (![nowBps, growBps, investBps].every((v) => Number.isSafeInteger(v) && v >= 0) || nowBps + growBps + investBps !== 10_000) {
    throw new Error("Portions must add up to 100%");
  }
  if (total <= 0n) throw new Error("Amount must be positive");
  let nowAmount = (total * BigInt(nowBps)) / BPS;
  let growAmount = (total * BigInt(growBps)) / BPS;
  let investAmount = 0n;
  if (investBps > 0) investAmount = total - nowAmount - growAmount;
  else if (growBps > 0) growAmount = total - nowAmount;
  else nowAmount = total;
  return { nowAmount, growAmount, investAmount };
}

/** A fresh one time key from 32 random bytes. The caller supplies the randomness (expo-crypto on the phone). */
function linkFromBytes(bytes: Uint8Array): { key: Hex; address: Address } {
  if (bytes.length !== 32) throw new Error("A link key needs 32 random bytes");
  const key = `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as Hex;
  return { key, address: privateKeyToAddress(key) };
}

/** The key rides in the part after #, which browsers never send to a server. */
function claimUrl(key: Hex): string {
  return `${CLAIM_BASE}#${key.slice(2)}`;
}

/** Accepts a claim link or a bare key and returns the key, or throws a plain message. */
function parseClaimInput(text: string): Hex {
  const trimmed = text.trim();
  const fragment = /\/claim\/?#(?:0x)?([0-9a-fA-F]{64})\b/.exec(trimmed)?.[1];
  const bare = /^(?:0x)?([0-9a-fA-F]{64})$/.exec(trimmed)?.[1];
  const hex = fragment ?? bare;
  if (!hex) throw new Error("That is not a Portionly money link");
  const key = `0x${hex.toLowerCase()}` as Hex;
  if (!isHex(key) || /^0x0+$/.test(key)) throw new Error("That is not a Portionly money link");
  return key;
}

/** The three steps a sender signs: allow the amount, park it under the link, give the link its fee. */
function buildCreateLinkCalls(input: {
  account: Address;
  link: Address;
  portions: Portions;
  lockDays: number;
  ausdBalance: bigint;
  monBalance: bigint;
}): PlannedCall[] {
  const { nowAmount, growAmount, investAmount } = input.portions;
  const total = nowAmount + growAmount + investAmount;
  if (total <= 0n) throw new Error("Amount must be positive");
  if (input.link.toLowerCase() === input.account.toLowerCase()) throw new Error("The link cannot be your own account");
  if (!(LOCK_DAYS as readonly number[]).includes(input.lockDays)) throw new Error("Unsupported lock length");
  if (input.lockDays > 0 && growAmount === 0n) throw new Error("Set savings above 0% to lock them");
  if (input.ausdBalance < total) throw new Error("AUSD balance is below the plan total");
  if (input.monBalance < LINK_FEE_MON + MIN_MON_BALANCE) throw new Error("At least 0.42 MON is required to send by link");
  return [
    { label: "Approve exact AUSD total", to: ADDRESSES.ausd, data: encodeFunctionData({ abi: approveAbi, functionName: "approve", args: [LINK_CONTRACT, total] }), value: 0n },
    { label: "Park the payment under the link", to: LINK_CONTRACT, data: encodeFunctionData({ abi: linkAbi, functionName: "create", args: [input.link, nowAmount, growAmount, investAmount, input.lockDays] }), value: 0n },
    { label: "Give the link its fee", to: input.link, data: "0x", value: LINK_FEE_MON },
  ];
}

function buildClaimCall(input: { recipient: Address; investAmount: bigint; investMinimumOut: bigint; deadline: bigint }): PlannedCall {
  if (input.investAmount > 0n && input.investMinimumOut <= 0n) throw new Error("A live stock quote is required to claim");
  if (input.investAmount === 0n && input.investMinimumOut !== 0n) throw new Error("No stock minimum applies to this payment");
  return {
    label: "Claim the payment",
    to: LINK_CONTRACT,
    data: encodeFunctionData({ abi: linkAbi, functionName: "claim", args: [input.recipient, input.investMinimumOut, input.deadline] }),
    value: 0n,
  };
}

function buildCancelCall(link: Address): PlannedCall {
  return { label: "Take the payment back", to: LINK_CONTRACT, data: encodeFunctionData({ abi: linkAbi, functionName: "cancel", args: [link] }), value: 0n };
}

/** What the one time account can pass on after its claim, keeping enough for that last transfer. */
function sweepAmount(balance: bigint): bigint {
  return balance > SWEEP_RESERVE_MON ? balance - SWEEP_RESERVE_MON : 0n;
}

export {
  buildCancelCall,
  buildClaimCall,
  buildCreateLinkCalls,
  claimUrl,
  LINK_CONTRACT,
  LINK_FEE_MON,
  linkAbi,
  linkFromBytes,
  parseClaimInput,
  portionAmounts,
  sweepAmount,
};
export type { Portions };
