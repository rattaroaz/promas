import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Fonts and field boxes must stay put when a control is focused or clicked.
 * Fit-to-width used to leave one shrink unapplied; the next focus ran it and
 * every font on the screen got smaller. This walks every screen.
 */

type Box = { x: number; y: number; w: number; h: number } | null;

type Shot = {
  font: number;
  rootFont: number;
  fit: string;
  self: Box;
  parent: Box;
  prev: Box;
  next: Box;
};

const FIELDS = "input:visible, select:visible, textarea:visible";

async function frames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        );
      })
  );
}

/** A screen can fit again when its rows arrive. Wait until type has held still. */
async function waitSettled(page: Page) {
  let last = "";
  let since = Date.now();
  const start = Date.now();
  while (Date.now() - start < 2500) {
    const now = await page.evaluate(() => {
      const root = document.documentElement;
      return `${getComputedStyle(root).fontSize}|${root.style.getPropertyValue("--fit-scale")}`;
    });
    if (now !== last) {
      last = now;
      since = Date.now();
    } else if (Date.now() - since >= 500) {
      return;
    }
    await page.waitForTimeout(40);
  }
}

async function shot(locator: Locator): Promise<Shot> {
  return locator.evaluate((el) => {
    const box = (node: Element | null) => {
      if (!node) return null;
      const b = node.getBoundingClientRect();
      const n = (v: number) => Math.round(v);
      return { x: n(b.x), y: n(b.y), w: n(b.width), h: n(b.height) };
    };
    const root = document.documentElement;
    return {
      font: parseFloat(getComputedStyle(el).fontSize),
      rootFont: parseFloat(getComputedStyle(root).fontSize),
      fit: root.style.getPropertyValue("--fit-scale"),
      self: box(el),
      parent: box(el.parentElement),
      prev: box(el.previousElementSibling),
      next: box(el.nextElementSibling),
    };
  });
}

function closeBox(a: Box, b: Box): boolean {
  if (a === null || b === null) return a === b;
  return (
    Math.abs(a.x - b.x) <= 1 &&
    Math.abs(a.y - b.y) <= 1 &&
    Math.abs(a.w - b.w) <= 1 &&
    Math.abs(a.h - b.h) <= 1
  );
}

/** Position relative to the field, so a page scroll is not a resize. */
function around(box: Box, origin: Box): Box {
  if (!box || !origin) return box;
  return { x: box.x - origin.x, y: box.y - origin.y, w: box.w, h: box.h };
}

function expectStill(before: Shot, after: Shot, where: string) {
  expect(after.rootFont, `${where} root font ${before.rootFont} → ${after.rootFont}`).toBeCloseTo(
    before.rootFont,
    1
  );
  expect(after.font, `${where} font ${before.font} → ${after.font}`).toBeCloseTo(before.font, 1);
  expect(after.fit, `${where} fit-scale`).toBe(before.fit);
  const beforeSelf = around(before.self, before.parent);
  const afterSelf = around(after.self, after.parent);
  expect(
    closeBox(beforeSelf, afterSelf),
    `${where} box ${JSON.stringify(before.self)} → ${JSON.stringify(after.self)}`
  ).toBe(true);
  expect(closeBox(around(before.parent, before.parent), around(after.parent, after.parent)), `${where} parent box`).toBe(true);
  expect(closeBox(around(before.prev, before.self), around(after.prev, after.self)), `${where} previous neighbour`).toBe(true);
  expect(closeBox(around(before.next, before.self), around(after.next, after.self)), `${where} next neighbour`).toBe(true);
}

async function marker(page: Page): Promise<{ screen: string; overlays: number }> {
  return page.evaluate(() => {
    const text = (sel: string) =>
      document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      screen: `${text(".dos-titlebar")}|${text(".menu-header")}|${text(".dlg-title")}`,
      overlays: document.querySelectorAll(".dos-overlay").length,
    };
  });
}

