import { Component, type ErrorInfo, type ReactNode } from "react";
import { log } from "../lib/observability";

type Props = { children: ReactNode };
type State = { error: Error | null };

/** Catches React render errors and records them in observability. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    log.error("app", "react render error", {
      error: error.message,
      stack: error.stack?.slice(0, 500),
      componentStack: info.componentStack?.slice(0, 500),
    });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="dos-screen" style={{ padding: "2em", color: "#fff" }}>
          <div className="dos-titlebar"> Unexpected Error </div>
          <p style={{ color: "var(--dos-yellow)", marginTop: "1.5em" }}>
            Something went wrong while rendering the screen.
          </p>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              color: "var(--dos-white-bright)",
              background: "rgba(0,0,0,0.3)",
              padding: "1em",
              border: "1px solid var(--dos-cyan)",
              maxWidth: "70ch",
            }}
          >
            {this.state.error.message}
          </pre>
          <button
            className="dos-btn"
            style={{ marginTop: "1em" }}
            onClick={() => this.setState({ error: null })}
            autoFocus
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
