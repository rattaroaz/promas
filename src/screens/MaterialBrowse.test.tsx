import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../test/render";
import { MaterialBrowse } from "./MaterialBrowse";
import { api, emptyEmployee, emptyMaterial } from "../api";
import { today } from "../dos/utils";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listMaterials: vi.fn(),
      listEmployees: vi.fn(),
      listWorkPersons: vi.fn(),
      saveMaterial: vi.fn(),
      deleteMaterial: vi.fn(),
    },
  };
});

const cloths = { ...emptyMaterial(), id: 3, empNo: "12", description: "Drop cloths", matDate: "2026-02-03", amount: 18.5 };
const tape = { ...emptyMaterial(), id: 4, empNo: "15", description: "Tape", matDate: "2026-02-04", amount: 1200 };

async function openList(sort?: "default" | "worker" | "date" | "desc") {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderApp(<MaterialBrowse onBack={onBack} sort={sort} />);
  await screen.findByRole("button", { name: /18\.50/ });
  return { user, onBack };
}

describe("MaterialBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listMaterials).mockResolvedValue([cloths, tape]);
    vi.mocked(api.listEmployees).mockResolvedValue([
      { ...emptyEmployee(), empNo: "12", name: "Jose Ramirez" },
      { ...emptyEmployee(), empNo: "15", name: "Ana Cruz" },
    ]);
    vi.mocked(api.listWorkPersons).mockResolvedValue([]);
    vi.mocked(api.saveMaterial).mockResolvedValue(undefined);
    vi.mocked(api.deleteMaterial).mockResolvedValue(undefined);
  });

  it("totals the list and searches without a sort by default", async () => {
    const { user } = await openList();
    expect(screen.getByText(/Material Maintenance\s+\*+\s+2\s+Total Material: 1,218\.50/)).toBeInTheDocument();
    expect(screen.getByText("Mat_Date")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Drop cloths/ })).toHaveTextContent("02/03/2026");
    await user.type(screen.getByRole("textbox"), "tape");
    await waitFor(() =>
      expect(api.listMaterials).toHaveBeenLastCalledWith({ search: "tape", sort: undefined })
    );
  });

  it.each([
    ["date", "Date Order", ["Empno", "Material Description", "Material Amount"], "12"],
    ["desc", "Descript Order", ["Empno", "Trans Date", "Material Amount"], "02/03/2026"],
    ["worker", "Worker Order", ["TransDate", "Material Description", "Material Amount"], "Drop cloths"],
  ] as const)("shows the %s order with its own columns", async (sort, title, headers, cell) => {
    await openList(sort);
    expect(api.listMaterials).toHaveBeenCalledWith({ search: "", sort });
    expect(screen.getByText(new RegExp(title))).toBeInTheDocument();
    for (const h of headers) expect(screen.getByText(h)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /18\.50/ })).toHaveTextContent(cell);
  });

  it("offers to add when there is no material", async () => {
    vi.mocked(api.listMaterials).mockResolvedValue([]);
    renderApp(<MaterialBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/Do you want add Material Data \(Y\/N\) \?\s+Press Ins/)).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    vi.mocked(api.listMaterials).mockRejectedValue(new Error("database is locked"));
    renderApp(<MaterialBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("adds material for a worker with Ins and Ctrl-S", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    const worker = screen.getByRole("combobox", { name: "Worker No" });
    expect(worker).toHaveFocus();
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Worker No required !!")).toBeInTheDocument();
    await user.selectOptions(worker, "15");
    fireEvent.change(screen.getByLabelText(/Mat Date/), { target: { value: "2026-02-09" } });
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Rollers");
    const amount = screen.getByRole("textbox", { name: "Amount" });
    await user.clear(amount);
    await user.type(amount, "12.75");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveMaterial).toHaveBeenCalledWith(
        expect.objectContaining({ empNo: "15", matDate: "2026-02-09", description: "Rollers", amount: 12.75 })
      )
    );
    await waitFor(() => expect(screen.queryByRole("combobox", { name: "Worker No" })).not.toBeInTheDocument());
    expect(api.listMaterials).toHaveBeenCalledTimes(2);
  });

  it("edits the selected row from Enter, Ctrl-Home, or a click", async () => {
    const { user } = await openList();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Drop cloths");
    await user.keyboard("{Escape}{ArrowDown}");
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Tape");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Drop cloths/ }));
    expect(screen.getByRole("combobox", { name: "Worker No" })).toHaveValue("12");
  });

  it("keeps the editor and shows a failed save", async () => {
    vi.mocked(api.saveMaterial).mockRejectedValue(new Error("amount out of range"));
    const { user } = await openList();
    await user.keyboard("{Enter}");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/amount out of range/)).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Worker No" })).toBeInTheDocument();
  });

  it("saves the date it shows when the date box is cleared", async () => {
    const { user } = await openList();
    await user.keyboard("{Enter}");
    const date = screen.getByLabelText(/Mat Date/);
    fireEvent.change(date, { target: { value: "" } });
    expect(date).toHaveValue(today());
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveMaterial).toHaveBeenCalledWith(expect.objectContaining({ id: 3, matDate: today() }))
    );
  });

  it("saves on Enter when no field has focus, and Enter in a field does not", async () => {
    const { user } = await openList();
    await user.keyboard("{Enter}");
    await user.keyboard("{Enter}");
    expect(api.saveMaterial).not.toHaveBeenCalled();
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(api.saveMaterial).toHaveBeenCalledWith(expect.objectContaining({ id: 3, empNo: "12" }))
    );
  });

  it("asks before voiding the selected row", async () => {
    const { user } = await openList();
    await user.keyboard("{ArrowDown}{Delete}");
    expect(screen.getByText("Do you want Void (Y/N) ?")).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.queryByText("Do you want Void (Y/N) ?")).not.toBeInTheDocument();
    await user.keyboard("{Delete}Y");
    await waitFor(() => expect(api.deleteMaterial).toHaveBeenCalledWith(4));
  });

  it("closes the void question and shows a failed void", async () => {
    vi.mocked(api.deleteMaterial).mockRejectedValue(new Error("material 4 is locked"));
    const { user } = await openList();
    await user.keyboard("{ArrowDown}{Delete}Y");
    expect(await screen.findByText(/material 4 is locked/)).toBeInTheDocument();
    expect(screen.queryByText("Do you want Void (Y/N) ?")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Tape/ })).toBeInTheDocument();
  });

  it("prints on End, pages with the page keys, and steps back with Esc", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { user, onBack } = await openList();
    await user.keyboard("{End}");
    expect(print).toHaveBeenCalledTimes(1);
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: /Tape/ })).toHaveClass("selected");
    await user.keyboard("{Home}{PageUp}");
    expect(screen.getByRole("button", { name: /Drop cloths/ })).toHaveClass("selected");
    await user.keyboard("{F1}{Escape}{Delete}{Escape}{Insert}{Escape}");
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
