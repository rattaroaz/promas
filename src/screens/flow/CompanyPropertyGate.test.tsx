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
      saveCompany: vi.fn(),
      saveProperty: vi.fn(),
    },
  };
});

const company = {
  ...emptyCompany(),
  companyNo: "1000",
  name: "ACME",
};

const property = {
  ...emptyProperty("1000"),
  proNo: "01",
  name: "Bldg A",
};

describe("CompanyPropertyGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([company]);
    vi.mocked(api.listProperties).mockResolvedValue([property]);
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
    expect(screen.getAllByText(/Search Company/i).length).toBeGreaterThan(0);
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
});
