// =============================================================================
// Tablecast — Typing Indicator Component
// WhatsApp-style animated dots showing that someone is typing.
// =============================================================================

export default function TypingIndicator({ user }) {
  if (!user) return null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: "0.4rem",
        padding: "0.2rem 0",
        marginTop: "0.15rem",
      }}
    >
      <div
        style={{
          background: "rgba(255,255,255,0.06)",
          borderRadius: "1rem 1rem 1rem 0.35rem",
          padding: "0.5rem 0.75rem",
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
        }}
      >
        <span className="typing-dot" />
        <span className="typing-dot" style={{ animationDelay: "0.2s" }} />
        <span className="typing-dot" style={{ animationDelay: "0.4s" }} />
      </div>
      <span style={{ fontSize: "0.68rem", color: "var(--color-muted)", whiteSpace: "nowrap" }}>
        {user}
      </span>
    </div>
  );
}
