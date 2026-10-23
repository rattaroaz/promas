import { expect, type Page, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const outDir = "/tmp/promas_v2162_r1/after";

function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

async function shot(page: Page, name: string) {
  mkdirSync(outDir, { recursive: true });
  await page.screenshot({ path: `${outDir}/${name}.png` });
}

async function measureDates(page: Page, screen: string) {
  return page.evaluate((screenName) => {
    const rootStyle = getComputedStyle(document.documentElement);
    const fit = parseFloat(rootStyle.getPropertyValue("--fit-scale")) || 1;
    const dates = [...document.querySelectorAll("input[type='date']")].map((el) => {
      const input = el as HTMLInputElement;
      const box = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      return {
        label: input.getAttribute("aria-label") || "",
        width: Math.round(box.width * 100) / 100,
        fontSize: style.fontSize,
        icon: style.backgroundImage.includes("svg"),
      };
    });
    return { screen: screenName, fit, dates };
  }, screen);
}

async function backToMain(page: Page) {
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole("button", { name: /5\.\s*Material Process/i }).isVisible()) {
      return;
    }
    await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
  }
}

async function openNewInvoice(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
  const company = page.getByPlaceholder("? = first").first();
  await company.fill("?");
  await company.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
  await page.getByRole("button", { name: /^New Invoice$/i }).click();
  await expect(page.getByLabel("Invoice Number")).toBeVisible();
}

