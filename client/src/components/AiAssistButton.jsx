// =============================================================================
// Tablecast — Shared AI Assist Button Component
// Reusable dropdown button for AI-powered text generation/expansion across
// all campaign content types (Wiki, NPCs, Monsters, Characters, Sessions).
// =============================================================================
import { useState, useEffect } from "react";
import { getJsonAuthHeaders } from "../utils/authHeaders";

// Actions that require existing text in the field
const ACTIONS_REQUIRING_TEXT = new Set([
  "expand", "summarize", "clarify", "make_dramatic", "style_5e", "read_aloud",
]);

// Default styles (can be overridden via props)
const defaultStyles = {
  toolbarBtn: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--color-text)",
    padding: "0.25rem 0.5rem",
    fontSize: "0.75rem",
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    minHeight: "28px",
  },
  assistDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    zIndex: 100,
    background: "var(--color-surface)",
    border: "1px solid var(--color-accent)",
    borderRadius: "6px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    minWidth: "140px",
    padding: "0.25rem 0",
    marginTop: "0.25rem",
  },
  assistOption: {
    background: "transparent",
    border: "none",
    color: "var(--color-text)",
    padding: "0.5rem 0.75rem",
    fontSize: "0.75rem",
    textAlign: "left",
    cursor: "pointer",
    width: "100%",
    outline: "none",
  },
  assistStatusText: {
    color: "var(--color-accent)",
    fontSize: "0.8rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    padding: "0.5rem",
    borderRadius: "4px",
    margin: "0.25rem 0 0 0",
  },
  assistUndoBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-accent)",
    textDecoration: "underline",
    cursor: "pointer",
    fontSize: "0.8rem",
    padding: 0,
    fontWeight: "600",
  },
};

/**
 * AiAssistButton — A reusable AI text assist dropdown button.
 *
 * @param {Object} props
 * @param {string} props.fieldName - Unique identifier for this field (e.g., "appearance", "backstory")
 * @param {Array} props.actions - Array of {action, label, requiresText} objects
 * @param {string} props.currentText - Current text value of the field
 * @param {Object} props.context - Entity context for the API call (entityType, npc/character/article data)
 * @param {Function} props.onApply - Callback(reply: string) when AI returns text
 * @param {Function} [props.onError] - Callback(message: string) on error
 * @param {Object} [props.user] - User object for auth headers
 * @param {boolean} [props.disabled] - Disable the button
 * @param {Object} [props.styles] - Override default styles
 * @param {string} [props.buttonLabel] - Custom button label (default: "✨ AI Assist")
 */
