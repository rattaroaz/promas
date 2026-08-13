import { expect, type Page, test } from "@playwright/test";

/** Invoice Process now gates through Company → Property before the list. */
async function openInvoiceBrowse(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
  await expect(page.getByText(/Enter Search Company NO/i)).toBeVisible();

  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();

  await expect(page.getByText(/Enter Property NO/i)).toBeVisible();
  const propertyNo = page.getByPlaceholder("? = first");
  await propertyNo.fill("?");
  await propertyNo.press("Enter");
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();

  // Browse list for the selected site (status bar + fixture row)
  await expect(page.getByText(/1 invoices/i)).toBeVisible();
}

test.describe("invoice process", () => {
  test("opens Invoice Process and shows fixture list row", async ({ page }) => {
    await openInvoiceBrowse(page);
    await expect(
      page.getByRole("button", { name: /1\s+01\/15\/2026\s+A1\s+250\.00/ })
    ).toBeVisible();
  });

  test("opens invoice detail from list row", async ({ page }) => {
    await openInvoiceBrowse(page);
    await page
      .getByRole("button", { name: /1\s+01\/15\/2026\s+A1\s+250\.00/ })
      .click();
    await expect(page.getByText(/Invoice No/i)).toBeVisible();
  });
});
