import { formatUnits, type Address } from "viem";

export type PositionRow = {
  id: string;
  shares: string;
  unlockAt: number;
  claimed: boolean;
  claimedAt: number | null;
  lockTxHash: string;
};

export type PlanRow = {
  planId: string;
  nowAusd: string;
  growAusd: string;
  growShares: string;
  investAusd: string;
  investOutAqqq: string;
  usedFallback: boolean;
  timestamp: number;
  txHash: string;
  /** Matching time lock (same lock tx), if the Grow part was time locked. */
  position: PositionRow | null;
};

export type History = { plans: PlanRow[]; positions: PositionRow[] };

export type HistoryState =
  | { kind: "not-configured" }
  | { kind: "error"; message: string }
  | { kind: "empty" }
  | { kind: "ready"; history: History };

const PLANS_QUERY = `query Plans($recipient: String!) {
  Plan(where: { recipient: { _eq: $recipient } }, order_by: { timestamp: desc }, limit: 20) {
    id planId sender recipient nowAmount growAmount growShares investAmount investOut
    usedFallback blockNumber timestamp txHash
  }
}`;

const POSITIONS_QUERY = `query Positions($beneficiary: String!) {
  Position(where: { beneficiary: { _eq: $beneficiary } }, order_by: [{ claimed: asc }, { unlockAt: asc }]) {
    id depositor beneficiary asset amount unlockAt lockedAt lockTxHash claimed claimedAt claimTxHash
  }
}`;

type Raw = Record<string, unknown>;

function big(value: unknown, field: string): bigint {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    try {
      return BigInt(value);
    } catch {
      /* fall through */
    }
  }
  throw new Error(`Indexer returned an unreadable ${field}.`);
}

function rows(payload: unknown, key: string): Raw[] {
  const body = payload as { data?: Record<string, unknown>; errors?: { message?: string }[] };
  if (body?.errors?.length) {
    throw new Error(body.errors.map((e) => e.message ?? "GraphQL error").join("; "));
  }
  const list = body?.data?.[key];
  if (!Array.isArray(list)) throw new Error(`Indexer response had no ${key} list.`);
  return list as Raw[];
}

export function parsePositions(payload: unknown): PositionRow[] {
  return rows(payload, "Position").map((r) => ({
    id: String(r.id),
    shares: formatUnits(big(r.amount, "position amount"), 6),
    unlockAt: Number(big(r.unlockAt, "unlockAt")),
    claimed: r.claimed === true,
    claimedAt: r.claimedAt == null ? null : Number(big(r.claimedAt, "claimedAt")),
    lockTxHash: String(r.lockTxHash),
  }));
}

export function parsePlans(payload: unknown, positions: PositionRow[]): PlanRow[] {
  return rows(payload, "Plan").map((r) => {
    const txHash = String(r.txHash);
    return {
      planId: String(r.planId),
      nowAusd: formatUnits(big(r.nowAmount, "nowAmount"), 6),
      growAusd: formatUnits(big(r.growAmount, "growAmount"), 6),
      growShares: formatUnits(big(r.growShares, "growShares"), 6),
      investAusd: formatUnits(big(r.investAmount, "investAmount"), 6),
      investOutAqqq: formatUnits(big(r.investOut, "investOut"), 18),
      usedFallback: r.usedFallback === true,
      timestamp: Number(big(r.timestamp, "timestamp")),
      txHash,
      position: positions.find((p) => p.lockTxHash.toLowerCase() === txHash.toLowerCase()) ?? null,
    };
  });
}

export function buildHistory(plansPayload: unknown, positionsPayload: unknown): History {
  const positions = parsePositions(positionsPayload);
  return { plans: parsePlans(plansPayload, positions), positions };
}

export function formatDate(unixSeconds: number): string {
  // Fixed to UTC so the same payment shows the same day for sender and recipient.
  return new Date(unixSeconds * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function explorerTx(hash: string) {
  return `https://monadscan.com/tx/${hash}`;
}

export function trimAmount(value: string, max = 6) {
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.slice(0, max).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function envioUrl(): string | undefined {
  const url = import.meta.env.VITE_ENVIO_GRAPHQL_URL as string | undefined;
  return url && url.trim() ? url.trim() : undefined;
}

async function post(url: string, query: string, variables: Raw) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Indexer responded ${res.status}.`);
  return res.json();
}

export async function loadHistory(recipient: Address, url = envioUrl()): Promise<HistoryState> {
  if (!url) return { kind: "not-configured" };
  try {
    const key = recipient.toLowerCase();
    const [plans, positions] = await Promise.all([
      post(url, PLANS_QUERY, { recipient: key }),
      post(url, POSITIONS_QUERY, { beneficiary: key }),
    ]);
    const history = buildHistory(plans, positions);
    if (history.plans.length === 0 && history.positions.length === 0) return { kind: "empty" };
    return { kind: "ready", history };
  } catch (cause) {
    return { kind: "error", message: cause instanceof Error ? cause.message : "Could not reach the indexer." };
  }
}
