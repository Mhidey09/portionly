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
import { deriveEvmPrivateKey } from "./hd";
import { readStoredPrf, storeAccount } from "./storage";

type Wallet = { address: EvmAddress; credentialId: string; session: Secp256k1SigningSession };

function openWallet(result: getPasskeyPrfOutput.Result): Wallet {
  const privateKey = deriveEvmPrivateKey(result.prfOutput);
  result.prfOutput.fill(0);
  try {
    const session = createSecp256k1SigningSession({ privateKey });
    return { address: getEvmAddress(session.publicKey), credentialId: result.credentialId, session };
  } finally {
    privateKey.fill(0);
  }
}

async function createAccount(): Promise<Wallet> {
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "Portionly" },
    user: { name: "portionly", displayName: `Portionly ${new Date().toISOString()}` },
    webAuthnClient: reactNativeWebAuthnClient,
  });
  const wallet = openWallet({ credentialId: result.credentialId, prfOutput: result.prfOutput.slice() });
  await storeAccount(result, wallet.address);
  result.prfOutput.fill(0);
  return wallet;
}

async function signIn(): Promise<Wallet> {
  const result = await getPasskeyPrfOutput({ rpId, webAuthnClient: reactNativeWebAuthnClient });
  const wallet = openWallet({ credentialId: result.credentialId, prfOutput: result.prfOutput.slice() });
  await storeAccount(result, wallet.address);
  result.prfOutput.fill(0);
  return wallet;
}

async function unlockStoredWallet(): Promise<Wallet | undefined> {
  const result = await readStoredPrf();
  return result === undefined ? undefined : openWallet(result);
}

function describeError(error: unknown): string {
  if (isMeraError(error)) return `${error.code}: ${error.message}`;
  if (error instanceof ViemError) return error.shortMessage;
  const passkey = error as Partial<PasskeyError>;
  if (typeof passkey.message === "string") return passkey.message;
  return error instanceof Error ? error.message : String(error);
}

export { createAccount, describeError, signIn, unlockStoredWallet };
export type { Wallet };
