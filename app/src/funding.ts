import { encodeFunctionData, isAddress, type Address, type Hex } from "viem";
import { ADDRESSES } from "./aqqqProofPlan";

const GAS_TOPUP_MON = 300_000_000_000_000_000n; // 0.3 MON, about two sends (Monad charges the gas limit)
const GAS_THRESHOLD_MON = 150_000_000_000_000_000n; // below this a send can fail the 0.12 MON plan minimum
const MON_RESERVE = 10_000_000_000_000_000n; // 0.01 MON left on Main for the transfers' own gas

const transferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

type FundingCall = { label: string; to: Address; data: Hex; value: bigint };

function gasTopUpFor(personMon: bigint): bigint {
  return personMon < GAS_THRESHOLD_MON ? GAS_TOPUP_MON : 0n;
}

function buildFundingCalls(input: {
  main: Address;
  person: Address;
  ausdAmount: bigint;
  monAmount: bigint;
  ausdBalance: bigint;
  monBalance: bigint;
}): FundingCall[] {
  if (!isAddress(input.person) || !isAddress(input.main)) throw new Error("Invalid account address");
  if (input.person.toLowerCase() === input.main.toLowerCase()) throw new Error("A person's account must differ from Main");
  if (input.ausdAmount <= 0n) throw new Error("AUSD amount must be greater than zero");
  if (input.monAmount < 0n) throw new Error("MON amount cannot be negative");
  if (input.ausdAmount > input.ausdBalance) throw new Error("Main has less AUSD than the top up");
  if (input.monAmount + MON_RESERVE > input.monBalance) throw new Error("Main has too little MON for the gas top up");
  const calls: FundingCall[] = [
    {
      label: "Send AUSD",
      to: ADDRESSES.ausd,
      data: encodeFunctionData({ abi: transferAbi, functionName: "transfer", args: [input.person, input.ausdAmount] }),
      value: 0n,
    },
  ];
  if (input.monAmount > 0n) calls.push({ label: "Send MON for gas", to: input.person, data: "0x", value: input.monAmount });
  return calls;
}

export { buildFundingCalls, GAS_THRESHOLD_MON, GAS_TOPUP_MON, gasTopUpFor };
export type { FundingCall };
