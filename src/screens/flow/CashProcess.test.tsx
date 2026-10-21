import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { CashProcess } from "./CashProcess";
import { api, emptyCompany, emptyInvoice } from "../../api";
import { today } from "../../dos/utils";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listInvoices: vi.fn(),
      listCashReceipts: vi.fn(),
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
    vi.mocked(api.listCashReceipts).mockResolvedValue([]);
    vi.mocked(api.saveCashReceipt).mockResolvedValue(undefined);
  });

  it("shows customer ledger with open balance", async () => {
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/Customer Ledger/i)).toBeInTheDocument();
    expect(screen.getByText(/Unpaid Total/i)).toBeInTheDocument();
    expect(screen.queryByText(/Balance Total/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Receipt Total/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ending Balance/i)).not.toBeInTheDocument();
    expect(api.listInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens payment entry with Ins and posts via Ctrl-S", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
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

    expect(screen.getByLabelText("Pay Date")).toHaveValue(today());
    await user.keyboard("{Control>}s{/Control}");

    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          invoice: 1,
          payment: 250,
          payDate: today(),
        })
      );
    });
  });

  it("starts Auto Receipt with A", async () => {
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
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
    expect(screen.getByLabelText("Pay Date")).toHaveValue(today());
    expect(screen.getByText(/Balance Due:/)).toBeInTheDocument();
    expect(screen.queryByText(/Ending Balance Due/i)).not.toBeInTheDocument();
  });

  it("rejects a payment that exceeds the invoice balance", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);
    const amount = screen.getByLabelText("Amount Paid");
    await user.clear(amount);
    await user.type(amount, "999");
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    expect(
      await screen.findByText(/Payment may not exceed Balance Due/i)
    ).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
  });

  it("rejects a zero payment", async () => {
    const user = userEvent.setup();
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);
    const amount = screen.getByLabelText("Amount Paid");
    await user.clear(amount);
    await user.type(amount, "0");
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    expect(await screen.findByText(/Payment is zero/i)).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
  });

  it("refuses payment on a paid invoice", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([
      { ...openInv, balance: 0, payTotal: 250 },
    ]);
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
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
      <CashProcess company={company} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /\(A\)/i }));
    await waitFor(() => {
      expect(
        screen.getAllByText(/Enter Automatic Receipt Data/i).length
      ).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    expect(
      screen.getByText("Apply 250.00 to open invoices? Y/N")
    ).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
    await user.keyboard("y");
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

  it("shows only the focused invoice in the ledger", async () => {
    const later = {
      ...openInv,
      salesDate: "2026-02-01",
      invoice: 42,
      salesTotal: 80,
      balance: 80,
    };
    vi.mocked(api.listInvoices).mockResolvedValue([openInv, later]);
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} focusInvoice={42} />
    );
    await screen.findByText(/Customer Ledger/i);
    const rows = document.querySelectorAll(".dos-browse-body .dos-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toMatch(/42/);
    expect(rows[0].textContent).not.toMatch(/01\/15\/2026/);
  });

  it("shows an empty receivable file", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([]);
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    expect(
      await screen.findByText(/does not exsit in Receivable File/i)
    ).toBeInTheDocument();
  });

  it("uses equal column tracks with left-aligned values", async () => {
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    const header = document.querySelector(".browse-grid-header");
    const firstRow = document.querySelector(".dos-browse-body .browse-grid");
    
    expect(header).toHaveClass("browse-grid");
    expect(firstRow).toHaveClass("browse-grid");
    
    // Both should use content-sized columns
    expect(header.style.gridTemplateColumns).toBeTruthy();
    expect(firstRow.style.gridTemplateColumns).toBeTruthy();
    expect(header.style.gridTemplateColumns).toBe(firstRow.style.gridTemplateColumns);
    
    // Check header contains expected column labels
    expect(header?.textContent).toContain("Inv_#");
    expect(header?.textContent).toContain("Payamount");
    expect(header?.textContent).toContain("Balance");
    expect(header?.textContent).toContain("OK");
    
    // Check row contains data
    expect(firstRow?.textContent).toContain("250.00");
  });

  it("shows PayDate and Check/Ref from latest receipt when available", async () => {
    const receiptInv = {
      ...openInv,
      invoice: 2,
      payTotal: 100,
      balance: 150,
    };
    const receipt = {
      id: 1,
      companyNo: "1000",
      salesDate: "2026-01-15",
      invoice: 2,
      payment: 100,
      payRefNo: "CHK-123",
      payDate: "2026-01-20",
      voided: false,
    };
    
    vi.mocked(api.listInvoices).mockResolvedValue([openInv, receiptInv]);
    vi.mocked(api.listCashReceipts).mockResolvedValue([receipt]);
    
    renderApp(
      <CashProcess company={company} onBack={vi.fn()} />
    );
    await screen.findByText(/Customer Ledger/i);
    
    const rows = document.querySelectorAll(".dos-browse-body .browse-grid");
    expect(rows).toHaveLength(2);

    // Same invoice date: the higher invoice number is newer and comes first.
    const newerCells = rows[0].querySelectorAll("div");
    expect(newerCells[0].textContent).toBe("2");
    expect(newerCells[3].textContent).toContain("01/20/2026");
    expect(newerCells[4].textContent).toBe("CHK-123");

    const olderCells = rows[1].querySelectorAll("div");
    expect(olderCells[0].textContent).toBe("1");
    expect(olderCells[3].textContent).toBe("");
    expect(olderCells[4].textContent).toBe("");
  });

  it("keeps unpaid invoices above paid ones, newest first", async () => {
    vi.mocked(api.listInvoices).mockResolvedValue([
      {
        ...openInv,
        invoice: 5,
        salesDate: "2025-06-01",
        salesTotal: 60,
        payTotal: 60,
        balance: 0,
      },
      {
        ...openInv,
        invoice: 3,
        salesDate: "2026-01-01",
        salesTotal: 80,
        payTotal: 0,
        balance: 80,
      },
      {
        ...openInv,
        invoice: 6,
        salesDate: "2026-02-01",
        salesTotal: 90,
        payTotal: 90,
        balance: 0,
      },
      {
        ...openInv,
        invoice: 1,
        salesDate: "2026-01-15",
        salesTotal: 250,
        payTotal: 0,
        balance: 250,
      },
      {
        ...openInv,
        invoice: 4,
        salesDate: "2026-03-01",
        salesTotal: 40,
        payTotal: 0,
        balance: 40,
      },
    ]);
    renderApp(<CashProcess company={company} onBack={vi.fn()} />);
    await screen.findByText(/Unpaid Total/i);
    const numbers = [
      ...document.querySelectorAll(".dos-browse-body .dos-row"),
    ].map((row) => row.querySelector("div")?.textContent);
    expect(numbers).toEqual(["4", "1", "3", "6", "5"]);
    expect(screen.getAllByText(/370\.00/).length).toBeGreaterThan(0);
  });

  it("posts a payment only after Y or y confirms Enter", async () => {
    const user = userEvent.setup();
    renderApp(<CashProcess company={company} onBack={vi.fn()} />);
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);

    await user.keyboard("{Enter}");
    expect(
      screen.getByText("Apply 250.00 to this invoice? Y/N")
    ).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();

    await user.keyboard("x");
    expect(
      screen.getByText("Apply 250.00 to this invoice? Y/N")
    ).toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();

    await user.keyboard("n");
    expect(
      screen.queryByText("Apply 250.00 to this invoice? Y/N")
    ).not.toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Enter Your Payment Data/i).length).toBeGreaterThan(0);

    await user.keyboard("{Enter}");
    await user.keyboard("N");
    expect(
      screen.queryByText("Apply 250.00 to this invoice? Y/N")
    ).not.toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Enter Your Payment Data/i).length).toBeGreaterThan(0);

    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    expect(
      screen.queryByText("Apply 250.00 to this invoice? Y/N")
    ).not.toBeInTheDocument();
    expect(api.saveCashReceipt).not.toHaveBeenCalled();
    expect(screen.getAllByText(/Enter Your Payment Data/i).length).toBeGreaterThan(0);

    await user.keyboard("{Enter}");
    await user.keyboard("y");
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.queryByText("Apply 250.00 to this invoice? Y/N")
    ).not.toBeInTheDocument();
  });

  it("posts a payment when uppercase Y confirms Enter", async () => {
    const user = userEvent.setup();
    renderApp(<CashProcess company={company} onBack={vi.fn()} />);
    await screen.findByText(/Customer Ledger/i);
    await user.click(screen.getByRole("button", { name: /250\.00/ }));
    await screen.findAllByText(/Enter Your Payment Data/i);
    await user.keyboard("{Enter}");
    await user.keyboard("Y");
    await waitFor(() => {
      expect(api.saveCashReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ invoice: 1, payment: 250 })
      );
    });
  });

  describe("auto receipt asks before Ctrl-S or Enter posts", () => {
    const question = "Apply 250.00 to open invoices? Y/N";

    async function openAuto() {
      const user = userEvent.setup();
      renderApp(<CashProcess company={company} onBack={vi.fn()} />);
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
      const amount = screen.getByLabelText("Auto Amount Paid");
      amount.focus();
      return { user, amount: amount as HTMLInputElement };
    }

    async function ask(user: ReturnType<typeof userEvent.setup>, how: "enter" | "ctrl") {
      if (how === "enter") {
        await user.keyboard("{Enter}");
        await user.keyboard("{Enter}");
      } else {
        await user.keyboard("{Control>}s{/Control}");
      }
    }

    function repeatKey(key: string) {
      act(() => {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key, repeat: true, bubbles: true })
        );
      });
    }

    it.each([
      ["enter", "y"],
      ["enter", "Y"],
      ["ctrl", "y"],
      ["ctrl", "Y"],
    ] as const)("%s then %s posts once, and a repeat does not post again", async (how, key) => {
      const { user } = await openAuto();
      await ask(user, how);
      expect(screen.getByText(question)).toBeInTheDocument();
      expect(api.saveCashReceipt).not.toHaveBeenCalled();
      await user.keyboard(key);
      await waitFor(() => {
        expect(api.saveCashReceipt).toHaveBeenCalledTimes(1);
      });
      expect(screen.queryByText(question)).not.toBeInTheDocument();
      repeatKey(key);
      repeatKey(how === "ctrl" ? "s" : "Enter");
      expect(api.saveCashReceipt).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["enter", "n"],
      ["enter", "N"],
      ["enter", "Escape"],
      ["enter", "x"],
      ["ctrl", "n"],
      ["ctrl", "N"],
      ["ctrl", "Escape"],
      ["ctrl", "x"],
    ] as const)("%s then %s does not post", async (how, key) => {
      const { user, amount } = await openAuto();
      await ask(user, how);
      expect(screen.getByText(question)).toBeInTheDocument();
      expect(api.saveCashReceipt).not.toHaveBeenCalled();
      await user.keyboard(key === "Escape" ? "{Escape}" : key);
      expect(api.saveCashReceipt).not.toHaveBeenCalled();
      if (key === "x") {
        expect(screen.getByText(question)).toBeInTheDocument();
        repeatKey("x");
        expect(screen.getByText(question)).toBeInTheDocument();
        expect(api.saveCashReceipt).not.toHaveBeenCalled();
        return;
      }
      expect(screen.queryByText(question)).not.toBeInTheDocument();
      expect(
        screen.getAllByText(/Enter Automatic Receipt Data/i).length
      ).toBeGreaterThan(0);
      expect(amount).toHaveFocus();
      expect(screen.queryByText(/Apply Finished/i)).not.toBeInTheDocument();
    });
  });
});
