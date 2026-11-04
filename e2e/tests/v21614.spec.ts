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

async function proof(page: Page, name: string) {
  if (!PROOF) return;
  fs.mkdirSync(PROOF, { recursive: true });
  await page.screenshot({ path: path.join(PROOF, `${name}.png`), fullPage: true });
}

async function showSelectOptions(page: Page, label: string) {
  await page.evaluate((name) => {
    const el = document.querySelector(`[aria-label="${name}"]`) as HTMLSelectElement | null;
    if (el) el.size = Math.min(el.options.length, 12);
  }, label);
}

test("checklist screens: token search, invoice bar, catalogs, worker id", async ({ page }) => {
  test.setTimeout(180_000);

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

    await propertyList(page, /3\.\s*Invoice Process/i);
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await expect(page.getByRole("button", { name: "New Invoice" })).toBeVisible();
    await expect(page.getByText(/1 invoices/i)).toHaveCount(0);
    await expect(page.locator(".dos-messagebar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ins Add$/i })).toBeVisible();
    await waitForFit(page);
    await proof(page, `${tag}-invoice-list-no-hint-bar`);

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /7\.\s*Unit Size/i }).click();
    for (const size of UNIT_SIZES) {
      await expect(page.getByText(size, { exact: true })).toBeVisible();
    }
    await waitForFit(page);
    await proof(page, `${tag}-unit-size-list`);
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
    await proof(page, `${tag}-paint-supply-dropdown`);

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
});
