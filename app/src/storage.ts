import type { EvmAddress, getPasskeyPrfOutput } from "@category-labs/mera";
import { base64urlnopad } from "@scure/base";
import {
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
} from "expo-secure-store";
import { parsePeople, type Person } from "./people";

const PRF_KEY = "portionly.mera.prf.v1";
const ACCOUNT_KEY = "portionly.mera.account.v1";
const PEOPLE_KEY = "portionly.people.v1";
const secureOptions = {
  requireAuthentication: true,
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  authenticationPrompt: "Unlock Portionly account",
} as const;

type StoredAccount = { address: EvmAddress; credentialId: string };

async function storeAccount(result: getPasskeyPrfOutput.Result, address: EvmAddress): Promise<void> {
  await setItemAsync(
    PRF_KEY,
    JSON.stringify({
      credentialId: result.credentialId,
      prfOutput: base64urlnopad.encode(result.prfOutput),
    }),
    secureOptions,
  );
  await setItemAsync(ACCOUNT_KEY, JSON.stringify({ address, credentialId: result.credentialId }));
}

async function loadAccount(): Promise<StoredAccount | undefined> {
  const raw = await getItemAsync(ACCOUNT_KEY);
  if (raw === null) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<StoredAccount>;
    if (
      typeof value.address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(value.address) ||
      typeof value.credentialId !== "string"
    ) return undefined;
    return value as StoredAccount;
  } catch {
    return undefined;
  }
}

async function readStoredPrf(): Promise<getPasskeyPrfOutput.Result | undefined> {
  const raw = await getItemAsync(PRF_KEY, secureOptions);
  if (raw === null) return undefined;
  const value = JSON.parse(raw) as { credentialId?: unknown; prfOutput?: unknown };
  if (typeof value.credentialId !== "string" || typeof value.prfOutput !== "string") {
    throw new Error("Stored Mera account is malformed");
  }
  const prfOutput = new Uint8Array(base64urlnopad.decode(value.prfOutput));
  if (prfOutput.length !== 32) throw new Error("Stored PRF output must be 32 bytes");
  return { credentialId: value.credentialId, prfOutput };
}

// Not secret (names and recipient addresses), so no requireAuthentication.
async function loadPeople(): Promise<Person[]> {
  return parsePeople(await getItemAsync(PEOPLE_KEY));
}

async function savePeople(people: readonly Person[]): Promise<void> {
  await setItemAsync(PEOPLE_KEY, JSON.stringify(people));
}

async function clearAccount(): Promise<void> {
  await deleteItemAsync(PEOPLE_KEY);
  await deleteItemAsync(PRF_KEY);
  await deleteItemAsync(ACCOUNT_KEY);
}

export { clearAccount, loadAccount, loadPeople, readStoredPrf, savePeople, storeAccount };
export type { StoredAccount };
