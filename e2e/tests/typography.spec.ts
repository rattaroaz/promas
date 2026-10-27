import { expect, test, type Page } from "@playwright/test";
import { companyList, home, openMain, propertyList, waitForFit } from "../support/app";

/**
 * Every element that draws text uses the root face, a size from the type
 * scale, a line height from the same scale, and a normal or bold weight.
 * The scale is read from the tokens in App.css, so retuning a step needs no
 * change here. An element that picks its own size, an inline style, or a
 * browser default such as the <pre> face or the <h3> size fails.
 */

type Sample = {
  what: string;
  family: string;
  size: number;
  leading: number | null;
  weight: string;
};

type Scale = {
  family: string;
  root: number;
  sizes: number[];
  leadings: number[];
};

function readScale(page: Page): Promise<Scale> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const probe = document.createElement("span");
    probe.style.cssText = "position:absolute;visibility:hidden";
    document.body.appendChild(probe);
    const sizes = ["--text-sm", "--text-md", "--text-lg"].map((token) => {
      probe.style.fontSize = `var(${token})`;
      return parseFloat(getComputedStyle(probe).fontSize);
    });
    probe.remove();
    return {
      family: style.fontFamily,
      root: parseFloat(style.fontSize),
      sizes,
      leadings: ["--leading-tight", "--leading-normal", "--leading-loose"].map((token) =>
        parseFloat(style.getPropertyValue(token))
      ),
    };
  });
}

/** Elements with their own visible text, and form controls. */
function sample(page: Page): Promise<Sample[]> {
  return page.evaluate(() => {
    const out: Sample[] = [];
    const glyphless = ["checkbox", "radio", "hidden", "range", "color"];
    for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
      if (el.closest("script, style, option, optgroup, iframe, svg, .print-preview-overlay")) continue;
      const style = getComputedStyle(el);
      if (style.visibility !== "visible") continue;
      let drawn = false;
      if (el.matches("input, select, textarea, button")) {
        if (el instanceof HTMLInputElement && glyphless.includes(el.type)) continue;
        const box = el.getBoundingClientRect();
        drawn = box.width >= 1 && box.height >= 1;
      } else {
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          const range = document.createRange();
          range.selectNodeContents(node);
          const box = range.getBoundingClientRect();
          if (box.width >= 1 && box.height >= 1) {
            drawn = true;
            break;
          }
        }
      }
      if (!drawn) continue;
      const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
      const text = (el.getAttribute("aria-label") || el.textContent || "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 28);
      out.push({
        what: `${el.tagName.toLowerCase()}${classes} "${text}"`,
        family: style.fontFamily,
        size: parseFloat(style.fontSize),
        leading: style.lineHeight === "normal" ? null : parseFloat(style.lineHeight),
        weight: style.fontWeight,
      });
    }
    return out;
  });
}

function problems(scale: Scale, samples: Sample[]): string[] {
  const issues: string[] = [];
  for (const s of samples) {
    if (s.family !== scale.family) issues.push(`${s.what} face ${s.family}`);
    if (!scale.sizes.some((size) => Math.abs(size - s.size) <= 0.05)) {
      issues.push(`${s.what} size ${(s.size / scale.root).toFixed(3)}× root`);
    }
    if (s.leading === null) {
      issues.push(`${s.what} line-height normal`);
    } else if (!scale.leadings.some((step) => Math.abs(step * s.size - s.leading!) <= 1)) {
      issues.push(`${s.what} line height ${(s.leading / s.size).toFixed(3)}× size`);
    }
    if (s.weight !== "400" && s.weight !== "700") issues.push(`${s.what} weight ${s.weight}`);
  }
  return issues;
}

function styleKey(scale: Scale, s: Sample): string {
  const leading = s.leading === null ? "normal" : (s.leading / s.size).toFixed(3);
  return `${s.family} | ${(s.size / scale.root).toFixed(3)}× root | leading ${leading} | weight ${s.weight}`;
}

function listScreens(names: Set<string>): string {
  const shown = [...names].slice(0, 4).join(", ");
  return names.size > 4 ? `${shown}, …` : shown;
}

