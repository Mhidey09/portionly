import { expect, test, type Page, type Route } from "@playwright/test";
import { encodeFunctionResult } from "viem";

// The same ABI the page reads with.
const paymentsAbi = [
  {
    type: "function",
    name: "payments",
    stateMutability: "view",
    inputs: [{ name: "link", type: "address" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "nowAmount", type: "uint256" },
      { name: "growAmount", type: "uint256" },
      { name: "investAmount", type: "uint256" },
      { name: "lockDays", type: "uint32" },
      { name: "createdAt", type: "uint64" },
      { name: "open", type: "bool" },
    ],
  },
] as const;

const KEY = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const SENDER = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";
const ZERO = "0x0000000000000000000000000000000000000000";
const FX = /open\.er-api\.com\/v6\/latest\/USD/;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "POST, OPTIONS" };

type Payment = { sender: string; now: bigint; grow: bigint; invest: bigint; lockDays: number; open: boolean };

const result = (payment: Payment) =>
  encodeFunctionResult({
    abi: paymentsAbi,
    functionName: "payments",
    result: [payment.sender as `0x${string}`, payment.now, payment.grow, payment.invest, payment.lockDays, 1_760_000_000n, payment.open],
  });

/** Answers the Monad RPC in the page with one canned payment. Returns every request body seen. */
async function mockMonad(page: Page, payment: Payment): Promise<string[]> {
  const seen: string[] = [];
  const answer = (call: { id: number; method: string }) => {
    if (call.method === "eth_chainId") return { jsonrpc: "2.0", id: call.id, result: "0x8f" };
    if (call.method === "eth_call") return { jsonrpc: "2.0", id: call.id, result: result(payment) };
    return { jsonrpc: "2.0", id: call.id, error: { code: -32601, message: "not mocked" } };
  };
  await page.route("https://rpc.monad.xyz/**", async (route: Route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    const body = request.postData() ?? "";
    seen.push(request.url() + body);
    const parsed = JSON.parse(body);
    const json = Array.isArray(parsed) ? parsed.map(answer) : answer(parsed);
    return route.fulfill({ json, headers: cors });
  });
  // Rates are never fetched for real.
  await page.route(FX, (route) => route.abort());
  return seen;
}

const open: Payment = { sender: SENDER, now: 100_000_000n, grow: 60_000_000n, invest: 40_000_000n, lockDays: 90, open: true };

test("an open money link shows the total, the three portions and the three steps", async ({ page }) => {
  const seen = await mockMonad(page, open);
  await page.goto(`/claim#${KEY}`);
  await expect(page.getByTestId("claim-total")).toHaveText("$200.00");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("is waiting for you.");
  await expect(page.locator(".claim-slip .slip-rows output")).toHaveText(["$100.00", "$60.00", "$40.00"]);
  await expect(page.getByText("locked for 3 months from the day you collect")).toBeVisible();
  await expect(page.getByText("Bought at the live price when you collect.")).toBeVisible();
  await expect(page.locator(".claim-steps li")).toHaveCount(3);
  await expect(page.getByText("I have a money link")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy my money link" })).toBeVisible();
  // The key stays in the browser: no request carried it.
  expect(seen.length).toBeGreaterThan(0);
  for (const entry of seen) expect(entry.toLowerCase()).not.toContain(KEY);
});

test("a closed payment says it was already collected", async ({ page }) => {
  await mockMonad(page, { ...open, open: false });
  await page.goto(`/claim#${KEY}`);
  await expect(page.getByRole("heading", { name: "This money was already collected." })).toBeVisible();
  await expect(page.getByTestId("claim-total")).toHaveCount(0);
  await expect(page.locator(".claim-steps")).toHaveCount(0);
});

test("a malformed fragment says the link is not complete and reads nothing", async ({ page }) => {
  const seen = await mockMonad(page, open);
  await page.goto("/claim#0102030405");
  await expect(page.getByRole("heading", { name: "This link is not complete." })).toBeVisible();
  await expect(page.getByTestId("claim-total")).toHaveCount(0);
  expect(seen).toHaveLength(0);
});

test("a link with no fragment says the link is not complete", async ({ page }) => {
  await mockMonad(page, open);
  await page.goto("/claim");
  await expect(page.getByRole("heading", { name: "This link is not complete." })).toBeVisible();
});

test("a link that was never funded says nothing is waiting", async ({ page }) => {
  await mockMonad(page, { sender: ZERO, now: 0n, grow: 0n, invest: 0n, lockDays: 0, open: false });
  await page.goto(`/claim#${KEY}`);
  await expect(page.getByRole("heading", { name: "Nothing is waiting here yet." })).toBeVisible();
  await expect(page.getByTestId("claim-total")).toHaveCount(0);
});

test("?cur= shows quiet local amounts under the total and each portion", async ({ page }) => {
  await mockMonad(page, open);
  await page.unroute(FX);
  await page.route(FX, (route) =>
    route.fulfill({ json: { result: "success", time_last_update_unix: Math.floor(Date.now() / 1000) - 3600, rates: { USD: 1, NGN: 1500, EUR: 0.9 } } }),
  );
  await page.goto(`/claim?cur=NGN#${KEY}`);
  await expect(page.getByTestId("claim-total")).toHaveText("$200.00");
  await expect(page.getByTestId("claim-local")).toHaveText("about ₦300,000");
  await expect(page.locator(".claim-slip .slip-rows .local")).toHaveText(["about ₦150,000", "about ₦90,000", "about ₦60,000"]);
  await expect(page.getByText("Reference rate, not a payout quote.")).toHaveCount(1);
  await page.getByLabel("Show in my currency").selectOption("");
  await expect(page.locator(".local")).toHaveCount(0);
});

test("the claim page stays dollars only when rates are unavailable", async ({ page }) => {
  await mockMonad(page, open);
  await page.goto(`/claim?cur=NGN#${KEY}`);
  await expect(page.getByTestId("claim-total")).toHaveText("$200.00");
  await expect(page.locator(".local")).toHaveCount(0);
  await expect(page.getByLabel("Show in my currency")).toHaveCount(0);
});

test("the landing page opens a pasted money link on the claim page", async ({ page }) => {
  await mockMonad(page, open);
  await page.goto("/");
  await expect(page.getByText("No account yet?")).toBeVisible();
  await page.getByLabel("Your Portionly link or address").fill(`https://portionly-three.vercel.app/claim#${KEY}`);
  await page.getByRole("button", { name: "See what arrived" }).click();
  await expect(page).toHaveURL(new RegExp(`/claim#${KEY}$`));
  await expect(page.getByTestId("claim-total")).toHaveText("$200.00");
});
