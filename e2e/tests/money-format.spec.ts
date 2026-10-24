import { expect, test } from "@playwright/test";
import { openNewInvoice } from "../support/app";

test.describe("money inputs", () => {
  test("formats invoice price and material cost on blur and Enter", async ({
    page,
  }) => {
    await openNewInvoice(page);
    const price = page.getByLabel("Price 1");
    await price.click();
    await price.fill("100");
    await expect(price).toHaveValue("100");
    await price.press("Tab");
    await expect(price).toHaveValue("100.00");

    const cost = page.getByLabel("Material Costs");
    await cost.click();
    await cost.fill("432");
    await expect(cost).toHaveValue("432");
    await cost.press("Enter");
    await expect(cost).toHaveValue("432.00");

    await cost.fill("");
    await cost.press("Tab");
    await expect(cost).toHaveValue("");
  });

  test("shows an existing work-order price with cents and formats a new one", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /2\.\s*Work Order Process/i }).click();
    const companyNo = page.getByPlaceholder("? = first").first();
    await companyNo.fill("?");
    await companyNo.press("Enter");
    await page.getByRole("button", { name: /1000\s+ACME/i }).click();
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
    const price = page.getByLabel("Price 1");
    await expect(price).toHaveValue("100.00");
    await price.fill("432");
    await price.press("Tab");
    await expect(price).toHaveValue("432.00");
  });

  test("formats a material amount on blur", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
    await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
    await page.getByRole("button", { name: /^Ins Add$/i }).click();
    const amount = page.getByLabel("Amount");
    await amount.fill("100");
    await amount.press("Tab");
    await expect(amount).toHaveValue("100.00");
  });

  test("placeholder matches the typed description yellow", async ({ page }) => {
    await openNewInvoice(page);
    const desc = page.getByLabel("Line 1 custom text");
    const placeholder = await desc.evaluate((el) => {
      const cs = getComputedStyle(el, "::placeholder");
      return { color: cs.color, opacity: cs.opacity };
    });
    await desc.fill("Hallway touch up");
    await page.getByLabel("Invoice Date").click();
    const typed = await desc.evaluate((el) => getComputedStyle(el).color);
    expect(placeholder.opacity).toBe("1");
    expect(placeholder.color).toBe(typed);
    expect(placeholder.color).toBe("rgb(255, 255, 85)");
  });
});
