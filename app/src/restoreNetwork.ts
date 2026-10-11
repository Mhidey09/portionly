import { createPublicClient, http, type Address } from "viem";
import { monad } from "viem/chains";
import { MONAD_RPC_URL } from "./config";
import { readBalances } from "./network";
import type { WalletActivity } from "./restore";

const publicClient = createPublicClient({ chain: monad, transport: http(MONAD_RPC_URL) });

/** Balances plus how many transactions the wallet has sent. Public reads only; no key is involved. */
async function readWalletActivity(address: Address): Promise<WalletActivity> {
  const [balances, nonce] = await Promise.all([readBalances(address), publicClient.getTransactionCount({ address })]);
  return { address, ...balances, nonce };
}

export { readWalletActivity };
