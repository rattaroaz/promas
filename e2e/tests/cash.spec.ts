import { expect, type Page, test } from "@playwright/test";

async function openCashLedger(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /4\.\s*Cash Receipts Process/i }).click();
  await expect(page.getByText(/Enter Search Company NO/i)).toBeVisible();

  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();

  const propertyNo = page.getByPlaceholder("? = first");
  await propertyNo.fill("?");
  await propertyNo.press("Enter");
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();

  await expect(page.getByText(/Ending Balance/i)).toBeVisible();
}

test.describe("cash receipts process", () => {
  test("opens ledger after company/property gate", async ({ page }) => {
    await openCashLedger(page);
    await expect(page.getByText(/Open 250\.00/i)).toBeVisible();
  });

  test("posts a receipt for the open invoice", async ({ page }) => {
    await openCashLedger(page);
    await page.getByRole("button", { name: /^Ins$/i }).click();
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );
    await expect(page.locator('input[type="number"]').last()).toHaveValue("250");
    await page.getByRole("button", { name: /Cntr_W Save/i }).click();
    await expect(page.getByText(/Ending Balance/i)).toBeVisible();
  });
});
