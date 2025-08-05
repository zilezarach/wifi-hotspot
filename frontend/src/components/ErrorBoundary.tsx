import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Error Boundary caught an error:", error, errorInfo);
    this.setState({ error, errorInfo });

    // You could also log this to your backend for logging
    fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      }),
    }).catch(console.error);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-content">
            <AlertTriangle size={48} color="#ef4444" />
            <h2>Oops! Something went wrong</h2>
            <p>
              We encountered an unexpected error. Please try refreshing the
              page.
            </p>

            {process.env.NODE_ENV === "development" && (
              <details className="error-details">
                <summary>Error Details (Development)</summary>
                <pre>{this.state.error?.message}</pre>
                <pre>{this.state.error?.stack}</pre>
              </details>
            )}

            <div className="error-actions">
              <button
                onClick={() => window.location.reload()}
                className="error-button primary"
              >
                <RefreshCw size={16} />
                Refresh Page
              </button>

              <button
                onClick={() => this.setState({ hasError: false })}
                className="error-button secondary"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
