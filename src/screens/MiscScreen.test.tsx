import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, renderApp, screen, userEvent, waitFor } from "../test/render";
import { MiscScreen } from "./MiscScreen";
import { UNSAVED_JOB_CHANGES } from "./JobDescriptionsScreen";
import { PAINTING_OF_CEILING } from "../lib/jobCatalog";
import { api } from "../api";
import { open } from "@tauri-apps/plugin-dialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
  save: vi.fn(),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexDataFiles: vi.fn(),
      importDbfFolder: vi.fn(),
      getSysdata: vi.fn(),
      saveSysdata: vi.fn(),
      listForms: vi.fn(),
      saveForm: vi.fn(),
      listWorkPersons: vi.fn(),
      saveWorkPerson: vi.fn(),
      deleteWorkPerson: vi.fn(),
      listJobDescriptions: vi.fn(),
      saveJobDescription: vi.fn(),
      deleteJobDescription: vi.fn(),
    },
  };
});

describe("MiscScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.reindexDataFiles).mockResolvedValue("Reindex complete.");
    vi.mocked(api.importDbfFolder).mockResolvedValue({
      companies: 2,
      properties: 4,
      employees: 1,
      workTypes: 3,
      invoices: 10,
      invoiceLines: 20,
      cashReceipts: 5,
      materials: 0,
      workOrders: 1,
      estimates: 0,
      messages: ["Import completed successfully"],
    });
  });

  it("lists Workers as option 5", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /5\.\s*Workers/i })
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /5\.\s*Workers/i }));
    expect(await screen.findByRole("button", { name: "Ins Add" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Worker name 1")).toHaveTextContent(
      "Jose Ramirez"
    );
  });

  it("closes a Workers delete prompt on Esc without leaving the screen", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    vi.mocked(api.deleteWorkPerson).mockResolvedValue([]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /5\.\s*Workers/i }));
    await user.click(
      await screen.findByRole("button", { name: "Delete Jose Ramirez" })
    );
    expect(
      screen.getByRole("dialog", { name: "Are you sure? Y/N" })
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ins Add" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /5\.\s*Workers/i })
    ).not.toBeInTheDocument();
    expect(api.deleteWorkPerson).not.toHaveBeenCalled();
  });

  it("closes the Work Person window on Esc without leaving Workers", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listWorkPersons).mockResolvedValue([
      { name: "Jose Ramirez", workerNo: "", active: true },
    ]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /5\.\s*Workers/i }));
    await user.click(await screen.findByRole("button", { name: "Ins Add" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ins Add" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /5\.\s*Workers/i })
    ).not.toBeInTheDocument();
    expect(api.saveWorkPerson).not.toHaveBeenCalled();
  });

  it("lists Job Descriptions as option 6 and can add one", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listJobDescriptions).mockResolvedValue([
      {
        description: PAINTING_OF_CEILING,
        single: 75,
        onePlusOne: 115,
        twoPlusOne: 125,
        twoPlusTwo: 150,
        threePlusTwo: 175,
        fourPlusTwo: 195,
        occupied: null,
        fixed: null,
      },
    ]);
    vi.mocked(api.saveJobDescription).mockImplementation(async (job) => [job]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /6\.\s*Job Descriptions/i }));
    expect(await screen.findByLabelText("Job description 1")).toHaveValue(
      PAINTING_OF_CEILING
    );
    expect(screen.getByRole("combobox", { name: "Size 1" })).toHaveValue("single");
    expect(screen.getByLabelText("Price 1")).toHaveValue("75.00");
    expect(screen.getByLabelText("Price 1")).toHaveClass("job-desc-price");
    expect(
      [...(document.querySelector(".job-desc-head")?.children ?? [])].map((el) => el.textContent)
    ).toEqual(["Description", "Size", "Price", ""]);
    await user.selectOptions(screen.getByRole("combobox", { name: "Size 1" }), "2+2");
    expect(screen.getByLabelText("Price 1")).toHaveValue("150.00");
    await user.selectOptions(screen.getByRole("combobox", { name: "Size 1" }), "Occupied");
    expect(screen.getByLabelText("Price 1")).toHaveValue("");
    expect(screen.getByRole("button", { name: `Delete ${PAINTING_OF_CEILING}` })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add Job Description" }));
    const added = screen.getByLabelText("Job description 2");
    await user.type(added, "Touch up");
    const price = screen.getByLabelText("Price 2");
    expect(screen.getByRole("combobox", { name: "Size 2" })).toHaveValue("single");
    await user.type(price, "10");
    await user.selectOptions(screen.getByRole("combobox", { name: "Size 2" }), "1+1");
    expect(screen.getByLabelText("Price 2")).toHaveValue("10.00");
    await user.clear(screen.getByLabelText("Price 2"));
    await user.type(screen.getByLabelText("Price 2"), "20");
    await user.selectOptions(screen.getByRole("combobox", { name: "Size 2" }), "2+2");
    expect(screen.getByLabelText("Price 2")).toHaveValue("10.00");
    await user.selectOptions(screen.getByRole("combobox", { name: "Size 2" }), "single");
    expect(screen.getByLabelText("Price 2")).toHaveValue("10.00");
    expect(api.saveJobDescription).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save Changes" }));
    await waitFor(() => {
      expect(api.saveJobDescription).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Touch up",
          single: 10,
          onePlusOne: 20,
          twoPlusOne: 10,
          twoPlusTwo: 10,
          threePlusTwo: 10,
          fourPlusTwo: 10,
          occupied: 10,
          fixed: null,
        })
      );
    });
  });

  it("asks before leaving unsaved job description edits", async () => {
    const user = userEvent.setup();
    vi.mocked(api.listJobDescriptions).mockResolvedValue([
      {
        description: PAINTING_OF_CEILING,
        single: 75,
        onePlusOne: 115,
        twoPlusOne: 125,
        twoPlusTwo: 150,
        threePlusTwo: 175,
        fourPlusTwo: 195,
        occupied: null,
        fixed: null,
      },
    ]);
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /6\.\s*Job Descriptions/i }));
    const desc = await screen.findByLabelText("Job description 1");
    await user.type(desc, " extra");
    await user.keyboard("{Escape}");
    expect(screen.getByText(UNSAVED_JOB_CHANGES)).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.getByLabelText("Job description 1")).toHaveValue(`${PAINTING_OF_CEILING} extra`);
    expect(api.saveJobDescription).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    await user.keyboard("y");
    expect(screen.getByRole("button", { name: /6\.\s*Job Descriptions/i })).toBeInTheDocument();
    expect(api.saveJobDescription).not.toHaveBeenCalled();
  });

  it("lists Import Database as option 4", () => {
    renderApp(<MiscScreen onBack={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /4\.\s*Import Database/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /2\.\s*Reindex Data Files/i })
    ).toBeInTheDocument();
  });

  it("imports original DBF folder after confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(open).mockResolvedValue("C:\\DKSKapp\\COMPBACK\\PROMAS");
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /4\.\s*Import Database/i }));
    await user.click(
      screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i })
    );
    expect(
      screen.getByText(/Import REPLACES all current data/i)
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    await waitFor(() => {
      expect(api.importDbfFolder).toHaveBeenCalledWith(
        "C:\\DKSKapp\\COMPBACK\\PROMAS"
      );
    });
    expect(await screen.findByText(/Imported original PROMAS data/i)).toBeInTheDocument();
  });

  it("offers original import from Reindex Data Files", async () => {
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(
      screen.getByRole("button", { name: /2\.\s*Reindex Data Files/i })
    );
    expect(screen.getByRole("button", { name: /Reindex Now/i })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i })
    ).toBeInTheDocument();
  });
});

