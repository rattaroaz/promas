import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "../test/render";
import { CompanyBrowse } from "./CompanyBrowse";
import { api, emptyCompany, emptyProperty } from "../api";

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    api: {
      ...actual.api,
      listCompanies: vi.fn(),
      nextCompanyNo: vi.fn(),
      saveCompany: vi.fn(),
      deleteCompany: vi.fn(),
      listProperties: vi.fn(),
      saveProperty: vi.fn(),
    },
  };
});

const acme = {
  ...emptyCompany(),
  companyNo: "1000",
  name: "ACME",
  city: "IRVINE",
  phone: "555-0100",
  contact: "ELAINE",
};
const bayside = { ...emptyCompany(), companyNo: "2000", name: "BAYSIDE", city: "COSTA MESA" };
const bldgA = { ...emptyProperty("1000"), proNo: "01", name: "Bldg A", street: "12 Main St", city: "IRVINE" };
const shop = { ...emptyProperty("1000"), proNo: "02", name: "Shop", street: "400 Harbor Blvd", city: "COSTA MESA" };

const row = (name: RegExp) => screen.findByRole("button", { name });

async function openList() {
  const user = userEvent.setup();
  const onBack = vi.fn();
  renderApp(<CompanyBrowse onBack={onBack} />);
  await screen.findByText(/2 companies/);
  return { user, onBack };
}

