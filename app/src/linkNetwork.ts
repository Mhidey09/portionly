import { createPublicClient, createWalletClient, http, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monad } from "viem/chains";
import { MONAD_CHAIN_ID, MONAD_RPC_URL } from "./config";
import { buildCancelCall, buildClaimCall, LINK_CONTRACT, linkAbi, sweepAmount } from "./linkPay";
import { quoteAusdToAqqq, sendCalls, type ExecutionUpdate } from "./network";
import type { Wallet } from "./wallet";

const publicClient = createPublicClient({ chain: monad, transport: http(MONAD_RPC_URL) });
const DEADLINE_SECONDS = 600n;
/** A claim cost about 0.11 MON on mainnet. Below this the link cannot safely pay for itself. */
const MIN_LINK_FEE = 150_000_000_000_000_000n;

type LinkPayment = {
  link: Address;
  sender: Address;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  lockDays: number;
  createdAt: number;
  open: boolean;
};

async function assertMonad(): Promise<void> {
  const chainId = await publicClient.getChainId();
  if (chainId !== MONAD_CHAIN_ID) throw new Error(`RPC returned chain ${chainId}; expected 143`);
}

/** What is waiting under a link address. A sender of the zero address means the link was never used. */
async function readLinkPayment(link: Address): Promise<LinkPayment | undefined> {
  await assertMonad();
  const [sender, nowAmount, growAmount, investAmount, lockDays, createdAt, open] = await publicClient.readContract({
    address: LINK_CONTRACT,
    abi: linkAbi,
    functionName: "payments",
    args: [link],
  });
  if (/^0x0+$/.test(sender)) return undefined;
  return { link, sender, nowAmount, growAmount, investAmount, lockDays, createdAt: Number(createdAt), open };
}

/** Every link this account has made, newest first, read from the contract. */
async function readSentLinks(sender: Address): Promise<LinkPayment[]> {
  await assertMonad();
  const links = await publicClient.readContract({ address: LINK_CONTRACT, abi: linkAbi, functionName: "sentBy", args: [sender] });
  const payments = await Promise.all(links.map((link) => readLinkPayment(link)));
  return payments.filter((payment): payment is LinkPayment => payment !== undefined).reverse();
}

/**
 * Claims a link's payment into `recipient` using the link's own key and fee balance, then passes the
 * leftover fee balance to the recipient. The recipient's own account signs nothing.
 */
async function claimLink(key: Hex, recipient: Address, onUpdate: (update: ExecutionUpdate) => void): Promise<{ hashes: Hash[]; payment: LinkPayment }> {
  const account = privateKeyToAccount(key);
  const payment = await readLinkPayment(account.address);
  if (!payment) throw new Error("This money link was never funded");
  if (!payment.open) throw new Error("This money link was already claimed or taken back");
  if (recipient.toLowerCase() === account.address.toLowerCase()) throw new Error("Choose your own account as the recipient");

  const fee = await publicClient.getBalance({ address: account.address });
  if (fee < MIN_LINK_FEE) throw new Error("This money link has too little MON to pay its fee. Ask the sender to send it again.");

  const quote = payment.investAmount > 0n ? await quoteAusdToAqqq(payment.investAmount) : undefined;
  const investMinimumOut = quote ? (quote.amountOut * 9_900n) / 10_000n : 0n;
  const deadline = BigInt(Math.floor(Date.now() / 1_000)) + DEADLINE_SECONDS;
  const claim = buildClaimCall({ recipient, investAmount: payment.investAmount, investMinimumOut, deadline });

  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hashes: Hash[] = [];

  onUpdate({ index: 0, label: claim.label, state: "signing" });
  const claimHash = await client.sendTransaction({ account, chain: monad, to: claim.to, data: claim.data, value: 0n });
  hashes.push(claimHash);
  onUpdate({ index: 0, label: claim.label, hash: claimHash, state: "pending" });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: claimHash, confirmations: 1 });
  if (receipt.status !== "success") throw new Error(`Claim reverted: ${claimHash}`);
  onUpdate({ index: 0, label: claim.label, hash: claimHash, state: "confirmed" });

  const after = await readLinkPayment(account.address);
  if (!after || after.open) throw new Error("Post-check failed: the link still shows as unclaimed");

  // Whatever fee balance the link has left belongs to the recipient. A failure here never undoes the claim.
  try {
    const left = sweepAmount(await publicClient.getBalance({ address: account.address }));
    if (left > 0n) {
      onUpdate({ index: 1, label: "Pass on the leftover fee balance", state: "signing" });
      const sweepHash = await client.sendTransaction({ account, chain: monad, to: recipient, value: left });
      hashes.push(sweepHash);
      await publicClient.waitForTransactionReceipt({ hash: sweepHash, confirmations: 1 });
      onUpdate({ index: 1, label: "Pass on the leftover fee balance", hash: sweepHash, state: "confirmed" });
    }
  } catch {
    // The payment has landed; the small leftover stays with the link key, which the recipient still holds.
  }

  return { hashes, payment };
}

/** The sender takes an unclaimed link payment back. */
async function cancelLink(wallet: Wallet, link: Address, onUpdate: (update: ExecutionUpdate) => void): Promise<Hash[]> {
  const payment = await readLinkPayment(link);
  if (!payment || !payment.open) throw new Error("This money link was already claimed or taken back");
  if (payment.sender.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("Only the account that made this link can take it back");
  return sendCalls(wallet, [buildCancelCall(link)], onUpdate);
}

/**
 * Sends whatever fee balance a link still holds to `to`. Used after a take back, so the 0.3 MON the
 * sender gave the link comes home, and it is safe to call on any link this phone holds the key for.
 */
async function sweepLinkFee(key: Hex, to: Address): Promise<Hash | undefined> {
  const account = privateKeyToAccount(key);
  const left = sweepAmount(await publicClient.getBalance({ address: account.address }));
  if (left === 0n) return undefined;
  const client = createWalletClient({ account, chain: monad, transport: http(MONAD_RPC_URL) });
  const hash = await client.sendTransaction({ account, chain: monad, to, value: left });
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  return hash;
}

export { cancelLink, claimLink, readLinkPayment, readSentLinks, sweepLinkFee };
export type { LinkPayment };
