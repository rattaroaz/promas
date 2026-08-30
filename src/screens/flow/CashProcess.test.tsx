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

  it("rejects a payment that exceeds the invoice balance", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);
    const amount = document.querySelector(
      'input[type="number"][step="0.01"]'
    ) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, "999");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    expect(
      await screen.findByText(/Payment may not exceed Balance Due/i)
    ).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
  });

  it("rejects a zero payment", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);
    const amount = document.querySelector(
      'input[type="number"][step="0.01"]'
    ) as HTMLInputElement;
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    expect(await screen.findByText(/Payment is zero/i)).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
  });

  it("refuses payment on a paid invoice", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([
      { ...openInv, balance: 0, payTotal: 250 },
    ]);
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByText(/Paid Invoice/i)).toBeInTheDocument();
    expect(screen.queryByText(/Enter Your Payment Data/i)).not.toBeInTheDocument();
  });

  it("applies an auto receipt oldest-open-first", async () => {
    const user = userEvent.setup();
    const older = {
      ...openInv,
      salesDate: "2026-01-10",
      invoice: 1,
      salesTotal: 100,
      balance: 100,
    };
    const newer = {
      ...openInv,
      salesDate: "2026-01-20",
      invoice: 2,
      salesTotal: 150,
      balance: 150,
    };
    vi.mocked(api.listInvoices).mockResolvedValue([newer, older]);
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /\(A\)/i }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/Enter Automatic Receipt Data/i).length
      ).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledTimes(2);
    });
    expect(api.saveCashReceipt).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ invoice: 1, payment: 100 })
    );
    expect(api.saveCashReceipt).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ invoice: 2, payment: 150 })
    );
  });

  it("shows an empty receivable file", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    renderApp(
      <CashProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(
      await screen.findByText(/does not exsit in Receivable File/i)
    ).toBeInTheDocument();
  });
});
