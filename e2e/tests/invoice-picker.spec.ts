import { expect, type Page, test } from "@playwright/test";

async function openStreetPicker(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
  const street = page.getByRole("textbox", { name: "Property Street" });
  await street.click();
  await street.fill("?");
  await street.press("Enter");
  await expect(page.getByRole("button", { name: /^CoNO v$/ })).toBeVisible();
}

function rows(page: Page) {
  return page.locator(".dos-browse .dos-row");
}

test.describe("invoice street picker", () => {
  test("sorts company numbers high to low and streets numerically", async ({ page }) => {
    await openStreetPicker(page);
    await expect(rows(page)).toHaveText([
      /2000\s*01\s*10 OAK AVENUE/,
      /2000\s*02\s*9 PINE STREET/,
      /1500\s*01\s*100 ELM ROAD/,
      /1000\s*01\s*14755 NORTH VENTURA/,
      /1000\s*02\s*88 MAIN ST/,
    ]);

    await page.getByRole("button", { name: /^CoNO v$/ }).click();
    await expect(page.getByRole("button", { name: /^CoNO \^$/ })).toBeVisible();
    await expect(rows(page).first()).toContainText("1000");
    await expect(rows(page).first()).toContainText("14755 NORTH VENTURA");

    await page.getByRole("button", { name: /^CoNO \^$/ }).click();
    await expect(rows(page).first()).toContainText("10 OAK AVENUE");

    await page.getByRole("button", { name: /^Street$/ }).click();
    await expect(page.getByRole("button", { name: /^Street \^$/ })).toBeVisible();
    await expect(rows(page)).toHaveText([
      /9 PINE STREET/,
      /10 OAK AVENUE/,
      /88 MAIN ST/,
      /100 ELM ROAD/,
      /14755 NORTH VENTURA/,
    ]);
  });

  test("right-click edits a property; cancel keeps it and save updates it", async ({
    page,
  }) => {
    await openStreetPicker(page);
    const pine = page.getByRole("button", { name: /9 PINE STREET/i });
    await pine.click({ button: "right" });
    await expect(page.getByText("Detaill Property Information")).toBeVisible();
    const street = page.locator(".dos-form input.w45");
    await expect(street).toHaveValue("9 PINE STREET");
    await street.fill("9 PINE COURT");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /9 PINE STREET/i })).toBeVisible();
    await expect(page.getByText("Detaill Property Information")).toHaveCount(0);

    await page.getByRole("button", { name: /9 PINE STREET/i }).click({ button: "right" });
    await page.locator(".dos-form input.w45").fill("9 PINE COURT");
    await page.keyboard.press("Control+s");
    await expect(page.getByText(/BAYSIDE, Pine House/)).toBeVisible();
    await expect(page.getByText("9 PINE COURT")).toBeVisible();

    await page.getByRole("button", { name: /^Esc Exit$/ }).click();
    await expect(page.getByRole("button", { name: /9 PINE COURT/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /9 PINE STREET/i })).toHaveCount(0);
  });

  test("puts the gate code and the Lock Box field in the invoice header", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
    await page.getByRole("textbox", { name: "Property Street" }).click();
    await page.getByRole("textbox", { name: "Property Street" }).fill("?");
    await page.getByRole("textbox", { name: "Property Street" }).press("Enter");
    await page.getByRole("button", { name: /10 OAK AVENUE/i }).click();
    await expect(page.getByText("Entry code: #1001")).toBeVisible();
    await expect(page.getByText("Lock box code: 4400")).toBeVisible();
    await expect(page.getByText("Lock box code: office@bayside.example")).toHaveCount(0);

    await page.goto("/");
    await page.getByRole("button", { name: /3\.\s*Invoice Process/i }).click();
    const companyNo = page.getByPlaceholder("? = first").first();
    await companyNo.fill("?");
    await companyNo.press("Enter");
    await page.getByRole("button", { name: /1000\s+ACME/i }).click();
    await page.getByRole("button", { name: /01\s+Bldg A/i }).waitFor();
    await page.getByRole("button", { name: /^Ctrl-Home$/ }).click();
    await expect(page.getByLabel("Gate Code")).toHaveValue("*2424");
    await expect(page.getByLabel("Lock Box")).toHaveValue("NAVAJO WHITE");
    await page.getByLabel("Lock Box").fill("5555");
    await page.getByLabel("E-mail").fill("maria@acme.example");
    await page.keyboard.press("Control+s");
    await expect(page.getByText("Entry code: *2424, Lock box code: 5555")).toBeVisible();
    await expect(page.getByText("maria@acme.example")).toHaveCount(0);
  });
});
