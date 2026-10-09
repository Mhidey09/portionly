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

export { deriveEvmPrivateKey };
