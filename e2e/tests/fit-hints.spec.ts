import { expect, test, type Page } from "@playwright/test";

/**
 * Every screen must fit the window, and every status line and key hint must
 * be fully visible. The fit scale is a fixed value per screen, taken from
 * static content. A clipped status line must not be what makes the type fit,
 * and it must not be cut off either.
 *
 * Widths are 1280 and 1024. Height 800 is the size where the Workers message
 * at scale 1 is 1991px in a 1280px bar.
 */

async function waitSettled(page: Page) {
  let last = "";
  let since = Date.now();
  const start = Date.now();
  while (Date.now() - start < 2500) {
    const now = await page.evaluate(() => {
      const root = document.documentElement;
      return `${getComputedStyle(root).fontSize}|${root.style.getPropertyValue("--fit-scale")}`;
    });
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= 500) return;
    await page.waitForTimeout(40);
  }
}

async function clipReport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const vw = window.innerWidth;
    const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const rangeBox = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const bars = document.querySelectorAll(".dos-messagebar, .dos-statusbar, .dlg-foot");
    for (const bar of bars) {
      if (bar.closest(".print-preview-overlay")) continue;
      const box = bar.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const text = rangeBox(bar);
      const clipped =
        bar.scrollWidth > bar.clientWidth + 1 ||
        text.right > box.right + 1 ||
        text.left < box.left - 1 ||
        text.right > vw + 1 ||
        box.right > vw + 1;
      if (clipped) {
        issues.push(
          `hint bar clipped "${textOf(bar).slice(0, 100)}" scroll ${Math.round(bar.scrollWidth)} client ${Math.round(bar.clientWidth)} textRight ${Math.round(text.right)} barRight ${Math.round(box.right)}`
        );
      }
      if (bar.classList.contains("dos-statusbar")) {
        for (const key of bar.querySelectorAll("button")) {
          const keyBox = key.getBoundingClientRect();
          if (keyBox.width < 2 || keyBox.height < 2) continue;
          const keyText = rangeBox(key);
          if (
            key.scrollWidth > key.clientWidth + 1 ||
            keyText.right > box.right + 1 ||
            keyText.left < box.left - 1 ||
            keyBox.right > vw + 1 ||
            keyBox.left < -1
          ) {
            issues.push(
              `key hint clipped "${textOf(key)}" right ${Math.round(keyBox.right)}`
            );
          }
        }
      }
    }

    const rows = document.querySelectorAll(
      ".browse-grid-header, .dos-row, .workers-head > div, .workers-row > *, .dos-browse-header, .aging-grid"
    );
    for (const el of rows) {
      if (el.closest(".print-preview-overlay")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      if (box.right > vw + 1 || box.left < -1) {
        issues.push(
          `table overflows viewport "${textOf(el).slice(0, 70)}" right ${Math.round(box.right)} left ${Math.round(box.left)} vw ${vw}`
        );
      }
    }

    for (const cell of document.querySelectorAll(".browse-grid-header > div, .workers-head > div")) {
      if (cell.closest(".print-preview-overlay")) continue;
      if (cell.scrollWidth > cell.clientWidth + 1) {
        issues.push(
          `header text clipped "${textOf(cell)}" scroll ${Math.round(cell.scrollWidth)} client ${Math.round(cell.clientWidth)}`
        );
      }
    }
    return issues;
  });
}

async function home(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /3\.\s*Invoice Process/i })).toBeVisible();
}

async function openMain(page: Page, item: RegExp) {
  await home(page);
  await page.getByRole("button", { name: item }).click();
}

async function companyList(page: Page, item: RegExp) {
  await openMain(page, item);
  const companyNo = page.getByRole("textbox", { name: "Company NO" });
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await expect(page.getByRole("button", { name: /1000\s+ACME/i })).toBeVisible();
}

async function propertyList(page: Page, item: RegExp) {
  await companyList(page, item);
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();
  await expect(page.getByRole("button", { name: /01\s+Bldg A/i })).toBeVisible();
}

