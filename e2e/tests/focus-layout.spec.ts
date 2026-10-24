import { expect, test, type Locator, type Page } from "@playwright/test";
import { openMain, propertyList, waitForFit } from "../support/app";
import { SCREENS } from "../support/screens";

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
    await waitForFit(page);
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
    await waitForFit(page);
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

  for (const screen of SCREENS) {
    test(`${screen.name}: every input, button, and dropdown keeps its font and neighbour boxes`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1400, height: 900 });
      await audit(page, () => screen.open(page), screen.name);
    });
  }

  test("opened dialogs and forms stay put when a field is focused", async ({ page }) => {
    test.setTimeout(180_000);
    page.setDefaultTimeout(8_000);

    const forms: { name: string; open: () => Promise<void> }[] = [
      {
        name: "Work order edit",
        open: async () => {
          await propertyList(page, /2\.\s*Work Order Process/i);
          await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
          await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
          await expect(page.locator(".dlg-title")).toBeVisible();
        },
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
        name: "Material edit",
        open: async () => {
          await openMain(page, /5\.\s*Material Process/i);
          await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
          await page.getByRole("button", { name: /^Ins Add$/i }).click();
          await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
        },
      },
      {
        name: "Diagnostics",
        open: async () => {
          await openMain(page, /8\.\s*Settings/i);
          await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
          await expect(page.getByText("Metrics · Traces · Logs · State")).toBeVisible();
        },
      },
    ];

    const layout = () =>
      page.evaluate(() => {
        const root = document.documentElement;
        const nodes = [...document.querySelectorAll("input, button, select, textarea, .dlg-title, .menu-header")]
          .filter((el) => {
            if (el.closest(".dos-help, .dos-prompt, .print-preview-overlay")) return false;
            const b = el.getBoundingClientRect();
            return b.width > 2 && b.height > 2;
          })
          .map((el) => {
            const b = el.getBoundingClientRect();
            const name = (el.getAttribute("aria-label") || el.textContent || el.tagName)
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 40);
            return {
              name,
              x: Math.round(b.x),
              y: Math.round(b.y),
              w: Math.round(b.width),
              h: Math.round(b.height),
            };
          });
        return {
          fit: root.style.getPropertyValue("--fit-scale"),
          font: getComputedStyle(root).fontSize,
          nodes,
        };
      });

    for (const width of [1280, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const form of forms) {
        await form.open();
        await waitForFit(page);
        const fields = page.locator(".dos-dialog input:visible, .dos-dialog select:visible, .dos-dialog textarea:visible, .dos-menu-frame button:visible");
        const count = await fields.count();
        for (let i = 0; i < count; i++) {
          const before = await layout();
          const field = fields.nth(i);
          if (!(await field.isVisible().catch(() => false))) continue;
          if (!(await field.isEnabled().catch(() => false))) continue;
          await field.focus();
          await frames(page);
          const after = await layout();
          expect(after.fit, `${width} ${form.name} focus fit-scale`).toBe(before.fit);
          expect(parseFloat(after.font), `${width} ${form.name} focus font`).toBeCloseTo(
            parseFloat(before.font),
            1
          );
          const moved = before.nodes.filter((node, index) => {
            const next = after.nodes[index];
            if (!next || next.name !== node.name) return false;
            return (
              Math.abs(next.x - node.x) > 1 ||
              Math.abs(next.y - node.y) > 1 ||
              Math.abs(next.w - node.w) > 1 ||
              Math.abs(next.h - node.h) > 1
            );
          });
          expect(
            moved.length,
            `${width} ${form.name} focus moved ${moved.length}: ${moved
              .slice(0, 8)
              .map((n) => n.name)
              .join(", ")}`
          ).toBe(0);
        }
      }
    }
  });
});
