import { expect, test } from "@playwright/test";

test.describe("update application", () => {
  test("Settings → Update Application shows up to date dialog", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /8\.\s*Settings/i }).click();
    await page.getByRole("button", { name: /Update Application/i }).click();
    await expect(page.getByText("Up to Date", { exact: true })).toBeVisible();
    await expect(page.getByText(/is up to date/i)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByText("Up to Date", { exact: true })).toHaveCount(0);
  });
});