test("status lines, key hints, and tables fit at 1280 and 1024", async ({ page }) => {
  test.setTimeout(720_000);
  page.setDefaultTimeout(8_000);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  page.on("dialog", (dialog) => {
    void dialog.dismiss();
  });

  const screens: { name: string; open: () => Promise<void> }[] = [
    { name: "Main menu", open: () => home(page) },
    { name: "Estimate gate", open: () => openMain(page, /1\.\s*Estimate Process/i) },
    { name: "Estimate properties", open: () => propertyList(page, /1\.\s*Estimate Process/i) },
    {
      name: "Estimate list",
      open: async () => {
        await propertyList(page, /1\.\s*Estimate Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await expect(page.getByText(/1 proposals/i)).toBeVisible();
      },
    },
    {
      name: "Estimate edit",
      open: async () => {
        await propertyList(page, /1\.\s*Estimate Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await page.getByRole("button", { name: /EST-1/i }).click();
        await expect(page.locator(".dlg-title")).toContainText("Proposal");
      },
    },
    { name: "Work order gate", open: () => openMain(page, /2\.\s*Work Order Process/i) },
    { name: "Work order properties", open: () => propertyList(page, /2\.\s*Work Order Process/i) },
    {
      name: "Work order list",
      open: async () => {
        await propertyList(page, /2\.\s*Work Order Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await expect(page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i })).toBeVisible();
      },
    },
    {
      name: "Work order edit",
      open: async () => {
        await propertyList(page, /2\.\s*Work Order Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
        await expect(page.locator(".dlg-title")).toBeVisible();
      },
    },
    { name: "Invoice gate", open: () => openMain(page, /3\.\s*Invoice Process/i) },
    { name: "Invoice companies", open: () => companyList(page, /3\.\s*Invoice Process/i) },
    { name: "Invoice properties", open: () => propertyList(page, /3\.\s*Invoice Process/i) },
    {
      name: "Property edit",
      open: async () => {
        await propertyList(page, /3\.\s*Invoice Process/i);
        await page.getByRole("button", { name: "Ctrl-Home" }).click();
        await expect(page.getByRole("textbox", { name: "Property NO" })).toBeVisible();
      },
    },
    {
      name: "Invoice list",
      open: async () => {
        await propertyList(page, /3\.\s*Invoice Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await expect(page.getByText(/1 invoices/i)).toBeVisible();
      },
    },
    {
      name: "Invoice edit",
      open: async () => {
        await propertyList(page, /3\.\s*Invoice Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await page.getByRole("button", { name: /^Ins Add$/i }).click();
        await expect(page.getByLabel("Invoice Number")).toBeVisible();
      },
    },
    { name: "Cash gate", open: () => openMain(page, /4\.\s*Cash Receipts Process/i) },
    {
      name: "Cash ledger",
      open: async () => {
        await companyList(page, /4\.\s*Cash Receipts Process/i);
        await page.getByRole("button", { name: /1000\s+ACME/i }).click();
        await expect(page.getByText(/Unpaid Total|Open/i).first()).toBeVisible();
      },
    },
    {
      name: "Cash payment",
      open: async () => {
        await companyList(page, /4\.\s*Cash Receipts Process/i);
        await page.getByRole("button", { name: /1000\s+ACME/i }).click();
        await page.getByRole("button", { name: /^Ins Add$/i }).click();
        await expect(page.getByLabel(/Amount Paid/i).first()).toBeVisible();
      },
    },
    { name: "Material menu", open: () => openMain(page, /5\.\s*Material Process/i) },
    {
      name: "Material transactions",
      open: async () => {
        await openMain(page, /5\.\s*Material Process/i);
        await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
        await expect(page.locator(".dos-searchline input")).toBeVisible();
      },
    },
    {
      name: "Material edit",
      open: async () => {
        await openMain(page, /5\.\s*Material Process/i);
        await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
        await page.getByRole("button", { name: /^Ins Add$/i }).click();
        await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
      },
    },
    {
      name: "Worker wages",
      open: async () => {
        await openMain(page, /5\.\s*Material Process/i);
        await page.getByRole("button", { name: /5\.\s*Worker Wages/i }).click();
        await expect(page.getByText(/Worker Wages/i).first()).toBeVisible();
      },
    },
    { name: "Reports menu", open: () => openMain(page, /6\.\s*Reports Menu/i) },
  ];

  const reports = [
    "Payroll Report",
    "Customer File",
    "Invoice Register",
    "Cash Receipts Register",
    "Open Receivables Aging",
    "Sales Analysis",
    "Check Missing Invoice",
    "Mailing Labels",
    "Paint Usage Report",
  ];
  for (const label of reports) {
    screens.push({
      name: `Report ${label}`,
      open: async () => {
        await openMain(page, /6\.\s*Reports Menu/i);
        await page.getByRole("button", { name: new RegExp(label, "i") }).click();
        await expect(page.getByRole("button", { name: /1\.\s*Payroll Report/i })).toHaveCount(0);
      },
    });
  }

  screens.push(
    { name: "Miscellaneous", open: () => openMain(page, /7\.\s*Miscellaneous/i) },
    {
      name: "Change system date",
      open: async () => {
        await openMain(page, /7\.\s*Miscellaneous/i);
        await page.getByRole("button", { name: /1\.\s*Change System Date/i }).click();
        await expect(page.locator("input").first()).toBeVisible();
      },
    },
    {
      name: "Form management",
      open: async () => {
        await openMain(page, /7\.\s*Miscellaneous/i);
        await page.getByRole("button", { name: /3\.\s*Form Management/i }).click();
        await expect(page.getByText(/Form/i).first()).toBeVisible();
      },
    },
    {
      name: "Workers",
      open: async () => {
        await openMain(page, /7\.\s*Miscellaneous/i);
        await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
        await expect(page.getByRole("button", { name: /Add Work Person/i })).toBeVisible();
      },
    },
    { name: "Settings", open: () => openMain(page, /8\.\s*Settings/i) },
    {
      name: "Diagnostics",
      open: async () => {
        await openMain(page, /8\.\s*Settings/i);
        await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
        await expect(page.getByText(/Diagnostic/i).first()).toBeVisible();
      },
    }
  );

  const failures: string[] = [];
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    for (const screen of screens) {
      await screen.open();
      await waitSettled(page);
      const issues = await clipReport(page);
      for (const issue of issues) failures.push(`${width} ${screen.name}: ${issue}`);
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
