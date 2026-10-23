import { expect, type Page, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const outRoot = process.env.PROOF_DIR || path.join(os.tmpdir(), "promas_v2162_r3");

async function settleFit(page: Page) {
  await page.waitForFunction(() => {
    const scale = getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim();
    const bag = window as unknown as { __fit?: string };
    const same = bag.__fit === scale;
    bag.__fit = scale;
    return same;
  });
}

async function shot(page: Page, dir: string, name: string) {
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${name}.png` });
}

async function backToMain(page: Page) {
  for (let i = 0; i < 6; i++) {
    if (await page.getByRole("button", { name: /5\.\s*Material Process/i }).isVisible()) return;
    await page.getByRole("button", { name: /^Esc(\s|$)/ }).first().click();
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
    await settleFit(page);

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
          scrollH: (el as HTMLElement).scrollHeight,
          clientH: (el as HTMLElement).clientHeight,
        };
      });
      const controls = [...row.children].map((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top };
      });
      const check = row.querySelector("input[type='checkbox']") as HTMLElement;
      const checkBox = check.getBoundingClientRect();
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const fitScale = getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim();
      const fit = parseFloat(fitScale) || 1;
      const frame = document.querySelector(".workers-frame") as HTMLElement;
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
        columnGap: getComputedStyle(row).columnGap,
        lineHeight: getComputedStyle(frame).lineHeight,
        fitScale,
        checkWidth: checkBox.width,
        checkHeight: checkBox.height,
        nameScroll: name.scrollWidth,
        nameClient: name.clientWidth,
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
    expect(initial.nameScroll, `${tag} Jose Ramirez`).toBeLessThanOrEqual(initial.nameClient + 1);
    expect(initial.columnGap, tag).toBe("16px");
    expect(Math.abs(initial.checkWidth - initial.checkHeight), `${tag} checkbox`).toBeLessThanOrEqual(1);
    for (const cell of initial.headBoxes) {
      if (!cell.text) continue;
      expect(cell.nowrap, `${tag} ${cell.text}`).toBe("nowrap");
      expect(cell.scroll, `${tag} ${cell.text}`).toBeLessThanOrEqual(cell.client + 1);
      expect(cell.scrollH, `${tag} ${cell.text} height`).toBeLessThanOrEqual(cell.clientH + 1);
    }
    const labeled = initial.headBoxes.filter((c) => c.text);
    const tops = labeled.map((c) => c.top);
    expect(Math.max(...tops) - Math.min(...tops), `${tag} header tops`).toBeLessThanOrEqual(2);
    for (let i = 0; i < 3; i++) {
      expect(Math.abs(initial.headLeft[i] - initial.rowLeft[i]), `${tag} col ${i}`).toBeLessThanOrEqual(2);
    }
    await shot(page, dir, "workers-initial");

    const readName = () => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const name = document.querySelector("input[aria-label='Worker name 1']") as HTMLElement;
      const box = name.getBoundingClientRect();
      return {
        fitScale: getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim(),
        value: (name as HTMLInputElement).value,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        nameLeft: box.left,
        nameRight: box.right,
        nameScroll: name.scrollWidth,
        nameClient: name.clientWidth,
        vw: window.innerWidth,
      };
    };
    await page.getByLabel("Worker name 1").fill("Bartholomew Montgomery-Fitzgerald");
    await settleFit(page);
    const named = await page.evaluate(readName);
    expect(named.fitScale, `${tag} 33-char name`).toBe(initial.fitScale);
    expect(named.scrollWidth, tag).toBeLessThanOrEqual(named.clientWidth + 1);
    expect(named.nameRight, tag).toBeLessThanOrEqual(named.vw + 1);
    await page.getByLabel("Worker name 1").fill("X".repeat(48));
    await settleFit(page);
    const longName = await page.evaluate(readName);
    expect(longName.fitScale, `${tag} 48-char name`).toBe(initial.fitScale);
    expect(longName.scrollWidth, tag).toBeLessThanOrEqual(longName.clientWidth + 1);
    expect(longName.nameLeft, tag).toBeGreaterThanOrEqual(-1);
    expect(longName.nameRight, tag).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.scrollWidth, tag).toBe(initial.scrollWidth);
    await shot(page, dir, "workers-longname");
    await page.getByLabel("Worker name 1").fill("Jose Ramirez");
    await settleFit(page);
    const restored = await page.evaluate(readName);
    expect(restored.fitScale, `${tag} restored name`).toBe(initial.fitScale);
    expect(restored.value, tag).toBe("Jose Ramirez");

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
    await page.getByRole("button", { name: /5\.\s*Material Process/i }).click();
    for (const mode of materialModes) {
      await page.getByRole("button", { name: mode.label }).click();
      await expect(page.locator(".dos-browse-body .browse-grid").first()).toBeVisible();
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
    await settleFit(page);
    const before = await page.evaluate(measureToolbar);
    await shot(page, dir, "payroll-before");
    await page.getByRole("button", { name: /^Run$/i }).click();
    await expect(page.getByText("Jose hallway payroll")).toBeVisible();
    await settleFit(page);
    const after = await page.evaluate(measureToolbar);
    await shot(page, dir, "payroll-after");
    expect(before.rows, `${tag} before`).toBe(1);
    expect(after.rows, `${tag} after`).toBe(1);
    expect(Math.abs(before.fit - after.fit), `${tag} fit ${before.fit} -> ${after.fit}`).toBeLessThanOrEqual(0.01);

    report.push({
      viewport: tag,
      workers: initial,
      named,
      longName,
      restored,
      material,
      payroll: { before, after },
    });
  }

  mkdirSync(outRoot, { recursive: true });
  writeFileSync(`${outRoot}/metrics.json`, JSON.stringify(report, null, 2));
  const lines = ["# Promas v2.16.2 round 3", ""];
  for (const row of report) {
    const workers = row.workers as {
      fitScale: string;
      columnGap: string;
      lineHeight: string;
      checkWidth: number;
      checkHeight: number;
      headBoxes: { text: string; scroll: number; client: number; scrollH: number; clientH: number }[];
    };
    const named = row.named as { fitScale: string };
    const longName = row.longName as { fitScale: string };
    const restored = row.restored as { fitScale: string };
    lines.push(`## ${row.viewport}`);
    lines.push("");
    lines.push(`- \`--fit-scale\` stayed \`${workers.fitScale}\` for a 33-character name (\`${named.fitScale}\`), a 48-character name (\`${longName.fitScale}\`), and after restoring Jose Ramirez (\`${restored.fitScale}\`).`);
    lines.push(`- Checkbox is ${workers.checkWidth.toFixed(2)} × ${workers.checkHeight.toFixed(2)} px. Column gap is ${workers.columnGap}. Header line box is ${workers.lineHeight}.`);
    for (const cell of workers.headBoxes) {
      if (!cell.text) continue;
      lines.push(`- Header “${cell.text}” is ${cell.scroll}×${cell.scrollH} inside ${cell.client}×${cell.clientH}.`);
    }
    lines.push("");
  }
  lines.push("Screenshots for 1280×800 and 1024×768 are in the matching folders.");
  writeFileSync(`${outRoot}/REPORT.md`, `${lines.join("\n")}\n`);
});
