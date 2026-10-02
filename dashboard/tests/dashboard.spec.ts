import { expect, test } from "@playwright/test";

const recipient = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";

test("starts read-only and rejects malformed recipients", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("No wallet connection is required.")).toBeVisible();
  await expect(page.getByText("Paste a recipient address")).toBeVisible();

  await page.getByLabel("Recipient address").fill("not-an-address");
  await page.getByRole("button", { name: "View balance" }).click();
  await expect(page.getByRole("alert")).toHaveText("Enter a valid 0x recipient address.");
});

test("reads a real Monad address and exposes chain evidence", async ({ page }) => {
  await page.goto(`/?recipient=${recipient}`);
  await expect(page.getByText("Live balance", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "0x000000...a9012a" })).toBeVisible();
  await expect(page.getByText(/^Read at block \d+$/)).toBeVisible();
  await expect(page.getByText("AUSD", { exact: true })).toBeVisible();
  await expect(page.getByText("aQQQ", { exact: true })).toBeVisible();
  await expect(page.getByText("History isn’t connected yet.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open explorer" })).toHaveAttribute("href", `https://monadscan.com/address/${recipient}`);
});
