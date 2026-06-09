// =============================================================================
// Tablecast — AiStreamingIndicator
// Shared animated dots indicator for AI streaming responses.
// Replaces static "_Thinking…_" placeholders and loading text across
// AiPanel, AiChatView, and ChatPanel.
// =============================================================================

/**
 * @param {Object} props
 * @param {string} [props.text] - Optional label before the dots (default: "Thinking")
 * @param {string} [props.size] - "sm" | "md" (default: "sm")
 */
export default function AiStreamingIndicator({ text = "Thinking", size = "sm" }) {
  const gap = size === "md" ? "0.25rem" : "0.15rem";
  const fontSize = size === "md" ? "0.9rem" : "0.8rem";

  // The dotAnim class provides the blink animation;
  // we give each dot a small fixed width so empty spans are visible
  const dotStyle = {
    display: "inline-block",
    width: "4px",
    height: "4px",
    borderRadius: "50%",
    background: "var(--color-accent)",
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap,
        fontSize,
        fontStyle: "italic",
        color: "var(--color-muted)",
      }}
    >
      <span className="dotAnim" style={{ ...dotStyle, animationDelay: "0s" }} />
      <span className="dotAnim" style={{ ...dotStyle, animationDelay: "0.2s" }} />
      <span className="dotAnim" style={{ ...dotStyle, animationDelay: "0.4s" }} />
      <span style={{ marginLeft: "0.2rem" }}>{text}</span>
    </div>
  );
}
