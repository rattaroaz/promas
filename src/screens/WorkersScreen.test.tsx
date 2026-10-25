import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { WorkersScreen } from "./WorkersScreen";
import { api, WorkPerson } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listWorkPersons: vi.fn(),
      saveWorkPerson: vi.fn(),
      deleteWorkPerson: vi.fn(),
    },
  };
});

const jose: WorkPerson = {
  name: "Jose Ramirez",
  workerNo: "400",
  active: true,
};

describe("WorkersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listWorkPersons).mockResolvedValue([jose]);
    vi.mocked(api.saveWorkPerson).mockImplementation(async (person) => [
      { name: person.name, workerNo: person.workerNo, active: person.active },
    ]);
    vi.mocked(api.deleteWorkPerson).mockResolvedValue([]);
  });

  it("shows seeded workers as active with the numeric ID number", async () => {
    renderApp(<WorkersScreen />);
    expect(await screen.findByLabelText("Worker name 1")).toHaveValue(
      "Jose Ramirez"
    );
    expect(screen.getByLabelText("Worker number 1")).toHaveValue("400");
    expect(screen.getByRole("checkbox", { name: "Active Jose Ramirez" })).toBeChecked();
    expect(document.querySelector(".workers-head")?.textContent).toBe(
      "Active?Work PersonID number"
    );
    expect(document.querySelector(".workers-head")?.textContent).not.toContain(
      "Delete"
    );
    expect(
      screen.getByRole("button", { name: "Add Work Person" })
    ).toBeInTheDocument();
  });

  it("adds a worker and edits the name and worker number", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await screen.findByLabelText("Worker name 1");
    await user.click(screen.getByRole("button", { name: "Add Work Person" }));
    await user.type(screen.getByLabelText("Worker name 2"), "Ana Cruz");
    await user.type(screen.getByLabelText("Worker number 2"), "15");
    await user.tab();
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ana Cruz",
          originalName: "",
          active: true,
        })
      );
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ana Cruz",
          workerNo: "15",
          active: true,
        })
      );
    });

    await user.clear(screen.getByLabelText("Worker name 2"));
    await user.type(screen.getByLabelText("Worker name 2"), "Ana C. Cruz");
    await user.clear(screen.getByLabelText("Worker number 2"));
    await user.type(screen.getByLabelText("Worker number 2"), "16");
    await user.tab();
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: "Ana C. Cruz",
          workerNo: "16",
          active: true,
        })
      );
    });
  });

  it("deactivates a worker without removing the row", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    const active = await screen.findByRole("checkbox", {
      name: "Active Jose Ramirez",
    });
    await user.click(active);
    expect(active).not.toBeChecked();
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jose Ramirez",
          active: false,
          originalName: "Jose Ramirez",
        })
      );
    });
    expect(screen.getByLabelText("Worker name 1")).toHaveValue("Jose Ramirez");
  });

  it("deletes only for Y or y, and n, N, Esc, or any other key leave the row", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    const openDelete = async () => {
      await user.click(
        await screen.findByRole("button", { name: "Delete Jose Ramirez" })
      );
      expect(
        screen.getByRole("dialog", { name: "Are you sure? Y/N" })
      ).toBeInTheDocument();
    };

    await openDelete();
    await user.keyboard("x");
    expect(
      screen.getByRole("dialog", { name: "Are you sure? Y/N" })
    ).toBeInTheDocument();
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();

    await user.keyboard("n");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Worker name 1")).toHaveValue("Jose Ramirez");

    await openDelete();
    await user.keyboard("N");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();

    await openDelete();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Worker name 1")).toHaveValue("Jose Ramirez");
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();

    await openDelete();
    await user.keyboard("y");
    await waitFor(() => {
      expect(api.deleteWorkPerson).toHaveBeenCalledWith("Jose Ramirez");
    });
    expect(api.deleteWorkPerson).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Worker name 1")).not.toBeInTheDocument();
  });

  it("deletes when the confirm key is uppercase Y", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await user.click(
      await screen.findByRole("button", { name: "Delete Jose Ramirez" })
    );
    await user.keyboard("Y");
    await waitFor(() => {
      expect(api.deleteWorkPerson).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByLabelText("Worker name 1")).not.toBeInTheDocument();
  });

  it("puts a deleted worker back with F2 Undo Delete", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await user.click(await screen.findByRole("button", { name: "Delete Jose Ramirez" }));
    await user.keyboard("y");
    await waitFor(() => {
      expect(api.deleteWorkPerson).toHaveBeenCalledWith("Jose Ramirez");
    });
    expect(screen.queryByLabelText("Worker name 1")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "F2 Undo Delete" }));
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jose Ramirez",
          workerNo: "400",
          active: true,
        })
      );
    });
    expect(screen.getByLabelText("Worker name 1")).toHaveValue("Jose Ramirez");
    expect(screen.queryByRole("button", { name: "F2 Undo Delete" })).not.toBeInTheDocument();
  });
});
