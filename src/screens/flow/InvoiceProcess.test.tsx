import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { InvoiceProcess, descriptionRowCount, siteHeaderLines } from "./InvoiceProcess";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";
import {
  COLOR_CHANGE_CEILING_SWISS_COFFEE,
  COLOR_CHANGE_WALLS_NAVAJO_WHITE,
  INTERIOR_PAINT_WALL_CLOSET,
  PAINTING_OF_CEILING,
  PAINT_BASE_BOARD,
  PAINT_ALL_ENAMEL_SURFACES,
  PAINT_KITCHEN_CABINET_BOTH,
  PAINT_KITCHEN_CABINET_INSIDE,
  PAINT_KITCHEN_CABINET_OUTSIDE,
  PAINT_OVER_CABINETS_PRIMER_INSIDE,
  PAINT_OVER_CABINETS_PRIMER_OUTSIDE,
  PLASTIC_COVERING_OF_FLOOR,
  TWO_TONE_COLORS,
  TWO_TONE_HASHED_HUE,
  VARNISH_KITCHEN_CABINET,
} from "../../lib/invoiceLinePresets";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listInvoices: vi.fn(),
      getInvoice: vi.fn(),
      listEmployees: vi.fn(),
      listWorkTypes: vi.fn(),
      listWorkPersons: vi.fn(),
      saveWorkPerson: vi.fn(),
      deleteWorkPerson: vi.fn(),
      listPaintSupplyCos: vi.fn(),
      savePaintSupplyCo: vi.fn(),
      deletePaintSupplyCo: vi.fn(),
      getSysdata: vi.fn(),
      saveInvoice: vi.fn(),
      voidInvoice: vi.fn(),
    },
  };
});

const company = { ...emptyCompany(), companyNo: "1000", name: "ACME" };
const property = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" };

const fixture = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesUnit: "A1",
  salesSize: "1+1",
  salesTotal: 250,
  balance: 250,
  custPoNo: "PO-441",
};

