import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { CashBrowse } from "./CashBrowse";
import { api, emptyCashReceipt, emptyInvoice } from "../api";
import { today } from "../dos/utils";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCashReceipts: vi.fn(),
      listInvoices: vi.fn(),
      saveCashReceipt: vi.fn(),
      deleteCashReceipt: vi.fn(),
    },
  };
});

const receipt = {
  ...emptyCashReceipt(),
  id: 9,
  companyNo: "1000",
  invoice: 1,
  payment: 125,
  payRefNo: "CHK-9",
  companyName: "ACME",
};

const openInv = {
  ...emptyInvoice(),
  companyNo: "1000",
  proNo: "01",
  salesDate: "2026-01-15",
  invoice: 1,
  salesTotal: 250,
  balance: 250,
  companyName: "ACME",
};

describe("CashBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCashReceipts).mockResolvedValue([receipt]);
    vi.mocked(api.listInvoices).mockResolvedValue([openInv]);
    vi.mocked(api.saveCashReceipt).mockResolvedValue(undefined);
    vi.mocked(api.deleteCashReceipt).mockResolvedValue(undefined);
  });

  it("posts a receipt from Ins after picking an open invoice", async () => {
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/1 receipts/i)).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(
      (await screen.findAllByText(/Enter Your Payment Data/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Pay Date")).toHaveValue(today());
    await user.selectOptions(
      screen.getByRole("combobox"),
      "1"
    );
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          invoice: 1,
          payment: 250,
        })
      );
    });
    expect(await screen.findByText(/1 receipts/i)).toBeInTheDocument();
  });

  it("rejects a zero payment", async () => {
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 receipts/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    await screen.findAllByText(/Enter Your Payment Data/i);
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    expect(await screen.findByText(/Payment is zero/i)).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
  });

  it("voids the selected receipt after Del confirm", async () => {
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 receipts/i);
    await user.click(screen.getByRole("button", { name: /^Del$/i }));
    expect(screen.getByText(/Do you want Void/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.deleteCashReceipt).toHaveBeenCalledWith(9);
    });
  });
});
