import Constants from "expo-constants";
import { isAddress, type Address } from "viem";

const rpId = Constants.expoConfig?.extra?.rpId;
if (typeof rpId !== "string" || rpId.length === 0) {
  throw new Error("The APK was built without a Mera relying-party domain");
}

const splitterValue: unknown = Constants.expoConfig?.extra?.splitterAddress;
const splitterAddress: Address | undefined = typeof splitterValue === "string" && isAddress(splitterValue)
  ? splitterValue
  : undefined;

const envioValue: unknown = Constants.expoConfig?.extra?.envioUrl;
const envioUrl: string | undefined = typeof envioValue === "string" && envioValue.startsWith("https://") ? envioValue : undefined;

const MONAD_RPC_URL = "https://rpc.monad.xyz";
const MONAD_CHAIN_ID = 143;

export { envioUrl, MONAD_CHAIN_ID, MONAD_RPC_URL, rpId, splitterAddress };
