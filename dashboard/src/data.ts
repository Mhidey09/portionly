import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  type Address,
} from "viem";
import { monad } from "viem/chains";

const RPC_URL = "https://rpc.monad.xyz";
const AUSD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as Address;
const AQQQ = "0x1446501E886c7f830DB9b494A1890cBCCC072f57" as Address;

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type RecipientSnapshot = {
  address: Address;
  blockNumber: bigint;
  mon: string;
  ausd: string;
  aqqq: string;
};

const client = createPublicClient({ chain: monad, transport: http(RPC_URL) });

export function parseRecipient(value: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed, { strict: false })) {
    throw new Error("Enter a valid 0x recipient address.");
  }
  return trimmed as Address;
}

export async function readRecipient(address: Address): Promise<RecipientSnapshot> {
  const chainId = await client.getChainId();
  if (chainId !== monad.id) throw new Error(`Wrong RPC chain ${chainId}. Expected Monad 143.`);

  const [blockNumber, native, ausdRaw, ausdDecimals, aqqqRaw, aqqqDecimals] = await Promise.all([
    client.getBlockNumber(),
    client.getBalance({ address }),
    client.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: AUSD, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: AQQQ, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: AQQQ, abi: erc20Abi, functionName: "decimals" }),
  ]);

  return {
    address,
    blockNumber,
    mon: formatUnits(native, 18),
    ausd: formatUnits(ausdRaw, ausdDecimals),
    aqqq: formatUnits(aqqqRaw, aqqqDecimals),
  };
}

export const explorerAddress = (address: Address) => `https://monadscan.com/address/${address}`;
