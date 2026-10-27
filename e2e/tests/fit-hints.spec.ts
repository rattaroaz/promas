import { expect, test, type Page } from "@playwright/test";
import { companyList, home, openMain, propertyList, waitForFit } from "../support/app";

/**
 * Every screen must fit the window, and every status line and key hint must
 * be fully visible. The fit scale is a fixed value per screen, taken from
 * static content. A clipped status line must not be what makes the type fit,
 * and it must not be cut off either. A table may be wider than the window
 * when its own horizontal scroller stays inside the window.
 *
 * Widths are 1280 and 1024. Height 800 is the size where the Workers message
 * at scale 1 is 1991px in a 1280px bar. The main menu is also checked full
 * screen, where the type is largest.
 */

async function clipReport(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const issues: string[] = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const textOf = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
    const rangeBox = (el: Element) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return range.getBoundingClientRect();
    };
    const bars = document.querySelectorAll(".dos-messagebar, .dos-statusbar, .dlg-foot");
    for (const bar of bars) {
      if (bar.closest(".print-preview-overlay")) continue;
      const box = bar.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const text = rangeBox(bar);
      const clipped =
        bar.scrollWidth > bar.clientWidth + 1 ||
        text.right > box.right + 1 ||
        text.left < box.left - 1 ||
        text.right > vw + 1 ||
        box.right > vw + 1;
      if (clipped) {
        issues.push(
          `hint bar clipped "${textOf(bar).slice(0, 100)}" scroll ${Math.round(bar.scrollWidth)} client ${Math.round(bar.clientWidth)} textRight ${Math.round(text.right)} barRight ${Math.round(box.right)}`
        );
      }
      if (bar.classList.contains("dlg-foot")) {
        if (box.top < -1 || box.bottom > vh + 1 || box.left < -1 || box.right > vw + 1) {
          issues.push(
            `dialog hint outside viewport "${textOf(bar).slice(0, 80)}" top ${Math.round(box.top)} bottom ${Math.round(box.bottom)} vh ${vh}`
          );
        }
        const dialog = bar.closest(".dos-dialog");
        if (dialog) {
          const dialogBox = dialog.getBoundingClientRect();
          if (box.bottom > dialogBox.bottom + 1 || box.top < dialogBox.top - 1) {
            issues.push(
              `dialog hint outside dialog "${textOf(bar).slice(0, 80)}" bottom ${Math.round(box.bottom)} dialog ${Math.round(dialogBox.bottom)}`
            );
          }
        }
      }
      if (bar.classList.contains("dos-statusbar")) {
        for (const key of bar.querySelectorAll("button")) {
          const keyBox = key.getBoundingClientRect();
          if (keyBox.width < 2 || keyBox.height < 2) continue;
          const keyText = rangeBox(key);
          if (
            key.scrollWidth > key.clientWidth + 1 ||
            keyText.right > box.right + 1 ||
            keyText.left < box.left - 1 ||
            keyBox.right > vw + 1 ||
            keyBox.left < -1
          ) {
            issues.push(
              `key hint clipped "${textOf(key)}" right ${Math.round(keyBox.right)}`
            );
          }
        }
      }
    }

    const rows = document.querySelectorAll(
      ".browse-grid-header, .dos-row, .workers-head > div, .workers-row > *, .dos-browse-header, .aging-grid"
    );
    const scrollport = (el: Element) => {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const overflow = getComputedStyle(node).overflowX;
        if (overflow === "auto" || overflow === "scroll") return node;
        node = node.parentElement;
      }
      return null;
    };
    for (const el of rows) {
      if (el.closest(".print-preview-overlay")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      if (box.right > vw + 1 || box.left < -1) {
        const port = scrollport(el);
        const portBox = port?.getBoundingClientRect();
        const scrolls =
          port != null &&
          portBox != null &&
          portBox.left >= -1 &&
          portBox.right <= vw + 1 &&
          port.scrollWidth > port.clientWidth + 1;
        if (scrolls) continue;
        issues.push(
          `table overflows viewport "${textOf(el).slice(0, 70)}" right ${Math.round(box.right)} left ${Math.round(box.left)} vw ${vw}`
        );
      }
    }

    for (const cell of document.querySelectorAll(".browse-grid-header > div, .workers-head > div")) {
      if (cell.closest(".print-preview-overlay")) continue;
      if (cell.scrollWidth > cell.clientWidth + 1) {
        issues.push(
          `header text clipped "${textOf(cell)}" scroll ${Math.round(cell.scrollWidth)} client ${Math.round(cell.clientWidth)}`
        );
      }
    }

    const controls = document.querySelectorAll(
      ".dos-dialog input, .dos-dialog button, .dos-dialog select, .dos-dialog textarea, .dos-menu-frame .menu-header, .dos-menu-frame button, .dos-menu-frame pre"
    );
    for (const el of controls) {
      if (el.closest(".print-preview-overlay, .dos-help, .dos-prompt")) continue;
      const box = el.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const name = (el.getAttribute("aria-label") || textOf(el)).slice(0, 60);
      if (box.right > vw + 1 || box.left < -1 || box.bottom > vh + 1 || box.top < -1) {
        issues.push(
          `form overflows viewport "${name}" right ${Math.round(box.right)} bottom ${Math.round(box.bottom)} vw ${vw} vh ${vh}`
        );
      }
      const body = el.closest(".dlg-body");
      if (body) {
        const br = body.getBoundingClientRect();
        if (
          box.right > br.right + 1 ||
          box.left < br.left - 1 ||
          box.bottom > br.bottom + 1 ||
          box.top < br.top - 1
        ) {
          issues.push(
            `form clipped by dialog "${name}" right ${Math.round(box.right)} bottom ${Math.round(box.bottom)} body ${Math.round(br.right)}x${Math.round(br.bottom)}`
          );
        }
      }
    }

    document.querySelectorAll(".dos-menu-frame").forEach((frame) => {
      if (frame.closest(".print-preview-overlay, .dos-help, .dos-prompt")) return;
      const box = frame.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) return;
      if (box.top < -1 || box.bottom > vh + 1 || box.left < -1 || box.right > vw + 1) {
        issues.push(
          `panel overflows viewport top ${Math.round(box.top)} bottom ${Math.round(box.bottom)} vh ${vh}`
        );
      }
    });

    const pre = document.querySelector(".dos-menu-frame pre");
    if (pre) {
      const text = pre.textContent || "";
      const idx = text.indexOf("NOTE:");
      if (idx >= 0) {
        const lineEnd = text.indexOf("\n", idx);
        const noteLength = (lineEnd < 0 ? text.length : lineEnd) - idx;
        const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT);
        let seen = 0;
        let target: Text | null = null;
        let start = 0;
        let current = walker.nextNode();
        while (current) {
          if (current.nodeType === Node.TEXT_NODE) {
            const next = seen + (current.textContent || "").length;
            if (idx < next) {
              target = current as Text;
              start = idx - seen;
              break;
            }
            seen = next;
          }
          current = walker.nextNode();
        }
        if (target) {
          const range = document.createRange();
          range.setStart(target, start);
          range.setEnd(target, Math.min(target.length, start + noteLength));
          const rect = range.getBoundingClientRect();
          const preBox = pre.getBoundingClientRect();
          if (
            rect.height > 0 &&
            (rect.bottom > vh + 1 ||
              rect.top < -1 ||
              rect.bottom > preBox.bottom + 1 ||
              rect.top < preBox.top - 1)
          ) {
            issues.push(
              `diagnostics note clipped bottom ${Math.round(rect.bottom)} pre ${Math.round(preBox.bottom)} vh ${vh}`
            );
          }
        }
      }
    }

    const header = document.querySelector(".dos-menu-frame .menu-header");
    if (header) {
      const box = header.getBoundingClientRect();
      if (box.width > 2 && box.height > 2) {
        const hit = document.elementFromPoint(box.left + box.width / 2, box.top + Math.min(box.height / 2, 8));
        if (hit && !header.contains(hit)) {
          issues.push(
            `title covered "${textOf(header)}" hit "${textOf(hit).slice(0, 40)}"`
          );
        }
      }
    }
    return issues;
  });
}

