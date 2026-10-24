import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import {
  CompanyPropertyGate,
  DEFAULT_PROPERTY_SORT,
  formatPropertySearchRow,
  INVOICE_SITE_BROWSE,
  nextPropertyNo,
  nextPropertySort,
  PROPERTY_BROWSE_GLOBAL,
  PROPERTY_BROWSE_WITH_NAME,
  sortProperties,
} from "./CompanyPropertyGate";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCompanies: vi.fn(),
      listProperties: vi.fn(),
      listInvoices: vi.fn(),
      getCompany: vi.fn(),
      saveCompany: vi.fn(),
      nextCompanyNo: vi.fn(),
      saveProperty: vi.fn(),
      deleteCompany: vi.fn(),
    },
  };
});

const company = {
  ...emptyCompany(),
  companyNo: "1000",
  name: "ACME",
  contact: "ELAINE",
};

const property = {
  ...emptyProperty("1000"),
  proNo: "01",
  name: "Bldg A",
  street: "1105 MAPLE ST.",
  city: "NEWPORT BEACH",
  zip: "92660",
  contact: "MARIA",
  manager: "MARIA",
};

describe("nextPropertyNo", () => {
  it("zero-pads the next number to the width of existing numbers", () => {
    expect(nextPropertyNo(["01", "02"])).toBe("03");
    expect(nextPropertyNo(["02", "01"])).toBe("03");
    expect(nextPropertyNo(["01", "02", "LOT-A"])).toBe("03");
    expect(nextPropertyNo([])).toBe("1");
    expect(nextPropertyNo(["100"])).toBe("101");
  });
});

describe("formatPropertySearchRow", () => {
  it("keeps three spaces between every column and does not clip the street", () => {
    const row = formatPropertySearchRow(property, false);
    expect(row).toMatch(/^01 {3,}/);
    expect(row).toContain("   Bldg A");
    expect(row).toContain("1105 MAPLE ST.");
    expect(row).toContain("NEWPORT BEACH");
    expect(row).toMatch(/92660 {8}MARIA/);
    expect(row.includes("ELAINE")).toBe(false);
    expect(row.includes("01Bldg")).toBe(false);
  });

  it("keeps all 45 characters of the street ahead of city", () => {
    const street = "14755 NORTH VENTURA CANYON AVENUE BUILDING A1";
    expect(street).toHaveLength(45);
    const row = formatPropertySearchRow(
      {
        ...property,
        street,
        city: "SHERMAN OAKS",
        zip: "91403",
      },
      false
    );
    expect(row).toContain(street);
    expect(row.indexOf(street)).toBeLessThan(row.indexOf("SHERMAN OAKS"));
    const longCity = "RANCHO SANTA MARGARITA";
    const wide = formatPropertySearchRow(
      { ...property, city: longCity },
      false
    );
    expect(wide).toContain(longCity);
    expect(row.endsWith("MARIA") || row.includes("MARIA")).toBe(true);
  });
});

