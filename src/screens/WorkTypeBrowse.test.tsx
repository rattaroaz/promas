import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { WorkTypeBrowse } from "./WorkTypeBrowse";
import { api, emptyWorkType } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkTypes: vi.fn(),
      saveWorkType: vi.fn(),
      deleteWorkType: vi.fn(),
    },
  };
});

const paint = { ...emptyWorkType(), codeNo: "P1", description: "Interior Paint", price: 220 };
const clean = { ...emptyWorkType(), codeNo: "C1", workType: "C", description: "Move-out Clean", price: 95.5 };

async function openList() {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderApp(<WorkTypeBrowse onBack={onBack} />);
  await screen.findByRole("button", { name: /Interior Paint/ });
  return { user, onBack };
}

describe("WorkTypeBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkTypes).mockResolvedValue([paint, clean]);
    vi.mocked(api.saveWorkType).mockResolvedValue(undefined);
    vi.mocked(api.deleteWorkType).mockResolvedValue(undefined);
  });

  it("lists codes with their price and searches by code", async () => {
    const { user } = await openList();
    expect(screen.getByRole("button", { name: /Move-out Clean/ })).toHaveTextContent("95.50");
    await user.type(screen.getAllByRole("textbox")[0], "c1");
    await waitFor(() => expect(api.listWorkTypes).toHaveBeenLastCalledWith({ search: "c1" }));
  });

  it("adds a code in upper case with its type and price", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    const code = screen.getByRole("textbox", { name: "Code NO" });
    expect(code).toHaveFocus();
    await user.type(code, "s2");
    expect(code).toHaveValue("S2");
    await user.type(screen.getByRole("textbox", { name: "Description" }), "Carpet Shampoo");
    await user.selectOptions(screen.getByRole("combobox", { name: "Work Type" }), "S");
    const price = screen.getByRole("textbox", { name: "Price" });
    await user.clear(price);
    await user.type(price, "75");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveWorkType).toHaveBeenCalledWith(
        expect.objectContaining({ codeNo: "S2", workType: "S", description: "Carpet Shampoo", price: 75 })
      )
    );
    expect(await screen.findByText("Code S2 saved.")).toBeInTheDocument();
  });

  it("needs a code before saving", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Code NO required !!")).toBeInTheDocument();
    expect(api.saveWorkType).not.toHaveBeenCalled();
  });

  it("shows a save that fails and keeps the editor", async () => {
    vi.mocked(api.saveWorkType).mockRejectedValue(new Error("readonly database"));
    const { user } = await openList();
    await user.click(screen.getByRole("button", { name: /Interior Paint/ }));
    expect(screen.getByRole("textbox", { name: "Code NO" })).toBeDisabled();
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/readonly database/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Interior Paint");
  });

  it("edits the selected code from Enter or Ctrl-Home", async () => {
    const { user } = await openList();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Move-out Clean");
    await user.keyboard("{Escape}{ArrowUp}");
    await user.keyboard("{Control>}{Home}{/Control}");
    expect(screen.getByRole("textbox", { name: "Description" })).toHaveValue("Interior Paint");
  });

  it("moves with Home, End, and the page keys", async () => {
    const { user } = await openList();
    await user.keyboard("{End}");
    expect(screen.getByRole("button", { name: /Move-out Clean/ })).toHaveClass("selected");
    await user.keyboard("{PageUp}");
    expect(screen.getByRole("button", { name: /Interior Paint/ })).toHaveClass("selected");
    await user.keyboard("{PageDown}{Home}");
    expect(screen.getByRole("button", { name: /Interior Paint/ })).toHaveClass("selected");
  });

  it("asks before voiding: N keeps the code, Y voids it", async () => {
    const { user } = await openList();
    await user.keyboard("{Delete}");
    expect(screen.getByText(/Do you want delete \(Y\/N\) \?\s+P1/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "N" }));
    expect(api.deleteWorkType).not.toHaveBeenCalled();
    await user.keyboard("{Delete}y");
    await waitFor(() => expect(api.deleteWorkType).toHaveBeenCalledWith("P1"));
  });

  it("shows a void or a load that fails", async () => {
    vi.mocked(api.deleteWorkType).mockRejectedValue(new Error("code is in use"));
    const { user } = await openList();
    await user.keyboard("{Delete}Y");
    expect(await screen.findByText(/code is in use/)).toBeInTheDocument();
  });

  it("shows a list that fails to load", async () => {
    vi.mocked(api.listWorkTypes).mockRejectedValue(new Error("database is locked"));
    renderApp(<WorkTypeBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("closes help, the prompt, and the editor before leaving on Esc", async () => {
    const { user, onBack } = await openList();
    await user.keyboard("{F1}");
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    await user.keyboard("{Delete}{Escape}");
    expect(screen.queryByText(/Do you want delete/)).not.toBeInTheDocument();
    await user.keyboard("{Insert}{Escape}");
    expect(screen.queryByRole("textbox", { name: "Code NO" })).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
