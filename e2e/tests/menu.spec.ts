import { expect, test } from "@playwright/test";

test.describe("main menu", () => {
  test("shows Settings as option 8", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Property Management System").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /8\.\s*Settings/i })).toBeVisible();
  });

  test("opens Settings submenu", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /8\.\s*Settings/i }).click();
    await expect(page.getByText("Update Application")).toBeVisible();
    await expect(page.getByText("Export Database")).toBeVisible();
    await expect(page.getByText("Import Database")).toBeVisible();
  });
});