const sysdata = {
  company: "DKS Painting",
  address1: "1 Main St",
  address2: "",
  city: "IRVINE",
  zip: "92614",
  closeDate: null,
  nextInvoice: 1042,
  nextOrder: 7,
  nextEstimate: 3,
  termsDays: 7,
  interestRate: 1.5,
};

describe("MiscScreen system date", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSysdata).mockResolvedValue({ ...sysdata });
    vi.mocked(api.saveSysdata).mockResolvedValue(undefined);
  });

  it("edits the company block and counters, then saves on Ctrl-S", async () => {
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /1\.\s*Change System Date/i }));
    const company = await screen.findByRole("textbox", { name: "Company" });
    expect(company).toHaveValue("DKS Painting");
    await user.clear(company);
    await user.type(company, "DKS Painting Inc");
    await user.type(screen.getByRole("textbox", { name: "Address2" }), "Suite 4");
    const next = screen.getByRole("spinbutton", { name: "Next Invoice" });
    await user.clear(next);
    await user.type(next, "2000");
    await user.clear(screen.getByRole("spinbutton", { name: "Terms Days" }));
    fireEvent.change(screen.getByLabelText(/Close Date/), { target: { value: "2026-01-31" } });
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveSysdata).toHaveBeenCalledWith(
        expect.objectContaining({
          company: "DKS Painting Inc",
          address2: "Suite 4",
          nextInvoice: 2000,
          termsDays: 7,
          closeDate: "2026-01-31",
        })
      )
    );
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("lets a counter be cleared, then saves the default for a blank one", async () => {
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /1\.\s*Change System Date/i }));
    for (const name of ["Next Order", "Next Estimate", "Terms Days"]) {
      const box = await screen.findByRole("spinbutton", { name });
      await user.clear(box);
      expect(box).toHaveValue(null);
    }
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveSysdata).toHaveBeenCalledWith(
        expect.objectContaining({ nextOrder: 1, nextEstimate: 1, termsDays: 7 })
      )
    );
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Next Order" })).toHaveValue(1);
    expect(screen.getByRole("spinbutton", { name: "Terms Days" })).toHaveValue(7);
  });

  it("shows a failed save or load", async () => {
    const user = userEvent.setup();
    vi.mocked(api.saveSysdata).mockRejectedValue(new Error("readonly database"));
    const { unmount } = renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /1\.\s*Change System Date/i }));
    await screen.findByRole("textbox", { name: "Company" });
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/readonly database/)).toBeInTheDocument();
    unmount();

    vi.mocked(api.getSysdata).mockRejectedValue(new Error("no sysdata row"));
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /1\.\s*Change System Date/i }));
    await waitFor(() => expect(api.getSysdata).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("textbox", { name: "Company" })).not.toBeInTheDocument();
  });

  it("closes help, then the screen, then leaves on Esc", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<MiscScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /1\.\s*Change System Date/i }));
    await screen.findByRole("textbox", { name: "Company" });
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: /1\.\s*Change System Date/i })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});

