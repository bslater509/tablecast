// =============================================================================
// Tablecast — Promise-based Confirmation Dialog Context
// Replaces native confirm() with a styled, non-blocking modal dialog.
// Usage: const { showConfirm } = useConfirm();
//        if (await showConfirm("Delete?", "Are you sure?")) { ... }
// =============================================================================
import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ConfirmContext = createContext(null);

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider");
  return ctx;
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { title, message, confirmLabel } or null
  const resolveRef = useRef(null);

  const showConfirm = useCallback((...args) => {
    let title; let message; let confirmLabel;
    if (args.length === 1) {
      title = "Confirm";
      message = args[0];
      confirmLabel = "Confirm";
    } else if (args.length === 2 && typeof args[1] === "string") {
      title = args[0];
      message = args[1];
      confirmLabel = title.replace(/[?]$/, "");
    } else {
      title = args[0];
      message = args[1];
      confirmLabel = args[2] ?? title.replace(/[?]$/, "");
    }

    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ title, message, confirmLabel });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(true);
      resolveRef.current = null;
      setState(null);
    }
  }, []);

  const handleCancel = useCallback(() => {
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
      setState(null);
    }
  }, []);

  // Escape key dismisses
  useEffect(() => {
    if (!state) return;
    const onKey = (e) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, handleCancel]);

  return (
    <ConfirmContext.Provider value={{ showConfirm }}>
      {children}
      {state && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5, 3, 10, 0.8)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
            padding: "1rem",
          }}
          onClick={handleCancel}
        >
          <div
            className="glass-panel gold-border-glow"
            style={{
              width: "100%",
              maxWidth: "400px",
              borderRadius: "10px",
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "1rem",
                fontWeight: 700,
                color: "var(--color-danger)",
                margin: 0,
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                paddingBottom: "0.5rem",
              }}
            >
              {state.title}
            </h3>
            <p
              style={{
                fontSize: "0.85rem",
                lineHeight: 1.5,
                color: "var(--color-text)",
                margin: 0,
              }}
            >
              {state.message}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "0.5rem",
                borderTop: "1px solid rgba(255,255,255,0.06)",
                paddingTop: "0.75rem",
              }}
            >
              <button
                onClick={handleCancel}
                className="touch-target"
                style={{
                  padding: "0.45rem 0.85rem",
                  borderRadius: "4px",
                  background: "transparent",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "var(--color-text)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  minWidth: "80px",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="touch-target btn-hover-scale"
                style={{
                  padding: "0.45rem 1rem",
                  borderRadius: "4px",
                  background: "rgba(235, 87, 87, 0.15)",
                  border: "1px solid rgba(235, 87, 87, 0.35)",
                  color: "var(--color-danger)",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  minWidth: "80px",
                }}
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
