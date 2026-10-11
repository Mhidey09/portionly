import type { Address } from "viem";

/** The parts of an on chain link payment the merge needs. */
type ChainLink = { link: Address; nowAmount: bigint; growAmount: bigint; investAmount: bigint; lockDays: number; createdAt: number; open: boolean };

/**
 * A link this account made that this phone holds no key for, for example after a reinstall. It can be
 * taken back (that needs only its address) but not shared again. Only open ones are ever listed.
 */
type OtherInstallLink = {
  address: Address;
  /** Milliseconds, like a saved link. */
  createdAt: number;
  /** Whole micro dollars as a decimal string, like a saved link. */
  total: string;
  nowAmount: bigint;
  growAmount: bigint;
  investAmount: bigint;
  lockDays: number;
};

/** Open links found on chain that the local store does not have. Newest first, as the chain read gives them. */
function mergeChainLinks(local: readonly { address: string }[], chain: readonly ChainLink[]): OtherInstallLink[] {
  const known = new Set(local.map((entry) => entry.address.toLowerCase()));
  const seen = new Set<string>();
  const out: OtherInstallLink[] = [];
  for (const payment of chain) {
    const id = payment.link.toLowerCase();
    if (!payment.open || known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push({
      address: payment.link,
      createdAt: payment.createdAt * 1000,
      total: (payment.nowAmount + payment.growAmount + payment.investAmount).toString(),
      nowAmount: payment.nowAmount,
      growAmount: payment.growAmount,
      investAmount: payment.investAmount,
      lockDays: payment.lockDays,
    });
  }
  return out;
}

export { mergeChainLinks };
export type { ChainLink, OtherInstallLink };