describe("MiscScreen reindex and import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.reindexDataFiles).mockResolvedValue("Reindex complete.");
  });

  async function openReindex() {
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /2\.\s*Reindex Data Files/i }));
    return user;
  }

  it("reindexes after Y and reports the result", async () => {
    const user = await openReindex();
    expect(screen.getAllByText(/DO NOT RUN THIS PROGRAM IF OTHER USERS ARE LOGGED IN/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Reindex Now" }));
    expect(screen.getByText("Are you sure(Y/N) ?")).toBeInTheDocument();
    await user.keyboard("y");
    expect(await screen.findByText("Reindex complete.")).toBeInTheDocument();
    expect(api.reindexDataFiles).toHaveBeenCalledTimes(1);
  });

  it("does nothing on N or Esc, and shows a failed reindex", async () => {
    vi.mocked(api.reindexDataFiles).mockRejectedValue(new Error("database is locked"));
    const user = await openReindex();
    await user.click(screen.getByRole("button", { name: "Reindex Now" }));
    await user.keyboard("n");
    expect(screen.queryByText("Are you sure(Y/N) ?")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reindex Now" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Are you sure(Y/N) ?")).not.toBeInTheDocument();
    expect(api.reindexDataFiles).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Reindex Now" }));
    await user.keyboard("Y");
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("imports nothing when the folder picker is cancelled", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const user = await openReindex();
    await user.click(screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i }));
    await user.keyboard("Y");
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(api.importDbfFolder).not.toHaveBeenCalled();
  });

  it("asks again on N and shows a failed import", async () => {
    vi.mocked(open).mockResolvedValue("C:\\PROMAS");
    vi.mocked(api.importDbfFolder).mockRejectedValue(new Error("COMPANY.DBF not found"));
    const user = userEvent.setup();
    renderApp(<MiscScreen onBack={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: /4\.\s*Import Database/i }));
    expect(screen.getByText(/This REPLACES all current companies/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i }));
    await user.keyboard("N");
    expect(screen.queryByText(/Are you sure\(Y\/N\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i }));
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Are you sure\(Y\/N\)/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i }));
    await user.keyboard("y");
    expect(await screen.findByText(/COMPANY\.DBF not found/)).toBeInTheDocument();
  });

  it("summarises the last import messages", async () => {
    vi.mocked(open).mockResolvedValue("C:\\PROMAS");
    vi.mocked(api.importDbfFolder).mockResolvedValue({
      companies: 2,
      properties: 4,
      employees: 1,
      workTypes: 3,
      invoices: 10,
      invoiceLines: 20,
      cashReceipts: 5,
      materials: 6,
      workOrders: 1,
      estimates: 2,
      messages: ["one", "two", "three", "four"],
    });
    const user = await openReindex();
    await user.click(screen.getByRole("button", { name: /Select Original PROMAS Folder & Import/i }));
    await user.click(screen.getByRole("button", { name: "Y" }));
    const summary = await screen.findByText(/Companies 2\s+Properties 4\s+Employees 1/);
    expect(summary).toHaveTextContent(/Invoices 10 Lines 20 Receipts 5 Orders 1 Estimates 2 Materials 6/);
    expect(summary).toHaveTextContent(/two three four$/);
    expect(summary).not.toHaveTextContent(/one/);
  });
});

