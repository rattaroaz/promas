import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { CompanyPropertyGate } from "./CompanyPropertyGate";
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
      saveProperty: vi.fn(),
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

describe("CompanyPropertyGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([company]);
    vi.mocked(api.listProperties).mockResolvedValue([property]);
    vi.mocked(api.getCompany).mockResolvedValue(company);
    vi.mocked(api.saveCompany).mockResolvedValue(undefined);
    vi.mocked(api.saveProperty).mockResolvedValue(undefined);
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
        process="cash"
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

    expect(
      await screen.findByText(/Enter Property NO/i)
    ).toBeInTheDocument();
    expect(api.listCompanies).toHaveBeenCalled();
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

    const propertyNo = await screen.findByPlaceholderText("? = first");
    await user.type(propertyNo, "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));

    await waitFor(() => {
      expect(onReady).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000" }),
        expect.objectContaining({ proNo: "01" })
      );
    });
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
      company,
      { ...emptyCompany(), companyNo: "2000", name: "BETA", contact: "ELAINE" },
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

    expect(await screen.findByRole("button", { name: /1000\s+ACME.*ELAINE/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /2000\s+BETA.*ELAINE/i })).toBeInTheDocument();
    expect(screen.getByText(/Phone\.+Contact/)).toBeInTheDocument();
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

    expect(
      await screen.findByText(/Enter Property NO/i)
    ).toBeInTheDocument();
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
    expect(screen.getByDisplayValue("9999")).toBeInTheDocument();

    const fields = screen.getAllByRole("textbox");
    await user.type(fields[1], "NEWCO");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveCompany).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "9999", name: "NEWCO" })
      );
    });
    expect(await screen.findByText(/Enter Property NO/i)).toBeInTheDocument();
  });

  it("requires company number and name when adding from Ins", async () => {
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
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    expect(
      await screen.findByText(/Company NO and Name required/i)
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
});
