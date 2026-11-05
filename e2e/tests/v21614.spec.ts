import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openMain, openNewInvoice, propertyList, waitForFit } from "../support/app";
import { PAINT_SUPPLY_COMPANIES, UNIT_SIZES } from "../../src/lib/catalogSeeds";

const PROOF = process.env.PROOF_DIR;

const viewports = [
  { width: 1024, height: 768, tag: "1024x768" },
  { width: 1280, height: 800, tag: "1280x800" },
  { width: 1400, height: 900, tag: "1400x900" },
] as const;

function expectedRoot(width: number, height: number, fit: number) {
  void width;
  void height;
  return 22 * fit;
}

async function proof(page: Page, name: string) {
  if (!PROOF) return;
  fs.mkdirSync(PROOF, { recursive: true });
  await page.screenshot({ path: path.join(PROOF, `${name}.png`), fullPage: true });
}

async function measure(page: Page, screen: string) {
  return page.evaluate((screenName) => {
    const root = getComputedStyle(document.documentElement);
    const fit = parseFloat(root.getPropertyValue("--fit-scale")) || 1;
    const dates = [...document.querySelectorAll("input[type='date']")].map((el) => {
      const input = el as HTMLInputElement;
      return {
        label: input.getAttribute("aria-label") || "",
        width: Math.round(input.getBoundingClientRect().width * 100) / 100,
      };
    });
    return { screen: screenName, fit, font: parseFloat(root.fontSize), dates };
  }, screen);
}

async function showSelectOptions(page: Page, label: string) {
  await page.evaluate((name) => {
    const el = document.querySelector(`[aria-label="${name}"]`) as HTMLSelectElement | null;
    if (el) el.size = Math.min(el.options.length, 12);
  }, label);
}

