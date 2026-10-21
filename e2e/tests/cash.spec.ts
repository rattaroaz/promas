import { expect, type Page, test } from "@playwright/test";

async function openCashLedger(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /4\.\s*Cash Receipts Process/i }).click();
  await expect(page.getByRole("textbox", { name: "Invoice Number" })).toBeFocused();

  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();

  await expect(page.getByText(/Unpaid Total/i)).toBeVisible();
  await expect(page.getByText(/Balance Total/i)).toHaveCount(0);
  await expect(page.getByText(/Receipt Total/i)).toHaveCount(0);
}

test.describe("cash receipts process", () => {
  test("opens ledger after company gate", async ({ page }) => {
    await openCashLedger(page);
    await expect(page.getByText(/Open.*370\.00/i)).toBeVisible();
  });

  test("opens ledger by invoice number", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /4\.\s*Cash Receipts Process/i }).click();

    const invoiceNo = page.getByRole("textbox", { name: "Invoice Number" });
    await expect(invoiceNo).toBeFocused();
    await expect(page.getByText(/Enter Search Invoice NO/i)).toBeVisible();
    await invoiceNo.fill("1");
    await invoiceNo.press("Enter");

    await expect(page.getByText(/Unpaid Total/i)).toBeVisible();
    const selectedRow = page.locator(".dos-row.selected");
    await expect(selectedRow).toBeVisible();
    await expect(selectedRow).toContainText("1");
  });

  test("posts a receipt for the open invoice", async ({ page }) => {
    await openCashLedger(page);
    await page.getByRole("button", { name: /^Ins Add$/i }).click();
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );
    await expect(page.getByLabel("Amount Paid")).toHaveValue("40.00");
    await page.getByRole("button", { name: /Cntr_S Save/i }).click();
    await expect(page.getByText(/Unpaid Total/i)).toBeVisible();
  });

  test("lists unpaid invoices above paid ones, newest first", async ({ page }) => {
    await openCashLedger(page);
    const rows = page.locator(".dos-browse-body .dos-row");
    await expect(rows).toHaveCount(5);
    const invoices = (await rows.allInnerTexts()).map(
      (text) => text.trim().split(/\s+/)[0]
    );
    expect(invoices).toEqual(["4", "1", "3", "6", "5"]);
  });

  test("Enter asks before posting and only Y or y saves", async ({ page }) => {
    await openCashLedger(page);
    await page.getByRole("button", { name: /^Ins Add$/i }).click();
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );

    await page.keyboard.press("Enter");
    const question = page.getByText("Are you sure this is correct? Y/N");
    await expect(question).toBeVisible();

    await page.keyboard.press("x");
    await expect(question).toBeVisible();

    await page.keyboard.press("n");
    await expect(question).toHaveCount(0);
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );

    await page.keyboard.press("Enter");
    await page.keyboard.press("N");
    await expect(question).toHaveCount(0);
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );

    await page.keyboard.press("Enter");
    await page.keyboard.press("Escape");
    await expect(question).toHaveCount(0);
    await expect(page.locator(".dlg-title")).toContainText(
      "Enter Your Payment Data"
    );

    await page.keyboard.press("Enter");
    await page.keyboard.press("y");
    await expect(page.getByText(/Receipt posted/i)).toBeVisible();
    await expect(question).toHaveCount(0);
  });

  test("uppercase Y confirms and posts the payment", async ({ page }) => {
    await openCashLedger(page);
    await page.getByRole("button", { name: /^Ins Add$/i }).click();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Y");
    await expect(page.getByText(/Receipt posted/i)).toBeVisible();
  });

  test("auto receipt says Balance Due", async ({ page }) => {
    await openCashLedger(page);
    await page.getByRole("button", { name: /\(A\)/i }).click();
    await expect(page.getByText("Balance Due: 370.00")).toBeVisible();
    await expect(page.getByText(/Ending Balance Due/i)).toHaveCount(0);
  });
});
