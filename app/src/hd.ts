import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

const MAX_INDEX = 2 ** 31 - 1;

function deriveEvmPrivateKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw new Error("Account index must be an integer from 0 to 2^31-1");
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    const key = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`).privateKey;
    if (!key) throw new Error("BIP-32 derivation produced no private key");
    return key;
  } finally {
    seed.fill(0);
  }
}

/**
 * Derives several keys from one seed, so a range costs one seed stretch instead of one per index.
 * The caller owns every returned array and must zero each one.
 */
function deriveEvmPrivateKeys(prfOutput: Uint8Array, indexes: readonly number[]): Uint8Array[] {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  for (const index of indexes) {
    if (!Number.isInteger(index) || index < 0 || index > MAX_INDEX) throw new Error("Account index must be an integer from 0 to 2^31-1");
  }
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  const keys: Uint8Array[] = [];
  try {
    const root = HDKey.fromMasterSeed(seed);
    for (const index of indexes) {
      const key = root.derive(`m/44'/60'/0'/0/${index}`).privateKey;
      if (!key) throw new Error("BIP-32 derivation produced no private key");
      keys.push(key);
    }
    return keys;
  } catch (error) {
    for (const key of keys) key.fill(0);
    throw error;
  } finally {
    seed.fill(0);
  }
}

export { deriveEvmPrivateKey, deriveEvmPrivateKeys };