test("every screen draws text from the one type scale", async ({ page }) => {
  test.setTimeout(480_000);
  page.setDefaultTimeout(8_000);
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  page.on("dialog", (dialog) => {
    void dialog.dismiss();
  });

  const screens: { name: string; open: () => Promise<void> }[] = [
    { name: "Main menu", open: () => home(page) },
    {
      name: "Help",
      open: async () => {
        await home(page);
        await page.keyboard.press("F1");
        await expect(page.getByText(/Function Key Description/)).toBeVisible();
      },
    },
    {
      name: "Quit prompt",
      open: async () => {
        await home(page);
        await page.keyboard.press("Escape");
        await expect(page.locator(".dos-prompt")).toBeVisible();
      },
    },
    { name: "Estimate gate", open: () => openMain(page, /1\.\s*Estimate Process/i) },
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
    {
      name: "Work order edit",
      open: async () => {
        await propertyList(page, /2\.\s*Work Order Process/i);
        await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
        await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
        await expect(page.locator(".dlg-title")).toBeVisible();
      },
    },
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
    {
      name: "Backup database",
      open: async () => {
        await openMain(page, /8\.\s*Settings/i);
        await page.getByRole("button", { name: /3\.\s*Backup Database/i }).click();
        await expect(page.getByText(/Current database:/i)).toBeVisible();
      },
    },
    {
      name: "Diagnostics",
      open: async () => {
        await openMain(page, /8\.\s*Settings/i);
        await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
        await expect(page.getByText(/recent logs/i)).toBeVisible();
      },
    }
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  const issues = new Map<string, Set<string>>();
  const inUse = new Map<string, { count: number; example: string; screens: Set<string> }>();
  const roots: string[] = [];
  for (const screen of screens) {
    await screen.open();
    await waitForFit(page);
    const scale = await readScale(page);
    roots.push(`${screen.name}: ${scale.root.toFixed(2)}px`);
    const samples = await sample(page);
    for (const s of samples) {
      const key = styleKey(scale, s);
      const row = inUse.get(key) ?? { count: 0, example: s.what, screens: new Set<string>() };
      row.count++;
      row.screens.add(screen.name);
      inUse.set(key, row);
    }
    for (const issue of problems(scale, samples)) {
      if (!issues.has(issue)) issues.set(issue, new Set());
      issues.get(issue)!.add(screen.name);
    }
  }

  const summary = [...inUse.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([key, row]) => `${key}  ×${row.count}  e.g. ${row.example} [${listScreens(row.screens)}]`);
  await test.info().attach("type-in-use.txt", { body: summary.join("\n"), contentType: "text/plain" });
  await test.info().attach("root-size-by-screen.txt", { body: roots.join("\n"), contentType: "text/plain" });
  const report = [...issues.entries()].map(([issue, names]) => `${issue}  [${listScreens(names)}]`);
  expect(report, `Type in use:\n${summary.join("\n")}\n\nOff the scale:\n${report.join("\n")}`).toEqual([]);
});

test("the main menu and Workers draw text at the same size in every window", async ({ page }) => {
  const rootSize = async () => {
    await waitForFit(page);
    return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
  };
  for (const [width, height] of [
    [1024, 700],
    [1280, 720],
    [1366, 768],
    [1600, 900],
    [1920, 1009],
    [1920, 1080],
  ] as const) {
    await page.setViewportSize({ width, height });
    await home(page);
    const main = await rootSize();
    await openMain(page, /7\.\s*Miscellaneous/i);
    await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
    await expect(page.getByRole("button", { name: /Add Work Person/i })).toBeVisible();
    expect(await rootSize(), `Workers at ${width}×${height}, main menu ${main}px`).toBeCloseTo(main, 1);
  }
});

test("printed reports use the print size, whatever the window and fit scale", async ({ page }) => {
  const printed: number[] = [];
  const screen: number[] = [];
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    await openMain(page, /6\.\s*Reports Menu/i);
    await page.getByRole("button", { name: /Open Receivables Aging/i }).click();
    await waitForFit(page);
    screen.push(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize)));
    await page.emulateMedia({ media: "print" });
    for (const fit of ["", "0.6"]) {
      printed.push(
        await page.evaluate((value) => {
          const root = document.documentElement;
          const before = root.style.getPropertyValue("--fit-scale");
          if (value) root.style.setProperty("--fit-scale", value);
          const size = parseFloat(getComputedStyle(root).fontSize);
          if (value) {
            if (before) root.style.setProperty("--fit-scale", before);
            else root.style.removeProperty("--fit-scale");
          }
          return size;
        }, fit)
      );
    }
    await page.emulateMedia({ media: "screen" });
  }
  expect(screen[0], "screen type stays 18px in every window").toBeCloseTo(18, 0);
  expect(screen[1], "screen type stays 18px in every window").toBeCloseTo(18, 0);
  for (const size of printed) expect(size, `printed sizes ${printed.join(", ")}`).toBeCloseTo(printed[0], 2);
  expect(printed[0], "paper stays off the screen size").not.toBeCloseTo(18, 0);
});
