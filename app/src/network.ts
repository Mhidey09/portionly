import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  decodeFunctionResult,
  encodeFunctionData,
  formatUnits,
  http,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { monad } from "viem/chains";
import { toViemAccount } from "@category-labs/mera/viem";
import { ADDRESSES, buildAqqqProofPlan, type AqqqProofPlan, type PlannedCall } from "./aqqqProofPlan";
import { portionlySplitterAbi, type PortionlyPlan } from "./portionlyPlan";
import { MONAD_CHAIN_ID, MONAD_RPC_URL } from "./config";
import { buildFundingCalls } from "./funding";
import { claimCallData } from "./locks";
import type { Wallet } from "./wallet";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInput",
    stateMutability: "view",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "exactCurrency", type: "address" },
          {
            name: "path",
            type: "tuple[]",
            components: [
              { name: "intermediateCurrency", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" },
              { name: "hookData", type: "bytes" },
            ],
          },
          { name: "exactAmount", type: "uint128" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

const publicClient = createPublicClient({ chain: monad, transport: http(MONAD_RPC_URL) });

type Balances = { ausd: bigint; aqqq: bigint; mon: bigint; earn: bigint };
type Quote = { amountOut: bigint; gasEstimate: bigint; observedAtMs: number };
type ExecutionUpdate = { index: number; label: string; hash?: Hash; state: "signing" | "pending" | "confirmed" };

async function assertMonad(): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`RPC returned chain ${chainId}; expected 143`);
}