async function controlName(locator: Locator): Promise<string> {
  return locator.evaluate((el) =>
    (el.getAttribute("aria-label") || el.textContent || el.tagName)
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60)
  );
}

async function poke(page: Page, locator: Locator, where: string, click: boolean) {
  if (!(await locator.isVisible().catch(() => false))) return false;
  if (!(await locator.isEnabled().catch(() => false))) return false;
  const token = await locator.evaluate((el) => {
    const id = `fit${Math.random().toString(36).slice(2)}`;
    el.setAttribute("data-fit-audit", id);
    return id;
  });
  const pinned = page.locator(`[data-fit-audit="${token}"]`);
  const before = await shot(pinned);
  if (!before.self || before.self.w < 2 || before.self.h < 2) return false;
  const name = await controlName(pinned);
  await pinned.focus();
  await frames(page);
  if ((await pinned.count()) === 0) return false;
  const focused = await shot(pinned);
  expectStill(before, focused, `${where} focus "${name}"`);
  if (!click) return false;
  const beforeMark = await marker(page);
  const beforeCount = await page.locator("input, button, select, textarea").count();
  const beforeText = await page.evaluate(() => document.body.innerText.length);
  const tag = await pinned.evaluate((el) => el.tagName);
  await pinned.click({ timeout: 4000 }).catch(() => undefined);
  await frames(page);
  const afterMark = await marker(page);
  const afterCount = await page.locator("input, button, select, textarea").count();
  const afterText = await page.evaluate(() => document.body.innerText.length);
  const still = (await pinned.count()) > 0 && (await pinned.isVisible().catch(() => false));
  const commandChangedScreen =
    tag === "BUTTON" &&
    (beforeCount !== afterCount || Math.abs(afterText - beforeText) > 20);
  // A menu click opens another screen, and that screen may fit to a different
  // scale. The rule under test is a click that stays on this screen.
  if (beforeMark.screen !== afterMark.screen || !still) return true;
  // Running a report or adding a row changes the content, so the screen may fit again.
  // Focus, above, already proved the click's focus step did not resize anything.
  if (commandChangedScreen) return false;
  const after = await shot(pinned);
  if (beforeMark.overlays !== afterMark.overlays) {
    expect(after.rootFont, `${where} click "${name}" root font`).toBeCloseTo(before.rootFont, 1);
    expect(after.font, `${where} click "${name}" font`).toBeCloseTo(before.font, 1);
    expect(after.fit, `${where} click "${name}" fit-scale`).toBe(before.fit);
    if (afterMark.overlays > beforeMark.overlays) {
      const ok = page.getByRole("button", { name: "OK" });
      if (await ok.isVisible().catch(() => false)) await ok.click();
      else await page.keyboard.press("Escape");
      await page.locator(".dos-overlay").first().waitFor({ state: "hidden", timeout: 2000 }).catch(() => undefined);
    }
    return false;
  }
  expectStill(before, after, `${where} click "${name}"`);
  return false;
}

async function audit(page: Page, open: () => Promise<void>, screen: string) {
  const show = async () => {
    await open();
    await waitSettled(page);
  };
  await show();
  const fields = page.locator(FIELDS);
  const fieldCount = await fields.count();
  for (let i = 0; i < fieldCount; i++) {
    await poke(page, fields.nth(i), screen, true);
  }
  let buttonCount = await page.locator("button:visible").count();
  for (let i = 0; i < buttonCount; i++) {
    let buttons = page.locator("button:visible");
    if ((await buttons.count()) <= i) {
      await show();
      buttons = page.locator("button:visible");
      buttonCount = await buttons.count();
      if (buttonCount <= i) break;
    }
    const changed = await poke(page, buttons.nth(i), screen, true);
    if (changed) await show();
  }
  test.info().annotations.push({
    type: "focus-audit",
    description: `${screen}: ${fieldCount} fields, ${buttonCount} buttons`,
  });
}

async function home(page: Page) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /3\.\s*Invoice Process/i })).toBeVisible();
}

