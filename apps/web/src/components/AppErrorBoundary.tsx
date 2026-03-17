import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  message: string | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
    message: null,
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unexpected application error.",
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error("Application render failed.", error, info);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="app-shell app-shell--minimal">
        <main className="experience-shell">
          <section className="flow-card">
            <div className="section-head">
              <div>
                <p className="eyebrow">Runtime error</p>
                <h2>Page failed to load</h2>
              </div>
            </div>
            <div className="error-callout">{this.state.message ?? "Unexpected application error."}</div>
            <div className="action-row action-row--tight">
              <button
                className="primary-button"
                onClick={() => window.location.assign("/")}
                type="button"
              >
                Go Home
              </button>
              <button
                className="secondary-button"
                onClick={() => window.location.reload()}
                type="button"
              >
                Reload
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }
}
