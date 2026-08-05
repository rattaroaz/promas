import { describe, expect, it } from "vitest";
import { renderApp, screen, userEvent } from "../test/render";
import { UpdateDialog } from "./UpdateDialog";
import {
  closeUpdateDialog,
  openUpdateDialog,
  setUpdateDialog,
} from "../stores/uiStore";

describe("UpdateDialog", () => {
  it("renders nothing when idle", () => {
    const { container } = renderApp(<UpdateDialog />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows checking title and hides Close while busy", () => {
    openUpdateDialog();
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Checking for Updates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("shows Close for up_to_date and closes on click", async () => {
    const user = userEvent.setup();
    setUpdateDialog({ phase: "up_to_date", message: "All good" });
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Up to Date")).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Up to Date")).toBeNull();
  });

  it("uses error styling title", () => {
    setUpdateDialog({ phase: "error", message: "Nope" });
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Update Error")).toBeInTheDocument();
    closeUpdateDialog();
  });
});
