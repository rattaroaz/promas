import { describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { ProcessRouter } from "./ProcessRouter";
import { api, emptyCompany, emptyProperty } from "../../api";
import { getAppState, resetObservabilityForTests } from "../../lib/observability";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCompanies: vi.fn(),
      listProperties: vi.fn(),
      listInvoices: vi.fn(),
    },
  };
});

describe("ProcessRouter observability", () => {
  it("sets screen to invoice/gate then invoice/process", async () => {
    resetObservabilityForTests();
    vi.mocked(api.listCompanies).mockResolvedValue([
      { ...emptyCompany(), companyNo: "1000", name: "ACME" },
    ]);
    vi.mocked(api.listProperties).mockResolvedValue([
      { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" },
    ]);
    vi.mocked(api.listInvoices).mockResolvedValue([]);

    const user = userEvent.setup();
    renderApp(<ProcessRouter process="invoice" onBack={vi.fn()} />);

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe("invoice/gate");
    });

    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /1000\s+ACME/i }));
    await user.type(screen.getByPlaceholderText("? = first"), "?{Enter}");
    await user.click(await screen.findByRole("button", { name: /01\s+Bldg A/i }));

    await waitFor(() => {
      expect(getAppState().currentScreen).toBe("invoice/process");
    });
  });
});