describe("CompanyPropertyGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([company]);
    vi.mocked(api.listProperties).mockResolvedValue([property]);
    vi.mocked(api.getCompany).mockResolvedValue(company);
    vi.mocked(api.saveCompany).mockResolvedValue("1001");
    vi.mocked(api.nextCompanyNo).mockResolvedValue("1001");
    vi.mocked(api.saveProperty).mockResolvedValue(undefined);
    vi.mocked(api.deleteCompany).mockResolvedValue(undefined);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
  });

  it("shows company search for invoice process", () => {
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    expect(screen.getByRole("textbox", { name: "Company NO" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company Name" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company Phone" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company Contact" })).toBeInTheDocument();
    const invoiceNo = screen.getByRole("textbox", { name: "Invoice Number" });
    const companyNo = screen.getByRole("textbox", { name: "Company NO" });
    expect(
      invoiceNo.compareDocumentPosition(companyNo) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(invoiceNo).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Property Street" })).toHaveClass(
      "w45"
    );
    expect(screen.getByRole("textbox", { name: "Property Contact" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("? = first")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company NO" })).toHaveValue("?");
    expect(screen.getAllByText(/Invoice Process/i).length).toBeGreaterThan(0);
  });

  it("lists companies with ? and selects into property search", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const companyNo = screen.getByPlaceholderText("? = first");
    await user.clear(companyNo);
    await user.type(companyNo, "?{Enter}");

    expect(await screen.findByRole("button", { name: /1000\s+ACME/i })).toBeInTheDocument();
    expect(screen.getByText(/Contact/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ELAINE/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /1000\s+ACME/i }));

    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /MARIA/i })).toBeInTheDocument();
    expect(screen.queryByText("Co.Contact")).not.toBeInTheDocument();
    expect(api.listCompanies).toHaveBeenCalled();
    expect(api.listProperties).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("right-click on Company NO Order selects that company and opens edit", async () => {
    const user = userEvent.setup();
    const other = {
      ...company,
      companyNo: "2000",
      name: "BRAVO",
      contact: "BOB",
    };
    vi.mocked(api.listCompanies).mockResolvedValue([company, other]);
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    expect(await screen.findByText(/Company NO Order/i)).toBeInTheDocument();
    const bravo = await screen.findByRole("button", { name: /2000\s+BRAVO/i });
    const menu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    fireEvent(bravo, menu);
    expect(menu.defaultPrevented).toBe(true);
    expect(await screen.findByDisplayValue("2000")).toBeInTheDocument();
    const name = screen.getByDisplayValue("BRAVO");
    expect(name).not.toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /2000\s+BRAVO/i })
    ).not.toBeInTheDocument();
  });

  it("shows the full 45-character street in its own column on the company property list", async () => {
    const street = "14755 NORTH VENTURA CANYON AVENUE BUILDING A1";
    vi.mocked(api.listProperties).mockResolvedValue([
      {
        ...property,
        street,
        city: "SHERMAN OAKS",
        zip: "91403",
        contact: "MARIA GONZALEZ",
        manager: "MARIA GONZALEZ",
      },
    ]);
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    const companyNo = screen.getByPlaceholderText("? = first");
    await user.clear(companyNo);
    await user.type(companyNo, "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));

    const row = await screen.findByRole("button", { name: /01\s+Bldg A/i });
    const streetCell = row.querySelector(".property-street");
    expect(streetCell).toHaveTextContent(street);
    expect(streetCell?.textContent).toBe(street);
    expect(streetCell?.textContent).not.toContain("SHERMAN");
    expect(row).toHaveTextContent("SHERMAN OAKS");
    expect(row).toHaveTextContent("91403");
    expect(row).toHaveTextContent("MARIA GONZALEZ");
    expect(row.closest(".content-grid")).toHaveStyle({
      gridTemplateColumns: PROPERTY_BROWSE_WITH_NAME,
    });
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
  });

  it("skips property selection for cash receipts and calls onReady", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="cash"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const invoiceNo = screen.getByRole("textbox", { name: "Invoice Number" });
    const companyNo = screen.getByPlaceholderText("? = first");
    expect(invoiceNo.compareDocumentPosition(companyNo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(invoiceNo).toHaveFocus();

    await user.clear(companyNo);
    await user.type(companyNo, "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" })
      );
    });
    expect(api.listProperties).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /01\s+Bldg A/i })).not.toBeInTheDocument();
  });

  it("completes company → property and calls onReady", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const companyNo = screen.getByPlaceholderText("? = first");
    await user.type(companyNo, "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "01" })
      );
    });
  });

  it("Ins on the company list opens a new company form", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    expect(await screen.findByRole("button", { name: /1000\s+ACME/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(
      (await screen.findAllByText(/Company Information/i)).length
    ).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue("1001")).toBeInTheDocument();
  });

  it("Ins on the property list opens a new property form", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Ins Add$/i }));
    expect(
      (await screen.findAllByText(/Property Information/i)).length
    ).toBeGreaterThan(0);
  });

  it("Esc from company search calls onBack", () => {
    const onBack = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="estimate"
        onBack={onBack}
        onReady={vi.fn()}
      />
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(onBack).toHaveBeenCalled();
  });

  it("Esc from the property list returns to the company list", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={onBack}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(await screen.findByRole("button", { name: /1000\s+ACME/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /01\s+Bldg A/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Company NO" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("Esc from the company list returns to company search", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={onBack}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    expect(await screen.findByRole("button", { name: /1000\s+ACME/i })).toBeInTheDocument();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(await screen.findByRole("textbox", { name: "Company NO" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /1000\s+ACME/i })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("selects property by street address", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const street = screen.getByRole("textbox", { name: "Property Street" });
    await user.click(street);
    await user.type(street, "MAPLE{Enter}");

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ street: "1105 MAPLE ST." })
      );
    });
  });

  it("selects property from the first screen by street", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="workorder"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const addr = screen.getByRole("textbox", { name: "Property Street" });
    await user.click(addr);
    await user.type(addr, "MAPLE{Enter}");

    await waitFor(() => {
      expect(api.listProperties).toHaveBeenCalled();
      expect(api.getCompany).toHaveBeenCalledWith("1000");
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ street: "1105 MAPLE ST." })
      );
    });
  });

  it("lists company contact in company search results", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...company, phone: "(555)555-1212" },
      {
        ...emptyCompany(),
        companyNo: "2000",
        name: "BETA",
        phone: "(555)555-1212",
        contact: "ELAINE",
      },
    ]);
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );

    const contact = screen.getByRole("textbox", { name: "Company Contact" });
    await user.click(contact);
    await user.type(contact, "ELAINE{Enter}");

    expect(
      await screen.findByRole("button", { name: /1000\s+ACME.*\(555\)555-1212\s+ELAINE/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2000\s+BETA.*\(555\)555-1212\s+ELAINE/i })
    ).toBeInTheDocument();
    const header = document.querySelector(".browse-grid-header");
    expect(header?.textContent).toContain("Phone");
    expect(header?.textContent).toContain("Contact");
  });

  it("selects company from the first screen by contact", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );

    const contact = screen.getByRole("textbox", { name: "Company Contact" });
    await user.click(contact);
    await user.type(contact, "ELAINE{Enter}");

    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();
    expect(api.listCompanies).toHaveBeenCalledWith(
      expect.objectContaining({ search: "ELAINE" })
    );
  });

  it("lists property address and property contact when several properties match", async () => {
    const other = {
      ...emptyProperty("2000"),
      proNo: "02",
      name: "Bldg B",
      street: "1105 MAPLE ST.",
      city: "IRVINE",
      zip: "92618",
      contact: "ROSA",
      manager: "ROSA",
    };
    vi.mocked(api.listProperties).mockResolvedValue([property, other]);
    vi.mocked(api.listCompanies).mockResolvedValue([
      company,
      { ...emptyCompany(), companyNo: "2000", name: "BETA", contact: "JANE" },
    ]);

    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );

    const street = screen.getByRole("textbox", { name: "Property Street" });
    await user.click(street);
    await user.type(street, "MAPLE{Enter}");

    const maria = await screen.findByRole("button", { name: /1105 MAPLE ST\.\s+NEWPORT/i });
    expect(maria).toBeInTheDocument();
    expect(maria.querySelector(".property-street")).toHaveTextContent("1105 MAPLE ST.");
    expect(maria.querySelector(".property-street")?.textContent).not.toContain("NEWPORT");
    expect(screen.getByRole("button", { name: /ROSA/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1105 MAPLE ST\.\s+IRVINE/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ELAINE/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /JANE/i })).not.toBeInTheDocument();
    expect(screen.getByText("Street")).toBeInTheDocument();
    expect(screen.getByText("City")).toBeInTheDocument();
    expect(screen.getByText("Zip")).toBeInTheDocument();
    expect(screen.getByText("Contact")).toBeInTheDocument();
    expect(screen.queryByText("Co.Contact")).not.toBeInTheDocument();
    expect(maria.closest(".content-grid")).toHaveStyle({
      gridTemplateColumns: PROPERTY_BROWSE_GLOBAL,
    });
  });

  it("selects property from the first screen by contact", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="cash"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    const contact = screen.getByRole("textbox", { name: "Property Contact" });
    await user.click(contact);
    await user.type(contact, "MARIA{Enter}");

    await waitFor(() => {
      expect(api.listProperties).toHaveBeenCalled();
      expect(api.getCompany).toHaveBeenCalledWith("1000");
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ contact: "MARIA" })
      );
    });
  });

  it("offers to add a company that does not exist, then saves it", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listCompanies).mockResolvedValue([]);
    vi.mocked(api.getCompany).mockResolvedValue(null);

    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );

    const companyNo = screen.getByPlaceholderText("? = first");
    await user.type(companyNo, "9999{Enter}");
    expect(
      (await screen.findAllByText(/Do you want Add Company \(Y\/N\)/i)).length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(
      (await screen.findAllByText(/Company Information/i)).length
    ).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue("1001")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1001")).toBeDisabled();
    expect(screen.getByLabelText("Cell#")).toBeInTheDocument();
    expect(screen.getByLabelText("Office#")).toBeInTheDocument();
    expect(screen.queryByText(/Beeper/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phone1/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Phone2/)).not.toBeInTheDocument();

    const fields = screen.getAllByRole("textbox");
    await user.type(fields[1], "NEWCO");
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await waitFor(() => {
      expect(api.saveCompany).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1001", name: "NEWCO" })
      );
    });
    expect(await screen.findByRole("button", { name: /01\s+Bldg A/i })).toBeInTheDocument();
  });

  it("requires a company name when adding from Ins", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(
      (await screen.findAllByText(/Company Information/i)).length
    ).toBeGreaterThan(0);
    expect(await screen.findByDisplayValue("1001")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    expect(
      await screen.findByText(/Company Name required/i)
    ).toBeInTheDocument();
    expect(api.saveCompany).not.toHaveBeenCalled();
  });

  it("offers to add a missing property and then calls onReady", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    vi.mocked(api.listProperties).mockResolvedValue([]);

    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    const propertyNo = await screen.findByPlaceholderText("? = first");
    await user.type(propertyNo, "02{Enter}");

    expect(
      (await screen.findAllByText(/Do you want Add Property\(Y\/N\)/i)).length
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(
      (await screen.findAllByText(/Property Information/i)).length
    ).toBeGreaterThan(0);
    const generatedNo = screen.getByRole("textbox", {
      name: "Property NO",
      hidden: true,
    });
    expect(generatedNo).toHaveValue("1");
    expect(generatedNo).toBeDisabled();
    expect(screen.getByLabelText("Gate Code")).toBeInTheDocument();
    expect(screen.getByLabelText("Lock Box")).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.queryByText(/^Key/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^PageMap/)).not.toBeInTheDocument();

    const fields = screen.getAllByRole("textbox");
    await user.type(fields[1], "Bldg B");
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await waitFor(() => {
      expect(api.saveProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          proNo: "1",
          name: "Bldg B",
        })
      );
    });
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "1", name: "Bldg B" })
      );
    });
  });

  it("reports a first-screen property search miss", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.click(screen.getByRole("textbox", { name: "Property Street" }));
    await user.type(
      screen.getByRole("textbox", { name: "Property Street" }),
      "ZZZZZ{Enter}"
    );
    expect(
      await screen.findByText(/property does not exist/i)
    ).toBeInTheDocument();
  });

  it("shows a delete-company icon after a company is chosen in invoice process", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    expect(
      await screen.findByRole("button", { name: "Delete company" })
    ).toBeInTheDocument();
  });

  it("does not show delete-company on other processes", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    renderApp(
      <CompanyPropertyGate
        process="cash"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await waitFor(() => {
      expect(onReady).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: "Delete company" })
    ).not.toBeInTheDocument();
  });

  it("deletes a company only after icon click and confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.click(await screen.findByRole("button", { name: "Delete company" }));
    expect(
      await screen.findByText(/Are you sure you want to delete company 1000 ACME/i)
    ).toBeInTheDocument();
    expect(api.deleteCompany).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /^N$/i }));
    expect(api.deleteCompany).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Delete company" }));
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.deleteCompany).toHaveBeenCalledWith("1000");
    });
    expect(
      await screen.findByRole("textbox", { name: "Company NO" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /01\s+Bldg A/i })).not.toBeInTheDocument();
  });

  it("searches by invoice number and opens that property", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    vi.mocked(api.listInvoices).mockResolvedValue([
      {
        ...emptyInvoice(),
        companyNo: "1000",
        proNo: "01",
        salesDate: "2026-01-15",
        invoice: 42,
        propertyStreet: "1105 MAPLE ST.",
      },
    ]);
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );
    await user.type(screen.getByRole("textbox", { name: "Invoice Number" }), "42{Enter}");
    await waitFor(() => {
      expect(api.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ search: "42" })
      );
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "01" }),
        { focusInvoice: 42 }
      );
    });
  });

  it("lists matching invoice sites when the number exists on more than one property", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    vi.mocked(api.getCompany).mockImplementation(async (no) =>
      no === "2000"
        ? { ...emptyCompany(), companyNo: "2000", name: "BETA" }
        : company
    );
    vi.mocked(api.listProperties).mockImplementation(async (params) =>
      params?.companyNo === "2000"
        ? [
            {
              ...emptyProperty("2000"),
              proNo: "02",
              name: "Shop",
              street: "88 MAIN ST.",
            },
          ]
        : [property]
    );
    vi.mocked(api.listInvoices).mockResolvedValue([
      {
        ...emptyInvoice(),
        companyNo: "1000",
        proNo: "01",
        salesDate: "2026-01-15",
        invoice: 7,
        propertyStreet: "1105 MAPLE ST.",
      },
      {
        ...emptyInvoice(),
        companyNo: "2000",
        proNo: "02",
        salesDate: "2026-02-01",
        invoice: 7,
        propertyStreet: "88 MAIN ST.",
      },
    ]);
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );
    await user.type(screen.getByRole("textbox", { name: "Invoice Number" }), "7{Enter}");
    const quail = await screen.findByRole("button", { name: /1105 MAPLE ST/i });
    expect(quail.querySelector(".property-street")).toHaveTextContent("1105 MAPLE ST.");
    expect(quail.closest(".content-grid")).toHaveStyle({
      gridTemplateColumns: INVOICE_SITE_BROWSE,
    });
    expect(screen.getByRole("button", { name: /88 MAIN ST/i })).toBeInTheDocument();
    expect(onReady).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /88 MAIN ST/i }));
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "2000" }),
        expect.objectContaining({ proNo: "02" }),
        { focusInvoice: 7 }
      );
    });
  });

  it("reports when the invoice number is not on file", async () => {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    await user.type(screen.getByRole("textbox", { name: "Invoice Number" }), "999{Enter}");
    expect(await screen.findByText(/Invoice #999 does not exist/i)).toBeInTheDocument();
  });

  it("searches cash receipts by invoice number and opens that company", async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    vi.mocked(api.listInvoices).mockResolvedValue([
      {
        ...emptyInvoice(),
        companyNo: "1000",
        proNo: "01",
        salesDate: "2026-01-15",
        invoice: 42,
        propertyStreet: "1105 MAPLE ST.",
      },
    ]);
    renderApp(
      <CompanyPropertyGate
        process="cash"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );
    await user.type(screen.getByRole("textbox", { name: "Invoice Number" }), "42{Enter}");
    await waitFor(() => {
      expect(api.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ search: "42" })
      );
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "01" }),
        { focusInvoice: 42 }
      );
    });
  });
});