describe("MiscScreen form management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listForms).mockResolvedValue([{ formNo: "EST-1", content: "Proposal text" }]);
    vi.mocked(api.saveForm).mockResolvedValue(undefined);
  });

  async function openForms() {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderApp(<MiscScreen onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: /3\.\s*Form Management/i }));
    return { user, onBack };
  }

  it("edits a form picked from the list", async () => {
    const { user } = await openForms();
    await user.click(await screen.findByRole("button", { name: /Proposal text/ }));
    const text = screen.getByRole("textbox", { name: "Form text" });
    await user.clear(text);
    await user.type(text, "New proposal text");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveForm).toHaveBeenCalledWith({ formNo: "EST-1", content: "New proposal text" })
    );
    expect(await screen.findByText("Form saved.")).toBeInTheDocument();
    expect(api.listForms).toHaveBeenCalledTimes(2);
  });

  it("adds a form with Ins, upper-casing its number, and needs a number", async () => {
    const { user } = await openForms();
    await screen.findByRole("button", { name: /Proposal text/ });
    await user.keyboard("{Insert}");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Form # required !!")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Form #" }), "inv-2");
    expect(screen.getByRole("textbox", { name: "Form #" })).toHaveValue("INV-2");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(api.saveForm).toHaveBeenCalledWith({ formNo: "INV-2", content: "" }));
  });

  it("starts with EST-1 when there are no forms, and shows a failed save", async () => {
    vi.mocked(api.listForms).mockResolvedValue([]);
    vi.mocked(api.saveForm).mockRejectedValue(new Error("readonly database"));
    const { user } = await openForms();
    await user.click(await screen.findByRole("button", { name: /EST-1/ }));
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/readonly database/)).toBeInTheDocument();
  });

  it("closes the editor, then the list, on Esc", async () => {
    const { user, onBack } = await openForms();
    await user.click(await screen.findByRole("button", { name: /Proposal text/ }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("textbox", { name: "Form text" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Proposal text/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByRole("button", { name: /3\.\s*Form Management/i })).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
  });
});
