import { expect, type Page, test } from "@playwright/test";

async function openWorkOrders(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /2\.\s*Work Order Process/i }).click();
  await expect(page.getByText("Search Company", { exact: true })).toBeVisible();

  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();

  const propertyNo = page.getByPlaceholder("? = first");
  await propertyNo.fill("?");
  await propertyNo.press("Enter");
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
}

test.describe("work order process", () => {
  test("lists fixture work order after gate", async ({ page }) => {
    await openWorkOrders(page);
    await expect(
      page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i })
    ).toBeVisible();
  });
});
