import { toViemAccount } from "@category-labs/mera/viem";
import { createPublicClient, createWalletClient, defineChain, encodeFunctionData, http, type Address, type Hash } from "viem";
import {
  AGORA,
  decodeSwapCall,
  erc20Abi,
  faucetAbi,
  METRICS_URL,
  pairAbi,
  parseMetrics,
  SWAPPER_ROLE,
  TESTNET_CHAIN_ID,
  TESTNET_RPC_URL,
  type Metrics,
  type SettlePlan,
} from "./agora";
import type { ExecutionUpdate } from "./network";
import type { Wallet } from "./wallet";

/** Monad TESTNET. Never mixed with the mainnet client in network.ts. */
const monadTestnet = defineChain({
  id: TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: [TESTNET_RPC_URL] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

const publicClient = createPublicClient({ chain: monadTestnet, transport: http(TESTNET_RPC_URL) });
const PATH = [AGORA.ausd, AGORA.ctk] as const;

async function assertTestnet(): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== TESTNET_CHAIN_ID) throw new Error(`RPC returned chain ${chainId}; expected ${TESTNET_CHAIN_ID}`);
}

type TestBalances = { mon: bigint; ausd: bigint; ctk: bigint };

async function readTestBalances(address: Address): Promise<TestBalances> {
  await assertTestnet();
  const [mon, ausd, ctk] = await Promise.all([
    publicClient.getBalance({ address }),
    publicClient.readContract({ address: AGORA.ausd, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    publicClient.readContract({ address: AGORA.ctk, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
  ]);
  return { mon, ausd, ctk };
}

/** Whether Agora's pair already lets this account swap. The pair only accepts approved swappers. */
async function readSwapperApproved(address: Address): Promise<boolean> {
  return publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "hasRole", args: [SWAPPER_ROLE, address] });
}

/** The pair's own fixed price quote: settled dollars (18 decimals) for this many test dollars (6 decimals). */
async function quoteSettle(amountIn: bigint): Promise<bigint> {
  if (amountIn <= 0n) throw new Error("Enter an amount above zero.");
  await assertTestnet();
  const amounts = await publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "getAmountsOut", args: [amountIn, [...PATH]] });
  const out = amounts[amounts.length - 1];
  if (amounts[0] !== amountIn || out === undefined || out <= 0n) throw new Error("The pool cannot settle that amount right now.");
  return out;
}

type PairHealth = { paused: boolean; ctkAvailable: bigint; feePercent: number };

async function readPairHealth(): Promise<PairHealth> {
  await assertTestnet();
  // token0 is CTK and token1 is AUSD on this pair (read on chain), so a test dollar going in pays token1PurchaseFee.
  const [paused, reserve0, fee, precision] = await Promise.all([
    publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "isPaused" }),
    publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "reserve0" }),
    publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "token1PurchaseFee" }),
    publicClient.readContract({ address: AGORA.pair, abi: pairAbi, functionName: "FEE_PRECISION" }),
  ]);
  const feePercent = precision > 0n ? Number((fee * 1_000_000n) / precision) / 10_000 : 0;
  return { paused, ctkAvailable: reserve0, feePercent };
}

async function sendOne(wallet: Wallet, label: string, to: Address, data: `0x${string}`, onUpdate: (u: ExecutionUpdate) => void, index: number): Promise<{ hash: Hash; sentAt: number; receiptAt: number }> {
  await assertTestnet();
  const account = toViemAccount(wallet.session);
  const client = createWalletClient({ account, chain: monadTestnet, transport: http(TESTNET_RPC_URL) });
  onUpdate({ index, label, state: "signing" });
  const hash = await client.sendTransaction({ account, chain: monadTestnet, to, data, value: 0n });
  // Timing starts once the network has the transaction, so waiting on the fingerprint is not counted.
  const sentAt = Date.now();
  onUpdate({ index, label, hash, state: "pending" });
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  const receiptAt = Date.now();
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  onUpdate({ index, label, hash, state: "confirmed" });
  return { hash, sentAt, receiptAt };
}

/** Test dollars from Agora's faucet: 10,000 per request, at most one a minute. */
async function requestTestDollars(wallet: Wallet): Promise<Hash> {
  const data = encodeFunctionData({ abi: faucetAbi, functionName: "requestFunds", args: [wallet.address] });
  const { hash } = await sendOne(wallet, "Get test dollars", AGORA.faucet, data, () => undefined, 0);
  return hash;
}

type SettleOutcome = { hashes: Hash[]; settleHash: Hash; seconds: number; amountIn: bigint; amountOut: bigint };

/** Signs and sends the plan in order, then checks balances moved by exactly what was promised. */
async function settleSend(wallet: Wallet, plan: SettlePlan, onUpdate: (update: ExecutionUpdate) => void): Promise<SettleOutcome> {
  if (plan.account.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Plan account does not match Mera account");
  if (BigInt(Math.floor(Date.now() / 1000)) >= plan.deadline) throw new Error("Plan expired; request a fresh quote");
  // The last call must be the settle call, and it must say exactly what the screen showed.
  const last = plan.calls[plan.calls.length - 1];
  if (!last || last.to.toLowerCase() !== AGORA.pair.toLowerCase()) throw new Error("Plan is missing the settle call");
  const swap = decodeSwapCall(last.data);
  if (swap.amountIn !== plan.amountIn || swap.amountOutMin !== plan.amountOut || swap.to.toLowerCase() !== plan.recipient.toLowerCase()) {
    throw new Error("Plan does not match the settle call");
  }

  await assertTestnet();
  const [senderBefore, recipientBefore] = await Promise.all([readTestBalances(wallet.address), readTestBalances(plan.recipient)]);
  const hashes: Hash[] = [];
  let timing: { hash: Hash; sentAt: number; receiptAt: number } | undefined;

  for (const [index, call] of plan.calls.entries()) {
    const sent = await sendOne(wallet, call.label, call.to, call.data, onUpdate, index);
    hashes.push(sent.hash);
    if (index === plan.calls.length - 1) timing = sent;
    if (call.to.toLowerCase() === AGORA.whitelister.toLowerCase() && !(await readSwapperApproved(wallet.address))) {
      throw new Error("Post-check failed: the account was not approved to settle");
    }
  }
  if (!timing) throw new Error("Settle receipt is missing");

  const [senderAfter, recipientAfter] = await Promise.all([readTestBalances(wallet.address), readTestBalances(plan.recipient)]);
  if (senderBefore.ausd - senderAfter.ausd !== plan.amountIn) throw new Error("Post-check failed: test dollars spent were not the amount shown");
  const received = recipientAfter.ctk - recipientBefore.ctk;
  // Fixed price: the pair pays the quote. The contract itself reverts below the minimum, so more is possible but less is not.
  if (received < plan.amountOut) throw new Error("Post-check failed: settled dollars received are below the quote");
  return { hashes, settleHash: timing.hash, seconds: (timing.receiptAt - timing.sentAt) / 1000, amountIn: plan.amountIn, amountOut: received };
}

/** Agora's public supply numbers. Undefined on any failure, so the screen shows nothing rather than a guess. */
async function fetchMetrics(): Promise<Metrics | undefined> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(METRICS_URL, { signal: controller.signal, headers: { accept: "application/json" } });
    if (!response.ok) return undefined;
    return parseMetrics(await response.json());
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

export { fetchMetrics, monadTestnet, quoteSettle, readPairHealth, readSwapperApproved, readTestBalances, requestTestDollars, settleSend };
export type { PairHealth, SettleOutcome, TestBalances };
