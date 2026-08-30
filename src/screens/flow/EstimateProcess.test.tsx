import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { renderApp, screen, userEvent, waitFor } from "../../test/render";
import { EstimateProcess } from "./EstimateProcess";
import { api, emptyCompany, emptyEstimate, emptyProperty } from "../../api";

vi.mock("../../api", async () => {
  const actual = await vi.importActual<typeof import("../../api")>("../../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listEstimates: vi.fn(),
      saveEstimate: vi.fn(),
      voidEstimate: vi.fn(),
    },
  };
});

const company = { ...emptyCompany(), companyNo: "1000", name: "ACME" };
const property = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A" };
const row = {
  ...emptyEstimate("1000"),
  id: 5,
  estNo: 12,
  estDate: "2026-03-01",
  formNo: "EST-1",
};

describe("EstimateProcess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEstimates).mockResolvedValue([row]);
    vi.mocked(api.saveEstimate).mockResolvedValue(12);
    vi.mocked(api.voidEstimate).mockResolvedValue(undefined);
  });

  it("lists proposals for the company", async () => {
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/1 proposals/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /EST-1/i })).toBeInTheDocument();
    expect(api.listEstimates).toHaveBeenCalledWith(
      expect.objectContaining({ companyNo: "1000" })
    );
  });

  it("opens a new proposal from Ins", async () => {
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 proposals/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(
      (await screen.findAllByText(/Enter Proposal Information/i)).length
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^Esc Cancel$/i })).toBeInTheDocument();
  });

  it("saves a new proposal with Ctrl-W", async () => {
    const user = userEvent.setup();
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 proposals/i);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Insert", bubbles: true })
      );
    });
    expect(await screen.findByDisplayValue("EST-1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          formNo: "EST-1",
        })
      );
    });
    expect(await screen.findByText(/1 proposals/i)).toBeInTheDocument();
  });

  it("opens an existing proposal and saves edits", async () => {
    const user = userEvent.setup();
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    await user.click(await screen.findByRole("button", { name: /EST-1/i }));
    const formNo = await screen.findByDisplayValue("EST-1");
    await user.clear(formNo);
    await user.type(formNo, "EST-2");
    await user.click(screen.getByRole("button", { name: /Cntr_W Save/i }));
    await waitFor(() => {
      expect(api.saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 5,
          estNo: 12,
          formNo: "EST-2",
        })
      );
    });
  });

  it("voids the selected proposal after Del confirm", async () => {
    const user = userEvent.setup();
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    await screen.findByText(/1 proposals/i);
    await user.click(screen.getByRole("button", { name: /^Del$/i }));
    expect(screen.getByText(/Do you want Void/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.voidEstimate).toHaveBeenCalledWith(5);
    });
  });

  it("shows an empty-state when the company has no proposals", async () => {
    vi.mocked(api.listEstimates).mockResolvedValue([]);
    renderApp(
      <EstimateProcess company={company} property={property} onBack={vi.fn()} />
    );
    expect(await screen.findByText(/No proposals/i)).toBeInTheDocument();
  });
});
