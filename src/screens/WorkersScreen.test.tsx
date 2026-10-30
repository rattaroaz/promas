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
  address: "12 Oak St",
  phone: "555-0100",
  active: true,
};

let catalog: WorkPerson[] = [];

describe("WorkersScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    catalog = [{ ...jose }];
    vi.mocked(api.listWorkPersons).mockImplementation(async () =>
      catalog.map((person) => ({ ...person }))
    );
    vi.mocked(api.saveWorkPerson).mockImplementation(async (person) => {
      const name = person.name.trim();
      const original = (person.originalName ?? "").trim();
      const key = (original || name).toLowerCase();
      const id = person.workerNo.trim().toLowerCase();
      const self = catalog.find((row) => row.name.toLowerCase() === key);
      const keeping = !!self && (self.workerNo ?? "").trim().toLowerCase() === id;
      if (
        id &&
        !keeping &&
        catalog.some(
          (row) =>
            row.name.toLowerCase() !== key &&
            (row.workerNo ?? "").trim().toLowerCase() === id
        )
      ) {
        throw new Error("Worker ID must be unique");
      }
      const next: WorkPerson = {
        name,
        workerNo: person.workerNo.trim(),
        address: person.address ?? "",
        phone: person.phone ?? "",
        active: person.active,
      };
      const idx = catalog.findIndex((row) => row.name.toLowerCase() === key);
      if (idx >= 0) catalog[idx] = next;
      else catalog.push(next);
      catalog.sort((a, b) => a.name.localeCompare(b.name));
      return catalog.map((row) => ({ ...row }));
    });
    vi.mocked(api.deleteWorkPerson).mockImplementation(async (name) => {
      catalog = catalog.filter((row) => row.name.toLowerCase() !== name.toLowerCase());
      return catalog.map((row) => ({ ...row }));
    });
  });

  it("shows the name and ID as text, with Edit beside Delete and Ins Add at the top", async () => {
    renderApp(<WorkersScreen />);
    expect(await screen.findByLabelText("Worker name 1")).toHaveTextContent(
      "Jose Ramirez"
    );
    expect(screen.getByLabelText("Worker number 1")).toHaveTextContent("400");
    expect(screen.queryByRole("textbox", { name: /Worker name/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Worker number/i })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Active Jose Ramirez" })).toBeChecked();
    expect(document.querySelector(".workers-head")?.textContent).toBe(
      "Active?Work PersonID number"
    );
    const row = document.querySelector(".workers-row");
    const buttons = [...(row?.querySelectorAll("button") ?? [])].map(
      (button) => button.textContent
    );
    expect(buttons).toEqual(["Edit", "Delete"]);
    expect(screen.getByLabelText("Worker name 1")).toHaveAttribute(
      "title",
      "Jose Ramirez"
    );
    expect(screen.getByRole("button", { name: "Ins Add" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add Work Person" })).not.toBeInTheDocument();
  });

  it("opens a Work Person window from Ins Add and saves its fields", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await screen.findByLabelText("Worker name 1");
    await user.click(screen.getByRole("button", { name: "Ins Add" }));
    expect(screen.getByRole("button", { name: "Esc Exit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ctrl-S Save" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Ana Cruz");
    await user.type(screen.getByLabelText("Address"), "9 Pine Ave");
    await user.type(screen.getByLabelText("Phone"), "555-0199");
    await user.type(screen.getByLabelText("Worker ID"), "15");
    await user.click(screen.getByRole("button", { name: "Ctrl-S Save" }));
    expect(await screen.findByLabelText("Worker name 1")).toHaveTextContent("Ana Cruz");
    expect(screen.getByLabelText("Worker number 2")).toHaveTextContent("400");
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Ana Cruz",
          address: "9 Pine Ave",
          phone: "555-0199",
          workerNo: "15",
          originalName: "",
          active: true,
        })
      );
    });
  });

  it("edits a person from the Edit button and keeps the ID unique", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await user.click(await screen.findByRole("button", { name: "Edit Jose Ramirez" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Jose Ramirez");
    expect(screen.getByLabelText("Address")).toHaveValue("12 Oak St");
    expect(screen.getByLabelText("Phone")).toHaveValue("555-0100");
    expect(screen.getByLabelText("Worker ID")).toHaveValue("400");
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Ana C. Cruz");
    await user.clear(screen.getByLabelText("Worker ID"));
    await user.type(screen.getByLabelText("Worker ID"), "16");
    await user.click(screen.getByRole("button", { name: "Ctrl-S Save" }));
    expect(await screen.findByLabelText("Worker name 1")).toHaveTextContent("Ana C. Cruz");
    expect(screen.getByLabelText("Worker number 1")).toHaveTextContent("16");

    await user.click(screen.getByRole("button", { name: "Ins Add" }));
    await user.type(screen.getByLabelText("Name"), "Pat Lee");
    await user.type(screen.getByLabelText("Worker ID"), "16");
    await user.click(screen.getByRole("button", { name: "Ctrl-S Save" }));
    expect(await screen.findByText("Worker ID must be unique")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Pat Lee");
    expect(screen.queryByLabelText("Worker name 2")).not.toBeInTheDocument();
  });

  it("warns when a Worker ID is already duplicated and still saves that person", async () => {
    catalog = [
      { ...jose },
      {
        name: "Ana Cruz",
        workerNo: "400",
        address: "9 Pine Ave",
        phone: "555-0199",
        active: true,
      },
    ];
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    expect(await screen.findByText(/Duplicate Worker ID 400/)).toHaveTextContent(
      "Jose Ramirez"
    );
    expect(screen.getByText(/Duplicate Worker ID 400/)).toHaveTextContent("Ana Cruz");
    expect(screen.getByText(/You can still save/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Jose Ramirez" }));
    expect(screen.getByLabelText("Phone")).toHaveClass("dos-input", "w16");
    expect(screen.getByText(/already shared/i)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Address"));
    await user.type(screen.getByLabelText("Address"), "44 Elm St");
    await user.click(screen.getByRole("button", { name: "Ctrl-S Save" }));
    expect(await screen.findByLabelText("Worker name 1")).toHaveTextContent("Ana Cruz");
    expect(screen.getByText(/Duplicate Worker ID 400/)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.saveWorkPerson).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Jose Ramirez",
          workerNo: "400",
          address: "44 Elm St",
          originalName: "Jose Ramirez",
        })
      );
    });

    await user.click(screen.getByRole("button", { name: "Edit Ana Cruz" }));
    await user.clear(screen.getByLabelText("Worker ID"));
    await user.type(screen.getByLabelText("Worker ID"), "15");
    await user.click(screen.getByRole("button", { name: "Ctrl-S Save" }));
    expect(await screen.findByLabelText("Worker number 1")).toHaveTextContent("15");
    expect(screen.queryByText(/Duplicate Worker ID/i)).not.toBeInTheDocument();
  });

  it("closes the Work Person window on Esc without saving", async () => {
    const user = userEvent.setup();
    renderApp(<WorkersScreen />);
    await user.click(await screen.findByRole("button", { name: "Ins Add" }));
    await user.type(screen.getByLabelText("Name"), "Ana Cruz");
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ins Add" })).toBeInTheDocument();
    expect(api.saveWorkPerson).not.toHaveBeenCalled();
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
    expect(screen.getByLabelText("Worker name 1")).toHaveTextContent("Jose Ramirez");
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
    expect(screen.getByLabelText("Worker name 1")).toHaveTextContent("Jose Ramirez");

    await openDelete();
    await user.keyboard("N");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();

    await openDelete();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Worker name 1")).toHaveTextContent("Jose Ramirez");
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
          address: "12 Oak St",
          phone: "555-0100",
          active: true,
        })
      );
    });
    expect(screen.getByLabelText("Worker name 1")).toHaveTextContent("Jose Ramirez");
    expect(screen.queryByRole("button", { name: "F2 Undo Delete" })).not.toBeInTheDocument();
  });
});
