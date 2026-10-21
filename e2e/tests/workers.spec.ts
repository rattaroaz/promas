import { expect, type Page, test } from "@playwright/test";

async function pressEsc(page: Page) {
  await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
}

async function backToMain(page: Page) {
  for (let i = 0; i < 8; i++) {
    if (
      await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).isVisible()
    ) {
      return;
    }
    await pressEsc(page);
  }
}

async function openWorkers(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
  await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
  await expect(page.getByRole("button", { name: "Add Work Person" })).toBeVisible();
}

async function openNewInvoice(page: Page) {
  await pressEsc(page);
  await pressEsc(page);
  await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
  const companyNo = page.getByPlaceholder("? = first").first();
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();
  await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
  await page.getByRole("button", { name: /^New Invoice$/i }).click();
}

test.describe("workers", () => {
  test("adds, edits, deactivates, and deletes without changing an old invoice", async ({
    page,
  }) => {
    await openWorkers(page);
    await expect(page.getByLabel("Worker name 1")).toHaveValue("Jose Ramirez");
    await expect(page.getByLabel("Worker number 1")).toHaveValue("");
    await expect(page.getByRole("checkbox", { name: "Active Jose Ramirez" })).toBeChecked();

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

    await openNewInvoice(page);
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
    await page.getByRole("button", { name: "Delete Jose Ramirez" }).click();
    await expect(page.getByText("Are you sure?")).toBeVisible();
    await page.getByRole("button", { name: /^Y$/i }).click();
    await expect(page.getByLabel("Worker name 1")).not.toHaveValue("Jose Ramirez");

    await backToMain(page);
    await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
    const companyNo = page.getByPlaceholder("? = first").first();
    await companyNo.fill("?");
    await companyNo.press("Enter");
    await page.getByRole("button", { name: /1000\s+ACME/i }).click();
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
