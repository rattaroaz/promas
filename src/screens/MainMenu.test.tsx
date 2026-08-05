import { describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent } from "../test/render";
import { MainMenu } from "./MainMenu";

describe("MainMenu", () => {
  it("lists Settings as option 8", () => {
    renderApp(<MainMenu onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /8\.\s*Settings/i })).toBeInTheDocument();
  });

  it("invokes onSelect(settings) when Settings is clicked", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderApp(<MainMenu onSelect={onSelect} />);
    await user.click(screen.getByRole("button", { name: /8\.\s*Settings/i }));
    expect(onSelect).toHaveBeenCalledWith("settings");
  });

  it("lists all primary process items", () => {
    renderApp(<MainMenu onSelect={vi.fn()} />);
    expect(
      screen.getByRole("button", { name: /Estimate Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Work Order Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Invoice Process/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Miscellaneous/i })
    ).toBeInTheDocument();
  });
});

