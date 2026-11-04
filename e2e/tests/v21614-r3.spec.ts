import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openMain, propertyList, waitForFit } from "../support/app";

const PROOF = process.env.PROOF_DIR;

const viewports = [
  { width: 1024, height: 768, tag: "1024x768" },
  { width: 1280, height: 800, tag: "1280x800" },
  { width: 1400, height: 900, tag: "1400x900" },
] as const;

const FIELD_LABELS = [
  "Invoice Date",
  "Due Date",
  "Terms",
  "Invoice Number",
  "Order Date",
  "Unit",
  "Customer P.O.",
  "Material Costs",
  "Custom size",
  "Paint Supply Co.",
  "Work Person",
];

async function proof(page: Page, name: string) {
  if (!PROOF) return;
  fs.mkdirSync(PROOF, { recursive: true });
  await page.screenshot({ path: path.join(PROOF, `${name}.png`) });
}

async function fitNow(page: Page) {
  return page.evaluate(() => {
    const raw = getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim();
    const font = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return { fit: raw ? parseFloat(raw) : 1, font };
  });
}

test("round 3: aligned invoice fields, five list rows, fit 1", async ({ page }) => {
  test.setTimeout(420_000);
  const report: unknown[] = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = viewport.tag;

    for (const item of [
      /1\.\s*Estimate Process/i,
      /2\.\s*Work Order Process/i,
      /3\.\s*Invoice Process/i,
      /4\.\s*Cash Receipts Process/i,
    ]) {
      await openMain(page, item);
      await expect(page.getByRole("textbox", { name: "Company NO" })).toBeVisible();
      await waitForFit(page);
      const entry = await fitNow(page);
      report.push({ tag, screen: String(item), ...entry });
      expect(entry.fit, `${tag} ${item} fit`).toBe(1);
    }

    await propertyList(page, /3\.\s*Invoice Process/i);
    await waitForFit(page);
    const properties = await page.evaluate(() => {
      const city = document.querySelector(".property-city") as HTMLElement;
      const contact = document.querySelector(".property-contact") as HTMLElement;
      const street = document.querySelector(".property-street") as HTMLElement;
      const streetStyle = getComputedStyle(street);
      const line = parseFloat(streetStyle.lineHeight) || 1;
      return {
        cityWrap: getComputedStyle(city).overflowWrap,
        cityBreak: getComputedStyle(city).wordBreak,
        cityText: (city.textContent || "").trim(),
        cityFits: city.clientWidth >= city.scrollWidth - 1,
        contactText: (contact.textContent || "").trim(),
        contactFits: contact.clientWidth >= contact.scrollWidth - 1,
        streetLines: street.scrollHeight / line,
        streetFits: street.clientWidth >= street.scrollWidth - 1,
        streetWidth: street.clientWidth,
        nameText: ((document.querySelector(".property-name") as HTMLElement | null)?.textContent || "").trim(),
        nameFits: (() => {
          const name = document.querySelector(".property-name") as HTMLElement | null;
          return !!name && name.clientWidth >= name.scrollWidth - 1;
        })(),
        template: (street.closest(".content-grid") as HTMLElement).style.gridTemplateColumns,
        whiteSpace: streetStyle.whiteSpace,
        cells: [...(street.parentElement?.children ?? [])].map((node) => {
          const el = node as HTMLElement;
          return {
            text: (el.textContent || "").trim().slice(0, 24),
            width: Math.round(el.getBoundingClientRect().width),
          };
        }),
      };
    });
    report.push({ tag, screen: "properties", ...properties });
    expect(properties.cityWrap, tag).toBe("normal");
    expect(properties.cityBreak, tag).toBe("normal");
    expect(properties.cityText, tag).toBe("SHERMAN OAKS");
    expect(properties.cityFits, tag).toBe(true);
    expect(properties.contactText, tag).toBe("MARIA GONZALEZ");
    expect(properties.contactFits, tag).toBe(true);
    expect(properties.streetFits, tag).toBe(true);
    expect(properties.nameText, tag).toBe("Bldg A");
    expect(properties.nameFits, tag).toBe(true);
    expect(properties.streetLines, tag).toBeLessThan(3.2);
    await proof(page, `${tag}-properties`);

    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await expect(page.getByRole("button", { name: "New Invoice" })).toBeVisible();
    await waitForFit(page);
    const list = await page.evaluate(() => {
      const grid = document.querySelector(".content-grid") as HTMLElement;
      const host = grid.getBoundingClientRect();
      const sample = grid.querySelector(".dos-row") as HTMLElement | null;
      const header = grid.querySelector(".browse-grid-header") as HTMLElement;
      const rowH = sample ? sample.getBoundingClientRect().height : 44;
      const capacity = Math.floor((Math.min(host.bottom, window.innerHeight) - header.getBoundingClientRect().bottom) / rowH);
      const date = grid.querySelectorAll(".invoice-inv-date")[1] as HTMLElement;
      const comments = (document.querySelector(".invoice-comment-text")?.textContent || "").trim();
      return {
        capacity,
        dateText: (date?.textContent || "").trim(),
        dateFits: date ? date.clientWidth >= date.scrollWidth - 1 : false,
        headerText: (header?.textContent || "").replace(/\s+/g, " ").trim(),
        comments,
      };
    });
    report.push({ tag, screen: "invoice-list", ...(await fitNow(page)), ...list });
    expect(list.capacity, `${tag} invoice rows`).toBeGreaterThanOrEqual(5);
    expect(list.comments.startsWith("Comments:"), `${tag} ${list.comments}`).toBe(true);
    expect(list.dateText, tag).not.toMatch(/…|\.\.\./);
    expect(list.dateFits, `${tag} ${list.dateText}`).toBe(true);
    expect((await fitNow(page)).fit, tag).toBe(1);
    await proof(page, `${tag}-invoice-list-rows`);

    await page.getByRole("button", { name: "New Invoice" }).click();
    await expect(page.getByLabel("Invoice Date")).toBeVisible();
    await waitForFit(page);
    const form = await page.evaluate((labels) => {
      const probe = document.createElement("span");
      probe.textContent = "0";
      probe.style.position = "absolute";
      probe.style.font = getComputedStyle(document.body).font;
      document.body.appendChild(probe);
      const ch = probe.getBoundingClientRect().width;
      probe.remove();
      const fields = labels.map((label) => {
        const el = document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
        const box = el.getBoundingClientRect();
        return { label, x: Math.round(box.x * 100) / 100, width: Math.round(box.width * 100) / 100 };
      });
      const body = document.querySelector(".dlg-body") as HTMLElement;
      const foot = document.querySelector(".dlg-foot") as HTMLElement;
      const line = [...document.querySelectorAll("button")].find((button) =>
        (button.textContent || "").includes("+ Line")
      ) as HTMLElement;
      const desc = document.querySelector(".invoice-line-desc") as HTMLElement;
      const bodyBox = body.getBoundingClientRect();
      const footBox = foot.getBoundingClientRect();
      const lineBox = line.getBoundingClientRect();
      const descBox = desc.getBoundingClientRect();
      const inside = (box: DOMRect) =>
        box.height > 8 && box.top >= bodyBox.top - 1 && box.bottom <= bodyBox.bottom + 1;
      const person = document.querySelector('[aria-label="Work Person"]') as HTMLElement;
      const lines = document.querySelector(".invoice-lines") as HTMLElement;
      const personBox = person.getBoundingClientRect();
      const linesTop = lines.getBoundingClientRect().top;
      return {
        ch,
        fields,
        scrollTop: body.scrollTop,
        footClearsBody: footBox.top >= bodyBox.bottom - 1,
        lineInBody: inside(lineBox),
        descInBody: inside(descBox),
        lineClearsDesc: lineBox.top >= descBox.bottom - 2,
        personClearsLines: personBox.height > 8 && personBox.top >= bodyBox.top - 1 && personBox.bottom <= linesTop + 4,
        personBottom: Math.round(personBox.bottom),
        linesTop: Math.round(linesTop),
        bodyHeight: Math.round(bodyBox.height),
        lineTop: Math.round(lineBox.top),
        lineBottom: Math.round(lineBox.bottom),
        bodyBottom: Math.round(bodyBox.bottom),
      };
    }, FIELD_LABELS);
    const xs = form.fields.map((field) => field.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    const widthOf = (label: string) => form.fields.find((field) => field.label === label)!.width;
    report.push({ tag, screen: "invoice-form", ...(await fitNow(page)), spread, ...form });
    expect(spread, `${tag} input left edges ${xs.join(",")}`).toBeLessThanOrEqual(2);
    expect(widthOf("Unit"), tag).toBeGreaterThanOrEqual(8 * form.ch - 1);
    expect(widthOf("Customer P.O."), tag).toBeGreaterThanOrEqual(8 * form.ch - 1);
    expect(widthOf("Custom size"), tag).toBeGreaterThanOrEqual(9 * form.ch - 1);
    expect(widthOf("Paint Supply Co."), tag).toBeGreaterThanOrEqual(9 * form.ch - 1);
    expect(form.scrollTop, tag).toBe(0);
    expect(form.footClearsBody, tag).toBe(true);
    expect(form.personClearsLines, `${tag} person ${form.personBottom} lines ${form.linesTop}`).toBe(true);
    expect(form.descInBody, `${tag} description ${form.bodyBottom}`).toBe(true);
    expect(form.lineClearsDesc, `${tag} + Line ${form.lineTop}`).toBe(true);
    expect(form.lineInBody, `${tag} + Line ${form.lineTop}-${form.lineBottom} body ${form.bodyBottom}`).toBe(true);
    expect((await fitNow(page)).fit, tag).toBe(1);
    await proof(page, `${tag}-invoice-form-fields`);

    await propertyList(page, /2\.\s*Work Order Process/i);
    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
    await expect(page.getByLabel("Order Person")).toBeVisible();
    await waitForFit(page);
    const order = await page.evaluate(() => {
      const body = document.querySelector(".dlg-body") as HTMLElement;
      const label = [...document.querySelectorAll("label")].find((node) =>
        (node.textContent || "").startsWith("Order Person")
      );
      const person = document.getElementById(label?.getAttribute("for") || "") as HTMLElement;
      const bodyBox = body.getBoundingClientRect();
      const box = person.getBoundingClientRect();
      const foot = document.querySelector(".dlg-foot")!.getBoundingClientRect();
      return {
        scrollTop: body.scrollTop,
        personVisible: box.top >= bodyBox.top - 1 && box.bottom <= bodyBox.bottom + 1,
        footClearsBody: foot.top >= bodyBox.bottom - 1,
      };
    });
    report.push({ tag, screen: "work-order", ...(await fitNow(page)), ...order });
    expect(order.scrollTop, tag).toBe(0);
    expect(order.personVisible, tag).toBe(true);
    expect(order.footClearsBody, tag).toBe(true);
    await proof(page, `${tag}-work-order-top`);

    await propertyList(page, /3\.\s*Invoice Process/i);
    await page.keyboard.press("Control+Home");
    await expect(page.getByRole("textbox", { name: "Street" })).toBeVisible();
    await waitForFit(page);
    const propertyEdit = await page.evaluate(() => {
      const body = document.querySelector(".dlg-body") as HTMLElement;
      return { scrollTop: body.scrollTop };
    });
    report.push({ tag, screen: "property-edit", ...(await fitNow(page)), ...propertyEdit });
    expect(propertyEdit.scrollTop, tag).toBe(0);
    await proof(page, `${tag}-property-edit-top`);

    await openMain(page, /5\.\s*Material Process/i);
    await page.getByRole("button", { name: /3\.\s*Material Transaction in Date/i }).click();
    await expect(page.getByText(/Date Order/i).first()).toBeVisible();
    await waitForFit(page);
    const material = await fitNow(page);
    report.push({ tag, screen: "material-date", ...material });
    expect(material.fit, `${tag} material date`).toBe(1);
    await proof(page, `${tag}-material-date`);

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /6\.\s*Job Descriptions/i }).click();
    await expect(page.getByRole("textbox", { name: "Job description 1", exact: true })).toBeVisible();
    await waitForFit(page);
    const jobs = await fitNow(page);
    report.push({ tag, screen: "job-descriptions", ...jobs });
    expect(jobs.fit, `${tag} job descriptions`).toBe(1);
    await proof(page, `${tag}-job-descriptions`);

    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /7\.\s*Unit Size/i }).click();
    await expect(page.getByText("Single", { exact: true })).toBeVisible();
    await waitForFit(page);
    const catalog = await page.evaluate(() => {
      const body = document.querySelector(".catalog-frame .menu-body") as HTMLElement;
      const row = document.querySelector(".catalog-row") as HTMLElement;
      const bodyStyle = getComputedStyle(body);
      const rowStyle = getComputedStyle(row);
      return {
        padLeft: parseFloat(bodyStyle.paddingLeft),
        padRight: parseFloat(bodyStyle.paddingRight),
        gap: parseFloat(rowStyle.columnGap),
      };
    });
    report.push({ tag, screen: "catalog", ...catalog });
    expect(catalog.padLeft, tag).toBe(8);
    expect(catalog.padRight, tag).toBe(8);
    expect([8, 16], tag).toContain(catalog.gap);
    await proof(page, `${tag}-catalog-padding`);

    await openMain(page, /8\.\s*Settings/i);
    await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
    await expect(page.getByText(/Diagnostics/i).first()).toBeVisible();
    await waitForFit(page);
    const diagnostics = await fitNow(page);
    report.push({ tag, screen: "diagnostics", ...diagnostics });
    expect(diagnostics.fit, `${tag} diagnostics`).toBe(1);
    await proof(page, `${tag}-diagnostics`);
  }

  if (PROOF) {
    fs.mkdirSync(PROOF, { recursive: true });
    fs.writeFileSync(path.join(PROOF, "metrics.json"), JSON.stringify(report, null, 2));
  }
});
