import { formatUnits } from "viem";

export type Totals = { payments: number; ausd: string };
export type ProofPlan = { txHash: string; timestamp: number; now: string; save: string; stocks: string; total: string; usedFallback: boolean; locked: boolean };

const QUERY = `{
  Plan(order_by: { timestamp: desc }, limit: 500) { nowAmount growAmount investAmount usedFallback timestamp txHash }
  Position { lockTxHash }
}`;

type RawPlan = { nowAmount: string | number; growAmount: string | number; investAmount: string | number; usedFallback: boolean; timestamp: string | number; txHash: string };

const usd = (units: bigint) => Number(formatUnits(units, 6)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function summarize(payload: unknown): { totals: Totals; plans: ProofPlan[] } {
  const data = (payload as { data?: { Plan?: RawPlan[]; Position?: { lockTxHash: string }[] }; errors?: { message?: string }[] }) ?? {};
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message ?? "Indexer error").join("; "));
  const list = data.data?.Plan;
  if (!Array.isArray(list)) throw new Error("Indexer response had no payments list.");
  const locks = new Set((data.data?.Position ?? []).map((p) => p.lockTxHash.toLowerCase()));
  let sum = 0n;
  const plans = list.map((row) => {
    const now = BigInt(row.nowAmount), save = BigInt(row.growAmount), stocks = BigInt(row.investAmount);
    sum += now + save + stocks;
    return { txHash: row.txHash, timestamp: Number(row.timestamp), now: usd(now), save: usd(save), stocks: usd(stocks), total: usd(now + save + stocks), usedFallback: row.usedFallback, locked: locks.has(row.txHash.toLowerCase()) };
  });
  return { totals: { payments: plans.length, ausd: usd(sum) }, plans };
}

async function query(): Promise<{ totals: Totals; plans: ProofPlan[] } | null> {
  const url = import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined;
  if (!url) return null;
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: QUERY }) });
  if (!res.ok) throw new Error(`Indexer responded ${res.status}.`);
  return summarize(await res.json());
}

/** Landing page figure. Null when the indexer is missing or failing: no number is better than a wrong one. */
export async function loadTotals(): Promise<Totals | null> {
  try {
    return (await query())?.totals ?? null;
  } catch {
    return null;
  }
}

export async function loadProof(): Promise<{ kind: "ready"; totals: Totals; plans: ProofPlan[] } | { kind: "not-configured" } | { kind: "error"; message: string }> {
  try {
    const result = await query();
    return result ? { kind: "ready", ...result } : { kind: "not-configured" };
  } catch (cause) {
    return { kind: "error", message: cause instanceof Error ? cause.message : "The indexer could not be read." };
  }
}