async function readBalances(account: Address): Promise<Balances> {
  await assertMonad();
  const [mon, ausd, aqqq, earn] = await Promise.all([
    publicClient.getBalance({ address: account }),
    publicClient.readContract({ address: ADDRESSES.ausd, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    publicClient.readContract({ address: ADDRESSES.aqqq, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    publicClient.readContract({ address: ADDRESSES.growShare, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
  ]);
  return { mon, ausd, aqqq, earn };
}

async function quoteAusdToAqqq(amountIn: bigint): Promise<Quote> {
  if (amountIn <= 0n || amountIn > (1n << 128n) - 1n) throw new Error("Quote amount is outside uint128 range");
  await assertMonad();
  const data = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInput",
    args: [
      {
        exactCurrency: ADDRESSES.ausd,
        path: [
          { intermediateCurrency: ADDRESSES.usdc, fee: 50, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
          { intermediateCurrency: ADDRESSES.aqqq, fee: 9_000, tickSpacing: 90, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
        ],
        exactAmount: amountIn,
      },
    ],
  });
  const response = await publicClient.call({ to: ADDRESSES.quoter, data });
  if (!response.data) throw new Error("Quoter returned no data");
  const [amountOut, gasEstimate] = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInput", data: response.data });
  return { amountOut, gasEstimate, observedAtMs: Date.now() };
}

async function quoteOneAusd(): Promise<Quote> {
  return quoteAusdToAqqq(1_000_000n);
}

async function prepareProof(account: Address): Promise<{ balances: Balances; quote: Quote; plan: AqqqProofPlan }> {
  const [balances, quote] = await Promise.all([readBalances(account), quoteOneAusd()]);
  const plan = buildAqqqProofPlan({
    chainId: MONAD_CHAIN_ID,
    account,
    ausdBalance: balances.ausd,
    monBalance: balances.mon,
    amountIn: 1_000_000n,
    quote,
    nowMs: Date.now(),
    slippageBps: 100,
  });
  return { balances, quote, plan };
}

async function executeProof(
  wallet: Wallet,
  plan: AqqqProofPlan,
  onUpdate: (update: ExecutionUpdate) => void,
): Promise<{ hashes: Hash[]; before: Balances; after: Balances }> {
  if (plan.account.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Plan account does not match Mera account");
  if (BigInt(Math.floor(Date.now() / 1_000)) >= plan.deadlineSeconds) throw new Error("Plan expired; request a fresh quote");

  const before = await readBalances(wallet.address);
  const account = toViemAccount(wallet.session);
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hashes: Hash[] = [];

  for (const [index, call] of plan.calls.entries()) {
    onUpdate({ index, label: call.label, state: "signing" });
    const hash = await client.sendTransaction({ account, chain: monad, to: call.to, data: call.data, value: call.value });
    hashes.push(hash);
    onUpdate({ index, label: call.label, hash, state: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw new Error(`${call.label} reverted: ${hash}`);
    onUpdate({ index, label: call.label, hash, state: "confirmed" });
  }

  const after = await readBalances(wallet.address);
  if (before.ausd - after.ausd !== 1_000_000n) throw new Error("Post-check failed: AUSD spend was not exactly 1 AUSD");
  if (after.aqqq - before.aqqq < plan.minimumOut) throw new Error("Post-check failed: aQQQ increase is below minimum output");
  return { hashes, before, after };
}

async function readTokenBalance(token: Address, account: Address): Promise<bigint> {
  return publicClient.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [account] });
}

async function executePortionly(
  wallet: Wallet,
  plan: PortionlyPlan,
  onUpdate: (update: ExecutionUpdate) => void,
): Promise<{ hashes: Hash[]; usedFallback: boolean; investOut: bigint; growShares: bigint }> {
  if (plan.account.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Plan account does not match Mera account");
  if (BigInt(Math.floor(Date.now() / 1_000)) >= plan.deadline) throw new Error("Plan expired; request a fresh quote");

  const splitter = plan.calls[1].to;
  // A locked Grow sends its shares to PortionlyFuture instead of the recipient.
  const growHolder = plan.unlockAt > 0n ? ADDRESSES.future : plan.recipient;
  const [senderBefore, recipientAusdBefore, recipientAqqqBefore, recipientGrowBefore, splitterAusdBefore] = await Promise.all([
    readBalances(wallet.address),
    readTokenBalance(ADDRESSES.ausd, plan.recipient),
    readTokenBalance(ADDRESSES.aqqq, plan.recipient),
    readTokenBalance(ADDRESSES.growShare, growHolder),
    readTokenBalance(ADDRESSES.ausd, splitter),
  ]);
  const account = toViemAccount(wallet.session);
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hashes: Hash[] = [];
  let executionReceipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>> | undefined;

  for (const [index, call] of plan.calls.entries()) {
    onUpdate({ index, label: call.label, state: "signing" });
    const hash = await client.sendTransaction({ account, chain: monad, to: call.to, data: call.data, value: call.value });
    hashes.push(hash);
    onUpdate({ index, label: call.label, hash, state: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw new Error(`${call.label} reverted: ${hash}`);
    if (index === 1) executionReceipt = receipt;
    onUpdate({ index, label: call.label, hash, state: "confirmed" });
  }
  if (!executionReceipt) throw new Error("Execution receipt is missing");

  const event = executionReceipt.logs
    .filter((log) => log.address.toLowerCase() === splitter.toLowerCase())
    .map((log) => {
      try {
        return decodeEventLog({ abi: portionlySplitterAbi, eventName: "PlanExecuted", data: log.data, topics: log.topics });
      } catch {
        return undefined;
      }
    })
    .find((decoded) => decoded?.args.planId === plan.planId);
  if (!event) throw new Error("Post-check failed: PlanExecuted event is missing");

  const [senderAfter, recipientAusdAfter, recipientAqqqAfter, recipientGrowAfter, splitterAusdAfter] = await Promise.all([
    readBalances(wallet.address),
    readTokenBalance(ADDRESSES.ausd, plan.recipient),
    readTokenBalance(ADDRESSES.aqqq, plan.recipient),
    readTokenBalance(ADDRESSES.growShare, growHolder),
    readTokenBalance(ADDRESSES.ausd, splitter),
  ]);
  const sameAccount = wallet.address.toLowerCase() === plan.recipient.toLowerCase();
  const expectedSenderDecrease = sameAccount ? plan.amountIn - plan.nowAmount : plan.amountIn;
  if (senderBefore.ausd - senderAfter.ausd !== expectedSenderDecrease) throw new Error("Post-check failed: sender AUSD delta is wrong");
  if (!sameAccount && recipientAusdAfter - recipientAusdBefore !== plan.nowAmount) throw new Error("Post-check failed: recipient Now amount is wrong");
  if (splitterAusdAfter !== splitterAusdBefore) throw new Error("Post-check failed: Splitter retained AUSD");
  if (event.args.usedFallback) {
    if (recipientGrowAfter <= recipientGrowBefore) throw new Error("Post-check failed: fallback Grow shares did not arrive");
  } else {
    if (recipientAqqqAfter - recipientAqqqBefore < plan.investMinimumOut) throw new Error("Post-check failed: Invest output is below minimum");
    if (plan.growAmount > 0n && recipientGrowAfter <= recipientGrowBefore) throw new Error("Post-check failed: Grow shares did not arrive");
  }
  if (plan.unlockAt > 0n && recipientGrowAfter - recipientGrowBefore !== event.args.growShares) throw new Error("Post-check failed: locked Grow shares are not held for the recipient");
  return {
    hashes,
    usedFallback: event.args.usedFallback,
    investOut: event.args.investOut,
    growShares: event.args.growShares,
  };
}

async function fundPerson(
  main: Wallet,
  person: Address,
  ausdAmount: bigint,
  monAmount: bigint,
  onUpdate: (update: ExecutionUpdate) => void = () => undefined,
): Promise<Hash[]> {
  if (main.index !== 0) throw new Error("Funding must come from Main");
  await assertMonad();
  const balances = await readBalances(main.address);
  const calls = buildFundingCalls({ main: main.address, person, ausdAmount, monAmount, ausdBalance: balances.ausd, monBalance: balances.mon });
  const account = toViemAccount(main.session);
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hashes: Hash[] = [];
  for (const [index, call] of calls.entries()) {
    onUpdate({ index, label: call.label, state: "signing" });
    const hash = await client.sendTransaction({ account, chain: monad, to: call.to, data: call.data, value: call.value });
    hashes.push(hash);
    onUpdate({ index, label: call.label, hash, state: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw new Error(`${call.label} reverted: ${hash}`);
    onUpdate({ index, label: call.label, hash, state: "confirmed" });
  }
  return hashes;
}

function formatBalances(value: Balances): { ausd: string; aqqq: string; mon: string; earn: string } {
  return { ausd: formatUnits(value.ausd, 6), aqqq: formatUnits(value.aqqq, 18), mon: formatUnits(value.mon, 18), earn: formatUnits(value.earn, 6) };
}

const upshiftReadAbi = [
  { type: "function", name: "previewRedemption", stateMutability: "view", inputs: [{ name: "shares", type: "uint256" }, { name: "isInstant", type: "bool" }], outputs: [{ name: "assetsAmount", type: "uint256" }, { name: "assetsAfterFee", type: "uint256" }] },
  { type: "function", name: "getWithdrawalEpoch", stateMutability: "view", inputs: [], outputs: [{ name: "year", type: "uint256" }, { name: "month", type: "uint256" }, { name: "day", type: "uint256" }, { name: "claimableEpoch", type: "uint256" }] },
] as const;

/** AUSD the vault would pay for these shares: instant (after its fee) or standard (after its lag). */
async function previewSavings(shares: bigint): Promise<{ instant: bigint; standard: bigint }> {
  if (shares === 0n) return { instant: 0n, standard: 0n };
  const [[, instant], [standard]] = await Promise.all([
    publicClient.readContract({ address: ADDRESSES.growVault, abi: upshiftReadAbi, functionName: "previewRedemption", args: [shares, true] }),
    publicClient.readContract({ address: ADDRESSES.growVault, abi: upshiftReadAbi, functionName: "previewRedemption", args: [shares, false] }),
  ]);
  return { instant, standard };
}

/** The date a standard withdrawal requested now becomes claimable. */
async function readWithdrawalDate(): Promise<{ year: number; month: number; day: number; claimableAt: number }> {
  const [year, month, day, claimableAt] = await publicClient.readContract({ address: ADDRESSES.growVault, abi: upshiftReadAbi, functionName: "getWithdrawalEpoch" });
  return { year: Number(year), month: Number(month), day: Number(day), claimableAt: Number(claimableAt) };
}

async function quoteAqqqToAusd(amountIn: bigint): Promise<Quote> {
  if (amountIn <= 0n || amountIn > (1n << 128n) - 1n) throw new Error("Quote amount is outside uint128 range");
  await assertMonad();
  const data = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInput",
    args: [
      {
        exactCurrency: ADDRESSES.aqqq,
        path: [
          { intermediateCurrency: ADDRESSES.usdc, fee: 9_000, tickSpacing: 90, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
          { intermediateCurrency: ADDRESSES.ausd, fee: 50, tickSpacing: 1, hooks: "0x0000000000000000000000000000000000000000", hookData: "0x" },
        ],
        exactAmount: amountIn,
      },
    ],
  });
  const response = await publicClient.call({ to: ADDRESSES.quoter, data });
  if (!response.data) throw new Error("Quoter returned no data");
  const [amountOut, gasEstimate] = decodeFunctionResult({ abi: quoterAbi, functionName: "quoteExactInput", data: response.data });
  return { amountOut, gasEstimate, observedAtMs: Date.now() };
}

/** Sign and send planned calls in order, stopping at the first revert. */
async function sendCalls(wallet: Wallet, calls: readonly PlannedCall[], onUpdate: (update: ExecutionUpdate) => void): Promise<Hash[]> {
  await assertMonad();
  const account = toViemAccount(wallet.session);
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hashes: Hash[] = [];
  for (const [index, call] of calls.entries()) {
    onUpdate({ index, label: call.label, state: "signing" });
    const hash = await client.sendTransaction({ account, chain: monad, to: call.to, data: call.data, value: call.value });
    hashes.push(hash);
    onUpdate({ index, label: call.label, hash, state: "pending" });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
    if (receipt.status !== "success") throw new Error(`${call.label} reverted: ${hash}`);
    onUpdate({ index, label: call.label, hash, state: "confirmed" });
  }
  return hashes;
}

async function claimLocked(wallet: Wallet, key: Hex): Promise<Hash> {
  await assertMonad();
  const account = toViemAccount(wallet.session);
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hash = await client.sendTransaction({ account, chain: monad, to: ADDRESSES.future, data: claimCallData(key), value: 0n });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`Claim reverted: ${hash}`);
  return hash;
}

export { claimLocked, previewSavings, quoteAqqqToAusd, readWithdrawalDate, sendCalls, executePortionly, executeProof, formatBalances, fundPerson, prepareProof, quoteAusdToAqqq, quoteOneAusd, readBalances };
export type { Balances, ExecutionUpdate, Quote };
