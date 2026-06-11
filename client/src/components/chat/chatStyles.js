// =============================================================================
// Tablecast — Chat Panel Styles
// Styles object for the WhatsApp-style Chat Panel.
// =============================================================================

export const chatStyles = {
  /* Name entry overlay */
  nameOverlay: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "1rem",
    background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%)",
  },
  nameForm: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(200,151,58,0.3)",
    borderRadius: "1rem",
    padding: "2rem",
    maxWidth: "360px",
    width: "100%",
    textAlign: "center",
    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
  },
  nameTitle: {
    color: "var(--color-accent)",
    fontSize: "1.75rem",
    marginBottom: "0.25rem",
  },
  nameSub: {
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginBottom: "1.25rem",
  },
  nameInput: {
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "1rem",
    borderRadius: "0.5rem",
    border: "1px solid rgba(200,151,58,0.3)",
    background: "rgba(0,0,0,0.3)",
    color: "var(--color-text)",
    outline: "none",
    marginBottom: "1rem",
  },
  nameBtn: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "1rem",
    fontWeight: 600,
    borderRadius: "0.5rem",
    border: "none",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    color: "var(--color-bg)",
    cursor: "pointer",
    transition: "opacity 0.2s",
  },

  /* Chat layout */
  wrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxHeight: "100dvh",
    background: "linear-gradient(135deg, var(--color-bg) 0%, var(--color-surface) 100%)",
    position: "relative",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.65rem 1rem",
    borderBottom: "1px solid rgba(200,151,58,0.12)",
    background: "rgba(0,0,0,0.2)",
    flexShrink: 0,
    zIndex: 5,
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  title: {
    fontSize: "1.1rem",
    color: "var(--color-accent)",
    fontWeight: 700,
  },
  badge: {
    fontSize: "0.65rem",
    color: "var(--color-bg)",
    background: "rgba(200,151,58,0.85)",
    padding: "0.1rem 0.45rem",
    borderRadius: "999px",
    fontWeight: 600,
    letterSpacing: "0.03em",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    flexShrink: 0,
    boxShadow: "0 0 6px currentColor",
  },

  /* Messages area */
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "0.5rem 0.75rem",
    display: "flex",
    flexDirection: "column",
  },
  emptyHint: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
};