describe("InvoiceProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listInvoices).mockResolvedValue([fixture]);
    vi.mocked(api.listEmployees).mockResolvedValue([]);
    vi.mocked(api.listWorkTypes).mockResolvedValue([]);
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    vi.mocked(api.saveWorkPerson).mockImplementation(async (person) => [person]);
    vi.mocked(api.deleteWorkPerson).mockResolvedValue([]);
    vi.mocked(api.listPaintSupplyCos).mockResolvedValue(["Dunn-Edwards"]);
    vi.mocked(api.savePaintSupplyCo).mockImplementation(async (name: string) => {
      const n = name.trim();
      return n
        ? ["Dunn-Edwards", n].filter((v, i, a) => a.indexOf(v) === i)
        : ["Dunn-Edwards"];
    });
    vi.mocked(api.deletePaintSupplyCo).mockResolvedValue([]);
    vi.mocked(api.getSysdata).mockResolvedValue({
      company: "Test",
      address1: "",
      address2: "",
      city: "",
      zip: "",
      closeDate: null,
      nextInvoice: 2,
      nextOrder: 1,
      nextEstimate: 1,
      termsDays: 7,
      interestRate: 1.5,
    });
    vi.mocked(api.getInvoice).mockResolvedValue({ invoice: fixture, lines: [] });
    vi.mocked(api.saveInvoice).mockResolvedValue(1);
    vi.mocked(api.voidInvoice).mockResolvedValue(undefined);
  });

  it("loads invoices for the selected property", async () => {
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/1 invoices/i)).toBeInTheDocument();
    const header = document.querySelector(".browse-grid-header");
    expect(header?.textContent).toContain("Inv#");
    expect(header?.textContent).toContain("PO");
    expect(header?.textContent).toContain("Size");
    expect(header?.textContent).toContain("Total");
    expect(screen.getByRole("button", { name: /Unit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toBeInTheDocument();
    
    // Header and rows share one content-sized grid.
    expect(header).toHaveClass("browse-grid");
    expect(header?.closest(".content-grid")).toHaveStyle({
      gridTemplateColumns: "repeat(9, max-content)",
    });
    
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({
        companyNo: "1000",
        proNo: "01",
        includeVoided: true,
      })
    );
  });

  it("opens existing invoice for edit", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /A1/i }));
    expect(await screen.findByText(/Invoice Number 1\s+PO-441/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Invoice Number")).toHaveValue("1");
    await waitFor(() => {
      expect(api.getInvoice).toHaveBeenCalled();
    });
  });

  it("opens a new invoice form from Ins with date and number filled", async () => {
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByLabelText("Invoice Number")).toHaveValue("2");
    expect(screen.getByText(/Invoice Number 2/i)).toBeInTheDocument();
    const dateInput = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;
    expect(dateInput.value).toBe(new Date().toISOString().slice(0, 10));
    expect(screen.getByLabelText("Order Date")).toHaveValue(dateInput.value);
    expect(api.getSysdata).toHaveBeenCalled();
  });

  it("saves material costs and paint supply company", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const cost = await screen.findByLabelText("Material Costs");
    const supplier = screen.getByLabelText("Paint Supply Co.");
    await user.clear(cost);
    await user.type(cost, "42.5");
    await user.type(supplier, "Kelly-Moore");
    await user.click(screen.getByRole("button", { name: /^Ctrl-S Save$/i }));
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.saveInvoice).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: expect.objectContaining({
            materialCost: 42.5,
            paintSupplyCo: "Kelly-Moore",
          }),
        })
      );
      expect(api.savePaintSupplyCo).toHaveBeenCalledWith("Kelly-Moore");
    });
  });

  it("lets the user pick a previous paint supply company from the list", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const list = await screen.findByLabelText("Paint Supply Co. list");
    await user.selectOptions(list, "Dunn-Edwards");
    expect(screen.getByLabelText("Paint Supply Co.")).toHaveValue("Dunn-Edwards");
  });

  it("does not let invoice processing delete a paint supply company", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    await user.selectOptions(
      await screen.findByLabelText("Paint Supply Co. list"),
      "Dunn-Edwards"
    );
    expect(
      screen.queryByRole("button", { name: /Remove .* from list/i })
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Remove "Dunn-Edwards"/i)).not.toBeInTheDocument();
    expect(api.deletePaintSupplyCo).not.toHaveBeenCalled();
  });

  it("opens a new invoice form from the New Invoice button", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(await screen.findByLabelText("Invoice Number")).toHaveValue("2");
    expect(screen.getByText(/Invoice Number 2/i)).toBeInTheDocument();
    expect(api.getSysdata).toHaveBeenCalled();
  });

  it("opens a new invoice when the Ins status hint is clicked", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(await screen.findByLabelText("Invoice Number")).toHaveValue("2");
  });

  it("goes back when the Esc status hint is clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={onBack} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^Esc Exit$/i }));
    expect(onBack).toHaveBeenCalled();
  });

  it("fills a preset description price from size and leaves Occupied blank", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const desc = await screen.findByLabelText("Line 1 description");
    await user.selectOptions(desc, INTERIOR_PAINT_WALL_CLOSET);
    expect(screen.getByLabelText("Line 1 custom text")).toHaveAttribute(
      "readonly"
    );
    expect(screen.getByLabelText("Line 1 custom text")).toHaveValue(
      INTERIOR_PAINT_WALL_CLOSET
    );
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("220.00");
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "1+1");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("245.00");
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "Occupied");
    expect(screen.getByLabelText("Custom size")).toHaveValue("Occupied");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("");
  });

  it("fills Painting of Ceiling price and description from the list", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    await user.selectOptions(
      await screen.findByLabelText("Line 1 description"),
      PAINTING_OF_CEILING
    );
    expect(screen.getByLabelText("Line 1 custom text")).toHaveValue(
      PAINTING_OF_CEILING
    );
    const invoiceDate = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;
    expect(screen.getByLabelText("Line 1 work date")).toHaveValue(
      invoiceDate.value
    );
    // No size yet: single-unit price, not a blank box.
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("75.00");
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "1+1");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("115.00");
    expect(screen.getByLabelText("Line 1 custom text")).toHaveValue(
      PAINTING_OF_CEILING
    );
  });

  it("allows a custom description and a manually edited price", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(screen.getByLabelText("Line 1 description")).toHaveValue("");
    expect(screen.getByLabelText("Line 1 custom text")).not.toHaveAttribute(
      "readonly"
    );
    await user.type(
      screen.getByLabelText("Line 1 custom text"),
      "Touch up hallway"
    );
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "1+1");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("");
    await user.type(screen.getByLabelText(/Price 1/i), "75.50");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("75.50");
    await user.tab();
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("75.50");
    expect(screen.getByLabelText("Line 1 custom text")).toHaveValue(
      "Touch up hallway"
    );
    expect(screen.queryByLabelText(/^Code 1$/i)).not.toBeInTheDocument();
  });

  it("offers only the specified size options", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const size = await screen.findByLabelText(/^Size$/i);
    const values = Array.from(size.querySelectorAll("option")).map(
      (o) => o.getAttribute("value") ?? ""
    );
    expect(values).toEqual([
      "",
      "single",
      "1+1",
      "2+1",
      "2+2",
      "3+2",
      "4+2",
      "Occupied",
    ]);
    expect(screen.getByLabelText("Custom size")).not.toHaveAttribute("readonly");
    expect(size).toHaveClass("dos-choice");
    expect(screen.getByLabelText("Line 1 description")).toHaveClass("dos-choice");
    expect(screen.getByLabelText("Work Person list")).toHaveClass("dos-choice");
    const desc = screen.getByLabelText("Line 1 description");
    const descriptions = Array.from(desc.querySelectorAll("option")).map(
      (o) => o.getAttribute("value") ?? ""
    );
    expect(descriptions).toEqual([
      "",
      INTERIOR_PAINT_WALL_CLOSET,
      COLOR_CHANGE_WALLS_NAVAJO_WHITE,
      PAINTING_OF_CEILING,
      COLOR_CHANGE_CEILING_SWISS_COFFEE,
      PAINT_BASE_BOARD,
      PLASTIC_COVERING_OF_FLOOR,
      PAINT_ALL_ENAMEL_SURFACES,
      TWO_TONE_COLORS,
      TWO_TONE_HASHED_HUE,
      PAINT_KITCHEN_CABINET_INSIDE,
      PAINT_KITCHEN_CABINET_OUTSIDE,
      PAINT_KITCHEN_CABINET_BOTH,
      VARNISH_KITCHEN_CABINET,
      PAINT_OVER_CABINETS_PRIMER_INSIDE,
      PAINT_OVER_CABINETS_PRIMER_OUTSIDE,
    ]);
  });

  it("places WorkDate over line fields and Work Person on the invoice", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(screen.getByText("WorkDate")).toBeInTheDocument();
    expect(screen.getByLabelText("Work Person")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 work date")).toBeInTheDocument();
    expect(screen.queryByLabelText("Line 1 work person")).not.toBeInTheDocument();
  });

  it("formats a typed price to cents on blur and Enter", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const price = await screen.findByLabelText(/Price 1/i);
    await user.type(price, "100");
    expect(price).toHaveValue("100");
    await user.tab();
    expect(price).toHaveValue("100.00");

    const cost = screen.getByLabelText("Material Costs");
    await user.clear(cost);
    await user.type(cost, "432");
    await user.keyboard("{Enter}");
    expect(cost).toHaveValue("432.00");
    await user.clear(cost);
    await user.tab();
    expect(cost).toHaveValue("");
  });

  it("lists only active workers and does not add a typed name", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
      { name: "Inactive Ian", workerNo: "9", active: false },
    ]);
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const pick = await screen.findByLabelText("Work Person list");
    expect(Array.from(pick.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      [" ", "Jose Ramirez"]
    );
    await user.type(screen.getByLabelText("Work Person"), "Custom Pat");
    await user.tab();
    expect(api.saveWorkPerson).not.toHaveBeenCalled();
    expect(Array.from(pick.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      [" ", "Jose Ramirez"]
    );
    expect(screen.getByLabelText("Work Person")).toHaveValue("Custom Pat");
  });

  it("keeps a deleted worker's name on an existing invoice", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Ana Cruz", workerNo: "15", active: true },
    ]);
    vi.mocked(api.getInvoice).mockResolvedValue({
      invoice: fixture,
      lines: [
        {
          companyNo: "1000",
          proNo: "01",
          salesDate: "2026-01-15",
          invoice: 1,
          lineNo: 1,
          codeNo: "*",
          description: "Hallway",
          workDate: "2026-01-15",
          workType: "P",
          price: 220,
          empNo: "Jose Ramirez",
          empPrice: 0,
          commission: 65,
          status: "",
        },
      ],
    });
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await user.click(await screen.findByRole("button", { name: /PO-441/i }));
    expect(await screen.findByLabelText("Work Person")).toHaveValue("Jose Ramirez");
    expect(
      Array.from(
        screen.getByLabelText("Work Person list").querySelectorAll("option")
      ).map((o) => o.textContent)
    ).toEqual([" ", "Ana Cruz"]);
  });

  it("lets the user pick, type, and save work person names", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const pick = await screen.findByLabelText("Work Person list");
    expect(Array.from(pick.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      [" ", "Jose Ramirez"]
    );
    await user.selectOptions(pick, "Jose Ramirez");
    expect(screen.getByLabelText("Work Person")).toHaveValue("Jose Ramirez");

    await user.clear(screen.getByLabelText("Work Person"));
    await user.type(screen.getByLabelText("Work Person"), "Ana Cruz");
    await user.tab();
    expect(api.saveWorkPerson).not.toHaveBeenCalled();
    expect(
      Array.from(
        screen.getByLabelText("Work Person list").querySelectorAll("option")
      ).map((o) => o.textContent)
    ).toEqual([" ", "Jose Ramirez"]);
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();
  });

  it("fills kitchen cabinet and color-change prices from the description", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    await user.selectOptions(
      await screen.findByLabelText("Line 1 description"),
      PAINT_KITCHEN_CABINET_INSIDE
    );
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("130.00");
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "4+2");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("130.00");
    await user.selectOptions(
      screen.getByLabelText("Line 1 description"),
      COLOR_CHANGE_CEILING_SWISS_COFFEE
    );
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue("156.00");
  });

  it("bolds outstanding invoices and not paid ones", async () => {
    const paid = {
      ...fixture,
      invoice: 8,
      balance: 0,
      payTotal: 250,
      custPoNo: "PAID-8",
    };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, paid]);
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/2 invoices/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toHaveClass(
      "invoice-open"
    );
    expect(screen.getByRole("button", { name: /PAID-8/i })).toHaveClass(
      "invoice-paid"
    );
  });

  it("shows only the focused invoice when opened from invoice-number search", async () => {
    const older = {
      ...fixture,
      invoice: 9,
      salesDate: "2025-06-01",
      custPoNo: "PO-9",
    };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, older]);
    renderApp(
      <InvoiceProcess
        company={company}
        property={property}
        onBack={vi.fn()}
        focusInvoice={9}
      />
    );
    expect(await screen.findByText(/1 invoices/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-9/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /PO-441/i })).not.toBeInTheDocument();
  });

  it("saves a new invoice after Ctrl-S confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    await user.type(screen.getByLabelText("Work Person"), "Ana Cruz");
    await user.click(screen.getByRole("button", { name: /^\+ Line$/i }));
    await user.click(screen.getByRole("button", { name: /^Ctrl-S Save$/i }));
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.saveInvoice).toHaveBeenCalled();
    });
    expect(api.saveWorkPerson).not.toHaveBeenCalled();
    expect(api.saveInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({
          companyNo: "1000",
          proNo: "01",
          invoice: 2,
        }),
        lines: [
          expect.objectContaining({ empNo: "Ana Cruz" }),
          expect.objectContaining({ empNo: "Ana Cruz" }),
        ],
      })
    );
  });

  it("voids the selected invoice after Del confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^Del Void$/i }));
    expect(screen.getByText(/Do you want Void/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.voidInvoice).toHaveBeenCalledWith(
        "1000",
        "01",
        "2026-01-15",
        1
      );
    });
  });

  it("lists every invoice for the property and skips other sites", async () => {
    const older = {
      ...fixture,
      salesDate: "2024-06-01",
      invoice: 9,
      custPoNo: "OLD-9",
      voided: true,
    };
    const otherSite = {
      ...fixture,
      proNo: "02",
      invoice: 3,
      custPoNo: "OTHER",
    };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, older, otherSite]);
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/2 invoices/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /OLD-9/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /OTHER/i })).not.toBeInTheDocument();
  });

  it("shows an empty-state when the property has no invoices", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(
      await screen.findByText(/No invoices for this property/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^New Invoice$/i })).toBeInTheDocument();
  });

  it("cycles unit sort through null → asc → desc → null", async () => {
    const inv2 = { ...fixture, invoice: 2, salesUnit: "10", custPoNo: "PO-2" };
    const inv3 = { ...fixture, invoice: 3, salesUnit: "2", custPoNo: "PO-3" };
    const inv4 = { ...fixture, invoice: 4, salesUnit: "1A", custPoNo: "PO-4" };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, inv2, inv3, inv4]);
    
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    
    await screen.findByText(/4 invoices/i);
    
    // Original loaded order (null)
    const rows = screen.getAllByRole("button").filter(btn => 
      btn.textContent?.includes("PO-")
    );
    expect(rows[0].textContent).toContain("A1");
    expect(rows[1].textContent).toContain("10");
    expect(rows[2].textContent).toContain("2");
    expect(rows[3].textContent).toContain("1A");
    
    const unitHeader = screen.getByRole("button", { name: /Unit/i });
    expect(unitHeader.textContent).toBe("Unit");
    expect(screen.getByText(/4 invoices.*Ins=Add/i)).toBeInTheDocument();
    
    // First click: ascending
    await user.click(unitHeader);
    
    const sortedRowsAsc = screen.getAllByRole("button").filter(btn => 
      btn.textContent?.includes("PO-")
    );
    expect(sortedRowsAsc[0].textContent).toContain("1A");
    expect(sortedRowsAsc[1].textContent).toContain("2");
    expect(sortedRowsAsc[2].textContent).toContain("10");
    expect(sortedRowsAsc[3].textContent).toContain("A1");
    expect(unitHeader.textContent).toContain("^");
    expect(screen.getByText(/Sorted by unit, ascending/i)).toBeInTheDocument();
    
    // Second click: descending
    await user.click(unitHeader);
    
    const sortedRowsDesc = screen.getAllByRole("button").filter(btn => 
      btn.textContent?.includes("PO-")
    );
    expect(sortedRowsDesc[0].textContent).toContain("A1");
    expect(sortedRowsDesc[1].textContent).toContain("10");
    expect(sortedRowsDesc[2].textContent).toContain("2");
    expect(sortedRowsDesc[3].textContent).toContain("1A");
    expect(unitHeader.textContent).toContain("v");
    expect(screen.getByText(/Sorted by unit, descending/i)).toBeInTheDocument();
    
    // Third click: back to original order (null)
    await user.click(unitHeader);
    
    const restoredRows = screen.getAllByRole("button").filter(btn => 
      btn.textContent?.includes("PO-")
    );
    expect(restoredRows[0].textContent).toContain("A1");
    expect(restoredRows[1].textContent).toContain("10");
    expect(restoredRows[2].textContent).toContain("2");
    expect(restoredRows[3].textContent).toContain("1A");
    expect(unitHeader.textContent).toBe("Unit");
    expect(screen.getByText(/4 invoices.*Ins=Add/i)).toBeInTheDocument();
  });

  it("uses equal column tracks and keeps alignment across Unit sort states", async () => {
    const inv2 = { ...fixture, invoice: 2, salesUnit: "10", custPoNo: "PO-2" };
    vi.mocked(api.listInvoices).mockResolvedValue([fixture, inv2]);
    
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    
    await screen.findByText(/2 invoices/i);
    
    const grid = document.querySelector(".content-grid");
    const header = grid?.querySelector(".browse-grid-header");
    const firstRow = grid?.querySelector(".dos-row.browse-grid");
    
    expect(header).toHaveClass("browse-grid");
    expect(firstRow).toHaveClass("browse-grid");
    expect(grid).toHaveStyle({
      gridTemplateColumns: "repeat(9, max-content)",
    });
    expect(header?.closest(".content-grid")).toBe(grid);
    expect(firstRow?.closest(".content-grid")).toBe(grid);
    
    const unitHeader = screen.getByRole("button", { name: /Unit/i });
    
    // Click to sort ascending - grid should remain
    await user.click(unitHeader);
    expect(header).toHaveClass("browse-grid");
    expect(firstRow).toHaveClass("browse-grid");
    
    // Click to sort descending - grid should remain
    await user.click(unitHeader);
    expect(header).toHaveClass("browse-grid");
    expect(firstRow).toHaveClass("browse-grid");
    
    // Click to restore original order - grid should remain
    await user.click(unitHeader);
    expect(header).toHaveClass("browse-grid");
    expect(firstRow).toHaveClass("browse-grid");
  });

  it("activates new-invoice status hints when they are clicked", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(await screen.findByLabelText("Invoice Number")).toHaveValue("2");

    await user.click(screen.getByRole("button", { name: /^F1 Help$/i }));
    expect(screen.getByText(/\*\*\* Function Key Description \*\*\*/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^OK$/i }));

    await user.click(screen.getByRole("button", { name: /^Ctrl-S Save$/i }));
    expect(
      screen.getAllByText(/Is This Data Correct \? \(Y\/N\)/i).length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^N$/i }));

    await user.click(screen.getByRole("button", { name: /^Esc Cancel$/i }));
    expect(screen.queryByLabelText("Invoice Number")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^New Invoice$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Esc Exit$/i })).toBeInTheDocument();
  });

  it("keeps the invoice number read-only", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const number = await screen.findByLabelText("Invoice Number");
    expect(number).toHaveAttribute("type", "text");
    expect(number).toHaveAttribute("readonly");
    await user.type(number, "99");
    expect(number).toHaveValue("2");
    expect(screen.getByText(/Invoice Number 2/i)).toBeInTheDocument();
    expect(screen.queryByText(/Invoice Number 99/i)).not.toBeInTheDocument();
  });

  it("does not show Order Person on the invoice", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(await screen.findByLabelText("Invoice Number")).toBeInTheDocument();
    expect(screen.queryByText(/Order Person/i)).not.toBeInTheDocument();
  });

  it("lays the site header out in order and skips empty fields", async () => {
    const co = {
      ...company,
      name: "MESA MANAGEMENT COMPANY",
      contact: "office@mesa.example",
      phone4: "(714) 851-0999",
    };
    const site = {
      ...property,
      name: "HEATHER APARTMENTS",
      street: "19609 SHERMAN WAY SUITE 100",
      city: "RESEDA",
      state: "CA",
      zip: "91335",
      phone: "(818) 349-8191",
      phone2: "(818) 445-5443",
      manager: "MARIA GONZALEZ",
      contact: "MARIA GONZALEZ",
      keyInfo: "*2424",
      comment1: "Pick up key from the rental office.",
      comment2: "Lock box 1984 on the front gate.",
    };
    renderApp(
      <InvoiceProcess company={co} property={site} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    const header = document.querySelector(".invoice-site-header");
    expect(header).not.toBeNull();
    const lines = [...(header?.children ?? [])].map((el) => el.textContent);
    expect(lines).toEqual([
      "MESA MANAGEMENT COMPANY, HEATHER APARTMENTS",
      "19609 SHERMAN WAY SUITE 100, RESEDA, CA, 91335",
      "Entry code: *2424, Lock box code: 1984",
      "Contact: MARIA GONZALEZ, Email: office@mesa.example",
      "Cell phone: (818) 445-5443, Phone: (818) 349-8191, Fax: (714) 851-0999",
      "Comments: Pick up key from the rental office. Lock box 1984 on the front gate.",
    ]);
    expect(lines.join("\n")).not.toMatch(/,\s*(,|$)/);
    expect(lines.some((line) => line === "")).toBe(false);
    const facts = [...(header?.querySelectorAll(".invoice-fact") ?? [])].map(
      (el) => el.textContent
    );
    expect(facts).toContain("Fax: (714) 851-0999");
    expect(facts).toContain("RESEDA, ");
    expect(facts).toContain("CA, ");
    expect(header?.querySelector(".invoice-fact")).toHaveClass("invoice-fact");
  });

  it("does not throw when company memo and fax are missing", () => {
    const partial = { ...company } as Partial<typeof company>;
    delete partial.memo;
    delete partial.phone4;
    delete partial.phone3;
    expect(
      siteHeaderLines(partial as typeof company, {
        ...property,
        state: "",
        phone: "(818) 555-0100",
      })
    ).toEqual(["ACME, Bldg A", "Phone: (818) 555-0100"]);
  });

  it("omits blank site-header lines when only some fields are filled", () => {
    const lines = siteHeaderLines(
      { ...company, name: "ACME", contact: "", phone4: "" },
      {
        ...property,
        name: "Bldg A",
        street: "1 Main",
        city: "",
        state: "",
        zip: "",
        phone: "(818) 555-0100",
        phone2: "",
        manager: "",
        contact: "",
        keyInfo: "",
        pageMap: "",
        comment1: "",
        comment2: "",
        memo: "",
      }
    );
    expect(lines).toEqual([
      "ACME, Bldg A",
      "1 Main",
      "Phone: (818) 555-0100",
    ]);
    expect(lines.join(" ")).not.toMatch(/,\s*,|,\s*$/);
  });

  it("shows page map as the lock box code when it is filled", async () => {
    const site = {
      ...property,
      keyInfo: "*2424",
      pageMap: "LB 1984",
      comment2: "Lock box 9999 on the front gate.",
    };
    renderApp(
      <InvoiceProcess company={company} property={site} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    const lines = [
      ...(document.querySelector(".invoice-site-header")?.children ?? []),
    ].map((el) => el.textContent);
    expect(lines.some((line) => line?.includes("Entry code: *2424"))).toBe(true);
    expect(lines.some((line) => line?.includes("Lock box code: LB 1984"))).toBe(
      true
    );
    expect(lines.join(" ")).not.toContain("Lock box code: 9999");
    expect(lines.join(" ")).not.toContain("Building entry");
  });

  it("shows the Lock Box field and the gate code, and skips an email page map", () => {
    const lines = siteHeaderLines(company, {
      ...property,
      keyInfo: "*2424",
      paintTime: "5555",
      pageMap: "maria@acme.example",
      comment1: "",
      comment2: "Lock box 1984 on the front gate.",
    });
    expect(lines).toContain("Entry code: *2424, Lock box code: 5555");
    expect(lines.join(" ")).not.toContain("maria@acme.example");
    expect(lines.join(" ")).not.toContain("Lock box code: 1984");
  });

  it("does not read the gate code as a lock box", () => {
    const lines = siteHeaderLines(company, {
      ...property,
      name: "Bldg A",
      street: "1 Main",
      keyInfo: "lock box 7777",
      paintTime: "",
      pageMap: "maria@acme.example",
      comment1: "",
      comment2: "",
      phone: "",
      phone2: "",
      manager: "",
      contact: "",
    });
    expect(lines).toContain("Entry code: lock box 7777");
    expect(lines.join(" ")).not.toContain("Lock box code");
  });

  it("keeps the full description and sizes rows from the on-screen width", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const custom = await screen.findByLabelText("Line 1 custom text");
    expect(custom.tagName).toBe("TEXTAREA");
    expect(custom).toHaveClass("invoice-line-desc");
    expect(custom).not.toHaveAttribute("maxlength");
    expect(document.querySelector(".invoice-edit .invoice-site-header")).toBeNull();

    const wide = "Paint the hallway closet doors and baseboards in this unit today.";
    expect(wide.length).toBeGreaterThan(62);
    expect(descriptionRowCount(wide, 62)).toBe(2);
    expect(descriptionRowCount(wide, wide.length)).toBe(1);
    expect(descriptionRowCount("x".repeat(63), 62)).toBe(2);

    await user.type(custom, wide);
    expect(custom).toHaveValue(wide);
    expect(
      screen.queryByRole("button", { name: /Remove .* from list/i })
    ).not.toBeInTheDocument();
  });
});
