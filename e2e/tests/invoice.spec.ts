import { expect, type Page, test } from "@playwright/test";

/** Local calendar arithmetic. ArrowDown in Chromium's picker moves one week. */
function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

/** Invoice Process now gates through Company → Property before the list. */
async function openInvoiceBrowse(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
  await expect(page.getByRole("textbox", { name: "Invoice Number" })).toBeFocused();

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

  test("calendar icon opens the picker and sets the date", async ({ page }) => {
    await openInvoiceBrowse(page);
    await page.getByRole("button", { name: /^New Invoice$/i }).click();
    const labels = [
      "Invoice Date",
      "Due Date",
      "Order Date",
      "Line 1 work date",
    ];
    await expect(page.locator(".invoice-edit input[type='date']")).toHaveCount(4);
    for (const label of labels) {
      const field = page.getByLabel(label);
      const before = await field.inputValue();
      const box = await field.boundingBox();
      expect(box, label).toBeTruthy();
      await field.click({
        position: { x: box!.width - 14, y: box!.height / 2 },
      });
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(field).toHaveValue(plusDays(before, 7));
    }
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