describe("street picker sort", () => {
  const sites = [
    {
      ...property,
      companyNo: "1000",
      proNo: "01",
      street: "14755 NORTH VENTURA",
      name: "Ventura",
    },
    {
      ...property,
      companyNo: "1500",
      proNo: "01",
      street: "100 ELM ROAD",
      name: "Cedar",
    },
    {
      ...property,
      companyNo: "2000",
      proNo: "01",
      street: "10 OAK AVENUE",
      name: "Oak",
    },
    {
      ...property,
      companyNo: "2000",
      proNo: "02",
      street: "9 PINE STREET",
      name: "Pine",
    },
  ];

  it("orders company numbers high to low and streets by number", () => {
    const byCompany = sortProperties(sites, DEFAULT_PROPERTY_SORT).map(
      (p) => `${p.companyNo}/${p.proNo} ${p.street}`
    );
    expect(byCompany).toEqual([
      "2000/01 10 OAK AVENUE",
      "2000/02 9 PINE STREET",
      "1500/01 100 ELM ROAD",
      "1000/01 14755 NORTH VENTURA",
    ]);
    const asc = nextPropertySort(DEFAULT_PROPERTY_SORT, "company");
    expect(asc).toEqual({ key: "company", dir: "asc" });
    expect(sortProperties(sites, asc).map((p) => p.companyNo)).toEqual([
      "1000",
      "1500",
      "2000",
      "2000",
    ]);
    expect(nextPropertySort(asc, "company")).toEqual(DEFAULT_PROPERTY_SORT);
    const byStreet = sortProperties(sites, nextPropertySort(asc, "street"));
    expect(byStreet.map((p) => p.street)).toEqual([
      "9 PINE STREET",
      "10 OAK AVENUE",
      "100 ELM ROAD",
      "14755 NORTH VENTURA",
    ]);
  });
});

