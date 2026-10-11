import { describe, expect, it } from "vitest";
import { fetchPlanRecipient, parsePlanRecipient, RECIPIENT_QUERY } from "./planRecipient";

const JAMES = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";
const WALLET = "0xF8603788F521f71Cfc484268eDb6B80265b780e9";

// Shapes of the indexer's answers: one row with the lowercase recipient, or an empty list.
const withPlan = { data: { Plan: [{ recipient: JAMES.toLowerCase() }] } };
const noPlan = { data: { Plan: [] } };

const fakeFetch = (body: unknown, ok = true): typeof fetch =>
  (async () => ({ ok, status: ok ? 200 : 503, json: async () => body })) as unknown as typeof fetch;

describe("parsePlanRecipient", () => {
  it("returns the checksummed recipient of the newest plan", () => {
    expect(parsePlanRecipient(withPlan)).toBe(JAMES);
  });
  it("returns undefined when there is no plan", () => {
    expect(parsePlanRecipient(noPlan)).toBeUndefined();
  });
  it("throws on errors and unreadable shapes", () => {
    expect(() => parsePlanRecipient({ errors: [{ message: "boom" }] })).toThrow("boom");
    expect(() => parsePlanRecipient({ data: {} })).toThrow();
    expect(() => parsePlanRecipient(null)).toThrow();
    expect(() => parsePlanRecipient({ data: { Plan: [{ recipient: "0x12" }] } })).toThrow();
    expect(() => parsePlanRecipient({ data: { Plan: [{}] } })).toThrow();
  });
});

describe("fetchPlanRecipient", () => {
  it("asks for the lowercase sender, newest first, one row", async () => {
    let sent: { query: string; variables: { sender: string } } | undefined;
    const spy = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      return { ok: true, json: async () => withPlan };
    }) as unknown as typeof fetch;
    expect(await fetchPlanRecipient("https://x.test/graphql", WALLET, spy)).toBe(JAMES);
    expect(sent?.variables.sender).toBe(WALLET.toLowerCase());
    expect(sent?.query).toBe(RECIPIENT_QUERY);
    expect(RECIPIENT_QUERY).toContain("limit: 1");
    expect(RECIPIENT_QUERY).toContain("order_by: { timestamp: desc }");
  });
  it("falls back to undefined with no indexer, a down indexer, a bad answer or no plan", async () => {
    expect(await fetchPlanRecipient(undefined, WALLET)).toBeUndefined();
    expect(await fetchPlanRecipient("https://x.test", WALLET, fakeFetch({}, false))).toBeUndefined();
    expect(await fetchPlanRecipient("https://x.test", WALLET, fakeFetch({ data: {} }))).toBeUndefined();
    expect(await fetchPlanRecipient("https://x.test", WALLET, fakeFetch(noPlan))).toBeUndefined();
    const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
    expect(await fetchPlanRecipient("https://x.test", WALLET, broken)).toBeUndefined();
  });
});
