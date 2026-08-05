import { expect, test } from "@playwright/test";

test.describe("invoice process", () => {
  test("opens Invoice Process and shows fixture list row", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
    await expect(page.getByText("Invoice Process").first()).toBeVisible();
    await expect(page.getByText(/1 invoices/i)).toBeVisible();
    // Row shows invoice #, company, unit, amounts from e2e mock
    await expect(page.getByRole("button", { name: /1000/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /A1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /250\.00/ })).toBeVisible();
  });
});
