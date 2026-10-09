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

const EARN_AUSD = "0x103222f020e98Bba0AD9809A011FDF8e6F067496" as Address;
const UPSHIFT_VAULT = "0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA" as Address;

const vaultAbi = [
  {
    type: "function",
    name: "previewRedemption",
    stateMutability: "view",
    inputs: [{ name: "shares", type: "uint256" }, { name: "isInstant", type: "bool" }],
    outputs: [{ name: "assetsAmount", type: "uint256" }, { name: "assetsAfterFee", type: "uint256" }],
  },
] as const;

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
  earn: string;
  /** AUSD value of earn shares from the vault's previewRedemption view; null if the read failed. */
  earnValue: string | null;
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

  const [blockNumber, native, ausdRaw, ausdDecimals, aqqqRaw, aqqqDecimals, earnRaw, earnDecimals] = await Promise.all([
    client.getBlockNumber(),
    client.getBalance({ address }),
    client.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: AUSD, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: AQQQ, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: AQQQ, abi: erc20Abi, functionName: "decimals" }),
    client.readContract({ address: EARN_AUSD, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
    client.readContract({ address: EARN_AUSD, abi: erc20Abi, functionName: "decimals" }),
  ]);

  let earnValue: string | null = null;
  if (earnRaw === 0n) {
    earnValue = "0";
  } else {
    try {
      const [assets] = await client.readContract({
        address: UPSHIFT_VAULT,
        abi: vaultAbi,
        functionName: "previewRedemption",
        args: [earnRaw, false],
      });
      earnValue = formatUnits(assets, ausdDecimals);
    } catch {
      earnValue = null;
    }
  }

  return {
    address,
    blockNumber,
    mon: formatUnits(native, 18),
    ausd: formatUnits(ausdRaw, ausdDecimals),
    aqqq: formatUnits(aqqqRaw, aqqqDecimals),
    earn: formatUnits(earnRaw, earnDecimals),
    earnValue,
  };
}

export const explorerAddress = (address: Address) => `https://monadscan.com/address/${address}`;