describe("street picker interactions", () => {
  const sites = [
    {
      ...property,
      companyNo: "1000",
      proNo: "02",
      street: "88 MAIN ST",
      name: "Bldg B",
    },
    {
      ...property,
      companyNo: "2000",
      proNo: "01",
      street: "10 OAK AVENUE",
      name: "Oak",
    },
    {
      ...property,
      companyNo: "2000",
      proNo: "02",
      street: "9 PINE STREET",
      name: "Pine",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listProperties).mockResolvedValue(sites);
    vi.mocked(api.saveProperty).mockResolvedValue(undefined);
    vi.mocked(api.getCompany).mockImplementation(async (companyNo: string) => ({
      ...company,
      companyNo,
      name: companyNo === "2000" ? "BAYSIDE" : "ACME",
    }));
  });

  async function openStreetPicker() {
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={vi.fn()}
      />
    );
    const street = screen.getByRole("textbox", { name: "Property Street" });
    await user.click(street);
    await user.type(street, "?{Enter}");
    await screen.findByRole("button", { name: /^CoNO v$/ });
    return user;
  }

  function rowText(): string[] {
    return screen
      .getAllByRole("button")
      .filter((el) => el.className.includes("dos-row"))
      .map((el) => (el.textContent ?? "").replace(/\s+/g, " "));
  }

  it("defaults to company number descending and toggles both headers", async () => {
    const user = await openStreetPicker();
    expect(rowText().map((row) => row.slice(0, 4))).toEqual([
      "2000",
      "2000",
      "1000",
    ]);
    expect(rowText()[0]).toContain("10 OAK AVENUE");
    expect(rowText()[1]).toContain("9 PINE STREET");

    await user.click(screen.getByRole("button", { name: /^CoNO v$/ }));
    expect(screen.getByRole("button", { name: /^CoNO \^$/ })).toBeInTheDocument();
    expect(rowText()[0]).toContain("88 MAIN ST");
    expect(rowText()[2]).toContain("9 PINE STREET");

    await user.click(screen.getByRole("button", { name: /^CoNO \^$/ }));
    expect(rowText()[0]).toContain("10 OAK AVENUE");

    await user.click(screen.getByRole("button", { name: /^Street$/ }));
    expect(screen.getByRole("button", { name: /^Street \^$/ })).toBeInTheDocument();
    expect(rowText()[0]).toContain("9 PINE STREET");
    expect(rowText()[1]).toContain("10 OAK AVENUE");
    expect(rowText()[2]).toContain("88 MAIN ST");
  });

  it("right-click edits a property, cancel keeps it, and save stores it", async () => {
    const onReady = vi.fn();
    const user = userEvent.setup();
    renderApp(
      <CompanyPropertyGate
        process="invoice"
        onBack={vi.fn()}
        onReady={onReady}
      />
    );
    const street = screen.getByRole("textbox", { name: "Property Street" });
    await user.click(street);
    await user.type(street, "?{Enter}");
    const pine = await screen.findByRole("button", { name: /9 PINE STREET/i });
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(pine, menu);
    expect(menu.defaultPrevented).toBe(true);
    const streetInput = await screen.findByDisplayValue("9 PINE STREET");
    fireEvent.change(streetInput, { target: { value: "9 PINE COURT" } });
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(await screen.findByRole("button", { name: /9 PINE STREET/i })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("9 PINE COURT")).not.toBeInTheDocument();
    expect(api.saveProperty).not.toHaveBeenCalled();

    const again = screen.getByRole("button", { name: /9 PINE STREET/i });
    const menu2 = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    fireEvent(again, menu2);
    expect(menu2.defaultPrevented).toBe(true);
    fireEvent.change(await screen.findByDisplayValue("9 PINE STREET"), {
      target: { value: "9 PINE COURT" },
    });
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true })
      );
    });
    await waitFor(() => {
      expect(api.saveProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "2000",
          proNo: "02",
          street: "9 PINE COURT",
        })
      );
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "2000" }),
        expect.objectContaining({ street: "9 PINE COURT" })
      );
    });
    expect(await screen.findByRole("button", { name: /9 PINE COURT/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /9 PINE STREET/i })).not.toBeInTheDocument();
  });
});

type Process = Parameters<typeof CompanyPropertyGate>[0]["process"];

const bravo = { ...company, companyNo: "2000", name: "BRAVO", contact: "BOB" };
const bldgB = { ...property, proNo: "02", name: "Bldg B", street: "9 ELM ST." };

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
  });
}

const messageBar = () => document.querySelector(".dos-messagebar");
const row = (name: RegExp) => screen.queryByRole("button", { name });

function renderGate(process: Process = "invoice") {
  const onReady = vi.fn();
  const onBack = vi.fn();
  renderApp(<CompanyPropertyGate process={process} onBack={onBack} onReady={onReady} />);
  return { onReady, onBack, user: userEvent.setup() };
}

