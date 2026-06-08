// =============================================================================
// Tablecast — React Error Boundary
// Catches rendering errors gracefully and displays a fallback UI instead of
// unmounting the entire application.
// =============================================================================
import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const isCritical = this.props.critical;

      if (isCritical) {
        // Critical boundary — full-page fallback
        return (
          <div style={styles.criticalContainer}>
            <div style={styles.card} className="glass-panel">
              <div style={styles.icon}>⚠️</div>
              <h2 style={styles.title}>Something went wrong</h2>
              <p style={styles.message}>
                Tablecast encountered an unexpected error. Please try reloading.
              </p>
              {process.env.NODE_ENV === "development" && this.state.error && (
                <pre style={styles.details}>
                  {this.state.error.toString()}
                </pre>
              )}
              <div style={styles.actions}>
                <button
                  onClick={this.handleReload}
                  style={styles.reloadBtn}
                  className="touch-target btn-hover-scale"
                >
                  Reload App
                </button>
              </div>
            </div>
          </div>
        );
      }

      // Non-critical boundary — inline fallback for a panel section
      return (
        <div style={styles.inlineFallback} className="glass-panel">
          <p style={styles.inlineText}>
            This panel encountered an error and was closed.
          </p>
          <button
            onClick={this.handleReset}
            style={styles.retryBtn}
            className="touch-target"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const styles = {
  criticalContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    width: "100vw",
    background: "var(--color-bg)",
    padding: "1rem",
  },
  card: {
    maxWidth: "440px",
    width: "100%",
    padding: "2rem",
    borderRadius: "12px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
  },
  icon: {
    fontSize: "2.5rem",
  },
  title: {
    fontSize: "1.25rem",
    color: "var(--color-text)",
    fontWeight: 700,
    margin: 0,
  },
  message: {
    fontSize: "0.9rem",
    color: "var(--color-muted)",
    lineHeight: 1.5,
    margin: 0,
  },
  details: {
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.2)",
    borderRadius: "6px",
    padding: "0.75rem",
    fontSize: "0.75rem",
    color: "var(--color-danger)",
    textAlign: "left",
    overflowX: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  actions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "center",
  },
  reloadBtn: {
    padding: "0.6rem 1.5rem",
    borderRadius: "6px",
    border: "none",
    background: "var(--color-accent)",
    color: "var(--color-bg)",
    fontWeight: "bold",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  inlineFallback: {
    padding: "1.5rem",
    margin: "1rem",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    alignItems: "center",
  },
  inlineText: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    margin: 0,
  },
  retryBtn: {
    padding: "0.4rem 1rem",
    borderRadius: "4px",
    border: "1px solid var(--color-accent)",
    background: "transparent",
    color: "var(--color-accent)",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
