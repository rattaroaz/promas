import { expect, type Page, test } from "@playwright/test";
import { backToMain, INVOICE_PROCESS, openMain, openNewInvoice, propertyList } from "../support/app";

async function openWorkers(page: Page) {
  await openMain(page, /7\.\s*Miscellaneous/i);
  await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
  await expect(page.getByRole("button", { name: "Add Work Person" })).toBeVisible();
}

test.describe("workers", () => {
  test("adds, edits, deactivates, and deletes without changing an old invoice", async ({
    page,
  }) => {
    await openWorkers(page);
    await expect(page.getByLabel("Worker name 1")).toHaveValue("Jose Ramirez");
    await expect(page.getByLabel("Worker number 1")).toHaveValue("400");
    await expect(page.getByRole("checkbox", { name: "Active Jose Ramirez" })).toBeChecked();
    await expect(page.locator(".workers-head")).toHaveText("Active?Work PersonID number");

    await page.getByRole("button", { name: "Add Work Person" }).click();
    await page.getByLabel("Worker name 2").fill("Ana Cruz");
    await page.getByLabel("Worker number 2").fill("15");
    await page.getByLabel("Worker number 2").press("Tab");
    await expect(page.getByLabel("Worker name 2")).toHaveValue("Ana Cruz");

    await page.getByLabel("Worker name 2").fill("Ana C. Cruz");
    await page.getByLabel("Worker number 2").fill("16");
    await page.getByLabel("Worker number 2").press("Tab");
    await expect(page.getByRole("checkbox", { name: "Active Ana C. Cruz" })).toBeChecked();

    await page.getByRole("button", { name: "Add Work Person" }).click();
    const ianName = page.getByLabel("Worker name 3");
    await ianName.fill("Inactive Ian");
    await ianName.press("Tab");
    await page.getByRole("checkbox", { name: "Active Inactive Ian" }).uncheck();
    await expect(
      page.getByRole("checkbox", { name: "Active Inactive Ian" })
    ).not.toBeChecked();

    await openNewInvoice(page, { keepData: true });
    const options = page.getByLabel("Work Person list").locator("option");
    await expect(options).toHaveText([" ", "Ana C. Cruz", "Jose Ramirez"]);
    const person = page.getByRole("textbox", { name: "Work Person" });
    await person.fill("Custom Pat");
    await person.press("Tab");
    await expect(options).toHaveText([" ", "Ana C. Cruz", "Jose Ramirez"]);
    await expect(person).toHaveValue("Custom Pat");

    await backToMain(page);
    await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    const deleteJose = page.getByRole("button", { name: "Delete Jose Ramirez" });
    const sure = page.getByRole("dialog", { name: "Are you sure? Y/N" });
    await deleteJose.click();
    await expect(sure).toBeVisible();
    await page.keyboard.press("x");
    await expect(sure).toBeVisible();
    await page.keyboard.press("n");
    await expect(sure).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Delete Jose Ramirez" })).toBeVisible();
    await deleteJose.click();
    await page.keyboard.press("Escape");
    await expect(sure).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add Work Person" })).toBeVisible();
    await expect(page.getByRole("button", { name: /5\.\s*Workers/i })).toHaveCount(0);
    await deleteJose.click();
    await page.keyboard.press("Y");
    await expect(page.getByLabel("Worker name 1")).not.toHaveValue("Jose Ramirez");

    await propertyList(page, INVOICE_PROCESS, { keepData: true });
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: /01\/15\/2026\s+1\s+A1\s+250\.00/ }).click();
    await expect(page.getByRole("textbox", { name: "Work Person" })).toHaveValue(
      "Jose Ramirez"
    );
    await expect(page.getByLabel("Work Person list").locator("option")).toHaveText([
      " ",
      "Ana C. Cruz",
    ]);
  });
});
