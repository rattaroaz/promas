import { describe, expect, it, vi } from "vitest";
import { renderApp, screen, userEvent } from "../test/render";
import { ErrorBoundary } from "./ErrorBoundary";
import { log, resetObservabilityForTests } from "../lib/observability";

function Boom(): never {
  throw new Error("kaboom render");
}

describe("ErrorBoundary", () => {
  it("shows fallback UI and logs react render error", async () => {
    resetObservabilityForTests();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderApp(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    expect(await screen.findByText(/Unexpected Error/i)).toBeInTheDocument();
    expect(screen.getByText(/kaboom render/i)).toBeInTheDocument();
    expect(
      log.getRecent().some(
        (e) => e.category === "app" && e.message === "react render error"
      )
    ).toBe(true);

    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Try again/i }));
    // After reset, Boom throws again → still in error UI
    expect(await screen.findByText(/Unexpected Error/i)).toBeInTheDocument();
    spy.mockRestore();
  });
});
