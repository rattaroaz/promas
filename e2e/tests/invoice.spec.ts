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
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();

  // Browse list for the selected site (status bar + fixture row)
  await expect(page.getByText(/1 invoices/i)).toBeVisible();
}

test.describe("invoice process", () => {
  test("opens Invoice Process and shows fixture list row", async ({ page }) => {
    await openInvoiceBrowse(page);
    await expect(
      page.getByRole("button", { name: /01\/15\/2026\s+1\s+A1\s+250\.00/ })
    ).toBeVisible();
  });

  test("opens invoice detail from list row", async ({ page }) => {
    await openInvoiceBrowse(page);
    await page
      .getByRole("button", { name: /01\/15\/2026\s+1\s+A1\s+250\.00/ })
      .click();
    await expect(page.getByLabel("Invoice Number")).toHaveValue("1");
    await expect(page.getByText(/Invoice Number 1/i)).toBeVisible();
  });

  test("Ins status hint adds a new invoice from the list", async ({ page }) => {
    await openInvoiceBrowse(page);
    await page.getByRole("button", { name: /^Ins Add$/i }).click();
    await expect(page.getByLabel("Invoice Number")).toHaveValue("2");
    await expect(page.getByText(/Invoice Number 2/i)).toBeVisible();
  });

  test("New Invoice skips date/number prompt and opens the form", async ({
    page,
  }) => {
    await openInvoiceBrowse(page);
    await page.getByRole("button", { name: /^New Invoice$/i }).click();
    await expect(page.getByLabel("Invoice Number")).toHaveValue("2");
    await expect(page.getByText(/Invoice Number 2/i)).toBeVisible();
    await expect(page.getByText(/Due Date/i)).toBeVisible();
  });

  test("fills a preset line price from size", async ({ page }) => {
    await openInvoiceBrowse(page);
    await page.getByRole("button", { name: /^New Invoice$/i }).click();
    await page.getByLabel("Line 1 description").selectOption(
      "Interior Painting of Wall/Closet Inside"
    );
    await page.getByLabel("Size", { exact: true }).selectOption("1+1");
    await expect(page.getByLabel("Price 1")).toHaveValue("245");
  });
});

