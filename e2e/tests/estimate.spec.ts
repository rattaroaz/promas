import { expect, type Page, test } from "@playwright/test";

async function openEstimates(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /1\.\s*Estimate Process/i }).click();
  await expect(page.getByText(/Enter Search Company NO/i)).toBeVisible();

  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();

  const propertyNo = page.getByPlaceholder("? = first");
  await propertyNo.fill("?");
  await propertyNo.press("Enter");
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();

  await expect(page.getByText(/1 proposals/i)).toBeVisible();
}

test.describe("estimate process", () => {
  test("lists fixture proposal after gate", async ({ page }) => {
    await openEstimates(page);
    await expect(page.getByRole("button", { name: /EST-1/i })).toBeVisible();
  });

  test("opens an existing proposal for edit", async ({ page }) => {
    await openEstimates(page);
    await page.getByRole("button", { name: /EST-1/i }).click();
    await expect(page.locator('input[value="EST-1"]')).toBeVisible();
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Proposal Information"
    );
  });

  test("creates a new proposal from Ins and saves it", async ({ page }) => {
    await openEstimates(page);
    await page.getByRole("button", { name: /^Ins$/i }).click();
    await expect(page.locator('input[value="EST-1"]')).toBeVisible();
    await page.getByRole("button", { name: /Cntr_W Save/i }).click();
    await expect(page.getByRole("button", { name: /EST-1/i })).toBeVisible();
    await expect(page.getByText(/1 proposals/i)).toBeVisible();
  });
});