test("checklist screens: token search, invoice bar, catalogs, worker id", async ({ page }) => {
  test.setTimeout(240_000);
  const measured: Awaited<ReturnType<typeof measure>>[] = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = viewport.tag;

    await openMain(page, /3\.\s*Invoice Process/i);
    const street = page.getByRole("textbox", { name: "Property Street" });
    await street.click();
    await street.fill("11334 Canyon");
    await street.press("Enter");
    await expect(page.getByText("11334 W. Secco Canyon Hwy")).toBeVisible();
    await expect(page.locator(".dos-messagebar")).toHaveCount(0);
    await waitForFit(page);
    await proof(page, `${tag}-search-11334-canyon`);

    await openMain(page, /3\.\s*Invoice Process/i);
    const again = page.getByRole("textbox", { name: "Property Street" });
    await again.click();
    await again.fill("11334 Secco");
    await again.press("Enter");
    await expect(page.getByText("11334 W. Secco Canyon Hwy")).toBeVisible();
    await expect(page.getByText(/invoices\s+Ins=Add/i)).toHaveCount(0);
    await waitForFit(page);
    await proof(page, `${tag}-search-11334-secco`);

    await openMain(page, /3\.\s*Invoice Process/i);
    const cross = page.getByRole("textbox", { name: "Property Street" });
    await cross.click();
    await cross.fill("Secco Main");
    await cross.press("Enter");
    await expect(page.getByText(/property does not exist/i)).toBeVisible();
    await expect(page.getByText("11334 W. Secco Canyon Hwy")).toHaveCount(0);

    await propertyList(page, /3\.\s*Invoice Process/i);
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await expect(page.getByRole("button", { name: "New Invoice" })).toBeVisible();
    await expect(page.getByText(/1 invoices/i)).toHaveCount(0);
    await expect(page.locator(".dos-messagebar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ins Add$/i })).toBeVisible();
    await waitForFit(page);
    const invoiceList = await measure(page, `${tag} invoice-list`);
    measured.push(invoiceList);
    expect(invoiceList.fit, tag).toBe(1);
    expect(invoiceList.font, tag).toBeCloseTo(expectedRoot(viewport.width, viewport.height, 1), 0);
    await proof(page, `${tag}-invoice-list-no-hint-bar`);

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /7\.\s*Unit Size/i }).click();
    for (const size of UNIT_SIZES) {
      await expect(page.getByText(size, { exact: true })).toBeVisible();
    }
    await waitForFit(page);
    const unitSize = await measure(page, `${tag} unit-size`);
    measured.push(unitSize);
    expect(unitSize.fit, tag).toBe(1);
    expect(unitSize.font, tag).toBeCloseTo(expectedRoot(viewport.width, viewport.height, 1), 0);
    const catalogRows = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".catalog-name")] as HTMLElement[];
      const deletes = [...document.querySelectorAll(".catalog-row .dos-btn")] as HTMLElement[];
      return {
        lines: names.map((name) => name.scrollHeight / parseFloat(getComputedStyle(name).lineHeight)),
        widths: deletes.map((button) => Math.round(button.getBoundingClientRect().width * 100) / 100),
      };
    });
    expect(Math.max(...catalogRows.lines), tag).toBeLessThanOrEqual(1.05);
    expect(Math.max(...catalogRows.widths) - Math.min(...catalogRows.widths), tag).toBeLessThanOrEqual(1);
    await proof(page, `${tag}-unit-size-list`);
    await page.getByLabel("Add Unit Size").fill("Single");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Already in the list.")).toBeVisible();
    await page.getByLabel("Add Unit Size").fill("Studio");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Studio", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete Single" }).click();
    await page.getByRole("button", { name: "Y", exact: true }).click();
    await expect(page.getByText("Single", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
    await page.getByRole("button", { name: /8\.\s*Paint Supply Company/i }).click();
    for (const name of PAINT_SUPPLY_COMPANIES) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
    await waitForFit(page);
    await proof(page, `${tag}-paint-supply-list`);
    await page.getByLabel("Add Paint Supply Company").fill("Kelly-Moore");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Kelly-Moore", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Delete Vista" }).click();
    await page.getByRole("button", { name: "Y", exact: true }).click();
    await expect(page.getByText("Vista", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
    await page.getByRole("button", { name: /6\.\s*Job Descriptions/i }).click();
    const sizeBox = page.getByRole("combobox", { name: "Size 1", exact: true });
    await expect(sizeBox).toBeVisible();
    await expect(sizeBox.locator("option")).toHaveText([
      ...UNIT_SIZES.filter((size) => size !== "Single"),
      "Studio",
    ]);
    await showSelectOptions(page, "Size 1");
    await waitForFit(page);
    await proof(page, `${tag}-job-size-dropdown`);

    await openNewInvoice(page, { keepData: true });
    const paint = page.getByRole("combobox", { name: "Paint Supply Co. list" });
    await expect(paint).toBeVisible();
    const paintOptions = await paint.locator("option").allTextContents();
    for (const name of ["Shilpark", "Dunn Edwards", "Sherman Williams", "Home Depot", "Lowes"]) {
      expect(paintOptions).toContain(name);
    }
    expect(paintOptions).not.toContain("Vista");
    await showSelectOptions(page, "Paint Supply Co. list");
    await waitForFit(page);
    const invoiceForm = await measure(page, `${tag} invoice-form`);
    measured.push(invoiceForm);
    expect(invoiceForm.fit, tag).toBe(1);
    expect(invoiceForm.font, tag).toBeCloseTo(expectedRoot(viewport.width, viewport.height, 1), 0);
    const formWidths = invoiceForm.dates.map((date) => date.width);
    expect(Math.max(...formWidths) - Math.min(...formWidths), tag).toBeLessThanOrEqual(1);
    await proof(page, `${tag}-paint-supply-dropdown`);

    await propertyList(page, /2\.\s*Work Order Process/i);
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
    await expect(page.locator("input[type='date']").first()).toBeVisible();
    await waitForFit(page);
    const workOrder = await measure(page, `${tag} work-order`);
    measured.push(workOrder);
    expect(workOrder.fit, tag).toBe(1);
    expect(workOrder.font, tag).toBeCloseTo(expectedRoot(viewport.width, viewport.height, 1), 0);
    const orderWidths = workOrder.dates.map((date) => date.width);
    expect(Math.max(...orderWidths) - Math.min(...orderWidths), tag).toBeLessThanOrEqual(1);
    const sameViewport = measured.filter((row) => row.screen.startsWith(tag) && row.dates.length > 0);
    const allDates = sameViewport.flatMap((row) => row.dates.map((date) => date.width));
    expect(Math.max(...allDates) - Math.min(...allDates), `${tag} date widths`).toBeLessThanOrEqual(2);
    await proof(page, `${tag}-work-order-edit`);

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await page.getByRole("button", { name: "Ins Add" }).click();
    await page.getByLabel("Name").fill("Ana Cruz");
    await expect(page.getByText("ID number is required")).toBeVisible();
    await page.getByRole("button", { name: /^Ctrl-S Save$/i }).click();
    await expect(page.getByLabel("Name")).toHaveValue("Ana Cruz");
    await expect(page.getByText("ID number is required")).toBeVisible();
    await waitForFit(page);
    await proof(page, `${tag}-worker-id-required`);
  }

  if (PROOF) {
    fs.mkdirSync(PROOF, { recursive: true });
    fs.writeFileSync(path.join(PROOF, "metrics.json"), JSON.stringify(measured, null, 2));
  }
});
