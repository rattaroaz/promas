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
    const question = page.getByText("Apply 40.00 to this invoice? Y/N");
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

  test("auto receipt Ctrl-S and Enter ask before posting", async ({ page }) => {
    const question = "Apply 370.00 to open invoices? Y/N";
    const triggers = ["Enter", "Control+s"] as const;
    const keys = ["y", "Y", "n", "N", "Escape", "x"] as const;

    for (const trigger of triggers) {
      for (const key of keys) {
        await openCashLedger(page);
        await page.getByRole("button", { name: /\(A\)/i }).click();
        const amount = page.getByLabel("Auto Amount Paid");
        await expect(amount).toBeVisible();
        await amount.focus();
        if (trigger === "Enter") {
          await page.keyboard.press("Enter");
          await page.keyboard.press("Enter");
        } else {
          await page.keyboard.press("Control+s");
        }
        const prompt = page.getByRole("dialog", { name: question });
        await expect(prompt, `${trigger} ${key}`).toBeVisible();
        await expect(page.getByText(/Apply Finished/i)).toHaveCount(0);

        await page.keyboard.press(key);
        if (key === "x") {
          await expect(prompt).toBeVisible();
          await page.keyboard.press("x");
          await expect(prompt).toBeVisible();
          await expect(page.locator(".dlg-title")).toContainText(
            "Enter Automatic Receipt Data"
          );
          continue;
        }
        if (key === "n" || key === "N" || key === "Escape") {
          await expect(prompt).toHaveCount(0);
          await expect(page.locator(".dlg-title")).toContainText(
            "Enter Automatic Receipt Data"
          );
          await expect(amount).toBeFocused();
          await expect(page.getByText("Balance Due: 370.00")).toBeVisible();
          continue;
        }
        await expect(prompt).toHaveCount(0);
        await expect(page.getByText(/Unpaid Total/i)).toBeVisible();
        await expect(page.locator(".dlg-title")).toHaveCount(0);
        await page.evaluate((held) => {
          window.dispatchEvent(
            new KeyboardEvent("keydown", { key: held, repeat: true, bubbles: true })
          );
          window.dispatchEvent(
            new KeyboardEvent("keydown", {
              key: "s",
              ctrlKey: true,
              repeat: true,
              bubbles: true,
            })
          );
        }, key);
        await expect(page.locator(".dlg-title")).toHaveCount(0);
        await expect(page.getByRole("dialog", { name: question })).toHaveCount(0);
      }
    }
  });

  test("confirm prompt stays below the fields at 1280 and 1024", async ({ page }) => {
    const autoHint = "Esc=Cancel  Enter/Ctrl-S=Apply (asks Y/N)";

    async function promptClearsRows(label: string) {
      const report = await page.evaluate(() => {
        const prompt = document.querySelector(".dos-prompt");
        const dialog = document.querySelector(".dos-dialog");
        if (!prompt || !dialog) return { missing: true, hits: [] as string[], under: 0, padTop: 0, padBottom: 0 };
        const promptBox = prompt.getBoundingClientRect();
        const overlaps = (a: DOMRect, b: DOMRect) =>
          a.left < b.right - 1 &&
          a.right > b.left + 1 &&
          a.top < b.bottom - 1 &&
          a.bottom > b.top + 1;
        const hits: string[] = [];
        const seen = new Set<Element>();
        const rows = [
          ...dialog.querySelectorAll(".dos-field, input, textarea, select"),
          ...dialog.querySelectorAll(".dos-form > div"),
        ];
        for (const el of rows) {
          if (seen.has(el) || el.closest(".dos-prompt")) continue;
          seen.add(el);
          const box = el.getBoundingClientRect();
          if (box.width < 2 || box.height < 2) continue;
          if (!overlaps(promptBox, box)) continue;
          const name = (el.getAttribute("aria-label") || el.textContent || el.tagName)
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 70);
          hits.push(`${name} @${Math.round(box.top)}`);
        }
        const q = prompt.querySelector(".q")?.getBoundingClientRect();
        const style = getComputedStyle(prompt);
        const borderBottom = parseFloat(style.borderBottomWidth) || 0;
        const under = q ? promptBox.bottom - borderBottom - q.bottom : promptBox.height;
        return {
          missing: false,
          hits,
          under,
          padTop: parseFloat(style.paddingTop),
          padBottom: parseFloat(style.paddingBottom),
        };
      });
      expect(report.missing, `${label} prompt missing`).toBe(false);
      expect(report.hits, `${label} prompt covers ${report.hits.join("; ")}`).toEqual([]);
      expect(report.padTop, `${label} padding`).toBe(8);
      expect(report.padBottom, `${label} padding`).toBe(8);
      expect(report.under, `${label} space under the question`).toBeLessThanOrEqual(8);
    }

    async function hintIsOneLine(text: string) {
      const foot = page.locator(".dos-dialog .dlg-foot");
      await expect(foot).toHaveText(text);
      const lines = await foot.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      expect(lines).toBe(1);
    }

    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 800 });

      await openCashLedger(page);
      await page.getByRole("button", { name: /^Ins Add$/i }).click();
      await expect(page.getByLabel("Amount Paid")).toHaveValue("40.00");
      await page.keyboard.press("Enter");
      await expect(page.locator(".dos-prompt")).toBeVisible();
      await promptClearsRows(`${width} payment`);
      await expect(page.locator(".dos-prompt")).toHaveText("Apply 40.00 to this invoice? Y/N");

      await openCashLedger(page);
      await page.getByRole("button", { name: /\(A\)/i }).click();
      await expect(page.getByText("Balance Due: 370.00")).toBeVisible();
      await hintIsOneLine(autoHint);
      await page.getByLabel("Auto Amount Paid").focus();
      await page.keyboard.press("Control+s");
      await expect(page.locator(".dos-prompt")).toBeVisible();
      await promptClearsRows(`${width} auto`);
      await expect(page.locator(".dos-prompt")).toHaveText("Apply 370.00 to open invoices? Y/N");
      await hintIsOneLine(autoHint);
    }
  });
});
