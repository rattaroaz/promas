import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { ReportsScreen } from "./ReportsScreen";
import { api } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      reportAging: vi.fn(),
      listCashReceipts: vi.fn(),
    },
  };
});

describe("ReportsScreen aging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.reportAging).mockResolvedValue([
      {
        companyNo: "1000",
        companyName: "ACME Prop",
        contact: "ELAINE",
        phone: "555-0100",
        current: 100,
        days30: 0,
        days60: 0,
        days90: 0,
        days120: 0,
        openBal: 100,
      },
    ]);
  });

  it("searches aging by company and shows contact right of the name", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );

    const search = await screen.findByLabelText("Aging company search");
    await user.type(search, "ELAINE");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, "ELAINE");
    });
    expect(await screen.findByText(/Contact/)).toBeInTheDocument();
    expect(screen.getByText(/ACME Prop\s+ELAINE/)).toBeInTheDocument();
  });

  it("searches aging by property address", async () => {
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Open Receivables Aging/i })
    );

    const search = await screen.findByLabelText("Aging company search");
    expect(search).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/address/i)
    );
    await user.type(search, "QUAIL");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.reportAging).toHaveBeenCalledWith(undefined, "QUAIL");
    });
  });

  it("searches cash receipts register by property address", async () => {
    vi.mocked(api.listCashReceipts).mockResolvedValue([
      {
        id: 1,
        companyNo: "1000",
        salesDate: "2026-01-15",
        invoice: 9,
        payment: 80,
        payRefNo: "CHK",
        payDate: "2026-01-20",
        voided: false,
        companyName: "ACME Prop",
      },
    ]);
    const user = userEvent.setup();
    renderApp(<ReportsScreen onBack={vi.fn()} />);

    await user.click(
      screen.getByRole("button", { name: /Cash Receipts Register/i })
    );

    const search = await screen.findByLabelText("Cash receipts search");
    await user.type(search, "QUAIL");
    await user.click(screen.getByRole("button", { name: /^Run$/i }));

    await waitFor(() => {
      expect(api.listCashReceipts).toHaveBeenCalledWith(
        expect.objectContaining({ search: "QUAIL" })
      );
    });
    expect(await screen.findByText(/ACME Prop/)).toBeInTheDocument();
  });
});
