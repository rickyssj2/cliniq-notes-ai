import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "./button";

type Props = {
  children: ReactNode;
  /** Optional label for where the boundary sits (e.g. "Notes"). */
  label?: string;
  fallback?: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Route/feature error boundary. Pulled forward from Phase 11 hardening so
 * render loops and unexpected throws don't blank the whole SPA.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", this.props.label ?? "app", error, info);
  }

  private reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div
        role="alert"
        className="mx-auto max-w-lg space-y-4 px-6 py-16 text-center"
      >
        <p className="text-sm font-medium tracking-[0.16em] text-[var(--muted)] uppercase">
          Something went wrong
          {this.props.label ? ` · ${this.props.label}` : ""}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">
          This view crashed
        </h1>
        <p className="text-sm text-[var(--muted)]">
          {error.message || "Unexpected render error"}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" size="sm" onClick={this.reset}>
            Try again
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              window.location.assign("/notes");
            }}
          >
            Back to notes
          </Button>
        </div>
      </div>
    );
  }
}
