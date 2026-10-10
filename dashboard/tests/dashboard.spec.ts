import { expect, test } from "@playwright/test";

const funded = "0x42e0dDf73e2275e7F41B22Cf9c587ADDA3C1B7D2";

test("landing explains the product and the slip responds to the mode", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Send money home.");
  await expect(page.getByRole("tab", { name: "Send + grow" })).toHaveAttribute("aria-selected", "true");
  const rows = page.locator(".slip-rows output");
  await expect(rows).toHaveText(["$100.00", "$60.00", "$40.00"]);

  await page.getByRole("tab", { name: "Send home" }).click();
  await expect(rows).toHaveText(["$200.00", "$0.00", "$0.00"]);

  await page.getByLabel("Example amount in dollars").fill("80");
  await expect(rows.first()).toHaveText("$80.00");
  // No APK URL or indexer is configured in tests, so neither a download link nor a live figure is invented.
  await expect(page.getByRole("link", { name: "Get the Android app" })).toHaveCount(0);
  await expect(page.locator(".live")).toHaveCount(0);
});

test("the slip lines move with the keyboard and always total 100%", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Move the line between home now and savings" }).press("ArrowRight");
  await expect(page.locator(".slip-rows output")).toHaveText(["$110.00", "$50.00", "$40.00"]);
  await page.getByRole("button", { name: "Move the line between savings and stocks" }).press("ArrowLeft");
  await expect(page.locator(".slip-rows output")).toHaveText(["$110.00", "$40.00", "$50.00"]);
});

test("a pasted link or address opens the recipient page; nonsense is refused", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Your Portionly link or address").fill("not an address");
  await page.getByRole("button", { name: "See what arrived" }).click();
  await expect(page.getByRole("alert")).toHaveText("That doesn't look like a Portionly link or address.");

  await page.getByLabel("Your Portionly link or address").fill(`https://portionly-three.vercel.app/pay/${funded}`);
  await page.getByRole("button", { name: "See what arrived" }).click();
  await expect(page).toHaveURL(new RegExp(`/pay/${funded}$`));
});

test("/pay/<address> reads real balances from Monad and offers the chain evidence", async ({ page }) => {
  await page.goto(`/pay/${funded}`);
  await expect(page.getByRole("heading", { name: "Here's what arrived." })).toBeVisible();
  await expect(page.getByTestId("pay-address")).toHaveAttribute("title", funded);
  await expect(page.getByTestId("spend")).toHaveText(/^\$\d[\d,]*\.\d{2}$/, { timeout: 30_000 });
  await expect(page.getByTestId("savings")).toHaveText(/^\$\d[\d,]*\.\d{2}$/);
  await expect(page.getByTestId("stocks")).toContainText("aQQQ");
  await expect(page.getByText(/^Read from Monad at block \d+\./)).toBeVisible();
  await expect(page.getByRole("link", { name: "See this account on the explorer" })).toHaveAttribute("href", `https://monadscan.com/address/${funded}`);
  await expect(page.getByText("Payment history isn't connected on this page.")).toBeVisible();
});

test("older ?recipient= links still open the recipient page", async ({ page }) => {
  await page.goto(`/?recipient=${funded}`);
  await expect(page.getByRole("heading", { name: "Here's what arrived." })).toBeVisible();
});

test("a malformed pay link fails closed", async ({ page }) => {
  await page.goto("/pay/0x123");
  await expect(page.getByRole("alert")).toHaveText("This pay link does not contain a valid address.");
  await expect(page.getByTestId("spend")).toHaveCount(0);
});

test("the proof page says so when no indexer is configured", async ({ page }) => {
  await page.goto("/proof");
  await expect(page.getByRole("heading", { name: "Every payment, in the open." })).toBeVisible();
  await expect(page.getByText("The indexer isn't connected on this page.")).toBeVisible();
});