export default function AiAssistButton({
  fieldName,
  actions,
  currentText,
  context,
  onApply,
  onError,
  user,
  disabled = false,
  styles: customStyles = {},
  buttonLabel,
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [undoState, setUndoState] = useState(null); // { previousText }

  const styles = { ...defaultStyles, ...customStyles };

  // Close dropdown on outside click
  useEffect(() => {
    if (!showDropdown) return;
    const handleClose = () => setShowDropdown(false);
    // Delay to avoid immediate close from the opening click
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClose);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClose);
    };
  }, [showDropdown]);

  const handleToggleDropdown = (e) => {
    e.stopPropagation();
    if (disabled || isLoading) return;
    setShowDropdown((prev) => !prev);
  };

  const handleApply = async (action) => {
    setShowDropdown(false);

    if (ACTIONS_REQUIRING_TEXT.has(action) && !currentText?.trim()) {
      onError?.("Add some text first, or choose Generate.");
      return;
    }

    setIsLoading(true);
    setUndoState({ previousText: currentText || "" });

    try {
      const authHeaders = getJsonAuthHeaders(user);

      const res = await fetch("/api/ai/expand-text", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          text: currentText || "",
          action,
          field: fieldName,
          context: context || {},
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to process text.");
      }

      const data = await res.json();

      if (!data.reply) {
        throw new Error("AI returned empty content.");
      }

      onApply(data.reply);
    } catch (err) {
      console.error("[AiAssistButton] Error:", err);
      setUndoState(null);
      onError?.(err.message || "AI assist failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUndo = () => {
    if (!undoState) return;
    onApply(undoState.previousText);
    setUndoState(null);
  };

  const displayLabel = isLoading
    ? "✨ Thinking…"
    : buttonLabel || "✨ AI Assist";

  return (
    <div>
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          title="AI Assist"
          disabled={disabled || isLoading}
          onClick={handleToggleDropdown}
          style={{
            ...styles.toolbarBtn,
            color: "var(--color-accent)",
            width: "auto",
            padding: "0 0.5rem",
            gap: "0.25rem",
            opacity: isLoading || disabled ? 0.6 : 1,
          }}
          className="touch-target btn-hover-scale"
        >
          {displayLabel}
        </button>
        {showDropdown && !isLoading && (
          <div style={styles.assistDropdown} onClick={(e) => e.stopPropagation()}>
            {(actions || []).map(({ action, label, requiresText }) => {
              const isDisabled = requiresText && !currentText?.trim();
              return (
                <button
                  key={action}
                  type="button"
                  disabled={isDisabled}
                  onClick={() => handleApply(action)}
                  style={{
                    ...styles.assistOption,
                    opacity: isDisabled ? 0.4 : 1,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                  }}
                  className="touch-target"
                  title={isDisabled ? "Add text first or use Generate" : label}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {/* Status bar for loading/undo */}
      {isLoading && (
        <p style={styles.assistStatusText}>✨ AI is working on {fieldName}…</p>
      )}
      {!isLoading && undoState && (
        <p style={styles.assistStatusText}>
          AI update applied.{" "}
          <button
            type="button"
            onClick={handleUndo}
            style={styles.assistUndoBtn}
            className="touch-target"
          >
            Undo
          </button>
        </p>
      )}
    </div>
  );
}

// Export the action definitions for use by consumers
export const AI_FIELD_ACTIONS = {
  alignment: [
    { action: "generate", label: "Suggest Alignment" },
    { action: "clarify", label: "Clarify Morality", requiresText: true },
  ],
  appearance: [
    { action: "generate", label: "Generate" },
    { action: "expand", label: "Expand Details", requiresText: true },
    { action: "read_aloud", label: "Read-Aloud Box", requiresText: true },
    { action: "make_dramatic", label: "Make Dramatic", requiresText: true },
  ],
  personality: [
    { action: "generate", label: "Generate Traits" },
    { action: "expand", label: "Expand", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
    { action: "add_flaw", label: "Add Flaw/Secret" },
  ],
  history: [
    { action: "generate", label: "Generate Backstory" },
    { action: "expand", label: "Expand", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
    { action: "campaign_tie", label: "Tie to Campaign" },
  ],
  partyRelationship: [
    { action: "generate", label: "Generate" },
    { action: "friendly", label: "Make Friendly" },
    { action: "hostile", label: "Make Hostile" },
    { action: "expand", label: "Expand", requiresText: true },
  ],
  markdown: [
    { action: "generate", label: "Generate Draft" },
    { action: "expand", label: "Expand Lore", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
    { action: "make_dramatic", label: "Make Dramatic", requiresText: true },
    { action: "style_5e", label: "Format 5e Style", requiresText: true },
  ],
  // Character-specific fields
  backstory: [
    { action: "generate", label: "Generate Backstory" },
    { action: "expand", label: "Expand", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
    { action: "campaign_tie", label: "Tie to Campaign" },
  ],
  // Session-specific fields
  agenda: [
    { action: "generate", label: "Generate Agenda" },
    { action: "expand", label: "Expand", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
  ],
  recap: [
    { action: "generate", label: "Generate Recap" },
    { action: "expand", label: "Expand", requiresText: true },
    { action: "summarize", label: "Summarize", requiresText: true },
    { action: "make_dramatic", label: "Make Dramatic", requiresText: true },
  ],
};