test.describe("promas 2.16.2", () => {
  test("date boxes, invoice alignment, and four blank descriptions", async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(10_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    const report: Awaited<ReturnType<typeof measureDates>>[] = [];

    await openNewInvoice(page);
    const descriptions = page.getByPlaceholder("Type description");
    await expect(descriptions).toHaveCount(4);
    for (const field of await descriptions.all()) {
      await expect(field).toHaveValue("");
    }
    const terms = page.locator(".invoice-terms-order input.dos-input.w15");
    const order = page.getByLabel("Order Date");
    const termsBox = await terms.boundingBox();
    const orderBox = await order.boundingBox();
    expect(termsBox).toBeTruthy();
    expect(orderBox).toBeTruthy();
    expect(Math.abs(termsBox!.x - orderBox!.x)).toBeLessThanOrEqual(1);

    const invoiceDate = page.getByLabel("Invoice Date");
    const blurred = await invoiceDate.evaluate((el) => getComputedStyle(el).fontSize);
    await invoiceDate.focus();
    const focused = await invoiceDate.evaluate((el) => getComputedStyle(el).fontSize);
    expect(focused).toBe(blurred);
    const before = await invoiceDate.inputValue();
    const box = await invoiceDate.boundingBox();
    await invoiceDate.click({ position: { x: box!.width - 8, y: box!.height / 2 } });
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(invoiceDate).toHaveValue(plusDays(before, 7));
    report.push(await measureDates(page, "invoice-new"));
    await shot(page, "invoice-new");

    const openers: { name: string; open: () => Promise<void> }[] = [
      {
        name: "estimate-edit",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /1\.\s*Estimate Process/i }).click();
          const company = page.getByRole("textbox", { name: "Company NO" });
          await company.fill("?");
          await company.press("Enter");
          await page.getByRole("button", { name: /1000\s+ACME/i }).click();
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /EST-1/i }).click();
          await expect(page.locator(".dlg-title")).toContainText("Proposal");
        },
      },
      {
        name: "workorder-edit",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /2\.\s*Work Order Process/i }).click();
          const company = page.getByRole("textbox", { name: "Company NO" });
          await company.fill("?");
          await company.press("Enter");
          await page.getByRole("button", { name: /1000\s+ACME/i }).click();
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
          await expect(page.locator("input[type='date']").first()).toBeVisible();
        },
      },
      {
        name: "cash-payment",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /4\.\s*Cash Receipts Process/i }).click();
          const company = page.getByPlaceholder("? = first").first();
          await company.fill("?");
          await company.press("Enter");
          await page.getByRole("button", { name: /1000\s+ACME/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByLabel("Amount Paid")).toBeVisible();
        },
      },
      {
        name: "material-edit",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
          await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
        },
      },
      {
        name: "wages",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
          await page.getByRole("button", { name: /5\.\s*Worker Wages/i }).click();
          await expect(page.getByText(/Worker Wages/i).first()).toBeVisible();
        },
      },
      {
        name: "payroll",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /6\.\s*Reports Menu/i }).click();
          await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
          await expect(page.getByLabel("Work person search")).toBeVisible();
        },
      },
      {
        name: "system-date",
        open: async () => {
          await page.goto("/");
          await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
          await page.getByRole("button", { name: /1\.\s*Change System Date/i }).click();
          await expect(page.locator("input[type='date']").first()).toBeVisible();
        },
      },
    ];

    for (const opener of openers) {
      await opener.open();
      const measured = await measureDates(page, opener.name);
      expect(measured.dates.length, opener.name).toBeGreaterThan(0);
      report.push(measured);
      await shot(page, opener.name);
    }

    const norms: number[] = [];
    for (const row of report) {
      const widths = row.dates.map((d) => d.width);
      const spread = Math.max(...widths) - Math.min(...widths);
      expect(spread, `${row.screen} date widths ${widths.join(",")}`).toBeLessThanOrEqual(1);
      for (const date of row.dates) {
        expect(date.icon, date.label).toBe(true);
        norms.push(date.width / row.fit);
      }
    }
    const normSpread = Math.max(...norms) - Math.min(...norms);
    expect(normSpread, `design widths ${norms.map((n) => n.toFixed(1)).join(",")}`).toBeLessThanOrEqual(2);

    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      `${outDir}/dates.json`,
      JSON.stringify(
        {
          termsLeft: termsBox!.x,
          orderLeft: orderBox!.x,
          screens: report,
        },
        null,
        2
      )
    );
  });

  test("workers catalog is larger, labeled, scrolling, and keeps numeric IDs", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByLabel("Worker name 1")).toHaveValue("Jose Ramirez");
    await expect(page.getByLabel("Worker number 1")).toHaveValue("400");
    await expect(page.locator(".workers-head")).toHaveText("Active?Work PersonID number");
    await expect(page.getByRole("button", { name: "Add Work Person" })).toBeVisible();
    await expect(page.locator(".dos-messagebar")).toContainText(
      "Active workers appear on new invoices. Deleting one leaves past invoices unchanged."
    );

    const font = await page.getByLabel("Worker name 1").evaluate((el) => {
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const size = parseFloat(getComputedStyle(el).fontSize);
      return { root, size };
    });
    expect(font.size).toBeCloseTo(font.root * 1.5, 1);
    await page.getByLabel("Worker name 1").focus();
    const focused = await page.getByLabel("Worker name 1").evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize)
    );
    expect(focused).toBeCloseTo(font.size, 1);

    const scroll = page.locator(".workers-scroll");
    await expect(scroll).toHaveCSS("overflow-y", "scroll");
    await shot(page, "workers");
    for (let i = 0; i < 8; i++) {
      await page.getByRole("button", { name: "Add Work Person" }).click();
    }
    const canScroll = await scroll.evaluate((el) => el.scrollHeight > el.clientHeight + 1);
    expect(canScroll).toBe(true);
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByRole("button", { name: "Add Work Person" })).toBeVisible();
    await shot(page, "workers-scrolled");
    writeFileSync(
      `${outDir}/workers.json`,
      JSON.stringify({ fontBeforePx: 39.04, fontAfterPx: font.size, rootPx: font.root }, null, 2)
    );
  });

  test("material and payroll worker fields list active workers only", async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await page.getByRole("button", { name: "Add Work Person" }).click();
    const ian = page.getByLabel("Worker name 2");
    await ian.fill("Inactive Ian");
    await ian.press("Tab");
    await page.getByRole("checkbox", { name: "Active Inactive Ian" }).uncheck();
    await expect(
      page.getByRole("checkbox", { name: "Active Inactive Ian" })
    ).not.toBeChecked();
    await page.locator(".workers-list").evaluate(
      () => new Promise((resolve) => setTimeout(resolve, 150))
    );

    await backToMain(page);
    await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
    await page.getByRole("button", { name: /2\.\s*Material Transaction in Worker Name/i }).click();
    await expect(page.getByText("From Worker Name :")).toBeVisible();
    const material = page.getByLabel("From Worker Name");
    await expect(material).toHaveJSProperty("tagName", "SELECT");
    await expect(material.locator("option")).toHaveText(["All", "Jose Ramirez"]);
    const materialFont = await material.evaluate((el) => getComputedStyle(el).fontSize);
    await material.focus();
    expect(await material.evaluate((el) => getComputedStyle(el).fontSize)).toBe(materialFont);
    await material.selectOption("Jose Ramirez");
    await expect(page.getByRole("button", { name: /Jose drop cloths/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Ian tape/i })).toHaveCount(0);
    await shot(page, "material-jose");
    await material.selectOption("");
    await expect(page.getByRole("button", { name: /Ian tape/i })).toBeVisible();
    await shot(page, "material-worker");

    await backToMain(page);
    await page.getByRole("button", { name: /6\.\s*Reports Menu/i }).click();
    await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
    const payroll = page.getByLabel("Work person search");
    await expect(payroll).toHaveJSProperty("tagName", "SELECT");
    await expect(payroll.locator("option")).toHaveText(["All", "Jose Ramirez"]);
    const payrollFont = await payroll.evaluate((el) => getComputedStyle(el).fontSize);
    await payroll.focus();
    expect(await payroll.evaluate((el) => getComputedStyle(el).fontSize)).toBe(payrollFont);
    await page.keyboard.press("ArrowDown");
    await expect(payroll).toHaveValue("Jose Ramirez");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByLabel("From invoice date")).toBeFocused();
    await page.getByRole("button", { name: /^Run$/i }).click();
    await expect(page.getByText("Jose hallway payroll")).toBeVisible();
    await expect(page.getByText("Ana closet payroll")).toHaveCount(0);
    await shot(page, "payroll-jose");
    await payroll.selectOption("");
    await page.getByRole("button", { name: /^Run$/i }).click();
    await expect(page.getByText("Jose hallway payroll")).toBeVisible();
    await expect(page.getByText("Ana closet payroll")).toBeVisible();
    const dates = await measureDates(page, "payroll-results");
    const widths = dates.dates.map((d) => d.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    await shot(page, "payroll-report");
    writeFileSync(`${outDir}/payroll.json`, JSON.stringify(dates, null, 2));
  });
});
