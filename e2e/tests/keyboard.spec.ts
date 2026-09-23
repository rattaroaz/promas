import { expect, test } from "@playwright/test";

test.describe("arrow key navigation", () => {
  test("moves the main menu, a company browse list, and form fields", async ({
    page,
  }) => {
    await page.goto("/");
    const estimate = page.getByRole("button", { name: /1\.\s*Estimate Process/i });
    const workOrder = page.getByRole("button", { name: /2\.\s*Work Order Process/i });
    await expect(estimate).toHaveClass(/hot/);

    await page.keyboard.press("ArrowDown");
    await expect(workOrder).toHaveClass(/hot/);
    await expect(estimate).not.toHaveClass(/hot/);

    await page.keyboard.press("ArrowLeft");
    await expect(estimate).toHaveClass(/hot/);

    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Company NO")).toBeVisible();

    await page.getByLabel("Company NO").fill("?");
    await page.getByLabel("Company NO").press("Enter");
    const acme = page.getByRole("button", { name: /1000\s+ACME/i });
    const bayside = page.getByRole("button", { name: /2000\s+BAYSIDE/i });
    await expect(acme).toHaveClass(/selected/);
    await page.keyboard.press("ArrowDown");
    await expect(bayside).toHaveClass(/selected/);
    await expect(acme).not.toHaveClass(/selected/);
    await page.keyboard.press("ArrowUp");
    await expect(acme).toHaveClass(/selected/);

    await page.goto("/");
    await expect(page.getByRole("button", { name: /5\.\s*Material Process/i })).toBeVisible();
    await page.keyboard.press("5");
    await expect(page.getByRole("button", { name: /5\.\s*Worker Wages/i })).toBeVisible();
    await page.keyboard.press("5");

    const fields = page.locator(".dos-searchline input");
    await expect(fields.nth(0)).toBeFocused();
    await page.keyboard.type("42");
    await expect(fields.nth(0)).toHaveValue("42");

    await page.keyboard.press("ArrowLeft");
    await expect(fields.nth(0)).toBeFocused();
    await expect(fields.nth(0)).toHaveValue("42");

    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(fields.nth(1)).toBeFocused();

    await page.keyboard.press("ArrowUp");
    await expect(fields.nth(0)).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(fields.nth(1)).toBeFocused();
    await fields.nth(2).click();
    await expect(fields.nth(2)).toBeFocused();
  });
});
