// =============================================================================
// Tablecast — Generate Image Modal (6.9)
// DALL-E 3 image generation via prompt editing, style selection, preview,
// and accept/regenerate workflow.
// Usage: <GenerateImageModal show={bool} onClose={fn} onAccept={fn(imageUrl)}
//          defaultPrompt="..." authHeaders={{ "x-tablecast-user-id": "1" }} />
// =============================================================================
import { useState, useEffect } from "react";
import { Sparkles, Loader2, X, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Style mapping per task requirements
// ---------------------------------------------------------------------------
const STYLE_OPTIONS = [
  { value: "", label: "None" },
  { value: "photorealistic", label: "Photorealistic" },
  { value: "painted", label: "Painted" },
  { value: "sketch", label: "Sketch" },
  { value: "comic", label: "Comic" },
  { value: "fantasy-art", label: "Fantasy Art" },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function GenerateImageModal({
  show,
  isOpen,
  onClose,
  onAccept,
  defaultPrompt = "",
  authHeaders = {},
  entityType,
  entityName,
}) {
  const [promptText, setPromptText] = useState("");
  const [selectedStyle, setSelectedStyle] = useState("");
  const [loading, setLoading] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState(null);
  const [error, setError] = useState(null);

  // Reset state when the modal opens
  useEffect(() => {
    if (show || isOpen) {
      setPromptText(defaultPrompt);
      setSelectedStyle("");
      setLoading(false);
      setError(null);
      setGeneratedUrl(null);
    }
  }, [show, isOpen, defaultPrompt]);

  // Handle image generation
  const handleGenerate = async () => {
    if (!promptText || !promptText.trim()) return;

    setError(null);
    setLoading(true);
    setGeneratedUrl(null);

    try {
      const res = await fetch("/api/ai/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          prompt: promptText.trim(),
          style: selectedStyle || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }

      if (!data.imageUrl) {
        throw new Error("No image URL returned from server.");
      }

      setGeneratedUrl(data.imageUrl);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Accept the generated image
  const handleAccept = () => {
    if (generatedUrl && onAccept) {
      onAccept(generatedUrl);
    }
    onClose();
  };

  // Keyboard shortcut: Ctrl/Cmd+Enter to generate, Escape to close
  const handleKeyDown = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleGenerate();
    }
    if (e.key === "Escape") {
      onClose();
    }
  };

  if (!show && !isOpen) return null;

  // ===========================================================================
  // Styles
  // ===========================================================================
  const S = {
    overlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.7)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10000,
      padding: "0.75rem",
    },
    modal: {
      width: "100%",
      maxWidth: "600px",
      maxHeight: "90vh",
      overflowY: "auto",
      padding: "1.5rem",
      borderRadius: "12px",
      background: "#1a1f2e",
      border: "1px solid #334155",
      color: "#e2e8f0",
      position: "relative",
    },
    closeBtn: {
      position: "absolute",
      top: "10px",
      right: "10px",
      width: "44px",
      height: "44px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "rgba(255,255,255,0.06)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: "8px",
      cursor: "pointer",
      color: "#94a3b8",
      transition: "background 0.15s ease",
    },
    titleRow: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      marginBottom: "1.25rem",
      paddingRight: "44px", // space for close button
    },
    title: {
      margin: 0,
      fontSize: "1.1rem",
      fontWeight: 700,
      color: "#c8973a",
    },
    fieldGroup: {
      display: "flex",
      flexDirection: "column",
      gap: "0.35rem",
      marginBottom: "0.85rem",
    },
    label: {
      fontSize: "0.8rem",
      fontWeight: 700,
      color: "#94a3b8",
      textTransform: "uppercase",
      letterSpacing: "0.03em",
    },
    textarea: {
      width: "100%",
      padding: "0.65rem 0.75rem",
      borderRadius: "8px",
      border: "1px solid #334155",
      background: "#09080e",
      color: "#e2e8f0",
      fontSize: "0.9rem",
      fontFamily: "inherit",
      lineHeight: 1.5,
      resize: "vertical",
      minHeight: "80px",
      boxSizing: "border-box",
      outline: "none",
    },
    select: {
      width: "100%",
      padding: "0.6rem 0.75rem",
      borderRadius: "8px",
      border: "1px solid #334155",
      background: "#09080e",
      color: "#e2e8f0",
      fontSize: "0.9rem",
      boxSizing: "border-box",
      outline: "none",
      cursor: "pointer",
    },
    generateBtn: {
      width: "100%",
      padding: "0.7rem 1rem",
      borderRadius: "10px",
      border: "none",
      background: "#c8973a",
      color: "#09080e",
      fontWeight: 700,
      fontSize: "0.9rem",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.5rem",
      minHeight: "44px",
      transition: "opacity 0.15s ease",
      marginTop: "0.5rem",
    },
    generateBtnDisabled: {
      opacity: 0.5,
      cursor: "not-allowed",
    },
    error: {
      color: "#fca5a5",
      fontSize: "0.85rem",
      padding: "0.5rem 0.65rem",
      borderRadius: "8px",
      backgroundColor: "rgba(239,68,68,0.15)",
      border: "1px solid rgba(239,68,68,0.3)",
      lineHeight: 1.4,
      marginTop: "0.5rem",
    },
    status: {
      display: "flex",
      alignItems: "center",
      gap: "0.5rem",
      fontSize: "0.85rem",
      color: "#94a3b8",
      padding: "0.5rem 0.65rem",
      borderRadius: "8px",
      backgroundColor: "rgba(200,151,58,0.08)",
      border: "1px solid #334155",
      marginTop: "0.5rem",
    },
    previewSection: {
      display: "flex",
      flexDirection: "column",
      gap: "0.75rem",
      marginTop: "0.5rem",
    },
    imageWrapper: {
      borderRadius: "10px",
      overflow: "hidden",
      border: "1px solid #334155",
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    previewImage: {
      width: "100%",
      height: "auto",
      display: "block",
      maxHeight: "400px",
      objectFit: "contain",
    },
    actions: {
      display: "flex",
      gap: "0.65rem",
    },
    acceptBtn: {
      flex: 1,
      padding: "0.65rem 1rem",
      borderRadius: "10px",
      border: "none",
      background: "#22c55e",
      color: "#09080e",
      fontWeight: 700,
      fontSize: "0.85rem",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.4rem",
      minHeight: "44px",
      transition: "opacity 0.15s ease",
    },
    regenerateBtn: {
      flex: 1,
      padding: "0.65rem 1rem",
      borderRadius: "10px",
      border: "1px solid #334155",
      background: "rgba(255,255,255,0.06)",
      color: "#e2e8f0",
      fontWeight: 600,
      fontSize: "0.85rem",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.4rem",
      minHeight: "44px",
      transition: "background 0.15s ease",
    },
    cancelBtn: {
      padding: "0.65rem 1rem",
      borderRadius: "10px",
      border: "1px solid #334155",
      background: "#1e293b",
      color: "#94a3b8",
      fontWeight: 600,
      fontSize: "0.85rem",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "0.4rem",
      minHeight: "44px",
      transition: "background 0.15s ease",
    },
  };

  return (
    <div
      style={S.overlay}
      onClick={loading ? undefined : onClose}
      onKeyDown={handleKeyDown}
    >
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        {/* Close button */}
        <button
          style={S.closeBtn}
          onClick={onClose}
          aria-label="Close image generator"
        >
          <X size={20} />
        </button>

        {/* Title */}
        <div style={S.titleRow}>
          <Sparkles size={20} color="#c8973a" />
          <h3 style={S.title}>Generate Image</h3>
        </div>

        {!generatedUrl ? (
          <>
            {/* Prompt input */}
            <div style={S.fieldGroup}>
              <label style={S.label}>Prompt</label>
              <textarea
                style={S.textarea}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe the image you want to generate..."
                rows={3}
                disabled={loading}
              />
            </div>

            {/* Style selector */}
            <div style={S.fieldGroup}>
              <label style={S.label}>Art Style</label>
              <select
                style={S.select}
                value={selectedStyle}
                onChange={(e) => setSelectedStyle(e.target.value)}
                disabled={loading}
              >
                {STYLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Generate button */}
            <button
              style={{
                ...S.generateBtn,
                ...(loading || !promptText.trim() ? S.generateBtnDisabled : {}),
              }}
              onClick={handleGenerate}
              disabled={loading || !promptText.trim()}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Image
                </>
              )}
            </button>

            {/* Loading indicator */}
            {loading && (
              <div style={S.status}>
                <Loader2 size={14} className="spin" />
                <span>Generating image via DALL-E 3...</span>
              </div>
            )}

            {/* Error message */}
            {error && !generatedUrl && <div style={S.error}>{error}</div>}
          </>
        ) : (
          <>
            {/* Image preview */}
            <div style={S.previewSection}>
              <div
                style={{
                  ...S.imageWrapper,
                  border: error ? "1px solid rgba(239,68,68,0.3)" : "1px solid #334155",
                }}
              >
                <img
                  src={generatedUrl}
                  alt={promptText || "Generated image"}
                  style={S.previewImage}
                  onError={() =>
                    setError("Failed to load the generated image. The URL may have expired.")
                  }
                />
              </div>

              {/* Error message */}
              {error && <div style={S.error}>{error}</div>}

              {/* Action buttons */}
              <div style={S.actions}>
                <button style={S.acceptBtn} onClick={handleAccept}>
                  <Check size={16} />
                  Accept
                </button>
                <button
                  style={S.regenerateBtn}
                  onClick={handleGenerate}
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 size={16} className="spin" />
                  ) : (
                    <Sparkles size={16} />
                  )}
                  Regenerate
                </button>
                <button style={S.cancelBtn} onClick={onClose}>
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
