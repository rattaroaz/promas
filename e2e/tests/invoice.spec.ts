import { expect, type Page, test } from "@playwright/test";

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

  test("calendar icon is the native indicator and sets a date", async ({
    page,
  }) => {
    await openInvoiceBrowse(page);
    await page.getByRole("button", { name: /^New Invoice$/i }).click();
    const dates = page.locator(".invoice-edit input[type='date']");
    await expect(dates).toHaveCount(4);
    await page.evaluate(() => {
      const active = document.activeElement;
      if (active instanceof HTMLElement) active.blur();
    });
    const labels = ["Invoice Date", "Due Date", "Order Date", "Line 1 work date"];
    for (const label of labels) {
      const field = page.getByLabel(label);
      const indicator = await field.evaluate((el) => {
        const style = getComputedStyle(el, "::-webkit-calendar-picker-indicator");
        return {
          opacity: Number(style.opacity),
          filter: style.filter,
          cursor: style.cursor,
        };
      });
      expect(indicator.opacity).toBeGreaterThan(0.3);
      expect(indicator.filter).toContain("invert");
      expect(indicator.cursor).toBe("pointer");
    }
    const order = page.getByLabel("Order Date");
    const before = await order.inputValue();
    const box = await order.boundingBox();
    expect(box).toBeTruthy();
    await order.click({
      position: { x: box!.width - 6, y: box!.height / 2 },
    });
    await order.fill("2024-11-02");
    await expect(order).toHaveValue("2024-11-02");
    expect(before).not.toBe("2024-11-02");
    await page.getByLabel("Line 1 work date").fill("2024-11-03");
    await expect(page.getByLabel("Line 1 work date")).toHaveValue("2024-11-03");
    await page.getByLabel("Due Date").fill("2024-11-09");
    await expect(page.getByLabel("Due Date")).toHaveValue("2024-11-09");
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

