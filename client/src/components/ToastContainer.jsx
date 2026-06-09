// =============================================================================
// Tablecast  Toast Notification Container
// Renders a fixed bottom-center stack of non-blocking toast notifications.
// Each toast has an icon, message, and dismiss button — auto-dismissed via parent.
// =============================================================================
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

const ICONS = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLORS = {
  success: {
    border: "rgba(111, 207, 151, 0.5)",
    bg: "rgba(111, 207, 151, 0.12)",
    color: "var(--color-success)",
  },
  error: {
    border: "rgba(235, 87, 87, 0.5)",
    bg: "rgba(235, 87, 87, 0.12)",
    color: "var(--color-danger)",
  },
  warning: {
    border: "rgba(200, 151, 58, 0.5)",
    bg: "rgba(200, 151, 58, 0.12)",
    color: "var(--color-accent)",
  },
  info: {
    border: "rgba(86, 204, 242, 0.5)",
    bg: "rgba(86, 204, 242, 0.12)",
    color: "var(--color-info)",
  },
};

export default function ToastContainer({ toasts, removeToast }) {
  if (toasts.length === 0) return null;

  return (
    <div style={styles.container} aria-live="polite" aria-label="Notifications">
      {toasts.map((toast) => {
        const Icon = ICONS[toast.type] || Info;
        const colors = COLORS[toast.type] || COLORS.info;
        return (
          <div
            key={toast.id}
            style={{ ...styles.toast, borderColor: colors.border, background: colors.bg }}
            className="toast-enter"
            role="alert"
          >
            <Icon size={18} style={{ color: colors.color, flexShrink: 0 }} />
            <span style={styles.message}>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              style={styles.dismissBtn}
              className="touch-target"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  container: {
    position: "fixed",
    bottom: "calc(58px + 0.75rem)",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    display: "flex",
    flexDirection: "column-reverse",
    gap: "0.5rem",
    maxWidth: "90vw",
    width: "420px",
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.65rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid",
    backdropFilter: "blur(8px)",
    boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
    pointerEvents: "auto",
    minHeight: "44px",
  },
  message: {
    flex: 1,
    fontSize: "0.85rem",
    color: "var(--color-text)",
    lineHeight: "1.35",
  },
  dismissBtn: {
    flexShrink: 0,
    width: "28px",
    height: "28px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-muted)",
    cursor: "pointer",
    padding: 0,
    fontSize: "0.8rem",
    transition: "background 0.15s",
  },
};
