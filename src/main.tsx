import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installGlobalErrorHandlers } from "./lib/observability";

installGlobalErrorHandlers();

// The WebView treats Ctrl-S as "Save page". Swallow it on every screen.
window.addEventListener(
  "keydown",
  (e) => {
    if (
      e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      (e.key === "s" || e.key === "S")
    ) {
      e.preventDefault();
    }
  },
  true
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
