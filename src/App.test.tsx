import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent, waitFor } from "./test/render";
import App from "./App";
import { openPrintPreview } from "./stores/printPreviewStore";
import { QUIT_PROMPT } from "./lib/windowClose";
import { getAppState } from "./lib/observability";

const invoke = vi.fn();
let onAsk: (() => void) | undefined;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: async (_event: string, handler: () => void) => {
    onAsk = handler;
    return () => {
      onAsk = undefined;
    };
  },
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
    onCloseRequested: async () => () => {},
  }),
}));

vi.mock("./components/UpdateDialog", () => ({
  UpdateDialog: () => null,
}));

describe("App window close", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    onAsk = undefined;
  });

  it("asks before quit when the window close event fires", async () => {
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(onAsk).toBeTypeOf("function");
    act(() => onAsk!());
    expect(
      screen.getByText(/Do you want quit \(Y\/N\)/i)
    ).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("does not quit when the user answers N", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onAsk!());
    await user.click(screen.getByRole("button", { name: /^N$/i }));
    expect(screen.queryByText(/Do you want quit \(Y\/N\)/i)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("closes print form with the overlay X without quitting", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    act(() => openPrintPreview("blob:test-invoice"));
    await user.click(screen.getByRole("button", { name: /Close print form/i }));
    expect(screen.queryByRole("dialog", { name: /Invoice print form/i })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("closes print form on window X instead of quitting", async () => {
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => openPrintPreview("blob:test-invoice"));
    expect(screen.getByRole("dialog", { name: /Invoice print form/i })).toBeInTheDocument();
    act(() => onAsk!());
    expect(screen.queryByRole("dialog", { name: /Invoice print form/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Do you want quit \(Y\/N\)/i)).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("quits only after the user answers Y", async () => {
    const user = userEvent.setup();
    renderApp(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onAsk!());
    await user.click(screen.getByRole("button", { name: /^Y$/i }));
    expect(invoke).toHaveBeenCalledWith("confirm_quit");
  });
});

function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  });
}

const titleBar = () => document.querySelector(".dos-titlebar");
const messageBar = () => document.querySelector(".dos-messagebar");
const mainMenu = () => screen.queryByRole("button", { name: /1\.\s*Estimate Process/ });

async function renderAndAskToQuit() {
  renderApp(<App />);
  await act(async () => {
    await Promise.resolve();
  });
  act(() => onAsk!());
  expect(screen.getByRole("dialog", { name: QUIT_PROMPT })).toBeInTheDocument();
}

describe("App window-close prompt keys", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
    onAsk = undefined;
  });

  it.each(["y", "Y", "Enter"])("%s quits", async (k) => {
    await renderAndAskToQuit();
    key(k);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("confirm_quit"));
  });

  it.each(["n", "N", "Escape"])("%s closes the prompt without quitting", async (k) => {
    await renderAndAskToQuit();
    key(k);
    expect(screen.queryByRole("dialog", { name: QUIT_PROMPT })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
  });

  it("Esc does not also open the main menu's own quit question", async () => {
    await renderAndAskToQuit();
    key("Escape");
    expect(screen.queryByRole("dialog", { name: QUIT_PROMPT })).not.toBeInTheDocument();
    expect(messageBar()).not.toHaveTextContent(QUIT_PROMPT);
  });

  it("Enter quits without opening the highlighted menu item", async () => {
    await renderAndAskToQuit();
    key("Enter");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("confirm_quit"));
    expect(mainMenu()).toBeInTheDocument();
  });

  it("Tab still moves between Y and N", async () => {
    const user = userEvent.setup();
    await renderAndAskToQuit();
    expect(screen.getByRole("button", { name: "Y" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "N" })).toHaveFocus();
  });

  it("Enter presses the answer that has focus", async () => {
    const user = userEvent.setup();
    await renderAndAskToQuit();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(screen.queryByRole("dialog", { name: QUIT_PROMPT })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalledWith("confirm_quit");
    expect(mainMenu()).toBeInTheDocument();

    act(() => onAsk!());
    expect(screen.getByRole("button", { name: "Y" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("confirm_quit"));
  });

  it("other keys stay with the prompt, not the screen behind it", async () => {
    await renderAndAskToQuit();
    key("1");
    key("Insert");
    expect(screen.getByRole("dialog", { name: QUIT_PROMPT })).toBeInTheDocument();
    expect(mainMenu()).toBeInTheDocument();
  });

  it("Esc keeps the open screen", async () => {
    renderApp(<App />);
    key("8");
    expect(titleBar()).toHaveTextContent("Settings");
    await act(async () => {
      await Promise.resolve();
    });
    act(() => onAsk!());
    key("Escape");
    expect(screen.queryByRole("dialog", { name: QUIT_PROMPT })).not.toBeInTheDocument();
    expect(titleBar()).toHaveTextContent("Settings");
  });
});

const sysdata = {
  company: "Test Co",
  address1: "",
  address2: "",
  city: "",
  zip: "",
  closeDate: null,
  nextInvoice: 1,
  nextOrder: 1,
  nextEstimate: 1,
  termsDays: 7,
  interestRate: 1.5,
};

describe("App navigation", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (cmd: string) => {
      if (cmd === "get_sysdata") return sysdata;
      if (cmd.startsWith("list_") || cmd.startsWith("report_")) return [];
      return undefined;
    });
    onAsk = undefined;
  });

  it.each([
    ["1", "Estimate Process"],
    ["2", "Work Order Process"],
    ["3", "Invoice Process"],
    ["4", "Cash Receipts Process"],
  ])("menu %s opens the %s company search, and Esc comes back", async (num, title) => {
    renderApp(<App />);
    key(num);
    expect(await screen.findByRole("textbox", { name: "Company NO" })).toBeInTheDocument();
    expect(titleBar()).toHaveTextContent(title);
    expect(mainMenu()).not.toBeInTheDocument();
    key("Escape");
    expect(mainMenu()).toBeInTheDocument();
  });

  it.each([
    ["6", "Reports Menu", "reports"],
    ["7", "Miscellaneous", "misc"],
    ["8", "Settings", "settings"],
  ])("menu %s opens %s, and Esc comes back", (num, title, name) => {
    renderApp(<App />);
    key(num);
    expect(titleBar()).toHaveTextContent(title);
    expect(getAppState().currentScreen).toBe(name);
    key("Escape");
    expect(mainMenu()).toBeInTheDocument();
    expect(getAppState().currentScreen).toBe("main");
  });

  it.each([
    ["1", "Material Maintenance"],
    ["2", "Worker Material Report (Worker Order)"],
    ["3", "Worker Material Report (Date Order)"],
    ["4", "Worker Material Report (Descript Order)"],
  ])("material menu %s opens the %s list, and Esc goes back one level", async (num, heading) => {
    renderApp(<App />);
    key("5");
    expect(titleBar()).toHaveTextContent("Material Process");
    key(num);
    await waitFor(() => expect(messageBar()).toHaveTextContent(heading));
    expect(screen.queryByRole("button", { name: /Worker Wages Calculation/ })).not.toBeInTheDocument();
    key("Escape");
    expect(screen.getByRole("button", { name: /Worker Wages Calculation/ })).toBeInTheDocument();
    key("Escape");
    expect(mainMenu()).toBeInTheDocument();
  });

  it("material menu 5 opens the wages report, and Esc goes back to the material menu", () => {
    renderApp(<App />);
    key("5");
    key("5");
    expect(titleBar()).toHaveTextContent("Worker Wages Report");
    key("Escape");
    expect(screen.getByRole("button", { name: /Worker Wages Calculation/ })).toBeInTheDocument();
  });

  it("quits from the main menu's own Y/N question", async () => {
    renderApp(<App />);
    key("Escape");
    expect(screen.getByRole("dialog", { name: QUIT_PROMPT })).toBeInTheDocument();
    key("y");
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("confirm_quit"));
  });
});

