import { describe, expect, it, vi } from "vitest";
import { act, renderApp, screen, userEvent } from "../test/render";
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
    act(() => {
      openUpdateDialog();
    });
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Checking for Updates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("shows Close for up_to_date and closes on click", async () => {
    const user = userEvent.setup();
    act(() => {
      setUpdateDialog({ phase: "up_to_date", message: "All good" });
    });
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Up to Date")).toBeInTheDocument();
    expect(screen.getByText("All good")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Up to Date")).toBeNull();
  });

  it("uses error styling title", () => {
    act(() => {
      setUpdateDialog({ phase: "error", message: "Nope" });
    });
    renderApp(<UpdateDialog />);
    expect(screen.getByText("Update Error")).toBeInTheDocument();
    act(() => {
      closeUpdateDialog();
    });
  });

  it("Enter closes with focus on Close and with focus elsewhere", async () => {
    const user = userEvent.setup();
    act(() => {
      setUpdateDialog({
        phase: "up_to_date",
        message: "PROMAS 2.9.1 is up to date.",
      });
    });
    renderApp(<UpdateDialog />);
    const close = screen.getByRole("button", { name: "Close" });
    expect(close).toHaveAttribute("type", "button");
    close.focus();
    expect(document.activeElement).toBe(close);
    const click = vi.fn();
    close.addEventListener("click", click);
    const enterOnClose = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      close.dispatchEvent(enterOnClose);
    });
    expect(enterOnClose.defaultPrevented).toBe(true);
    expect(click).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();

    act(() => {
      setUpdateDialog({
        phase: "up_to_date",
        message: "PROMAS 2.9.1 is up to date.",
      });
    });
    const elsewhere = document.createElement("button");
    elsewhere.type = "button";
    elsewhere.textContent = "Elsewhere";
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    expect(document.activeElement).toBe(elsewhere);
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Up to Date")).toBeNull();
    elsewhere.remove();

    act(() => {
      setUpdateDialog({
        phase: "up_to_date",
        message: "PROMAS 2.9.1 is up to date.",
      });
    });
    (document.activeElement as HTMLElement | null)?.blur();
    document.body.focus();
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Up to Date")).toBeNull();
  });

  it("closes on Enter and Esc the same way Close does", async () => {
    const user = userEvent.setup();
    act(() => {
      setUpdateDialog({ phase: "up_to_date", message: "All good" });
    });
    const { rerender } = renderApp(<UpdateDialog />);
    await user.keyboard("{Enter}");
    expect(screen.queryByText("Up to Date")).toBeNull();

    act(() => {
      setUpdateDialog({ phase: "error", message: "Nope" });
    });
    rerender(<UpdateDialog />);
    expect(screen.getByText("Update Error")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Update Error")).toBeNull();
  });

  it("does not close while an update is still running", async () => {
    const user = userEvent.setup();
    act(() => {
      openUpdateDialog();
    });
    renderApp(<UpdateDialog />);
    await user.keyboard("{Enter}");
    await user.keyboard("{Escape}");
    expect(screen.getByText("Checking for Updates")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });
});
