import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import {
  CompanyPropertyGate,
  formatPropertySearchRow,
} from "./CompanyPropertyGate";
import { api, emptyCompany, emptyProperty } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCompanies: vi.fn(),
      listProperties: vi.fn(),
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
  street: "1105 QUAIL ST.",
  city: "NEWPORT BEACH",
  zip: "92660",
  contact: "MARIA",
  manager: "MARIA",
};

describe("formatPropertySearchRow", () => {
  it("keeps three spaces between every column", () => {
    const row = formatPropertySearchRow(property, "ELAINE", false);
    expect(row).toMatch(/^01 {3,}/);
    expect(row).toContain("   Bldg A");
    expect(row).toContain("1105 QUAIL ST., NEWPORT BEACH, CA, 92660");
    expect(row).toMatch(/92660 {3}ELAINE/);
    expect(row.includes("01Bldg")).toBe(false);
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
    expect(screen.getByRole("textbox", { name: "Property Street" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Property Contact" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("? = first")).toBeInTheDocument();
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
    expect(api.listCompanies).toHaveBeenCalled();
    expect(api.listProperties).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
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

    const companyNo = screen.getByPlaceholderText("? = first");
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
    await user.type(street, "QUAIL{Enter}");

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ street: "1105 QUAIL ST." })
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
    await user.type(addr, "QUAIL{Enter}");

    await waitFor(() => {
      expect(api.listProperties).toHaveBeenCalled();
      expect(api.getCompany).toHaveBeenCalledWith("1000");
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ street: "1105 QUAIL ST." })
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
    expect(screen.getByText(/Phone\.+\s+Contact/)).toBeInTheDocument();
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

  it("lists property address and company contact when several properties match", async () => {
    const other = {
      ...emptyProperty("2000"),
      proNo: "02",
      name: "Bldg B",
      street: "1105 QUAIL ST.",
      city: "IRVINE",
      zip: "92618",
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
    await user.type(street, "QUAIL{Enter}");

    expect(
      await screen.findByRole("button", { name: /1105 QUAIL ST\.\s*,\s*NEWPORT/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ELAINE/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /1105 QUAIL ST\.\s*,\s*IRVINE/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /JANE/i })).toBeInTheDocument();
    expect(screen.getByText(/Address/i)).toBeInTheDocument();
    expect(screen.getByText(/Co\.Contact/i)).toBeInTheDocument();
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

    const fields = screen.getAllByRole("textbox");
    await user.type(fields[1], "NEWCO");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
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
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
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
    expect(screen.getByDisplayValue("02")).toBeInTheDocument();

    const fields = screen.getAllByRole("textbox");
    await user.type(fields[1], "Bldg B");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveProperty).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          proNo: "02",
          name: "Bldg B",
        })
      );
    });
    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "02", name: "Bldg B" })
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
});
