import { getAddress, isAddress, type Address } from "viem";

// A budget wallet pays only its own person, so the recipient of any plan it executed is that person.
const RECIPIENT_QUERY = `query PlanRecipient($sender: String!) {
  Plan(where: { sender: { _eq: $sender } }, limit: 1, order_by: { timestamp: desc }) { recipient }
}`;

/** The newest plan's recipient, or undefined when the indexer has no plan for this sender. Throws on a malformed answer. */
function parsePlanRecipient(body: unknown): Address | undefined {
  const data = (body ?? {}) as { data?: { Plan?: unknown }; errors?: { message?: string }[] };
  if (data.errors?.length) throw new Error(data.errors.map((e) => e.message ?? "GraphQL error").join("; "));
  const list = data.data?.Plan;
  if (!Array.isArray(list)) throw new Error("Indexer response had no Plan list");
  if (list.length === 0) return undefined;
  const recipient = (list[0] as { recipient?: unknown } | null)?.recipient;
  if (typeof recipient !== "string" || !isAddress(recipient, { strict: false })) throw new Error("Indexer returned an unreadable recipient");
  return getAddress(recipient);
}

/** Never throws: no indexer, an indexer that is down, or no plan all mean "unknown", which the caller turns into an address prompt. */
async function fetchPlanRecipient(url: string | undefined, sender: Address, fetcher: typeof fetch = fetch): Promise<Address | undefined> {
  if (!url) return undefined;
  try {
    const res = await fetcher(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: RECIPIENT_QUERY, variables: { sender: sender.toLowerCase() } }),
    });
    if (!res.ok) return undefined;
    return parsePlanRecipient(await res.json());
  } catch {
    return undefined;
  }
}

export { fetchPlanRecipient, parsePlanRecipient, RECIPIENT_QUERY };
