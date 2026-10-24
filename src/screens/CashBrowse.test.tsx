import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { fireEvent, renderApp, screen, userEvent, waitFor, within } from "../test/render";
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
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          invoice: 1,
          payment: 250,
        })
      );
    });
    expect(await screen.findByText("Receipt posted.")).toBeInTheDocument();
    expect(api.listCashReceipts).toHaveBeenCalledTimes(2);
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
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
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

  it("totals the receipts and filters by search and pay date", async () => {
    vi.mocked(api.listCashReceipts).mockResolvedValue([receipt, { ...receipt, id: 10, payment: 1000 }]);
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/2 receipts\s+Total: 1,125\.00/)).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Search" }), "ACME");
    fireEvent.change(screen.getByLabelText("From:"), { target: { value: "2026-02-01" } });
    fireEvent.change(screen.getByLabelText("To:"), { target: { value: "2026-02-28" } });
    await waitFor(() =>
      expect(api.listCashReceipts).toHaveBeenLastCalledWith({
        search: "ACME",
        fromDate: "2026-02-01",
        toDate: "2026-02-28",
        limit: 400,
      })
    );
  });

  it("shows a failed load", async () => {
    vi.mocked(api.listCashReceipts).mockRejectedValue(new Error("database is locked"));
    renderApp(<CashBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("offers only open invoices and fills the receipt from the one picked", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([
      openInv,
      { ...openInv, invoice: 2, balance: 0 },
      { ...openInv, invoice: 3, balance: 50, voided: true },
      { ...openInv, invoice: 4, balance: 0.004 },
    ]);
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 receipts/i);
    await user.keyboard("{Insert}");
    const pick = await screen.findByRole("combobox", { name: "Open Invoice" });
    expect(pick).toHaveFocus();
    expect(within(pick).getAllByRole("option").map((o) => o.textContent)).toEqual([
      "Select open invoice...",
      "#1 ACME bal 250.00",
    ]);
    await user.selectOptions(pick, "1");
    expect(screen.getByRole("spinbutton", { name: "Invoice_No" })).toHaveValue(1);
    expect(screen.getByRole("textbox", { name: "Company No" })).toHaveValue("1000");
    expect(screen.getByRole("textbox", { name: "Amount Paid" })).toHaveValue("250.00");
  });

  it("posts a receipt typed by hand with Ctrl-S", async () => {
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 receipts/i);
    await user.keyboard("{Insert}");
    await user.type(await screen.findByRole("spinbutton", { name: "Invoice_No" }), "77");
    await user.type(screen.getByRole("textbox", { name: "Company No" }), "2000");
    await user.type(screen.getByRole("textbox", { name: "Check/Ref" }), "CHK-1");
    fireEvent.change(screen.getByLabelText("Pay Date"), { target: { value: "2026-02-03" } });
    const amount = screen.getByRole("textbox", { name: "Amount Paid" });
    await user.clear(amount);
    await user.type(amount, "40");
    await user.keyboard("{Enter}");
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          invoice: 77,
          companyNo: "2000",
          payRefNo: "CHK-1",
          payDate: "2026-02-03",
          payment: 40,
        })
      )
    );
  });

  it("asks again for a receipt with no invoice or company, and keeps the form on a failed post", async () => {
    vi.mocked(api.saveCashReceipt).mockRejectedValue(new Error("invoice 1 is void"));
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/1 receipts/i);
    await user.keyboard("{Insert}");
    const amount = await screen.findByRole("textbox", { name: "Amount Paid" });
    await user.clear(amount);
    await user.type(amount, "40");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/Payment is zero/)).toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Open Invoice" }), "1");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/invoice 1 is void/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Open Invoice" })).toBeInTheDocument();
  });

  it("moves with the arrow keys, keeps a receipt on N, and prints on End", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(api.listCashReceipts).mockResolvedValue([receipt, { ...receipt, id: 10, payRefNo: "CHK-10" }]);
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={vi.fn()} />);
    await screen.findByText(/2 receipts/i);
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /CHK-10/ })).toHaveClass("selected");
    await user.keyboard("{Delete}");
    await user.keyboard("n");
    expect(screen.queryByText(/Do you want Void/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}");
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Do you want Void/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}y");
    await waitFor(() => expect(api.deleteCashReceipt).toHaveBeenCalledWith(10));
    await user.keyboard("{End}");
    expect(print).toHaveBeenCalledTimes(1);
  });

  it("closes help, then the form, then leaves on Esc", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    renderApp(<CashBrowse onBack={onBack} />);
    await screen.findByText(/1 receipts/i);
    await user.keyboard("{Insert}");
    await screen.findByRole("combobox", { name: "Open Invoice" });
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("combobox", { name: "Open Invoice" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.getByText("Ins=Add Receipt Del=Void Esc=Exit")).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
