import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { InvoiceProcess } from "./InvoiceProcess";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";
import {
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
    vi.mocked(api.listWorkPersons).mockResolvedValue(["Jose Ramirez"]);
    vi.mocked(api.saveWorkPerson).mockImplementation(async (name: string) => {
      const n = name.trim();
      return n ? ["Jose Ramirez", n].filter((v, i, a) => a.indexOf(v) === i) : ["Jose Ramirez"];
    });
    vi.mocked(api.deleteWorkPerson).mockResolvedValue([]);
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
  });

  it("loads invoices for the selected property", async () => {
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/1 invoices/i)).toBeInTheDocument();
    expect(screen.getByText(/Inv#\s+PO/i)).toBeInTheDocument();
    expect(screen.getByText(/Unit\s+Size/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /PO-441/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /A1\s+1\+1/i })).toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens existing invoice for edit", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /A1/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 1\s+PO-441/i)).toBeInTheDocument();
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
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Invoice Number/i)).toHaveValue(2);
    const dateInput = document.querySelector(
      'input[type="date"]'
    ) as HTMLInputElement;
    expect(dateInput.value).toBe(new Date().toISOString().slice(0, 10));
    expect(api.getSysdata).toHaveBeenCalled();
  });

  it("opens a new invoice form from the New Invoice button", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Invoice Number/i)).toHaveValue(2);
    expect(api.getSysdata).toHaveBeenCalled();
  });

  it("opens a new invoice when the Ins status hint is clicked", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).toBeInTheDocument();
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

  it("leaves price empty until size is entered for a preset description", async () => {
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
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(null);
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "1+1");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(245);
  });

  it("updates preset price when size changes", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    await user.selectOptions(
      await screen.findByLabelText("Line 1 description"),
      INTERIOR_PAINT_WALL_CLOSET
    );
    const size = screen.getByLabelText(/^Size$/i);
    await user.selectOptions(size, "single");
    expect(screen.getByLabelText("Custom size")).toHaveAttribute("readonly");
    expect(screen.getByLabelText("Custom size")).toHaveValue("single");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(220);
    await user.selectOptions(size, "");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(null);
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "4+2");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(545);
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
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(null);
    await user.type(screen.getByLabelText(/Price 1/i), "75.50");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(75.5);
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
    expect(values).toEqual(["", "single", "1+1", "2+1", "2+2", "3+2", "4+2"]);
    expect(screen.getByLabelText("Custom size")).not.toHaveAttribute("readonly");
    const desc = screen.getByLabelText("Line 1 description");
    const descriptions = Array.from(desc.querySelectorAll("option")).map(
      (o) => o.getAttribute("value") ?? ""
    );
    expect(descriptions).toEqual([
      "",
      INTERIOR_PAINT_WALL_CLOSET,
      PAINTING_OF_CEILING,
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

  it("places WorkDate and WorkPerson labels over their line fields", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(screen.getByText("WorkDate")).toBeInTheDocument();
    expect(screen.getByText("WorkPerson")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 work date")).toBeInTheDocument();
    expect(screen.getByLabelText("Line 1 work person")).toBeInTheDocument();
  });

  it("lets the user pick, type, save, and delete work person names", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    const pick = await screen.findByLabelText("Line 1 work person");
    expect(Array.from(pick.querySelectorAll("option")).map((o) => o.textContent)).toEqual(
      [" ", "Jose Ramirez"]
    );
    await user.selectOptions(pick, "Jose Ramirez");
    expect(screen.getByLabelText("Line 1 work person name")).toHaveValue(
      "Jose Ramirez"
    );

    await user.clear(screen.getByLabelText("Line 1 work person name"));
    await user.type(screen.getByLabelText("Line 1 work person name"), "Ana Cruz");
    await user.tab();
    expect(api.saveWorkPerson).toHaveBeenCalledWith("Ana Cruz");

    await user.selectOptions(
      screen.getByLabelText("Line 1 work person"),
      "Jose Ramirez"
    );
    await user.click(
      screen.getByRole("button", { name: /Remove Jose Ramirez from list/i })
    );
    expect(
      screen.getByText(/Remove "Jose Ramirez" from Work Person list/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(api.deleteWorkPerson).toHaveBeenCalledWith("Jose Ramirez");
    expect(screen.getByLabelText("Line 1 work person name")).toHaveValue("");
  });

  it("fills a fixed kitchen cabinet price without using size", async () => {
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
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(130);
    await user.selectOptions(screen.getByLabelText(/^Size$/i), "4+2");
    expect(screen.getByLabelText(/Price 1/i)).toHaveValue(130);
  });

  it("activates new-invoice status hints when they are clicked", async () => {
    const user = userEvent.setup();
    renderApp(
      <InvoiceProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 invoices/i);
    await user.click(screen.getByRole("button", { name: /^New Invoice$/i }));
    expect(await screen.findByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^F1 Help$/i }));
    expect(screen.getByText(/\*\*\* Function Key Description \*\*\*/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^OK$/i }));

    await user.click(screen.getByRole("button", { name: /^Ctrl-W Save$/i }));
    expect(
      screen.getAllByText(/Is This Data Correct \? \(Y\/N\)/i).length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^N$/i }));

    await user.click(screen.getByRole("button", { name: /^Esc Cancel$/i }));
    expect(screen.queryByText(/Invoice No\.\.\.\.\.\.\.\. 2/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^New Invoice$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Esc Exit$/i })).toBeInTheDocument();
  });
});
