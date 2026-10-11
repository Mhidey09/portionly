import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type EvmAddress,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";
import type { PasskeyError } from "react-native-passkey";
import { BaseError as ViemError } from "viem";
import { rpId } from "./config";
import { deriveEvmPrivateKey, deriveEvmPrivateKeys } from "./hd";
import { SCAN_MAX_INDEX } from "./restore";
import { loadAccount, loadPeople, readStoredPrf, savePeople, storeAccount } from "./storage";

type Wallet = { address: EvmAddress; index: number; credentialId: string; session: Secp256k1SigningSession };
/** Main (index 0) plus one wallet per person index, all opened from a single passkey unlock. */
type Wallets = {
  main: Wallet;
  byIndex: ReadonlyMap<number, Wallet>;
  /** Only when the unlock was asked to scan: public addresses of the budget wallets, no keys and no sessions. */
  candidates?: readonly { index: number; address: EvmAddress }[];
};

function endWallets(wallets: Wallets | null | undefined): void {
  if (!wallets) return;
  for (const wallet of wallets.byIndex.values()) wallet.session.end();
}

/**
 * Addresses only. Each key lives just long enough to learn its address: a signing session is opened and
 * ended at once, and the key bytes are zeroed, so nothing for a scanned index outlives this call.
 */
function deriveCandidates(prfOutput: Uint8Array, upTo: number): { index: number; address: EvmAddress }[] {
  const indexes = Array.from({ length: upTo }, (_, i) => i + 1);
  const keys = deriveEvmPrivateKeys(prfOutput, indexes);
  try {
    return keys.map((privateKey, i) => {
      const session = createSecp256k1SigningSession({ privateKey });
      try {
        return { index: indexes[i], address: getEvmAddress(session.publicKey) };
      } finally {
        session.end();
      }
    });
  } finally {
    for (const key of keys) key.fill(0);
  }
}

function openWallets(result: getPasskeyPrfOutput.Result, personIndexes: readonly number[], scan = false): Wallets {
  const indexes = [0, ...new Set(personIndexes.filter((index) => index !== 0))];
  const byIndex = new Map<number, Wallet>();
  let candidates: { index: number; address: EvmAddress }[] | undefined;
  try {
    for (const index of indexes) {
      const privateKey = deriveEvmPrivateKey(result.prfOutput, index);
      try {
        const session = createSecp256k1SigningSession({ privateKey });
        byIndex.set(index, { address: getEvmAddress(session.publicKey), index, credentialId: result.credentialId, session });
      } finally {
        privateKey.fill(0);
      }
    }
    candidates = scan ? deriveCandidates(result.prfOutput, SCAN_MAX_INDEX) : undefined;
  } catch (error) {
    for (const wallet of byIndex.values()) wallet.session.end();
    throw error;
  } finally {
    result.prfOutput.fill(0);
  }
  const main = byIndex.get(0);
  if (!main) throw new Error("Main account failed to open");
  return candidates ? { main, byIndex, candidates } : { main, byIndex };
}

async function personIndexes(): Promise<number[]> {
  return (await loadPeople()).map((person) => person.index);
}

async function createAccount(): Promise<Wallets> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "Portionly" },
    user: { name: "portionly", displayName: `Portionly ${new Date().toISOString()}` },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  try {
    await savePeople([]); // a brand new passkey starts with no people
    const wallets = openWallets({ credentialId: result.credentialId, prfOutput: result.prfOutput.slice() }, []);
    await storeAccount(result, wallets.main.address);
    return wallets;
  } finally {
    result.prfOutput.fill(0);
  }
}

async function signIn(scan = false): Promise<Wallets> {
  const result = await getPasskeyPrfOutput({ rpId, webAuthnClient: reactNativeWebAuthnClient });
  try {
    const previous = await loadAccount();
    let wallets = openWallets({ credentialId: result.credentialId, prfOutput: result.prfOutput.slice() }, await personIndexes(), scan);
    // A different passkey is a different account. The saved people belong to the old one: their
    // places would point at this account's wallets, so start clean and look this account up instead.
    if (previous && previous.address.toLowerCase() !== wallets.main.address.toLowerCase()) {
      endWallets(wallets);
      await savePeople([]);
      wallets = openWallets({ credentialId: result.credentialId, prfOutput: result.prfOutput.slice() }, [], true);
    }
    await storeAccount(result, wallets.main.address);
    return wallets;
  } finally {
    result.prfOutput.fill(0);
  }
}

async function unlockStoredWallet(scan = false): Promise<Wallets | undefined> {
  const indexes = await personIndexes();
  const result = await readStoredPrf();
  return result === undefined ? undefined : openWallets(result, indexes, scan);
}

function describeError(error: unknown): string {
  if (isMeraError(error)) return `${error.code}: ${error.message}`;
  if (error instanceof ViemError) return error.shortMessage;
  const passkey = error as Partial<PasskeyError>;
  if (typeof passkey.message === "string") return passkey.message;
  return error instanceof Error ? error.message : String(error);
}

export { createAccount, describeError, endWallets, signIn, unlockStoredWallet };
export type { Wallet, Wallets };
