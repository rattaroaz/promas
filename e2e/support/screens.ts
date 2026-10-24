import { expect, type Page } from "@playwright/test";
import { companyList, home, openMain, propertyList } from "./app";

/** Every screen the whole-app audits walk, and how to reach it from a fresh load. */
export type Screen = { name: string; open: (page: Page) => Promise<void> };

const REPORTS = [
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

export const SCREENS: Screen[] = [
  { name: "Main menu", open: (page) => home(page) },
  { name: "Estimate gate", open: (page) => openMain(page, /1\.\s*Estimate Process/i) },
  {
    name: "Estimate properties",
    open: (page) => propertyList(page, /1\.\s*Estimate Process/i),
  },
  {
    name: "Estimate list",
    open: async (page) => {
      await propertyList(page, /1\.\s*Estimate Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await expect(page.getByText(/1 proposals/i)).toBeVisible();
    },
  },
  {
    name: "Estimate edit",
    open: async (page) => {
      await propertyList(page, /1\.\s*Estimate Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await page.getByRole("button", { name: /EST-1/i }).click();
      await expect(page.locator(".dlg-title")).toContainText("Proposal");
    },
  },
  { name: "Work order gate", open: (page) => openMain(page, /2\.\s*Work Order Process/i) },
  {
    name: "Work order properties",
    open: (page) => propertyList(page, /2\.\s*Work Order Process/i),
  },
  {
    name: "Work order list",
    open: async (page) => {
      await propertyList(page, /2\.\s*Work Order Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await expect(page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i })).toBeVisible();
    },
  },
  {
    name: "Work order edit",
    open: async (page) => {
      await propertyList(page, /2\.\s*Work Order Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await page.getByRole("button", { name: /7\s+02\/01\/2026|A1/i }).click();
      await expect(page.locator(".dlg-title")).toBeVisible();
    },
  },
  { name: "Invoice gate", open: (page) => openMain(page, /3\.\s*Invoice Process/i) },
  {
    name: "Invoice companies",
    open: (page) => companyList(page, /3\.\s*Invoice Process/i),
  },
  {
    name: "Invoice properties",
    open: (page) => propertyList(page, /3\.\s*Invoice Process/i),
  },
  {
    name: "Property edit",
    open: async (page) => {
      await propertyList(page, /3\.\s*Invoice Process/i);
      await page.getByRole("button", { name: "Ctrl-Home" }).click();
      await expect(page.getByRole("textbox", { name: "Property NO" })).toBeVisible();
    },
  },
  {
    name: "Invoice list",
    open: async (page) => {
      await propertyList(page, /3\.\s*Invoice Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await expect(page.getByText(/1 invoices/i)).toBeVisible();
    },
  },
  {
    name: "Invoice edit",
    open: async (page) => {
      await propertyList(page, /3\.\s*Invoice Process/i);
      await page.getByRole("button", { name: /01\s+Bldg A/i }).click();
      await page.getByRole("button", { name: /^Ins Add$/i }).click();
      await expect(page.getByLabel("Invoice Number", { exact: true })).toBeVisible();
    },
  },
  { name: "Cash gate", open: (page) => openMain(page, /4\.\s*Cash Receipts Process/i) },
  {
    name: "Cash ledger",
    open: async (page) => {
      await companyList(page, /4\.\s*Cash Receipts Process/i);
      await page.getByRole("button", { name: /1000\s+ACME/i }).click();
      await expect(page.getByText(/Unpaid Total|Open/i).first()).toBeVisible();
    },
  },
  {
    name: "Cash payment",
    open: async (page) => {
      await companyList(page, /4\.\s*Cash Receipts Process/i);
      await page.getByRole("button", { name: /1000\s+ACME/i }).click();
      await page.getByRole("button", { name: /^Ins Add$/i }).click();
      await expect(page.getByLabel(/Amount Paid/i).first()).toBeVisible();
    },
  },
  { name: "Material menu", open: (page) => openMain(page, /5\.\s*Material Process/i) },
  {
    name: "Material transactions",
    open: async (page) => {
      await openMain(page, /5\.\s*Material Process/i);
      await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
      await expect(page.locator(".dos-searchline input")).toBeVisible();
    },
  },
  {
    name: "Material edit",
    open: async (page) => {
      await openMain(page, /5\.\s*Material Process/i);
      await page.getByRole("button", { name: /1\.\s*Material Transaction/i }).click();
      await page.getByRole("button", { name: /^Ins Add$/i }).click();
      await expect(page.getByRole("textbox", { name: "Amount" })).toBeVisible();
    },
  },
  {
    name: "Worker wages",
    open: async (page) => {
      await openMain(page, /5\.\s*Material Process/i);
      await page.getByRole("button", { name: /5\.\s*Worker Wages/i }).click();
      await expect(page.getByText(/Worker Wages/i).first()).toBeVisible();
    },
  },
  { name: "Reports menu", open: (page) => openMain(page, /6\.\s*Reports Menu/i) },
  ...REPORTS.map((label): Screen => ({
    name: `Report ${label}`,
    open: async (page) => {
      await openMain(page, /6\.\s*Reports Menu/i);
      await page.getByRole("button", { name: new RegExp(label, "i") }).click();
      await expect(page.getByRole("button", { name: /1\.\s*Payroll Report/i })).toHaveCount(0);
    },
  })),
  { name: "Miscellaneous", open: (page) => openMain(page, /7\.\s*Miscellaneous/i) },
  {
    name: "Change system date",
    open: async (page) => {
      await openMain(page, /7\.\s*Miscellaneous/i);
      await page.getByRole("button", { name: /1\.\s*Change System Date/i }).click();
      await expect(page.locator("input").first()).toBeVisible();
    },
  },
  {
    name: "Form management",
    open: async (page) => {
      await openMain(page, /7\.\s*Miscellaneous/i);
      await page.getByRole("button", { name: /3\.\s*Form Management/i }).click();
      await expect(page.getByText(/Form/i).first()).toBeVisible();
    },
  },
  {
    name: "Workers",
    open: async (page) => {
      await openMain(page, /7\.\s*Miscellaneous/i);
      await page.getByRole("button", { name: /5\.\s*Workers/i }).click();
      await expect(page.getByRole("button", { name: /Add Work Person/i })).toBeVisible();
    },
  },
  { name: "Settings", open: (page) => openMain(page, /8\.\s*Settings/i) },
  {
    name: "Diagnostics",
    open: async (page) => {
      await openMain(page, /8\.\s*Settings/i);
      await page.getByRole("button", { name: /5\.\s*Diagnostics/i }).click();
      await expect(page.getByText(/Diagnostic/i).first()).toBeVisible();
    },
  },
];
