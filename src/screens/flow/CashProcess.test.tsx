import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { CashProcess } from "./CashProcess";
import { api, emptyCompany, emptyInvoice, emptyProperty } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listInvoices: vi.fn(),
      saveCashReceipt: vi.fn(),
    },
  };
});

const company = {
  ...emptyCompany(),
  companyNo: "1000",
  name: "ACME",
  phone: "555-0100",
};
const property = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" };

const openInv = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesUnit: "A1",
  salesTotal: 250,
  balance: 250,
  voided: false,
};

describe("CashProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listInvoices).mockResolvedValue([openInv]);
    vi.mocked(api.saveCashReceipt).mockResolvedValue(undefined);
  });

  it("shows customer ledger with open balance", async () => {
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/Customer Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Ending Balance/i)).toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens payment entry with Ins and posts via Ctrl-W", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);

    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    await waitFor(() => {
      expect(
        screen.getAllByText(/Enter Your Payment Data/i).length
      ).toBeGreaterThan(0);
    });

    await user.keyboard("{Control>}w{/Control}");
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          invoice: 1,
          payment: 250,
        })
      );
    });
  });

  it("starts Auto Receipt with A", async () => {
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true })
      );
    });
    await waitFor(() => {
      expect(
        screen.getAllByText(/Enter Automatic Receipt Data/i).length
      ).toBeGreaterThan(0);
    });
  });
});
