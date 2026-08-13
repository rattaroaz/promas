import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
