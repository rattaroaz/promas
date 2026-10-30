import { expect, test } from "@playwright/test";
import { companyList, home, openMain, propertyList, saveWorkPerson, waitForFit } from "../support/app";

/**
 * v2.16.12 passed the UI gate while --fit-scale was below 1, because widths
 * were divided by that scale. These checks read the scale itself.
 */

const viewports = [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
] as const;

test("payroll, property tables, and the work person form fit at scale 1", async ({ page }) => {
  test.setTimeout(180_000);
  for (const viewport of viewports) {
    const tag = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);

    await openMain(page, /6\.\s*Reports Menu/i);
    await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
    await expect(page.getByLabel("Work person search")).toBeVisible();
    await waitForFit(page);
    const payroll = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        fit: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
        font: parseFloat(getComputedStyle(root).fontSize),
      };
    });
    expect(payroll.fit, `${tag} payroll --fit-scale`).toBe("1");
    expect(payroll.font, `${tag} payroll font`).toBeCloseTo(22, 0);

    await propertyList(page, /3\.\s*Invoice Process/i);
    await waitForFit(page);
    const properties = await page.evaluate(() => {
      const root = document.documentElement;
      const grid = document.querySelector(".content-grid") as HTMLElement;
      const street = document.querySelector(".property-street") as HTMLElement;
      return {
        fit: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
        font: parseFloat(getComputedStyle(root).fontSize),
        overflow: grid.scrollWidth - grid.clientWidth,
        title: street.getAttribute("title"),
        text: (street.textContent || "").trim(),
        ellipsis: getComputedStyle(street).textOverflow,
        streetScroll: street.scrollWidth,
        streetClient: street.clientWidth,
      };
    });
    expect(properties.fit, `${tag} property table --fit-scale`).toBe("1");
    expect(properties.font, `${tag} property table font`).toBeCloseTo(22, 0);
    expect(properties.overflow, `${tag} property table overflow`).toBeLessThanOrEqual(1);
    expect(properties.title, tag).toBe("14755 NORTH VENTURA CANYON AVENUE BUILDING A1");
    expect(properties.text, tag).toBe(properties.title);
    if (viewport.width === 1024) {
      expect(properties.ellipsis, tag).toBe("ellipsis");
      expect(properties.streetClient, `${tag} street truncates`).toBeLessThan(properties.streetScroll);
    }

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByLabel("Worker name 1")).toHaveText("Jose Ramirez");
    const row = page.locator(".workers-row").first();
    await expect(row.locator("button")).toHaveText(["Edit", "Delete"]);

    const long = "A".repeat(70);
    await saveWorkPerson(page, { name: long }, "Jose Ramirez");
    const name = page.getByLabel("Worker name 1");
    await expect(name).toHaveAttribute("title", long);
    await expect(name).toHaveCSS("text-overflow", "ellipsis");
    await expect(name).toHaveCSS("overflow-x", "hidden");
    const nameEdges = () =>
      name.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const text = range.getBoundingClientRect();
        const cell = el.getBoundingClientRect();
        return { textRight: text.right, cellRight: cell.right };
      });
    await name.hover();
    const hovered = await nameEdges();
    expect(hovered.textRight, `${tag} hovered name stays in the cell`).toBeLessThanOrEqual(
      hovered.cellRight + 1
    );
    await name.focus();
    const focused = await nameEdges();
    expect(focused.textRight, `${tag} focused name stays in the cell`).toBeLessThanOrEqual(
      focused.cellRight + 1
    );
    // Blur before Edit. Focus wraps the row, and the click target moves when it collapses.
    await name.blur();

    await page.getByRole("button", { name: `Edit ${long}` }).click();
    await expect(page.getByLabel("Phone")).toBeVisible();
    await waitForFit(page);
    const form = await page.evaluate(() => {
      const root = document.documentElement;
      const form = document.querySelector(".work-person-form") as HTMLElement;
      const phone = document.querySelector("[aria-label='Phone']") as HTMLElement;
      const nameField = document.querySelector("[aria-label='Name']") as HTMLElement;
      const content = document.querySelector(".dos-content") as HTMLElement;
      const probe = document.createElement("span");
      probe.style.cssText = `position:absolute;visibility:hidden;font:${getComputedStyle(form).font};`;
      probe.textContent = "0";
      document.body.appendChild(probe);
      const ch = probe.getBoundingClientRect().width;
      probe.remove();
      const read = (el: HTMLElement) => {
        const blurred = getComputedStyle(el).fontSize;
        el.focus();
        const focused = getComputedStyle(el).fontSize;
        return { blurred, focused };
      };
      return {
        fit: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
        font: parseFloat(getComputedStyle(root).fontSize),
        minWidth: parseFloat(getComputedStyle(form).minWidth),
        ch,
        gap: form.getBoundingClientRect().top - content.getBoundingClientRect().top,
        phoneWidth: phone.getBoundingClientRect().width,
        nameWidth: nameField.getBoundingClientRect().width,
        phoneClass: phone.className,
        address: read(document.querySelector("[aria-label='Address']") as HTMLElement),
        phone: read(phone),
      };
    });
    expect(form.fit, `${tag} work person --fit-scale`).toBe("1");
    expect(form.font, `${tag} work person font`).toBeCloseTo(22, 0);
    expect(form.minWidth, `${tag} form min-width`).toBeGreaterThanOrEqual(46 * form.ch - 1);
    expect(form.gap, `${tag} space above the form`).toBeLessThan(48);
    expect(form.phoneClass, tag).toContain("w16");
    expect(form.phoneWidth, `${tag} phone is narrower than the name`).toBeLessThan(form.nameWidth - 8);
    expect(form.address.focused, `${tag} address focus font`).toBe(form.address.blurred);
    expect(form.phone.focused, `${tag} phone focus font`).toBe(form.phone.blurred);
    expect(parseFloat(form.address.focused), `${tag} address font`).toBeCloseTo(22, 0);
    expect(parseFloat(form.phone.focused), `${tag} phone font`).toBeCloseTo(22, 0);
  }
});

