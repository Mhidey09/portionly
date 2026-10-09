import { encodeFunctionData, isHex, type Address, type Hex } from "viem";

type LockedSaving = { key: Hex; amount: bigint; unlockAt: bigint; claimed: boolean; lockTxHash: Hex };

const futureClaimAbi = [
  { type: "function", name: "claim", stateMutability: "nonpayable", inputs: [{ name: "positionId", type: "bytes32" }], outputs: [] },
] as const;

const LOCKS_QUERY = `query Locks($beneficiary: String!) {
  Position(where: { beneficiary: { _eq: $beneficiary } }, order_by: { unlockAt: asc }) {
    id amount unlockAt claimed lockTxHash
  }
}`;

function toBigInt(value: unknown, field: string): bigint {
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  throw new Error(`Indexer returned an unreadable ${field}`);
}

function parseLocks(body: unknown): LockedSaving[] {
  const data = (body as { data?: { Position?: unknown }; errors?: { message?: string }[] }) ?? {};
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message ?? "GraphQL error").join("; "));
  const list = data.data?.Position;
  if (!Array.isArray(list)) throw new Error("Indexer response had no Position list");
  return list.map((row) => {
    const r = row as Record<string, unknown>;
    if (typeof r.id !== "string" || !isHex(r.id) || r.id.length !== 66) throw new Error("Indexer returned an unreadable position id");
    if (typeof r.lockTxHash !== "string" || !isHex(r.lockTxHash)) throw new Error("Indexer returned an unreadable lock tx");
    if (typeof r.claimed !== "boolean") throw new Error("Indexer returned an unreadable claim flag");
    return { key: r.id, amount: toBigInt(r.amount, "amount"), unlockAt: toBigInt(r.unlockAt, "unlock date"), claimed: r.claimed, lockTxHash: r.lockTxHash };
  });
}

async function fetchLocks(url: string, beneficiary: Address): Promise<LockedSaving[]> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: LOCKS_QUERY, variables: { beneficiary: beneficiary.toLowerCase() } }),
  });
  if (!res.ok) throw new Error(`Indexer responded ${res.status}`);
  return parseLocks(await res.json());
}

function canClaim(lock: LockedSaving, nowSeconds: bigint): boolean {
  return !lock.claimed && nowSeconds >= lock.unlockAt;
}

function claimCallData(key: Hex): Hex {
  return encodeFunctionData({ abi: futureClaimAbi, functionName: "claim", args: [key] });
}

export { canClaim, claimCallData, fetchLocks, parseLocks };
export type { LockedSaving };
