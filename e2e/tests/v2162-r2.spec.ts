import { expect, type Page, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const outRoot = "artifacts/promas_v2162_r2";

async function shot(page: Page, dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function backToMain(page: Page) {
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole("button", { name: /5\.\s*Material Process/i }).isVisible()) return;
    await page.keyboard.press("Escape");
    await page.waitForTimeout(80);
  }
}

test("round 2 gate at 1280 and 1024", async ({ page }) => {
  test.setTimeout(180_000);
  const report: Record<string, unknown>[] = [];

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    const tag = `${viewport.width}x${viewport.height}`;
    const dir = `${outRoot}/${tag}`;
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.getByRole("button", { name: /7\.\s*Miscellaneous/i }).click();
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByLabel("Worker name 1")).toHaveValue("Jose Ramirez");

    const initial = await page.evaluate(() => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const head = document.querySelector(".workers-head") as HTMLElement;
      const row = document.querySelector(".workers-row") as HTMLElement;
      const del = row.querySelector("button") as HTMLElement;
      const name = row.querySelector("input[aria-label^='Worker name']") as HTMLElement;
      const id = row.querySelector("input[aria-label^='Worker number']") as HTMLElement;
      const box = del.getBoundingClientRect();
      const headBoxes = [...head.children].map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const style = getComputedStyle(el as HTMLElement);
        return {
          text: (el.textContent || "").trim(),
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          height: r.height,
          nowrap: style.whiteSpace,
          scroll: (el as HTMLElement).scrollWidth,
          client: (el as HTMLElement).clientWidth,
        };
      });
      const controls = [...row.children].map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
      const gaps: number[] = [];
      for (let i = 1; i < controls.length; i++) {
        gaps.push(Math.round((controls[i].left - controls[i - 1].right) * 100) / 100);
      }
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fit-scale")) || 1;
      return {
        fit,
        font: parseFloat(getComputedStyle(name).fontSize),
        root,
        overflowX: getComputedStyle(scroll).overflowX,
        overflowY: getComputedStyle(scroll).overflowY,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        deleteText: del.textContent,
        deleteRight: box.right,
        deleteLeft: box.left,
        vw: window.innerWidth,
        headBoxes,
        gaps,
        nameWidth: name.getBoundingClientRect().width,
        idWidth: id.getBoundingClientRect().width,
        headLeft: [...head.children].map((el) => (el as HTMLElement).getBoundingClientRect().left),
        rowLeft: controls.map((c) => c.left),
      };
    });

    expect(initial.overflowX, tag).toBe("hidden");
    expect(initial.overflowY, tag).toBe("scroll");
    expect(initial.scrollWidth, tag).toBeLessThanOrEqual(initial.clientWidth + 1);
    expect(initial.deleteText, tag).toBe("Delete");
    expect(initial.deleteRight, tag).toBeLessThanOrEqual(initial.vw + 1);
    expect(initial.deleteLeft, tag).toBeGreaterThanOrEqual(-1);
    expect(initial.font, tag).toBeCloseTo(initial.root * 1.5, 1);
    for (const cell of initial.headBoxes) {
      if (!cell.text) continue;
      expect(cell.nowrap, `${tag} ${cell.text}`).toBe("nowrap");
      expect(cell.scroll, `${tag} ${cell.text}`).toBeLessThanOrEqual(cell.client + 1);
    }
    const labeled = initial.headBoxes.filter((c) => c.text);
    const tops = labeled.map((c) => c.top);
    expect(Math.max(...tops) - Math.min(...tops), `${tag} header tops`).toBeLessThanOrEqual(2);
    const gapSpread = Math.max(...initial.gaps) - Math.min(...initial.gaps);
    expect(gapSpread, `${tag} gaps ${initial.gaps.join(",")}`).toBeLessThanOrEqual(2);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(initial.headLeft[i] - initial.rowLeft[i]), `${tag} col ${i}`).toBeLessThanOrEqual(2);
    }
    await shot(page, dir, "workers-initial");

    await page.getByLabel("Worker name 1").fill("Montgomery-Fitzgerald");
    const longName = await page.evaluate(() => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const name = document.querySelector("input[aria-label='Worker name 1']") as HTMLElement;
      const box = name.getBoundingClientRect();
      return {
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        nameLeft: box.left,
        nameRight: box.right,
        vw: window.innerWidth,
      };
    });
    expect(longName.scrollWidth, tag).toBeLessThanOrEqual(longName.clientWidth + 1);
    expect(longName.nameLeft, tag).toBeGreaterThanOrEqual(-1);
    expect(longName.nameRight, tag).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.scrollWidth, tag).toBe(initial.scrollWidth);
    await shot(page, dir, "workers-longname");
    await page.getByLabel("Worker name 1").fill("Jose Ramirez");

    for (let i = 0; i < 8; i++) {
      await page.getByRole("button", { name: "Add Work Person" }).click();
    }
    const names = page.locator("input[aria-label^='Worker name']");
    const widthSpread = await names.evaluateAll((els) => {
      const widths = els.map((el) => Math.round(el.getBoundingClientRect().width * 100) / 100);
      return Math.max(...widths) - Math.min(...widths);
    });
    expect(widthSpread, tag).toBeLessThanOrEqual(1);
    const scroll = page.locator(".workers-scroll");
    await scroll.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    const header = await page.locator(".workers-head").evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { top: box.top, bottom: box.bottom, text: el.textContent };
    });
    expect(header.top, tag).toBeGreaterThanOrEqual(0);
    expect(header.bottom, tag).toBeGreaterThan(header.top);
    expect(header.text).toContain("Active?");
    expect(header.text).toContain("ID number");
    await shot(page, dir, "workers-scrolled");

    await backToMain(page);
    const materialModes = [
      { label: /1\.\s*Material Transaction \(Add,Modification\)/i, shot: "material-default" },
      { label: /3\.\s*Material Transaction in Date/i, shot: "material-date" },
      { label: /4\.\s*Material Transaction in Descript/i, shot: "material-desc" },
    ];
    const material: Record<string, unknown>[] = [];
    for (const mode of materialModes) {
      await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
      await page.getByRole("button", { name: mode.label }).click();
      await expect(page.getByRole("button", { name: /Jose drop cloths/i })).toBeVisible();
      const cells = await page.evaluate(() => {
        return [...document.querySelectorAll(".dos-browse-body .browse-grid > div")].map((el) => {
          const node = el as HTMLElement;
          return {
            text: (node.innerText || "").replace(/\s+/g, " ").trim(),
            scroll: node.scrollWidth,
            client: node.clientWidth,
          };
        });
      });
      for (const cell of cells) {
        expect(cell.scroll, `${tag} ${mode.shot} ${cell.text}`).toBeLessThanOrEqual(cell.client + 1);
      }
      material.push({ mode: mode.shot, cells });
      await shot(page, dir, mode.shot);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /1\.\s*Material Transaction/i })).toBeVisible();
    }

    await backToMain(page);
    await page.getByRole("button", { name: /6\.\s*Reports Menu/i }).click();
    await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
    const measureToolbar = () => {
      const bar = document.querySelector(".payroll-toolbar") as HTMLElement;
      const fit =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fit-scale")) || 1;
      const bits = [...bar.querySelectorAll("label, input, select, button")].map((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return { top: Math.round(box.top), text: (el.textContent || "").trim() };
      });
      const tops = bits.map((b) => b.top);
      const min = Math.min(...tops);
      const rows = new Set(tops.map((t) => Math.round((t - min) / 8))).size;
      return { fit, rows, height: bar.getBoundingClientRect().height, bits };
    };
    const before = await page.evaluate(measureToolbar);
    await shot(page, dir, "payroll-before");
    await page.getByRole("button", { name: /^Run$/i }).click();
    await expect(page.getByText("Jose hallway payroll")).toBeVisible();
    const after = await page.evaluate(measureToolbar);
    await shot(page, dir, "payroll-after");
    expect(before.rows, `${tag} before`).toBe(1);
    expect(after.rows, `${tag} after`).toBe(1);
    expect(Math.abs(before.fit - after.fit), `${tag} fit ${before.fit} -> ${after.fit}`).toBeLessThanOrEqual(0.01);

    report.push({ viewport: tag, workers: initial, longName, material, payroll: { before, after } });
  }

  mkdirSync(outRoot, { recursive: true });
  writeFileSync(`${outRoot}/metrics.json`, JSON.stringify(report, null, 2));
});
