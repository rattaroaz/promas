import { expect, test } from "@playwright/test";

test.describe("diagnostics", () => {
  test("Settings → Diagnostics shows observability bundle", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /8\.\s*Settings/i }).click();
    await page.getByRole("button", { name: /Diagnostics/i }).click();
    await expect(page.getByText(/Metrics · Traces · Logs · State/i)).toBeVisible();
    await expect(page.getByText(/Diagnostics/i).first()).toBeVisible();
    await expect(page.getByText(/recent logs/i)).toBeVisible();
  });
});
