import { ReactElement } from "react";
import { render, RenderOptions } from "@testing-library/react";

/** Shared render helper — extend here if a provider tree is added later. */
export function renderApp(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  return render(ui, options);
}

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";
