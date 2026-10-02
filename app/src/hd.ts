import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

function deriveEvmPrivateKey(prfOutput: Uint8Array): Uint8Array {
  if (prfOutput.length !== 32) throw new Error("PRF output must be 32 bytes");
  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const seed = mnemonicToSeedSync(mnemonic);
  try {
    const key = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0").privateKey;
    if (!key) throw new Error("BIP-32 derivation produced no private key");
    return key;
  } finally {
    seed.fill(0);
  }
}

export { deriveEvmPrivateKey };
