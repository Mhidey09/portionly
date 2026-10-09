import {
  encodeAbiParameters,
  encodeFunctionData,
  type AbiParameter,
  type Address,
  type Hex,
} from "viem";

const ADDRESSES = {
  ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  usdc: "0x754704Bc059F8C67012fEd69BC8A327a5aafb603",
  aqqq: "0x1446501E886c7f830DB9b494A1890cBCCC072f57",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  universalRouter: "0xa6CE4F10d83dBdDAc17E68e1837ca9cE6a1b596e",
  quoter: "0xa222Dd357A9076d1091Ed6Aa2e16C9742dD26891",
  growVault: "0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA",
  // Upshift mints Grow shares from this separate earnAUSD token (vault.lpTokenAddress()); the vault itself has no balanceOf.
  growShare: "0x103222f020e98Bba0AD9809A011FDF8e6F067496",
} as const satisfies Record<string, Address>;

const PROOF_AMOUNT = 1_000_000n;
const MIN_MON_BALANCE = 120_000_000_000_000_000n;
const MAX_QUOTE_AGE_MS = 60_000;
const MAX_SLIPPAGE_BPS = 100;
const BPS_DENOMINATOR = 10_000n;
const TRANSACTION_DEADLINE_SECONDS = 600n;
const ROUTER_AS_RECIPIENT = "0x0000000000000000000000000000000000000002";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const pathParameter = {
  type: "tuple[]",
  components: [
    { name: "intermediateCurrency", type: "address" },
    { name: "fee", type: "uint256" },
    { name: "tickSpacing", type: "int24" },
    { name: "hooks", type: "address" },
    { name: "hookData", type: "bytes" },
  ],
} as const satisfies AbiParameter;

const approveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const permit2ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

const routerAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

type AqqqProofPlanInput = {
  chainId: number;
  account: Address;
  ausdBalance: bigint;
  monBalance: bigint;
  amountIn: bigint;
  quote: {
    amountOut: bigint;
    observedAtMs: number;
  };
  nowMs: number;
  slippageBps: number;
};

type PlannedCall = {
  label: string;
  to: Address;
  data: Hex;
  value: bigint;
};

type AqqqProofPlan = {
  chainId: 143;
  account: Address;
  amountIn: bigint;
  quotedOut: bigint;
  minimumOut: bigint;
  deadlineSeconds: bigint;
  calls: readonly PlannedCall[];
};

function buildAqqqProofPlan(input: AqqqProofPlanInput): AqqqProofPlan {
  if (input.chainId !== 143) {
    throw new Error("Monad mainnet chain ID 143 is required");
  }
  if (input.amountIn !== PROOF_AMOUNT) {
    throw new Error("Proof amount must equal exactly 1 AUSD");
  }
  if (input.ausdBalance < PROOF_AMOUNT) {
    throw new Error("At least 1 AUSD is required");
  }
  if (input.monBalance < MIN_MON_BALANCE) {
    throw new Error("At least 0.12 MON is required");
  }
  if (
    !Number.isSafeInteger(input.nowMs) ||
    !Number.isSafeInteger(input.quote.observedAtMs) ||
    input.nowMs < input.quote.observedAtMs ||
    input.nowMs - input.quote.observedAtMs > MAX_QUOTE_AGE_MS
  ) {
    throw new Error("Quote is stale");
  }
  if (
    !Number.isSafeInteger(input.slippageBps) ||
    input.slippageBps < 0 ||
    input.slippageBps > MAX_SLIPPAGE_BPS
  ) {
    throw new Error("Slippage cannot exceed 1%");
  }
  if (input.quote.amountOut <= 0n) {
    throw new Error("Quote output must be positive");
  }

  const minimumOut =
    (input.quote.amountOut *
      (BPS_DENOMINATOR - BigInt(input.slippageBps))) /
    BPS_DENOMINATOR;
  const deadlineSeconds =
    BigInt(Math.floor(input.nowMs / 1_000)) + TRANSACTION_DEADLINE_SECONDS;

  const swapAction = encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "currencyIn", type: "address" },
          { ...pathParameter, name: "path" },
          { name: "minHopPriceX36", type: "uint256[]" },
          { name: "amountIn", type: "uint128" },
          { name: "amountOutMinimum", type: "uint128" },
        ],
      },
    ],
    [
      {
        currencyIn: ADDRESSES.ausd,
        path: [
          {
            intermediateCurrency: ADDRESSES.usdc,
            fee: 50n,
            tickSpacing: 1,
            hooks: ZERO_ADDRESS,
            hookData: "0x",
          },
          {
            intermediateCurrency: ADDRESSES.aqqq,
            fee: 9_000n,
            tickSpacing: 90,
            hooks: ZERO_ADDRESS,
            hookData: "0x",
          },
        ],
        minHopPriceX36: [],
        amountIn: input.amountIn,
        amountOutMinimum: 0n,
      },
    ],
  );
  const settleAction = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "bool" }],
    [ADDRESSES.ausd, input.amountIn, false],
  );
  const takeAction = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [ADDRESSES.aqqq, ROUTER_AS_RECIPIENT, 0n],
  );
  const v4Input = encodeAbiParameters(
    [{ type: "bytes" }, { type: "bytes[]" }],
    ["0x070b0e", [swapAction, settleAction, takeAction]],
  );
  const permit2TransferInput = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint160" }],
    [ADDRESSES.ausd, ROUTER_AS_RECIPIENT, input.amountIn],
  );
  const sweepInput = encodeAbiParameters(
    [{ type: "address" }, { type: "address" }, { type: "uint256" }],
    [ADDRESSES.aqqq, input.account, minimumOut],
  );
  const routerData = encodeFunctionData({
    abi: routerAbi,
    functionName: "execute",
    args: [
      "0x021004",
      [permit2TransferInput, v4Input, sweepInput],
      deadlineSeconds,
    ],
  });

  return {
    chainId: 143,
    account: input.account,
    amountIn: input.amountIn,
    quotedOut: input.quote.amountOut,
    minimumOut,
    deadlineSeconds,
    calls: [
      {
        label: "Approve Permit2",
        to: ADDRESSES.ausd,
        data: encodeFunctionData({
          abi: approveAbi,
          functionName: "approve",
          args: [ADDRESSES.permit2, input.amountIn],
        }),
        value: 0n,
      },
      {
        label: "Approve Universal Router",
        to: ADDRESSES.permit2,
        data: encodeFunctionData({
          abi: permit2ApproveAbi,
          functionName: "approve",
          args: [
            ADDRESSES.ausd,
            ADDRESSES.universalRouter,
            input.amountIn,
            Number(deadlineSeconds),
          ],
        }),
        value: 0n,
      },
      {
        label: "Swap AUSD to aQQQ",
        to: ADDRESSES.universalRouter,
        data: routerData,
        value: 0n,
      },
    ],
  };
}

export { ADDRESSES, buildAqqqProofPlan };
export type { AqqqProofPlan, AqqqProofPlanInput, PlannedCall };
