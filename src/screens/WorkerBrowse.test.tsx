import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { WorkerBrowse } from "./WorkerBrowse";
import { api, emptyEmployee } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listEmployees: vi.fn(),
      saveEmployee: vi.fn(),
      deleteEmployee: vi.fn(),
    },
  };
});

const jose = { ...emptyEmployee(), empNo: "12", name: "Jose Ramirez", phone: "555-0100", commission: 65 };
const ana = { ...emptyEmployee(), empNo: "15", name: "Ana Cruz", commission: 70 };

async function openList() {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderApp(<WorkerBrowse onBack={onBack} />);
  await screen.findByRole("button", { name: /Jose Ramirez/ });
  return { user, onBack };
}

describe("WorkerBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listEmployees).mockResolvedValue([jose, ana]);
    vi.mocked(api.saveEmployee).mockResolvedValue(undefined);
    vi.mocked(api.deleteEmployee).mockResolvedValue(undefined);
  });

  it("lists workers with their wage rate and searches", async () => {
    const { user } = await openList();
    expect(screen.getByRole("button", { name: /Jose Ramirez/ })).toHaveTextContent("65.00");
    await user.type(screen.getAllByRole("textbox")[0], "ana");
    await waitFor(() => expect(api.listEmployees).toHaveBeenLastCalledWith({ search: "ana" }));
  });

  it("adds a worker with Ins and Ctrl-S", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    const no = screen.getByRole("textbox", { name: "Worker No" });
    expect(no).toBeEnabled();
    expect(no).toHaveFocus();
    await user.type(no, "21");
    await user.type(screen.getByRole("textbox", { name: "Worker Name" }), "Pat Lee");
    await user.type(screen.getByRole("textbox", { name: "Phone" }), "555-0142");
    const rate = screen.getByRole("textbox", { name: "Wages Rate" });
    await user.clear(rate);
    await user.type(rate, "60");
    await user.type(screen.getByRole("textbox", { name: "S.S.#" }), "000-00-0000");
    await user.type(screen.getByLabelText(/Birth Date/), "1990-05-01");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveEmployee).toHaveBeenCalledWith(
        expect.objectContaining({
          empNo: "21",
          name: "Pat Lee",
          phone: "555-0142",
          commission: 60,
          ssno: "000-00-0000",
          birthDate: "1990-05-01",
        })
      )
    );
    expect(await screen.findByText("Worker 21 saved.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Worker No" })).not.toBeInTheDocument();
  });

  it("needs a number and a name", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    await user.type(screen.getByRole("textbox", { name: "Worker No" }), "21");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Worker No and Name required !!")).toBeInTheDocument();
    expect(api.saveEmployee).not.toHaveBeenCalled();
  });

  it("keeps the editor open and shows the error when a save fails", async () => {
    vi.mocked(api.saveEmployee).mockRejectedValue(new Error("UNIQUE constraint failed"));
    const { user } = await openList();
    await user.keyboard("{Insert}");
    await user.type(screen.getByRole("textbox", { name: "Worker No" }), "12");
    await user.type(screen.getByRole("textbox", { name: "Worker Name" }), "Dup");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/UNIQUE constraint failed/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Worker Name" })).toHaveValue("Dup");
  });

  it("edits the selected worker from Enter, Ctrl-Home, or a click, with the number locked", async () => {
    const { user } = await openList();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox", { name: "Worker Name" })).toHaveValue("Jose Ramirez");
    expect(screen.getByRole("textbox", { name: "Worker No" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await user.keyboard("{ArrowDown}");
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(screen.getByRole("textbox", { name: "Worker Name" })).toHaveValue("Ana Cruz");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: /Jose Ramirez/ }));
    const name = screen.getByRole("textbox", { name: "Worker Name" });
    await user.clear(name);
    await user.type(name, "Jose R. Ramirez");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveEmployee).toHaveBeenCalledWith(
        expect.objectContaining({ empNo: "12", name: "Jose R. Ramirez" })
      )
    );
  });

  it("moves through the list with arrows, Home, End, and the page keys", async () => {
    const { user } = await openList();
    const joseRow = () => screen.getByRole("button", { name: /Jose Ramirez/ });
    const anaRow = () => screen.getByRole("button", { name: /Ana Cruz/ });
    expect(joseRow()).toHaveClass("selected");
    await user.keyboard("{End}");
    expect(anaRow()).toHaveClass("selected");
    await user.keyboard("{Home}");
    expect(joseRow()).toHaveClass("selected");
    await user.keyboard("{PageDown}");
    expect(anaRow()).toHaveClass("selected");
    await user.keyboard("{PageUp}");
    expect(joseRow()).toHaveClass("selected");
  });

  it("asks before voiding: N keeps the worker, Y voids and reloads", async () => {
    const { user } = await openList();
    await user.keyboard("{Delete}");
    expect(screen.getByText(/Do you want delete \(Y\/N\) \?\s+12 Jose Ramirez/)).toBeInTheDocument();
    await user.keyboard("N");
    expect(screen.queryByText(/Do you want delete/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}");
    await user.keyboard("y");
    await waitFor(() => expect(api.deleteEmployee).toHaveBeenCalledWith("12"));
    await waitFor(() => expect(api.listEmployees).toHaveBeenCalledTimes(2));
  });

  it("shows a void that fails", async () => {
    vi.mocked(api.deleteEmployee).mockRejectedValue(new Error("worker is on an open invoice"));
    const { user } = await openList();
    await user.keyboard("{Delete}");
    await user.click(screen.getByRole("button", { name: "Y" }));
    expect(await screen.findByText(/worker is on an open invoice/)).toBeInTheDocument();
  });

  it("shows a list that fails to load", async () => {
    vi.mocked(api.listEmployees).mockRejectedValue(new Error("database is locked"));
    renderApp(<WorkerBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("closes help, the prompt, and the editor before leaving on Esc", async () => {
    const { user, onBack } = await openList();
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}");
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Do you want delete/)).not.toBeInTheDocument();
    await user.keyboard("{Insert}");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Worker No" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