async function openMain(page: Page, item: RegExp) {
  await home(page);
  await page.getByRole("button", { name: item }).click();
}

async function companyList(page: Page, item: RegExp) {
  await openMain(page, item);
  const companyNo = page.getByRole("textbox", { name: "Company NO" });
  await companyNo.fill("?");
  await companyNo.press("Enter");
  await expect(page.getByRole("button", { name: /1000\s+ACME/i })).toBeVisible();
}

async function propertyList(page: Page, item: RegExp) {
  await companyList(page, item);
  await page.getByRole("button", { name: /1000\s+ACME/i }).click();
  await expect(page.getByRole("button", { name: /01\s+Bldg A/i })).toBeVisible();
}

test.describe("focus does not resize the screen", () => {
  test.beforeEach(async ({ page }) => {
    page.setDefaultTimeout(8_000);
    await page.addInitScript(() => {
      window.print = () => undefined;
    });
    page.on("dialog", (dialog) => {
      void dialog.dismiss();
    });
  });

  test("clicking a field on Invoice Process keeps the font and the neighbouring boxes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openMain(page, /3\.\s*Invoice Process/i);
    await expect(page.getByRole("textbox", { name: "Company NO" })).toBeVisible();
    await waitSettled(page);
    const company = page.getByRole("textbox", { name: "Company NO" });
    const street = page.getByRole("textbox", { name: "Property Street" });
    const beforeCompany = await shot(company);
    const beforeStreet = await shot(street);
    await company.click();
    await frames(page);
    expectStill(beforeCompany, await shot(company), "Invoice Process click Company NO");
    expectStill(beforeStreet, await shot(street), "Invoice Process Company NO click neighbour Property Street");
    const beforeProp = await shot(street);
    await street.click();
    await frames(page);
    expectStill(beforeProp, await shot(street), "Invoice Process click Property Street");
    expectStill(beforeCompany, await shot(company), "Invoice Process Property Street click neighbour Company NO");
  });

  test("every input, button, and dropdown keeps its font and neighbour boxes", async ({
    page,
  }) => {
    test.setTimeout(480_000);
    await page.setViewportSize({ width: 1400, height: 900 });

    const screens: { name: string; open: () => Promise<void> }[] = [
      { name: "Main menu", open: () => home(page) },
      { name: "Estimate gate", open: () => openMain(page, /1\.\s*Estimate Process/i) },
      {
        name: "Estimate properties",
        open: () => propertyList(page, /1\.\s*Estimate Process/i),
      },
      {
        name: "Estimate list",
        open: async () => {
          await propertyList(page, /1\.\s*Estimate Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await expect(page.getByText(/1 proposals/i)).toBeVisible();
        },
      },
      {
        name: "Estimate edit",
        open: async () => {
          await propertyList(page, /1\.\s*Estimate Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /EST-1/i }).click();
          await expect(page.locator(".dlg-title")).toContainText("Proposal");
        },
      },
      { name: "Work order gate", open: () => openMain(page, /2\.\s*Work Order Process/i) },
      {
        name: "Work order properties",
        open: () => propertyList(page, /2\.\s*Work Order Process/i),
      },
      {
        name: "Work order list",
        open: async () => {
          await propertyList(page, /2\.\s*Work Order Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await expect(page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i })).toBeVisible();
        },
      },
      {
        name: "Work order edit",
        open: async () => {
          await propertyList(page, /2\.\s*Work Order Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
          await expect(page.locator(".dlg-title")).toBeVisible();
        },
      },
      { name: "Invoice gate", open: () => openMain(page, /3\.\s*Invoice Process/i) },
      {
        name: "Invoice companies",
        open: () => companyList(page, /3\.\s*Invoice Process/i),
      },
      {
        name: "Invoice properties",
        open: () => propertyList(page, /3\.\s*Invoice Process/i),
      },
      {
        name: "Property edit",
        open: async () => {
          await propertyList(page, /3\.\s*Invoice Process/i);
          await page.getByRole("button", { name: "Ctrl-Home" }).click();
          await expect(page.getByRole("textbox", { name: "Property NO" })).toBeVisible();
        },
      },
      {
        name: "Invoice list",
        open: async () => {
          await propertyList(page, /3\.\s*Invoice Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await expect(page.getByText(/1 invoices/i)).toBeVisible();
        },
      },
      {
        name: "Invoice edit",
        open: async () => {
          await propertyList(page, /3\.\s*Invoice Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByLabel("Invoice Number")).toBeVisible();
        },
      },
      { name: "Cash gate", open: () => openMain(page, /4\.\s*Cash Receipts Process/i) },
      {
        name: "Cash ledger",
        open: async () => {
          await companyList(page, /4\.\s*Cash Receipts Process/i);
          await page.getByRole("button", { name: /1000\s+ACME/i }).click();
          await expect(page.getByText(/Unpaid Total|Open/i).first()).toBeVisible();
        },
      },
      {
        name: "Cash payment",
        open: async () => {
          await companyList(page, /4\.\s*Cash Receipts Process/i);
          await page.getByRole("button", { name: /1000\s+ACME/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByLabel(/Amount Paid/i).first()).toBeVisible();
        },
      },
      { name: "Material menu", open: () => openMain(page, /5\.\s*Material Process/i) },
      {
        name: "Material transactions",
        open: async () => {
          await openMain(page, /5\.\s*Material Process/i);
          await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
          await expect(page.locator(".dos-searchline input")).toBeVisible();
        },
      },
      {
        name: "Material edit",
        open: async () => {
          await openMain(page, /5\.\s*Material Process/i);
          await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
        },
      },
      {
        name: "Worker wages",
        open: async () => {
          await openMain(page, /5\.\s*Material Process/i);
          await page.getByRole("button", { name: /5\.\s*Worker Wages/i }).click();
          await expect(page.getByText(/Worker Wages/i).first()).toBeVisible();
        },
      },
      { name: "Reports menu", open: () => openMain(page, /6\.\s*Reports Menu/i) },
    ];

    const reports = [
      "Payroll Report",
      "Customer File",
      "Invoice Register",
      "Cash Receipts Register",
      "Open Receivables Aging",
      "Sales Analysis",
      "Check Missing Invoice",
      "Mailing Labels",
      "Paint Usage Report",
    ];
    for (const label of reports) {
      screens.push({
        name: `Report ${label}`,
        open: async () => {
          await openMain(page, /6\.\s*Reports Menu/i);
          await page.getByRole("button", { name: new RegExp(label, "i") }).click();
          await expect(page.getByRole("button", { name: /1\.\s*Payroll Report/i })).toHaveCount(0);
        },
      });
    }

    screens.push(
      { name: "Miscellaneous", open: () => openMain(page, /7\.\s*Miscellaneous/i) },
      {
        name: "Change system date",
        open: async () => {
          await openMain(page, /7\.\s*Miscellaneous/i);
          await page.getByRole("button", { name: /1\.\s*Change System Date/i }).click();
          await expect(page.locator("input").first()).toBeVisible();
        },
      },
      {
        name: "Form management",
        open: async () => {
          await openMain(page, /7\.\s*Miscellaneous/i);
          await page.getByRole("button", { name: /3\.\s*Form Management/i }).click();
          await expect(page.getByText(/Form/i).first()).toBeVisible();
        },
      },
      {
        name: "Workers",
        open: async () => {
          await openMain(page, /7\.\s*Miscellaneous/i);
          await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
          await expect(page.getByRole("button", { name: /Add Work Person/i })).toBeVisible();
        },
      },
      { name: "Settings", open: () => openMain(page, /8\.\s*Settings/i) },
      {
        name: "Diagnostics",
        open: async () => {
          await openMain(page, /8\.\s*Settings/i);
          await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
          await expect(page.getByText(/Diagnostic/i).first()).toBeVisible();
        },
      }
    );

    for (const screen of screens) {
      await audit(page, screen.open, screen.name);
    }
  });
});