describe("CompanyBrowse", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listCompanies).mockResolvedValue([acme, bayside]);
    vi.mocked(api.nextCompanyNo).mockResolvedValue("2001");
    vi.mocked(api.saveCompany).mockResolvedValue("2001");
    vi.mocked(api.deleteCompany).mockResolvedValue(undefined);
    vi.mocked(api.listProperties).mockResolvedValue([bldgA, shop]);
    vi.mocked(api.saveProperty).mockResolvedValue(undefined);
  });

  it("lists companies and searches by what is typed", async () => {
    const { user } = await openList();
    expect(await row(/ACME/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /BAYSIDE/ })).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Company NO, Name/), "bay");
    await waitFor(() =>
      expect(api.listCompanies).toHaveBeenLastCalledWith({ search: "bay", limit: 2000 })
    );
  });

  it("says how to start when there are no companies", async () => {
    vi.mocked(api.listCompanies).mockResolvedValue([]);
    renderApp(<CompanyBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/No companies\. Press Ins to add/)).toBeInTheDocument();
    expect(screen.getByText("( no records )")).toBeInTheDocument();
  });

  it("shows a load error", async () => {
    vi.mocked(api.listCompanies).mockRejectedValue(new Error("database is locked"));
    renderApp(<CompanyBrowse onBack={vi.fn()} />);
    expect(await screen.findByText(/database is locked/)).toBeInTheDocument();
  });

  it("adds a company under the next number with Ins and Ctrl-S", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    const name = await screen.findByRole("textbox", { name: "Company Name" });
    expect(screen.getByRole("textbox", { name: "Company NO" })).toHaveValue("2001");
    expect(screen.getByText("Company Information")).toBeInTheDocument();
    await user.type(name, "CEDAR");
    await user.type(screen.getByRole("textbox", { name: "City" }), "TUSTIN");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveCompany).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "2001", name: "CEDAR", city: "TUSTIN" })
      )
    );
    expect(await screen.findByText("Company 2001 saved.")).toBeInTheDocument();
    expect(api.listCompanies).toHaveBeenCalledTimes(2);
  });

  it("numbers a new company 1000 when the next number cannot be read", async () => {
    vi.mocked(api.nextCompanyNo).mockRejectedValue(new Error("no sysdata"));
    const { user } = await openList();
    await user.keyboard("{Insert}");
    expect(await screen.findByRole("textbox", { name: "Company NO" })).toHaveValue("1000");
  });

  it("needs a company name before saving", async () => {
    const { user } = await openList();
    await user.keyboard("{Insert}");
    await screen.findByRole("textbox", { name: "Company Name" });
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Company Name required !!")).toBeInTheDocument();
    expect(api.saveCompany).not.toHaveBeenCalled();
  });

  it("keeps the editor open and shows the error when a save fails", async () => {
    vi.mocked(api.saveCompany).mockRejectedValue(new Error("disk full"));
    const { user } = await openList();
    await user.keyboard("{Insert}");
    await user.type(await screen.findByRole("textbox", { name: "Company Name" }), "CEDAR");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/disk full/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company Name" })).toHaveValue("CEDAR");
  });

  it("edits the selected company with Ctrl-Home", async () => {
    const { user } = await openList();
    await row(/ACME/);
    await user.keyboard("{Control>}{Home}{/Control}");
    const name = await screen.findByRole("textbox", { name: "Company Name" });
    expect(name).toHaveValue("ACME");
    expect(name).toBeEnabled();
    await user.clear(screen.getByRole("textbox", { name: "Contact" }));
    await user.type(screen.getByRole("textbox", { name: "Contact" }), "ROSA");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveCompany).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000", name: "ACME", contact: "ROSA" })
      )
    );
    expect(await screen.findByText("Company 1000 saved.")).toBeInTheDocument();
  });

  it("moves the selection with the arrow keys", async () => {
    const { user } = await openList();
    expect(await row(/ACME/)).toHaveClass("selected");
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("button", { name: /BAYSIDE/ })).toHaveClass("selected");
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("button", { name: /ACME/ })).toHaveClass("selected");
  });

  it("shows a read-only detail on Enter or click, with buttons to edit", async () => {
    const { user } = await openList();
    await row(/ACME/);
    await user.keyboard("{Enter}");
    expect(await screen.findByText("Detaill Company Information")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company Name" })).toBeDisabled();
    expect(screen.getByText(/Entered:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit (Ctrl-Home)" }));
    expect(screen.getByRole("textbox", { name: "Company Name" })).toBeEnabled();
    await user.keyboard("{Escape}");
    await user.click(await row(/BAYSIDE/));
    expect(screen.getByRole("textbox", { name: "Company Name" })).toHaveValue("BAYSIDE");
    expect(screen.getByRole("textbox", { name: "Company Name" })).toBeDisabled();
  });

  it("opens the editor on double-click", async () => {
    const { user } = await openList();
    await user.dblClick(await row(/BAYSIDE/));
    expect(screen.getByRole("textbox", { name: "Company Name" })).toBeEnabled();
    expect(screen.getByRole("textbox", { name: "City" })).toHaveValue("COSTA MESA");
  });

  it("asks before voiding: N keeps the company, Y voids it", async () => {
    const { user } = await openList();
    await row(/ACME/);
    await user.keyboard("{Delete}");
    expect(screen.getByText(/Do you want delete \(Y\/N\) \?\s+1000 ACME/)).toBeInTheDocument();
    await user.keyboard("n");
    expect(screen.queryByText(/Do you want delete/)).not.toBeInTheDocument();
    expect(api.deleteCompany).not.toHaveBeenCalled();
    await user.keyboard("{Delete}");
    await user.keyboard("Y");
    await waitFor(() => expect(api.deleteCompany).toHaveBeenCalledWith("1000"));
    expect(await screen.findByText("Company 1000 voided.")).toBeInTheDocument();
  });

  it("lists properties on Home, filters them by address, and adds one", async () => {
    const { user } = await openList();
    await row(/ACME/);
    await user.keyboard("{Home}");
    expect(await screen.findByText(/Properties for 1000 ACME/)).toBeInTheDocument();
    expect(api.listProperties).toHaveBeenCalledWith({ companyNo: "1000", limit: 500 });
    expect(screen.getByText(/Property File/)).toBeInTheDocument();
    const search = screen.getByPlaceholderText(/Property NO, Name, Street/);
    await user.type(search, "harbor");
    expect(screen.getByRole("button", { name: /Shop/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Bldg A/ })).not.toBeInTheDocument();
    await user.type(search, " nowhere");
    expect(screen.getByText("( no properties match that address )")).toBeInTheDocument();
    await user.clear(search);

    await user.keyboard("{Insert}");
    expect(await screen.findByText("Property Information")).toBeInTheDocument();
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText("--> Property NO and Name required !!")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Property NO" }), "03");
    await user.type(screen.getByRole("textbox", { name: "PropertyName" }), "Annex");
    await user.type(screen.getByRole("textbox", { name: "Gate Code" }), "#4411");
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() =>
      expect(api.saveProperty).toHaveBeenCalledWith(
        expect.objectContaining({ companyNo: "1000", proNo: "03", name: "Annex", keyInfo: "#4411" })
      )
    );
    expect(await screen.findByText("Property saved.")).toBeInTheDocument();
    expect(api.listProperties).toHaveBeenCalledTimes(2);
  });

  it("edits a property picked from the list and reports a failed save", async () => {
    vi.mocked(api.saveProperty).mockRejectedValue(new Error("constraint failed"));
    const { user } = await openList();
    await row(/ACME/);
    await user.keyboard("{Home}");
    await user.click(await row(/Bldg A/));
    const street = screen.getByRole("textbox", { name: "Street" });
    expect(street).toHaveValue("12 Main St");
    await user.clear(street);
    await user.type(street, "14 Main St");
    await user.keyboard("{Control>}s{/Control}");
    expect(await screen.findByText(/constraint failed/)).toBeInTheDocument();
    expect(api.saveProperty).toHaveBeenCalledWith(
      expect.objectContaining({ proNo: "01", street: "14 Main St" })
    );
  });

  it("says how to add a property when the company has none", async () => {
    vi.mocked(api.listProperties).mockResolvedValue([]);
    const { user } = await openList();
    await user.click(await row(/ACME/));
    await user.click(screen.getByRole("button", { name: "Properties (Home)" }));
    expect(await screen.findByText(/Property Empty !! Press Ins to Add Property/)).toBeInTheDocument();
  });

  it("steps back one level per Esc and leaves from the list", async () => {
    const { user, onBack } = await openList();
    await row(/ACME/);
    await user.keyboard("{Home}");
    await user.keyboard("{Insert}");
    await screen.findByText("Property Information");
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Property Information")).not.toBeInTheDocument();
    expect(screen.getByText(/Property File/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(await screen.findByText(/Company File/)).toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows help on F1 and prints the list on End", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    const { user } = await openList();
    await user.keyboard("{F1}");
    expect(screen.getByText(/Function Key Description/)).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/Function Key Description/)).not.toBeInTheDocument();
    await user.keyboard("{End}");
    expect(print).toHaveBeenCalledTimes(1);
  });
});