describe("App date boxes", () => {
  const boxes: HTMLInputElement[] = [];

  /** A date box 100px wide and 20px tall, so its calendar icon covers x 181–200. */
  function dateBox(props: Partial<Pick<HTMLInputElement, "type" | "disabled" | "readOnly">> = {}) {
    const box = Object.assign(document.createElement("input"), { type: "date", ...props });
    box.getBoundingClientRect = () => new DOMRect(100, 0, 100, 20);
    box.showPicker = vi.fn();
    document.body.appendChild(box);
    boxes.push(box);
    return box;
  }

  function pressAt(target: Element, clientX: number) {
    const ev = new MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX });
    target.dispatchEvent(ev);
    return ev;
  }

  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  afterEach(() => {
    boxes.splice(0).forEach((b) => b.remove());
  });

  it("opens the calendar when the icon is pressed", () => {
    renderApp(<App />);
    const box = dateBox();
    const ev = pressAt(box, 195);
    expect(box.showPicker).toHaveBeenCalledOnce();
    expect(ev.defaultPrevented).toBe(true);
    expect(box).toHaveFocus();
  });

  it("leaves a press on the date text to the box", () => {
    renderApp(<App />);
    const box = dateBox();
    const ev = pressAt(box, 150);
    expect(box.showPicker).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it.each([
    ["disabled", { disabled: true }],
    ["read-only", { readOnly: true }],
    ["text", { type: "text" }],
  ] as const)("ignores a %s box", (_label, props) => {
    renderApp(<App />);
    const box = dateBox(props);
    const ev = pressAt(box, 195);
    expect(box.showPicker).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("still focuses the box when the engine refuses to open the calendar", () => {
    renderApp(<App />);
    const box = dateBox();
    vi.mocked(box.showPicker).mockImplementation(() => {
      throw new DOMException("not allowed", "NotAllowedError");
    });
    expect(() => pressAt(box, 195)).not.toThrow();
    expect(box).toHaveFocus();
  });

  it("stops listening after the app unmounts", () => {
    const { unmount } = renderApp(<App />);
    unmount();
    const box = dateBox();
    pressAt(box, 195);
    expect(box.showPicker).not.toHaveBeenCalled();
  });
});