/** Types into a first-screen or property search box and presses Enter. */
async function search(user: ReturnType<typeof userEvent.setup>, box: string, text: string) {
  await user.type(screen.getByRole("textbox", { name: box }), `${text}{Enter}`);
}

/** Company NO selects its text a frame after focus; typing sooner would land before the selection. */
async function typeCompanyNo(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(screen.getByRole("textbox", { name: "Company NO" }));
  await act(() => new Promise<void>((done) => requestAnimationFrame(() => done())));
  await user.keyboard(`${text}{Enter}`);
}

/** Picks ACME from the company list, landing on its property list (or property search when it has none). */
async function chooseAcme(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
  await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
}

describe("CompanyPropertyGate searches, keys and failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([company]);
    vi.mocked(api.listProperties).mockResolvedValue([property]);
    vi.mocked(api.getCompany).mockResolvedValue(company);
    vi.mocked(api.saveCompany).mockResolvedValue("1001");
    vi.mocked(api.nextCompanyNo).mockResolvedValue("1001");
    vi.mocked(api.saveProperty).mockResolvedValue(undefined);
    vi.mocked(api.deleteCompany).mockResolvedValue(undefined);
    vi.mocked(api.listInvoices).mockResolvedValue([]);
  });

  describe("company search", () => {
    it("finds a short company number written with leading zeros", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([{ ...company, companyNo: "0042" }]);
      const { user } = renderGate();
      await typeCompanyNo(user, "42");
      await waitFor(() =>
        expect(api.listProperties).toHaveBeenCalledWith(expect.objectContaining({ companyNo: "0042" }))
      );
      expect(api.getCompany).not.toHaveBeenCalled();
    });

    it("looks the number up directly when the search list misses it", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([]);
      vi.mocked(api.getCompany).mockResolvedValue({ ...company, companyNo: "5000", name: "FIVE" });
      const { user } = renderGate();
      await typeCompanyNo(user, "5000");
      await waitFor(() =>
        expect(api.listProperties).toHaveBeenCalledWith(expect.objectContaining({ companyNo: "5000" }))
      );
      expect(api.getCompany).toHaveBeenCalledWith("5000");
    });

    it("lists the companies whose number starts with what was typed", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([company, { ...bravo, companyNo: "1001" }, bravo]);
      vi.mocked(api.getCompany).mockResolvedValue(null);
      const { user } = renderGate();
      await typeCompanyNo(user, "10");
      expect(await screen.findByRole("button", { name: /1000\s+ACME/ })).toBeInTheDocument();
      expect(row(/1001\s+BRAVO/)).toBeInTheDocument();
      expect(row(/2000\s+BRAVO/)).not.toBeInTheDocument();
      expect(api.listProperties).not.toHaveBeenCalled();
    });

    it("lists every company whose name contains the text, in any case", async () => {
      const west = { ...company, companyNo: "1001", name: "ACME WEST" };
      vi.mocked(api.listCompanies).mockResolvedValue([company, west, bravo]);
      const { user } = renderGate();
      await search(user, "Company Name", "acme");
      expect(await screen.findByRole("button", { name: /1000\s+ACME/ })).toBeInTheDocument();
      expect(row(/1001\s+ACME WEST/)).toBeInTheDocument();
      expect(row(/BRAVO/)).not.toBeInTheDocument();
      expect(document.querySelector(".dos-titlebar")).toHaveTextContent("Company Name Order");
    });

    it("still shows the list when one name matches, so the pick is confirmed", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([company, bravo]);
      const { user } = renderGate();
      await search(user, "Company Name", "brav");
      expect(await screen.findByRole("button", { name: /2000\s+BRAVO/ })).toBeInTheDocument();
      expect(api.listProperties).not.toHaveBeenCalled();
    });

    it("matches a phone search against either phone number", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([
        { ...company, phone: "714-555-1000" },
        { ...bravo, phone2: "949-555-2000" },
      ]);
      const { user } = renderGate();
      await search(user, "Company Phone", "949");
      expect(await screen.findByRole("button", { name: /2000\s+BRAVO/ })).toBeInTheDocument();
      expect(row(/1000\s+ACME/)).not.toBeInTheDocument();
      expect(document.querySelector(".dos-titlebar")).toHaveTextContent("Company Phone Order");
    });

    it("asks for a value when Enter is pressed on an empty name", async () => {
      const { user } = renderGate();
      await search(user, "Company Name", "");
      expect(messageBar()).toHaveTextContent("--> enter search value or ? for first !!");
      expect(messageBar()).toHaveClass("error");
      expect(api.listCompanies).not.toHaveBeenCalled();
    });

    it("offers a new company named after the missing name, and Y opens it", async () => {
      vi.mocked(api.listCompanies).mockResolvedValue([]);
      const { user } = renderGate();
      await search(user, "Company Name", "NEWCO");
      expect(await screen.findByRole("dialog", { name: "Do you want Add Company (Y/N) ?" })).toBeInTheDocument();
      key("y");
      expect(screen.getByRole("dialog", { name: "Company Information" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Company Name/)).toHaveValue("NEWCO");
      expect(messageBar()).toHaveTextContent("Enter Company Information (Esc=exit) !");
    });

    it.each(["n", "Escape"])("%s at the add-company question goes back to the search", async (k) => {
      vi.mocked(api.listCompanies).mockResolvedValue([]);
      const { user, onBack } = renderGate();
      await search(user, "Company Name", "NEWCO");
      await screen.findByRole("dialog", { name: "Do you want Add Company (Y/N) ?" });
      key(k);
      expect(screen.queryByRole("dialog", { name: /Do you want Add Company/ })).not.toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Company Information" })).not.toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Company Name" })).toBeInTheDocument();
      expect(onBack).not.toHaveBeenCalled();
    });

    it("numbers a new company 1000 when the next number can't be read", async () => {
      vi.mocked(api.nextCompanyNo).mockRejectedValue("no sysdata");
      renderGate();
      key("Insert");
      expect(await screen.findByDisplayValue("1000")).toBeDisabled();
    });

    it("shows why the company search failed", async () => {
      vi.mocked(api.listCompanies).mockRejectedValue("database is locked");
      const { user } = renderGate();
      await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
      await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
      expect(messageBar()).toHaveClass("error");
    });
  });

  describe("company list", () => {
    async function listTwo() {
      vi.mocked(api.listCompanies).mockResolvedValue([company, bravo]);
      const gate = renderGate();
      await gate.user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
      await screen.findByRole("button", { name: /2000\s+BRAVO/ });
      return gate;
    }

    it("arrow keys and Enter choose a company", async () => {
      await listTwo();
      key("ArrowDown");
      key("Enter");
      await waitFor(() =>
        expect(api.listProperties).toHaveBeenCalledWith(expect.objectContaining({ companyNo: "2000" }))
      );
    });

    it("End, Home and the page keys move through the list without choosing", async () => {
      await listTwo();
      key("End");
      expect(row(/2000\s+BRAVO/)).toHaveClass("selected");
      key("PageUp");
      expect(row(/1000\s+ACME/)).toHaveClass("selected");
      key("PageDown");
      expect(row(/2000\s+BRAVO/)).toHaveClass("selected");
      key("ArrowUp");
      expect(row(/1000\s+ACME/)).toHaveClass("selected");
      expect(api.listProperties).not.toHaveBeenCalled();
    });

    it("Home shows the highlighted company's details", async () => {
      await listTwo();
      key("ArrowDown");
      key("Home");
      expect(screen.getByRole("dialog", { name: "Detaill Company Information" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Company Name/)).toHaveValue("BRAVO");
      expect(messageBar()).toHaveTextContent("Detaill Company Information — Esc=Cancel, Ctrl-S=Save");
    });

    it("Ctrl-Home edits the highlighted company, and Esc returns to the list", async () => {
      await listTwo();
      key("Home", { ctrlKey: true });
      expect(screen.getByLabelText(/^Company Name/)).toHaveValue("ACME");
      key("Escape");
      expect(screen.queryByRole("dialog", { name: "Detaill Company Information" })).not.toBeInTheDocument();
      expect(row(/1000\s+ACME/)).toBeInTheDocument();
    });

    it("shows why a company's properties could not be read", async () => {
      await listTwo();
      vi.mocked(api.listProperties).mockRejectedValue("disk I/O error");
      await userEvent.setup().click(row(/1000\s+ACME/)!);
      await waitFor(() => expect(messageBar()).toHaveTextContent("disk I/O error"));
      expect(messageBar()).toHaveClass("error");
    });
  });

  describe("company form", () => {
    it("starts a new company as class A in California", async () => {
      renderGate();
      key("Insert");
      expect(await screen.findByDisplayValue("1001")).toBeDisabled();
      expect(screen.getByLabelText(/^Class/)).toHaveValue("A");
      expect(screen.getByLabelText(/^Sta/)).toHaveValue("CA");
    });

    it("saves every field where it belongs", async () => {
      renderGate();
      key("Insert");
      expect(await screen.findByDisplayValue("1001")).toBeInTheDocument();
      const fill = (label: string | RegExp, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fill(/^Company Name/, "NEWCO");
      fill(/^Class/, "B");
      fill(/^Street/, "1 MAIN ST");
      fill(/^City/, "IRVINE");
      fill(/^Sta/, "NV");
      fill(/^Zip/, "92618");
      fill("Cell#", "714-555-0001");
      fill("Office#", "949-555-0002");
      fill(/^Fax NO/, "949-555-0003");
      fill(/^Contact/, "PAT");
      key("s", { ctrlKey: true });
      await waitFor(() =>
        expect(api.saveCompany).toHaveBeenCalledWith(
          expect.objectContaining({
            companyNo: "1001",
            name: "NEWCO",
            class: "B",
            street: "1 MAIN ST",
            city: "IRVINE",
            state: "NV",
            zip: "92618",
            phone: "714-555-0001",
            phone2: "949-555-0002",
            phone4: "949-555-0003",
            contact: "PAT",
            enterDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
          })
        )
      );
    });

    it("keeps the form open and shows why a save failed", async () => {
      vi.mocked(api.saveCompany).mockRejectedValue("UNIQUE constraint failed: companies.company_no");
      const { user } = renderGate();
      key("Insert");
      await user.type(await screen.findByLabelText(/^Company Name/), "NEWCO");
      key("s", { ctrlKey: true });
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("UNIQUE constraint failed: companies.company_no")
      );
      expect(screen.getByLabelText(/^Company Name/)).toHaveValue("NEWCO");
      expect(api.listProperties).not.toHaveBeenCalled();
    });
  });

  describe("property search for a company", () => {
    async function acmeWithoutProperties(later: (typeof property)[]) {
      vi.mocked(api.listProperties).mockResolvedValueOnce([]).mockResolvedValue(later);
      const gate = renderGate();
      await chooseAcme(gate.user);
      await screen.findByRole("textbox", { name: "Property NO" });
      return gate;
    }

    it("asks for a value when Enter is pressed on an empty box", async () => {
      const { user } = await acmeWithoutProperties([property]);
      await search(user, "Property NO", "");
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("--> enter search value or ? for first !!")
      );
    });

    it("offers to add the first property when ? finds none, and Y opens the form", async () => {
      const { user } = await acmeWithoutProperties([]);
      await search(user, "Property NO", "?");
      expect(
        await screen.findByRole("dialog", { name: "Do you want Add Property(Y/N) ?" })
      ).toBeInTheDocument();
      expect(messageBar()).toHaveTextContent("Property Empty !! Do you want Add Property(Y/N) ?");
      key("y");
      expect(screen.getByRole("dialog", { name: "Property Information" })).toBeInTheDocument();
      expect(screen.getByRole("textbox", { name: "Property NO", hidden: true })).toHaveValue("1");
    });

    it("goes straight to an exact property number", async () => {
      const one = { ...property, proNo: "1" };
      const { user, onReady } = await acmeWithoutProperties([
        one,
        { ...property, proNo: "10" },
        { ...property, proNo: "11" },
      ]);
      await search(user, "Property NO", "1");
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(company, expect.objectContaining({ proNo: "1" }))
      );
    });

    it("lists the properties whose number starts with what was typed", async () => {
      const { user, onReady } = await acmeWithoutProperties([
        { ...property, proNo: "10" },
        { ...property, proNo: "11", name: "Bldg 11" },
      ]);
      await search(user, "Property NO", "1");
      expect(await screen.findByRole("button", { name: /^10\s/ })).toBeInTheDocument();
      expect(row(/^11\s+Bldg 11/)).toBeInTheDocument();
      expect(onReady).not.toHaveBeenCalled();
    });

    it("lists properties by name, in any case", async () => {
      const { user } = await acmeWithoutProperties([property, bldgB, { ...property, proNo: "03", name: "Shop" }]);
      await search(user, "Property Name", "bldg");
      expect(await screen.findByRole("button", { name: /01\s+Bldg A/ })).toBeInTheDocument();
      expect(row(/02\s+Bldg B/)).toBeInTheDocument();
      expect(row(/03\s+Shop/)).not.toBeInTheDocument();
    });

    it("matches a property phone search against either number", async () => {
      const { user } = await acmeWithoutProperties([
        { ...property, phone: "714-555-0101" },
        { ...bldgB, phone2: "949-555-0202" },
      ]);
      await search(user, "Property Phone", "949");
      expect(await screen.findByRole("button", { name: /02\s+Bldg B/ })).toBeInTheDocument();
      expect(row(/01\s+Bldg A/)).not.toBeInTheDocument();
    });

    it("offers to add a property named after a missing name", async () => {
      const { user } = await acmeWithoutProperties([property]);
      await search(user, "Property Name", "Warehouse");
      await screen.findByRole("dialog", { name: "Do you want Add Property(Y/N) ?" });
      key("y");
      expect(screen.getByLabelText(/^PropertyName/)).toHaveValue("Warehouse");
      expect(screen.getByRole("textbox", { name: "Property NO", hidden: true })).toHaveValue("02");
    });

    it("shows why the property search failed", async () => {
      const { user } = await acmeWithoutProperties([]);
      vi.mocked(api.listProperties).mockRejectedValue("database is locked");
      await search(user, "Property NO", "?");
      await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
      expect(messageBar()).toHaveClass("error");
    });
  });

  describe("property list for a company", () => {
    async function acmeProperties(list = [property, bldgB]) {
      vi.mocked(api.listProperties).mockResolvedValue(list);
      const gate = renderGate();
      await chooseAcme(gate.user);
      await screen.findByRole("button", { name: /02\s+Bldg B/ });
      return gate;
    }

    it("arrow keys and Enter choose a property", async () => {
      const { onReady } = await acmeProperties();
      key("ArrowDown");
      key("Enter");
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(company, expect.objectContaining({ proNo: "02" }))
      );
    });

    it("Home shows the highlighted property's details", async () => {
      await acmeProperties();
      key("End");
      key("Home");
      expect(screen.getByRole("dialog", { name: "Detaill Property Information" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^PropertyName/)).toHaveValue("Bldg B");
    });

    it("Ctrl-Home edits the highlighted property", async () => {
      await acmeProperties();
      key("Home", { ctrlKey: true });
      expect(screen.getByLabelText(/^PropertyName/)).toHaveValue("Bldg A");
    });

    it("saves every property field where it belongs", async () => {
      const { onReady } = await acmeProperties();
      key("Insert");
      expect(await screen.findByRole("dialog", { name: "Property Information" })).toBeInTheDocument();
      expect(screen.getByLabelText(/^Sta/)).toHaveValue("CA");
      const fill = (label: string | RegExp, value: string) =>
        fireEvent.change(screen.getByLabelText(label), { target: { value } });
      fill(/^PropertyName/, "Bldg C");
      fill(/^Class/, "R");
      fill(/^Street/, "5 OAK AVE");
      fill(/^City/, "TUSTIN");
      fill(/^Sta/, "AZ");
      fill(/^Zip/, "92780");
      fill(/^Phone1/, "714-555-0301");
      fill(/^Phone2/, "714-555-0302");
      fill(/^Contact/, "LEE");
      fill("Gate Code", "#1234");
      fill("Lock Box", "LB-9");
      fill("E-mail", "lee@example.com");
      fill(/^Comment/, "Side gate");
      key("s", { ctrlKey: true });
      await waitFor(() =>
        expect(api.saveProperty).toHaveBeenCalledWith(
          expect.objectContaining({
            companyNo: "1000",
            proNo: "03",
            name: "Bldg C",
            class: "R",
            street: "5 OAK AVE",
            city: "TUSTIN",
            state: "AZ",
            zip: "92780",
            phone: "714-555-0301",
            phone2: "714-555-0302",
            manager: "LEE",
            contact: "LEE",
            keyInfo: "#1234",
            paintTime: "LB-9",
            pageMap: "lee@example.com",
            comment1: "Side gate",
          })
        )
      );
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(company, expect.objectContaining({ proNo: "03" }))
      );
    });

    it("requires a property name", async () => {
      await acmeProperties();
      key("Insert");
      await screen.findByRole("dialog", { name: "Property Information" });
      key("s", { ctrlKey: true });
      expect(messageBar()).toHaveTextContent("--> Property NO and Name required !!");
      expect(api.saveProperty).not.toHaveBeenCalled();
    });

    it("keeps the property form open and shows why a save failed", async () => {
      vi.mocked(api.saveProperty).mockRejectedValue("disk full");
      const { user, onReady } = await acmeProperties();
      key("Insert");
      await user.type(await screen.findByLabelText(/^PropertyName/), "Bldg C");
      key("s", { ctrlKey: true });
      await waitFor(() => expect(messageBar()).toHaveTextContent("disk full"));
      expect(screen.getByLabelText(/^PropertyName/)).toHaveValue("Bldg C");
      expect(onReady).not.toHaveBeenCalled();
    });

    it("shows why a new property could not be numbered", async () => {
      await acmeProperties();
      vi.mocked(api.listProperties).mockRejectedValue("database is locked");
      key("Insert");
      await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
      expect(screen.queryByRole("dialog", { name: "Property Information" })).not.toBeInTheDocument();
    });
  });

  describe("first-screen property search", () => {
    it("? lists every property on file with its company", async () => {
      vi.mocked(api.listProperties).mockResolvedValue([property, { ...bldgB, companyNo: "2000" }]);
      const { user } = renderGate();
      await search(user, "Property Street", "?");
      expect(await screen.findByRole("button", { name: /2000\s+02/ })).toBeInTheDocument();
      expect(row(/1000\s+01/)).toBeInTheDocument();
      expect(messageBar()).toHaveTextContent("Enter=Select Esc=Back (all properties)");
    });

    it("? says to search a company first when no properties are on file", async () => {
      vi.mocked(api.listProperties).mockResolvedValue([]);
      const { user } = renderGate();
      await search(user, "Property Street", "?");
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("No properties on file. Search a company first, then Ins to add.")
      );
    });

    it("asks for a value when Enter is pressed on an empty street", async () => {
      const { user } = renderGate();
      await search(user, "Property Street", "");
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("--> enter search value or ? for first !!")
      );
    });

    it("falls back to the property name when no street matches", async () => {
      vi.mocked(api.listProperties).mockResolvedValue([{ ...property, name: "HARBOR VIEW" }]);
      const { user, onReady } = renderGate();
      await search(user, "Property Street", "harbor");
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(company, expect.objectContaining({ name: "HARBOR VIEW" }))
      );
      expect(api.getCompany).toHaveBeenCalledWith("1000");
    });

    it("reports a property whose company is not on file", async () => {
      vi.mocked(api.getCompany).mockResolvedValue(null);
      const { user, onReady } = renderGate();
      await search(user, "Property Street", "MAPLE");
      await waitFor(() =>
        expect(messageBar()).toHaveTextContent("--> Company 1000 for this property was not found !!")
      );
      expect(onReady).not.toHaveBeenCalled();
    });

    it("Ins on the all-properties list asks for a company first", async () => {
      vi.mocked(api.listProperties).mockResolvedValue([property, bldgB]);
      const { user } = renderGate();
      await search(user, "Property Street", "?");
      await screen.findByRole("button", { name: /1000\s+02/ });
      key("Insert");
      expect(messageBar()).toHaveTextContent("Select a company first, then Ins to add a property.");
      expect(screen.queryByRole("dialog", { name: "Property Information" })).not.toBeInTheDocument();
    });
  });

  describe("invoice number search", () => {
    it.each(["", "0", "-4", "abc"])("asks for an invoice number when given %j", async (text) => {
      const { user } = renderGate();
      await search(user, "Invoice Number", text);
      await waitFor(() => expect(messageBar()).toHaveTextContent("--> enter invoice number !!"));
      expect(api.listInvoices).not.toHaveBeenCalled();
    });

    it("arrow keys and Enter pick one of several invoice sites", async () => {
      vi.mocked(api.getCompany).mockImplementation(async (no) => (no === "2000" ? bravo : company));
      vi.mocked(api.listProperties).mockImplementation(async (params) =>
        params?.companyNo === "2000" ? [{ ...bldgB, companyNo: "2000" }] : [property]
      );
      vi.mocked(api.listInvoices).mockResolvedValue([
        { ...emptyInvoice(), companyNo: "1000", proNo: "01", salesDate: "2026-01-15", invoice: 7, propertyStreet: "1105 MAPLE ST." },
        { ...emptyInvoice(), companyNo: "2000", proNo: "02", salesDate: "2026-02-01", invoice: 7, propertyStreet: "9 ELM ST." },
      ]);
      const { user, onReady } = renderGate();
      await search(user, "Invoice Number", "7");
      await screen.findByRole("button", { name: /9 ELM ST/ });
      key("ArrowDown");
      key("Enter");
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(bravo, expect.objectContaining({ proNo: "02" }), { focusInvoice: 7 })
      );
    });

    it("opens a site that is no longer in the property file, named from the invoice", async () => {
      vi.mocked(api.listProperties).mockResolvedValue([]);
      vi.mocked(api.listInvoices).mockResolvedValue([
        { ...emptyInvoice(), companyNo: "1000", proNo: "09", salesDate: "2026-01-15", invoice: 8, propertyName: "Old Site", propertyStreet: "3 GONE RD." },
      ]);
      const { user, onReady } = renderGate();
      await search(user, "Invoice Number", "8");
      await waitFor(() =>
        expect(onReady).toHaveBeenCalledWith(
          company,
          expect.objectContaining({ proNo: "09", name: "Old Site", street: "3 GONE RD." }),
          { focusInvoice: 8 }
        )
      );
    });

    it("shows why the invoice search failed", async () => {
      vi.mocked(api.listInvoices).mockRejectedValue("database is locked");
      const { user } = renderGate();
      await search(user, "Invoice Number", "7");
      await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
      expect(messageBar()).toHaveClass("error");
    });
  });

  describe("help and delete-company keys", () => {
    it("F1 shows help, and Esc closes only the help", () => {
      const { onBack } = renderGate();
      key("F1");
      expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
      key("Insert");
      expect(screen.queryByRole("dialog", { name: "Company Information" })).not.toBeInTheDocument();
      key("Escape");
      expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
      expect(onBack).not.toHaveBeenCalled();
    });

    async function askToDelete() {
      const gate = renderGate();
      await chooseAcme(gate.user);
      await gate.user.click(await screen.findByRole("button", { name: "Delete company" }));
      expect(
        screen.getByRole("dialog", { name: "Are you sure you want to delete company 1000 ACME (Y/N) ?" })
      ).toBeInTheDocument();
      return gate;
    }

    it("Y deletes the company and says so on the company search", async () => {
      await askToDelete();
      key("y");
      await waitFor(() => expect(api.deleteCompany).toHaveBeenCalledWith("1000"));
      expect(screen.getByRole("textbox", { name: "Invoice Number" })).toHaveFocus();
      expect(messageBar()).toHaveTextContent("Company 1000 deleted. Enter Search Invoice NO (Esc=Exit)");
    });

    it("keeps the deleted notice while moving between search boxes, until the next search", async () => {
      const { user } = await askToDelete();
      key("y");
      await waitFor(() => expect(messageBar()).toHaveTextContent("Company 1000 deleted."));
      await user.click(screen.getByRole("textbox", { name: "Company Name" }));
      expect(messageBar()).toHaveTextContent(
        "Company 1000 deleted. Enter Search Company Name (Esc=Exit, ?=First)"
      );
      await search(user, "Invoice Number", "999");
      await waitFor(() => expect(messageBar()).toHaveTextContent("--> Invoice #999 does not exist !!"));
      await user.click(screen.getByRole("textbox", { name: "Company Name" }));
      expect(messageBar()).toHaveTextContent("Enter Search Company Name (Esc=Exit, ?=First)");
      expect(messageBar()).not.toHaveTextContent("deleted");
    });

    it.each(["n", "Escape"])("%s keeps the company", async (k) => {
      const { onBack } = await askToDelete();
      key(k);
      expect(screen.queryByRole("dialog", { name: /delete company/ })).not.toBeInTheDocument();
      expect(row(/01\s+Bldg A/)).toBeInTheDocument();
      expect(api.deleteCompany).not.toHaveBeenCalled();
      expect(onBack).not.toHaveBeenCalled();
    });

    it("other keys wait for Y or N", async () => {
      await askToDelete();
      key("x");
      key("Insert");
      expect(screen.getByRole("dialog", { name: /delete company 1000 ACME/ })).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Property Information" })).not.toBeInTheDocument();
    });

    it("shows why the company could not be deleted, and keeps it", async () => {
      vi.mocked(api.deleteCompany).mockRejectedValue("FOREIGN KEY constraint failed");
      await askToDelete();
      key("y");
      await waitFor(() => expect(messageBar()).toHaveTextContent("FOREIGN KEY constraint failed"));
      expect(screen.queryByRole("dialog", { name: /delete company/ })).not.toBeInTheDocument();
      expect(row(/01\s+Bldg A/)).toBeInTheDocument();
    });
  });
});
