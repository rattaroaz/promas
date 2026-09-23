import { expect, test } from "@playwright/test";

test.describe("arrow key navigation", () => {
  test("moves menus, browse rows, and form fields without stealing the caret", async ({
    page,
  }) => {
    await page.goto("/");
    const estimate = page.getByRole("button", { name: /1\.\s*Estimate Process/i });
    const workOrder = page.getByRole("button", { name: /2\.\s*Work Order Process/i });
    await expect(estimate).toHaveClass(/hot/);

    await page.keyboard.press("ArrowDown");
    await expect(workOrder).toHaveClass(/hot/);
    await estimate.hover();
    await expect(workOrder).toHaveClass(/hot/);

    await page.keyboard.press("ArrowLeft");
    await expect(estimate).toHaveClass(/hot/);
    await page.keyboard.press("ArrowRight");
    await expect(workOrder).toHaveClass(/hot/);

    await page.keyboard.press("3");
    const invoiceNo = page.getByLabel("Invoice Number");
    const companyNo = page.getByLabel("Company NO");
    const companyName = page.getByLabel("Company Name");
    const companyPhone = page.getByLabel("Company Phone");
    const status = page.locator(".dos-messagebar");
    await expect(invoiceNo).toBeFocused();
    await expect(status).toContainText("Invoice NO");

    await page.keyboard.press("ArrowDown");
    await expect(companyNo).toBeFocused();
    await expect(status).toContainText("Company NO");

    await page.keyboard.press("ArrowDown");
    await expect(companyName).toBeFocused();
    await expect(status).toContainText("Company Name");

    await page.keyboard.type("AC");
    await page.keyboard.press("ArrowLeft");
    await expect(companyName).toBeFocused();
    await page.keyboard.type("X");
    await expect(companyName).toHaveValue("AXC");

    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowLeft");
    await expect(companyNo).toBeFocused();
    await expect(status).toContainText("Company NO");

    await companyName.click();
    await expect(status).toContainText("Company Name");
    await page.keyboard.press("End");
    await page.keyboard.press("ArrowRight");
    await expect(companyPhone).toBeFocused();
    await expect(status).toContainText("Company Phone");

    await page.keyboard.press("ArrowUp");
    await expect(companyName).toBeFocused();
    await expect(status).toContainText("Company Name");

    await page.keyboard.press("Tab");
    await expect(companyPhone).toBeFocused();
    await expect(status).toContainText("Company Phone");

    await companyNo.click();
    await companyNo.fill("?");
    await companyNo.press("Enter");
    const acme = page.getByRole("button", { name: /1000\s+ACME/i });
    const bayside = page.getByRole("button", { name: /2000\s+BAYSIDE/i });
    await expect(acme).toHaveClass(/selected/);

    await page.keyboard.press("ArrowDown");
    await expect(bayside).toHaveClass(/selected/);
    await acme.hover();
    await expect(bayside).toHaveClass(/selected/);
    await expect(acme).not.toHaveClass(/selected/);

    await page.keyboard.press("ArrowUp");
    await expect(acme).toHaveClass(/selected/);
    await page.keyboard.press("ArrowRight");
    await expect(bayside).toHaveClass(/selected/);
    await page.keyboard.press("ArrowLeft");
    await expect(acme).toHaveClass(/selected/);

    await bayside.click();
    await expect(page.getByText("Co:2000")).toBeVisible();
    await expect(page.getByRole("button", { name: /01\s+Bldg A/i })).toBeVisible();
  });
});