test("status lines, key hints, and tables fit at 1280 and 1024", async ({ page }) => {
  test.setTimeout(720_000);
  page.setDefaultTimeout(8_000);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  page.on("dialog", (dialog) => {
    void dialog.dismiss();
  });

  const screens: { name: string; open: () => Promise<void> }[] = [
    { name: "Main menu", open: () => home(page) },
    { name: "Estimate gate", open: () => openMain(page, /1\.\s*Estimate Process/i) },
    { name: "Estimate properties", open: () => propertyList(page, /1\.\s*Estimate Process/i) },
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
    { name: "Work order properties", open: () => propertyList(page, /2\.\s*Work Order Process/i) },
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
    { name: "Invoice companies", open: () => companyList(page, /3\.\s*Invoice Process/i) },
    { name: "Invoice properties", open: () => propertyList(page, /3\.\s*Invoice Process/i) },
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
        await expect(page.getByLabel("Invoice Number", { exact: true })).toBeVisible();
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

  const failures: string[] = [];
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    for (const screen of screens) {
      await screen.open();
      await waitForFit(page);
      const issues = await clipReport(page);
      for (const issue of issues) failures.push(`${width} ${screen.name}: ${issue}`);
      if (screen.name === "Material transactions") {
        const msg = await page.locator(".dos-messagebar").innerText();
        if (!/Material Maintenance/.test(msg) || !/Ins=Add/.test(msg) || !/Delete=Void/.test(msg)) {
          failures.push(`${width} material status lost the report title: ${msg}`);
        }
      }
      if (screen.name === "Workers") {
        const msg = await page.locator(".dos-messagebar").innerText();
        if (
          !msg.includes(
            "Active workers appear on new invoices. Deleting one leaves past invoices unchanged."
          )
        ) {
          failures.push(`${width} workers status reworded: ${msg}`);
        }
      }
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
});

test("a long typed value fits, and Delete does not move the scale", async ({ page }) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(8_000);
  const long = "X".repeat(48);
  for (const width of [1280, 1024]) {
    await page.setViewportSize({ width, height: 800 });
    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByRole("button", { name: /Add Work Person/i })).toBeVisible();
    const name = page.getByRole("textbox", { name: /Worker name/i }).first();
    await waitForFit(page);
    const beforeFit = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fit-scale")
    );
    await name.fill(long);
    await waitForFit(page);
    const duringFit = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fit-scale")
    );
    expect(duringFit, `${width} typing a long name changed fit-scale`).toBe(beforeFit);
    const typed = await clipReport(page);
    expect(typed, typed.join("\n")).toEqual([]);
    const del = page.getByRole("button", { name: new RegExp(`Delete ${long}`) });
    await del.click();
    await expect(page.getByLabel("Are you sure? Y/N")).toBeVisible();
    await waitForFit(page);
    const afterFit = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fit-scale")
    );
    expect(afterFit, `${width} Delete click changed fit-scale`).toBe(beforeFit);
    const prompted = await clipReport(page);
    expect(prompted, prompted.join("\n")).toEqual([]);
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Are you sure? Y/N")).toHaveCount(0);
    await waitForFit(page);
    const closed = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fit-scale")
    );
    expect(closed, `${width} dismissing Delete changed fit-scale`).toBe(beforeFit);
    await name.fill("Jose Ramirez");
    await waitForFit(page);
    const restored = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue("--fit-scale")
    );
    expect(restored, `${width} restoring the name changed fit-scale`).toBe(beforeFit);
  }
});

test("the main menu and the copyright under it fit a full-screen window", async ({ page }) => {
  test.setTimeout(60_000);
  const failures: string[] = [];
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1920, height: 1009 },
    { width: 2560, height: 1440 },
  ]) {
    await page.setViewportSize(viewport);
    await home(page);
    await waitForFit(page);
    const size = `${viewport.width}x${viewport.height}`;
    for (const issue of await clipReport(page)) failures.push(`${size}: ${issue}`);
    const spilled = await page.evaluate(() => {
      const wrap = document.querySelector(".dos-main-wrap");
      if (!wrap) return ["no .dos-main-wrap"];
      const box = wrap.getBoundingClientRect();
      return [...wrap.children].flatMap((child) => {
        const r = child.getBoundingClientRect();
        return r.top < box.top - 1 || r.bottom > box.bottom + 1
          ? [`${child.className} spans ${Math.round(r.top)}..${Math.round(r.bottom)}, wrap ${Math.round(box.top)}..${Math.round(box.bottom)}`]
          : [];
      });
    });
    for (const issue of spilled) failures.push(`${size}: ${issue}`);
  }
  expect(failures, failures.join("\n")).toEqual([]);
});
