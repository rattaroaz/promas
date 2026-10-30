import { expect, test, type Page } from "@playwright/test";

/**
 * Shared navigation and waits for the e2e suite. The mock backend keeps its
 * data in page memory, so anything that loads "/" starts from the seed data;
 * pass `keepData` to Esc back to the menu instead.
 */

export const INVOICE_PROCESS = /3\.\s*Invoice Process/i;

type Nav = { keepData?: boolean };

/** Loads the app fresh and waits for the main menu. */
export async function home(page: Page) {
  await test.step("load the main menu", async () => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: INVOICE_PROCESS })).toBeVisible();
  }, { box: true });
}

/** Escs out to the main menu without reloading. */
export async function backToMain(page: Page) {
  await test.step("Esc back to the main menu", async () => {
    const menu = page.getByRole("button", { name: INVOICE_PROCESS });
    for (let i = 0; i < 8 && !(await menu.isVisible()); i++) {
      await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
    }
    await expect(menu).toBeVisible();
  }, { box: true });
}

export async function openMain(page: Page, item: RegExp, { keepData = false }: Nav = {}) {
  await test.step(`open ${item}`, async () => {
    if (keepData) await backToMain(page);
    else await home(page);
    await page.getByRole("button", { name: item }).click();
  }, { box: true });
}

/** Opens a process from the main menu and lists every company with "?". */
export async function companyList(page: Page, item: RegExp, nav: Nav = {}) {
  await openMain(page, item, nav);
  await test.step("list companies", async () => {
    const companyNo = page.getByRole("textbox", { name: "Company NO" });
    await companyNo.fill("?");
    await companyNo.press("Enter");
    await expect(page.getByRole("button", { name: /1000\s+ACME/i })).toBeVisible();
  }, { box: true });
}

/** As `companyList`, then picks ACME to list its properties. */
export async function propertyList(page: Page, item: RegExp, nav: Nav = {}) {
  await companyList(page, item, nav);
  await test.step("list ACME properties", async () => {
    await page.getByRole("button", { name: /1000\s+ACME/i }).click();
    await expect(page.getByRole("button", { name: /01\s+Bldg A/i })).toBeVisible();
  }, { box: true });
}

/** A blank invoice for ACME, Bldg A. */
export async function openNewInvoice(page: Page, nav: Nav = {}) {
  await propertyList(page, INVOICE_PROCESS, nav);
  await test.step("start a new invoice", async () => {
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: /^New Invoice$/i }).click();
    await expect(page.getByLabel("Invoice Number", { exact: true })).toBeVisible();
  }, { box: true });
}

/**
 * Waits until the root size and --fit-scale have held still for `quietMs`.
 * A screen refits when late rows or options widen it, so measure type and
 * layout only after this. Fails if the fit never settles.
 */
export async function waitForFit(page: Page, quietMs = 500) {
  await test.step("wait for the fit to settle", async () => {
    const token = `${Date.now()}-${Math.random()}`;
    await page.waitForFunction(
      ({ quietMs, token }) => {
        const root = document.documentElement;
        const value = `${getComputedStyle(root).fontSize}|${root.style.getPropertyValue("--fit-scale")}`;
        const now = performance.now();
        const bag = window as unknown as {
          __fitWatch?: { token: string; value: string; since: number };
        };
        const watch = bag.__fitWatch;
        if (!watch || watch.token !== token || watch.value !== value) {
          bag.__fitWatch = { token, value, since: now };
          return false;
        }
        return now - watch.since >= quietMs;
      },
      { quietMs, token },
      { polling: 50, timeout: 10_000 }
    );
  }, { box: true });
}

/** Attaches a screenshot of the page to the test report. */
export async function shot(page: Page, name: string) {
  await test.info().attach(`${name}.png`, {
    body: await page.screenshot(),
    contentType: "image/png",
  });
}

/** Opens the Work Person window, fills it, and saves back to the list. */
export async function saveWorkPerson(
  page: Page,
  fields: { name: string; address?: string; phone?: string; workerId?: string },
  editName?: string
) {
  if (editName) {
    await page.getByRole("button", { name: `Edit ${editName}` }).click();
  } else {
    await page.getByRole("button", { name: "Ins Add" }).click();
  }
  await page.getByLabel("Name").fill(fields.name);
  if (fields.address != null) await page.getByLabel("Address").fill(fields.address);
  if (fields.phone != null) await page.getByLabel("Phone").fill(fields.phone);
  if (fields.workerId != null) await page.getByLabel("Worker ID").fill(fields.workerId);
  await page.getByRole("button", { name: "Ctrl-S Save" }).click();
  await expect(page.getByRole("button", { name: "Ins Add" })).toBeVisible();
}

/** Attaches measurements to the test report. */
export async function attachJson(name: string, data: unknown) {
  await test.info().attach(name, {
    body: JSON.stringify(data, null, 2),
    contentType: "application/json",
  });
}

/** `iso` plus `days`, as YYYY-MM-DD in local time. ArrowDown in Chromium's date picker moves one week. */
export function plusDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}