test("startup warns about worker IDs that are already duplicated and still saves them", async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("e2e-duplicate-workers", "1");
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await home(page);
  const bar = page.locator(".dos-messagebar");
  await expect(bar).toContainText(/Duplicate Worker ID 400/);
  await expect(bar).toContainText("Jose Ramirez");
  await expect(bar).toContainText("Ana Cruz");
  await expect(bar).toContainText(/You can still save/i);
  const messageLines = await bar.evaluate((el) => {
    const line = parseFloat(getComputedStyle(el).lineHeight);
    return el.scrollHeight / line;
  });
  expect(messageLines, "duplicate warning is one line at 1024").toBeLessThanOrEqual(1.05);

  await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
  await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
  await expect(page.locator(".dos-messagebar")).toContainText(/You can still save/i);
  await page.getByRole("button", { name: "Edit Jose Ramirez" }).click();
  await expect(page.locator(".dos-messagebar")).toContainText(/already shared/i);
  await page.getByLabel("Address").fill("44 Elm St");
  await page.getByRole("button", { name: "Ctrl-S Save" }).click();
  await expect(page.getByRole("button", { name: "Ins Add" })).toBeVisible();
  await expect(page.locator(".dos-messagebar")).toContainText(/Duplicate Worker ID/i);

  await page.getByRole("checkbox", { name: "Active Jose Ramirez" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Active Jose Ramirez" })).not.toBeChecked();

  await saveWorkPerson(
    page,
    { name: "Ana Cruz", workerId: "15", address: "9 Pine Ave", phone: "555-0199" },
    "Ana Cruz"
  );
  await expect(page.locator(".dos-messagebar")).not.toContainText(/Duplicate Worker ID/i);
  await page.getByRole("button", { name: "Edit Jose Ramirez" }).click();
  await expect(page.getByLabel("Address")).toHaveValue("44 Elm St");
  await page.getByLabel("Worker ID").fill("15");
  await page.getByRole("button", { name: "Ctrl-S Save" }).click();
  await expect(page.getByText("Worker ID must be unique")).toBeVisible();
});

test("payroll headers share left edges with their columns", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await openMain(page, /6\.\s*Reports Menu/i);
    await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByRole("button", { name: "Invoice 12" })).toBeVisible();
    await waitForFit(page);
    const deltas = await page.evaluate(() => {
      const header = document.querySelector(".browse-grid-header") as HTMLElement;
      const row = document.querySelector(".dos-browse-body .browse-grid") as HTMLElement;
      const heads = [...header.children];
      const cells = [...row.children];
      return heads.map((head, i) =>
        Math.abs(head.getBoundingClientRect().left - cells[i].getBoundingClientRect().left)
      );
    });
    expect(deltas.length, `${viewport.width} payroll columns`).toBeGreaterThan(0);
    for (const [index, delta] of deltas.entries()) {
      expect(delta, `${viewport.width} column ${index}`).toBeLessThanOrEqual(1);
    }
  }
});

test("a wide window shows the full property street", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await propertyList(page, /3\.\s*Invoice Process/i);
  await waitForFit(page);
  const street = await page.evaluate(() => {
    const root = document.documentElement;
    const grid = document.querySelector(".content-grid") as HTMLElement;
    const cell = document.querySelector(".property-street") as HTMLElement;
    return {
      fit: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
      overflow: grid.scrollWidth - grid.clientWidth,
      client: cell.clientWidth,
      scroll: cell.scrollWidth,
      text: (cell.textContent || "").trim(),
    };
  });
  expect(street.fit, "1400 property --fit-scale").toBe("1");
  expect(street.overflow, "1400 property overflow").toBeLessThanOrEqual(1);
  expect(street.text).toBe("14755 NORTH VENTURA CANYON AVENUE BUILDING A1");
  expect(street.client, "1400 street is not truncated").toBeGreaterThanOrEqual(street.scroll - 1);
});

test("company list property tables stay at scale 1", async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await companyList(page, /3\.\s*Invoice Process/i);
    await waitForFit(page);
    const measured = await page.evaluate(() => {
      const root = document.documentElement;
      const grid = document.querySelector(".content-grid") as HTMLElement;
      return {
        fit: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
        overflow: grid.scrollWidth - grid.clientWidth,
      };
    });
    expect(measured.fit, `${viewport.width} companies --fit-scale`).toBe("1");
    expect(measured.overflow, `${viewport.width} companies overflow`).toBeLessThanOrEqual(1);
  }
});
