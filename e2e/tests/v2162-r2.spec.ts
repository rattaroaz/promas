import { expect, test } from "@playwright/test";
import { attachJson, backToMain, openMain, saveWorkPerson, shot, waitForFit } from "../support/app";

test("round 2 gate at 1280 and 1024", async ({ page }) => {
  test.setTimeout(180_000);
  const report: Record<string, unknown>[] = [];

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    const tag = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByLabel("Worker name 1")).toHaveText("Jose Ramirez");
    await waitForFit(page);

    const initial = await page.evaluate(() => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const head = document.querySelector(".workers-head") as HTMLElement;
      const row = document.querySelector(".workers-row") as HTMLElement;
      const del = [...row.querySelectorAll("button")].find(
        (button) => (button.textContent || "").trim() === "Delete"
      ) as HTMLElement;
      const name = row.querySelector("[aria-label^='Worker name']") as HTMLElement;
      const id = row.querySelector("[aria-label^='Worker number']") as HTMLElement;
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
    expect(initial.font, tag).toBeCloseTo(initial.root, 1);
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
    await shot(page, `${tag}-workers-initial`);

    const readName = () => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const name = document.querySelector("[aria-label='Worker name 1']") as HTMLElement;
      const box = name.getBoundingClientRect();
      return {
        fitScale: getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim(),
        value: (name.textContent || "").trim(),
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        nameLeft: box.left,
        nameRight: box.right,
        nameScroll: name.scrollWidth,
        nameClient: name.clientWidth,
        vw: window.innerWidth,
      };
    };
    await saveWorkPerson(page, { name: "Bartholomew Montgomery-Fitzgerald" }, "Jose Ramirez");
    await waitForFit(page);
    const named = await page.evaluate(readName);
    expect(named.fitScale, `${tag} 33-char name`).toBe(initial.fitScale);
    expect(named.scrollWidth, tag).toBeLessThanOrEqual(named.clientWidth + 1);
    expect(named.nameRight, tag).toBeLessThanOrEqual(named.vw + 1);
    let current = "Bartholomew Montgomery-Fitzgerald";
    for (const ordinary of ["Maria Gonzalez", "Christopher Johnson", "Alexander Montgomery-Smith"]) {
      await saveWorkPerson(page, { name: ordinary }, current);
      current = ordinary;
      await waitForFit(page);
      const fitted = await page.evaluate((value) => {
        const name = document.querySelector("[aria-label='Worker name 1']") as HTMLElement;
        const probe = document.createElement("span");
        probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(name).font};`;
        probe.textContent = value;
        document.body.appendChild(probe);
        const text = probe.getBoundingClientRect().width;
        probe.remove();
        return {
          text,
          field: name.getBoundingClientRect().width,
          scroll: name.scrollWidth,
          client: name.clientWidth,
        };
      }, ordinary);
      expect(fitted.field, `${tag} ${ordinary}`).toBeGreaterThanOrEqual(fitted.text - 1);
      expect(fitted.scroll, `${tag} ${ordinary}`).toBeLessThanOrEqual(fitted.client + 1);
    }
    const long = "X".repeat(48);
    await saveWorkPerson(page, { name: long }, current);
    await waitForFit(page);
    const longName = await page.evaluate(() => {
      const scroll = document.querySelector(".workers-scroll") as HTMLElement;
      const head = document.querySelector(".workers-head") as HTMLElement;
      const row = document.querySelector(".workers-row") as HTMLElement;
      const name = document.querySelector("[aria-label='Worker name 1']") as HTMLElement;
      const del = [...row.querySelectorAll("button")].find(
        (button) => (button.textContent || "").trim() === "Delete"
      ) as HTMLElement;
      const active = head.children[0] as HTMLElement;
      const idHead = head.children[2] as HTMLElement;
      const nameBox = name.getBoundingClientRect();
      const delBox = del.getBoundingClientRect();
      const activeBox = active.getBoundingClientRect();
      const idBox = idHead.getBoundingClientRect();
      const doc = document.documentElement;
      return {
        fitScale: getComputedStyle(document.documentElement).getPropertyValue("--fit-scale").trim(),
        overflowX: getComputedStyle(scroll).overflowX,
        scrollWidth: scroll.scrollWidth,
        clientWidth: scroll.clientWidth,
        nameLeft: nameBox.left,
        nameRight: nameBox.right,
        activeLeft: activeBox.left,
        activeRight: activeBox.right,
        idRight: idBox.right,
        deleteLeft: delBox.left,
        deleteRight: delBox.right,
        docScroll: doc.scrollWidth,
        vw: window.innerWidth,
      };
    });
    expect(longName.fitScale, `${tag} 48-char name`).toBe(initial.fitScale);
    expect(longName.overflowX, `${tag} 48-char name`).toBe("hidden");
    expect(longName.scrollWidth, `${tag} 48-char name`).toBeLessThanOrEqual(longName.clientWidth + 1);
    expect(longName.docScroll, `${tag} 48-char name`).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.nameLeft, `${tag} 48-char name`).toBeGreaterThanOrEqual(-1);
    expect(longName.nameRight, `${tag} 48-char name`).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.activeLeft, `${tag} 48-char name`).toBeGreaterThanOrEqual(-1);
    expect(longName.activeRight, `${tag} 48-char name`).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.idRight, `${tag} 48-char name`).toBeLessThanOrEqual(longName.vw + 1);
    expect(longName.deleteLeft, `${tag} 48-char name`).toBeGreaterThanOrEqual(-1);
    expect(longName.deleteRight, `${tag} 48-char name`).toBeLessThanOrEqual(longName.vw + 1);
    await expect(page.getByLabel("Worker name 1")).toHaveCSS("text-overflow", "ellipsis");
    await shot(page, `${tag}-workers-longname`);
    await saveWorkPerson(page, { name: "Jose Ramirez" }, long);
    await waitForFit(page);
    const restored = await page.evaluate(readName);
    expect(restored.fitScale, `${tag} restored name`).toBe(initial.fitScale);
    expect(restored.value, tag).toBe("Jose Ramirez");

    for (let i = 0; i < 8; i++) {
      await saveWorkPerson(page, { name: `Added Worker ${i}`, workerId: String(1000 + i) });
    }
    const names = page.locator("[aria-label^='Worker name']");
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
    await shot(page, `${tag}-workers-scrolled`);

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
      await shot(page, `${tag}-${mode.shot}`);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("button", { name: /1\.\s*Material Transaction/i })).toBeVisible();
    }

    // Reload so the workers added for the scroll check are not in this list.
    await openMain(page, /6\.\s*Reports Menu/i);
    await page.getByRole("button", { name: /1\.\s*Payroll Report/i }).click();
    const measureToolbar = () => {
      const bar = document.querySelector(".payroll-toolbar") as HTMLElement;
      const root = document.documentElement;
      const fit =
        parseFloat(getComputedStyle(root).getPropertyValue("--fit-scale")) || 1;
      const bits = [...bar.querySelectorAll("label, input, select, button")].map((el) => {
        const box = (el as HTMLElement).getBoundingClientRect();
        return {
          top: Math.round(box.top),
          right: Math.round(box.right),
          text: ((el as HTMLElement).getAttribute("aria-label") || el.textContent || "").trim(),
        };
      });
      const tops = bits.map((b) => b.top);
      const min = Math.min(...tops);
      const rows = new Set(tops.map((t) => Math.round((t - min) / 8))).size;
      return {
        fit,
        fitScale: getComputedStyle(root).getPropertyValue("--fit-scale").trim() || "1",
        rows,
        height: bar.getBoundingClientRect().height,
        scrollWidth: bar.scrollWidth,
        clientWidth: bar.clientWidth,
        bits,
        vw: window.innerWidth,
      };
    };
    await expect(page.getByLabel("Work person search").locator("option")).toHaveText([
      "All",
      "Jose Ramirez",
    ]);
    await waitForFit(page);
    const before = await page.evaluate(measureToolbar);
    await shot(page, `${tag}-payroll-before`);
    await page.getByRole("button", { name: /^Run$/i }).click();
    await expect(page.getByText("Jose hallway payroll")).toBeVisible();
    await waitForFit(page);
    const after = await page.evaluate(measureToolbar);
    await shot(page, `${tag}-payroll-after`);
    // Dividing a measured width by fit-scale hid 0.8535 at 1024. The scale itself is 1.
    expect(before.fit, `${tag} payroll --fit-scale`).toBe(1);
    expect(before.fitScale, `${tag} payroll --fit-scale`).toBe("1");
    expect(after.fit, `${tag} payroll --fit-scale after Run`).toBe(1);
    expect(after.fitScale, `${tag} payroll --fit-scale after Run`).toBe("1");
    expect(before.scrollWidth, `${tag} payroll toolbar`).toBeLessThanOrEqual(before.clientWidth + 1);
    expect(after.scrollWidth, `${tag} payroll toolbar after Run`).toBeLessThanOrEqual(after.clientWidth + 1);
    for (const bit of [...before.bits, ...after.bits]) {
      expect(bit.right, `${tag} ${bit.text}`).toBeLessThanOrEqual(viewport.width + 1);
    }

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

  await attachJson("metrics.json", report);
});
