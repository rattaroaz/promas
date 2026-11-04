import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { propertyList, waitForFit } from "../support/app";

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

const DROPDOWNS = [
  { list: "Size", text: "Custom size" },
  { list: "Paint Supply Co. list", text: "Paint Supply Co." },
];

async function proof(page: Page, name: string) {
  if (!PROOF) return;
  fs.mkdirSync(PROOF, { recursive: true });
  await page.screenshot({ path: path.join(PROOF, `${name}.png`) });
}

function intersects(
  a: { left: number; right: number; top: number; bottom: number },
  b: { left: number; right: number; top: number; bottom: number }
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test("round 4: invoice rows do not overlap and property text keeps a gap", async ({ page }) => {
  test.setTimeout(180_000);
  const report: unknown[] = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = viewport.tag;

    await propertyList(page, /3\.\s*Invoice Process/i);
    await waitForFit(page);
    const properties = await page.evaluate(() => {
      function textBox(el: HTMLElement) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        if (rects.length === 0) return null;
        return {
          left: Math.min(...rects.map((rect) => rect.left)),
          right: Math.max(...rects.map((rect) => rect.right)),
          top: Math.min(...rects.map((rect) => rect.top)),
          bottom: Math.max(...rects.map((rect) => rect.bottom)),
        };
      }
      const grid = document.querySelector(".content-grid") as HTMLElement;
      const style = getComputedStyle(grid);
      const row = grid.querySelector(".dos-row") as HTMLElement;
      const cells = [...row.children].map((node) => {
        const el = node as HTMLElement;
        const box = el.getBoundingClientRect();
        const text = textBox(el);
        return {
          className: el.className,
          text: (el.textContent || "").replace(/\s+/g, " ").trim(),
          cellLeft: box.left,
          cellRight: box.right,
          textLeft: text?.left ?? box.left,
          textRight: text?.right ?? box.right,
        };
      });
      const gaps = cells.slice(0, -1).map((cell, index) => {
        const next = cells[index + 1];
        return {
          pair: `${cell.text.slice(0, 18)} | ${next.text.slice(0, 18)}`,
          gap: next.textLeft - cell.textRight,
        };
      });
      const contact = row.querySelector(".property-contact") as HTMLElement;
      const contactBox = contact.getBoundingClientRect();
      const street = row.querySelector(".property-street") as HTMLElement;
      const streetStyle = getComputedStyle(street);
      const line = parseFloat(streetStyle.lineHeight) || 1;
      return {
        columnGap: parseFloat(style.columnGap),
        padLeft: parseFloat(style.paddingLeft),
        padRight: parseFloat(style.paddingRight),
        template: grid.style.gridTemplateColumns,
        streetWhiteSpace: streetStyle.whiteSpace,
        streetLines: street.scrollHeight / line,
        streetWidth: street.getBoundingClientRect().width,
        gaps,
        minGap: Math.min(...gaps.map((item) => item.gap)),
        contactRight: contactBox.right,
        viewport: window.innerWidth,
        contactInside: contactBox.right <= window.innerWidth - 8 + 0.5,
        joined: cells.map((cell) => cell.text).join(""),
      };
    });
    report.push({ tag, screen: "properties", ...properties });
    expect(properties.columnGap, tag).toBe(16);
    expect(properties.padLeft, tag).toBe(8);
    expect(properties.padRight, tag).toBe(8);
    expect(properties.streetWhiteSpace, tag).toBe("normal");
    expect(properties.minGap, `${tag} ${JSON.stringify(properties.gaps)}`).toBeGreaterThan(0);
    expect(properties.contactInside, `${tag} contact ${properties.contactRight} viewport ${properties.viewport}`).toBe(true);
    await proof(page, `${tag}-properties`);

    await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
    await page.getByRole("button", { name: "New Invoice" }).click();
    await expect(page.getByLabel("Invoice Date")).toBeVisible();
    await waitForFit(page);
    const form = await page.evaluate(
      ({ labels, dropdowns }) => {
        function boxOf(label: string) {
          const el = document.querySelector(`[aria-label="${label}"]`) as HTMLElement;
          const box = el.getBoundingClientRect();
          return { label, top: box.top, bottom: box.bottom, left: box.left, right: box.right, width: box.width, height: box.height };
        }
        const fields = labels.map(boxOf).sort((a, b) => a.top - b.top || a.left - b.left);
        const pairs = fields.slice(0, -1).map((field, index) => {
          const next = fields[index + 1];
          return {
            pair: `${field.label} -> ${next.label}`,
            overlap: field.bottom - next.top,
            clears: field.bottom <= next.top + 0.5,
          };
        });
        const menus = dropdowns.map((item) => {
          const text = boxOf(item.text);
          const menu = boxOf(item.list);
          const hits =
            text.left < menu.right &&
            text.right > menu.left &&
            text.top < menu.bottom &&
            text.bottom > menu.top;
          return { ...item, text, menu, hits };
        });
        const grid = document.querySelector(".invoice-fields") as HTMLElement;
        const body = document.querySelector(".dlg-body") as HTMLElement;
        const lines = document.querySelector(".invoice-lines") as HTMLElement;
        const summary = document.querySelector(".invoice-summary") as HTMLElement;
        const lineBtn = [...document.querySelectorAll("button")].find((button) =>
          (button.textContent || "").includes("+ Line")
        ) as HTMLElement | undefined;
        const box = (el: HTMLElement | undefined | null) => {
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) };
        };
        return {
          rowGap: parseFloat(getComputedStyle(grid).rowGap),
          autoRows: getComputedStyle(grid).gridAutoRows,
          pairs,
          menus,
          layout: {
            body: box(body),
            fields: box(grid),
            lines: box(lines),
            summary: box(summary),
            line: box(lineBtn ?? null),
            scrollTop: body.scrollTop,
          },
        };
      },
      { labels: FIELD_LABELS, dropdowns: DROPDOWNS }
    );
    report.push({ tag, screen: "invoice-form", ...form });
    expect(form.rowGap, tag).toBe(8);
    expect(form.autoRows, tag).toMatch(/^minmax\([\d.]+px, auto\)$/);
    for (const pair of form.pairs) {
      expect(pair.clears, `${tag} ${pair.pair} overlap ${pair.overlap}`).toBe(true);
    }
    for (const menu of form.menus) {
      expect(menu.hits, `${tag} ${menu.list} intersects ${menu.text.label}`).toBe(false);
      expect(intersects(menu.text, menu.menu), tag).toBe(false);
    }
    await proof(page, `${tag}-invoice-form`);
  }

  if (PROOF) {
    fs.mkdirSync(PROOF, { recursive: true });
    fs.writeFileSync(path.join(PROOF, "metrics.json"), JSON.stringify(report, null, 2));
  }
});
