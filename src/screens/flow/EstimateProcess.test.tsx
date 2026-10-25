import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../../test/render";
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

  it("saves a new proposal with Ctrl-S", async () => {
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
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
    await waitFor(() => {
      expect(api.saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({
          companyNo: "1000",
          formNo: "EST-1",
        })
      );
    });
    expect(await screen.findByText("Proposal #12 saved.")).toBeInTheDocument();
    expect(api.listEstimates).toHaveBeenCalledTimes(2);
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
    await user.click(screen.getByRole("button", { name: /Cntr_S Save/i }));
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
    await user.click(screen.getByRole("button", { name: /^Delete$/i }));
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

const sent = { ...row, id: 6, estNo: 13, estDate: "2026-03-02", formNo: "EST-2", status: "SENT" };
const voided = { ...row, id: 7, estNo: 14, estDate: "2026-03-03", formNo: "EST-3", voided: true };

function key(k: string, init: KeyboardEventInit = {}) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...init }));
  });
}

const messageBar = () => document.querySelector(".dos-messagebar");
const selectedRow = () => document.querySelector(".dos-browse-body .dos-row.selected");
const formNo = () => screen.queryByLabelText(/^Form #/);
const voidQuestion = /^Do you want Void \(Y\/N\)\s+\?\s+Proposal #12$/;

async function renderList(list = [row, sent, voided]) {
  vi.mocked(api.listEstimates).mockResolvedValue(list);
  const onBack = vi.fn();
  renderApp(<EstimateProcess company={company} property={property} onBack={onBack} />);
  await screen.findByText(new RegExp(`${list.length} proposals`));
  return onBack;
}

describe("EstimateProcess keys and edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.saveEstimate).mockResolvedValue(12);
    vi.mocked(api.voidEstimate).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows each proposal's status, with VOID for voided ones", async () => {
    await renderList();
    expect(screen.getByRole("button", { name: /EST-2\s*SENT/ })).toBeInTheDocument();
    const voidRow = screen.getByRole("button", { name: /EST-3\s*VOID/ });
    expect(voidRow).toHaveClass("voided");
    expect(screen.getByText("ACME", { exact: false })).toHaveTextContent("1000 ACME — 01 Bldg A");
  });

  it("arrow keys move the selection, and Enter opens that proposal", async () => {
    await renderList();
    expect(selectedRow()).toHaveTextContent("EST-1");
    key("ArrowDown");
    expect(selectedRow()).toHaveTextContent("EST-2");
    key("Enter");
    expect(formNo()).toHaveValue("EST-2");
    expect(messageBar()).toHaveTextContent("Enter Proposal Information (Esc=Cancel, Cntr_S=Save & Exit) !");
  });

  it("End, Home, PgDn and PgUp move through the list", async () => {
    await renderList();
    key("End");
    expect(selectedRow()).toHaveTextContent("EST-3");
    key("Home");
    expect(selectedRow()).toHaveTextContent("EST-1");
    key("PageDown");
    expect(selectedRow()).toHaveTextContent("EST-3");
    key("PageUp");
    expect(selectedRow()).toHaveTextContent("EST-1");
  });

  it("Ctrl-Home opens the selected proposal", async () => {
    await renderList();
    key("Home", { ctrlKey: true });
    expect(formNo()).toHaveValue("EST-1");
  });

  it("keeps an existing proposal's number, and lets a new one be typed", async () => {
    await renderList();
    key("Enter");
    expect(screen.getByLabelText(/^Proposal #/)).toBeDisabled();
    key("Escape");
    key("Insert");
    expect(screen.getByLabelText(/^Proposal #/)).toBeEnabled();
  });

  it("Esc cancels an edit without saving, and a second Esc leaves", async () => {
    const user = userEvent.setup();
    const onBack = await renderList();
    key("Enter");
    await user.type(formNo()!, "-X");
    key("Escape");
    expect(formNo()).not.toBeInTheDocument();
    expect(messageBar()).toHaveTextContent("Ins=Add Proposal Esc=Back");
    expect(onBack).not.toHaveBeenCalled();
    key("Escape");
    expect(onBack).toHaveBeenCalledOnce();
    expect(api.saveEstimate).not.toHaveBeenCalled();
  });

  it("opens a voided proposal as Void Proposal, and Del does not ask again", async () => {
    await renderList();
    key("End");
    key("Delete");
    expect(screen.queryByRole("dialog", { name: /Do you want Void/ })).not.toBeInTheDocument();
    key("Enter");
    expect(screen.getByRole("dialog", { name: "Void Proposal" })).toBeInTheDocument();
  });

  it.each(["n", "N", "Escape"])("%s at the void question keeps the proposal", async (k) => {
    const onBack = await renderList();
    key("Delete");
    expect(screen.getByRole("dialog", { name: voidQuestion })).toBeInTheDocument();
    key(k);
    expect(screen.queryByRole("dialog", { name: voidQuestion })).not.toBeInTheDocument();
    expect(api.voidEstimate).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it("Y at the void question voids the proposal and reloads the list", async () => {
    await renderList();
    key("Delete");
    key("y");
    await waitFor(() => expect(messageBar()).toHaveTextContent("Void Proposal"));
    expect(api.voidEstimate).toHaveBeenCalledWith(5);
    expect(api.listEstimates).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: voidQuestion })).not.toBeInTheDocument();
  });

  it("shows why a proposal could not be voided", async () => {
    vi.mocked(api.voidEstimate).mockRejectedValue("proposal is locked");
    await renderList();
    key("Delete");
    key("y");
    await waitFor(() => expect(messageBar()).toHaveTextContent("proposal is locked"));
    expect(messageBar()).toHaveClass("error");
    expect(screen.queryByRole("dialog", { name: voidQuestion })).not.toBeInTheDocument();
    expect(api.listEstimates).toHaveBeenCalledOnce();
  });

  it("Ins does nothing while the void question or help is open", async () => {
    await renderList();
    key("Delete");
    key("Insert");
    expect(formNo()).not.toBeInTheDocument();
    key("n");
    key("F1");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    key("Insert");
    expect(formNo()).not.toBeInTheDocument();
    key("Escape");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    expect(selectedRow()).toHaveTextContent("EST-1");
  });

  it("keeps the form open and shows why a save failed", async () => {
    vi.mocked(api.saveEstimate).mockRejectedValue("UNIQUE constraint failed: estimates.est_no");
    await renderList();
    key("Insert");
    key("s", { ctrlKey: true });
    await waitFor(() =>
      expect(messageBar()).toHaveTextContent("UNIQUE constraint failed: estimates.est_no")
    );
    expect(messageBar()).toHaveClass("error");
    expect(formNo()).toHaveValue("EST-1");
    expect(api.listEstimates).toHaveBeenCalledOnce();
  });

  it("starts a new proposal on today's date", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T20:30:00-07:00"));
    await renderList();
    key("Insert");
    expect(screen.getByLabelText(/^Proposal Date/)).toHaveValue("2026-03-10");
    expect(formNo()).toHaveValue("EST-1");
  });

  it("saves today's date when the date box is cleared", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-10T20:30:00-07:00"));
    await renderList();
    key("Enter");
    const date = screen.getByLabelText(/^Proposal Date/);
    fireEvent.change(date, { target: { value: "" } });
    expect(date).toHaveValue("2026-03-10");
    key("s", { ctrlKey: true });
    await waitFor(() =>
      expect(api.saveEstimate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 5, estDate: "2026-03-10" })
      )
    );
  });

  it("shows why the proposals could not be listed", async () => {
    vi.mocked(api.listEstimates).mockRejectedValue("database is locked");
    renderApp(<EstimateProcess company={company} property={property} onBack={vi.fn()} />);
    await waitFor(() => expect(messageBar()).toHaveTextContent("database is locked"));
    expect(messageBar()).toHaveClass("error");
    expect(screen.getByText(/no proposals — press Ins/)).toBeInTheDocument();
  });
});
