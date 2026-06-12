// =============================================================================
// Tablecast — Copy Button Component
// A copy-to-clipboard button with "Copied!" visual feedback.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { Copy, Check } from "lucide-react";

export default function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef(null);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
      copiedTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  useEffect(() => () => {
      if (copiedTimeoutRef.current) {
        clearTimeout(copiedTimeoutRef.current);
      }
    }, []);

  return (
    <button
      onClick={handleCopy}
      style={{
        background: "transparent",
        border: "none",
        color: copied ? "var(--color-success)" : "var(--color-muted)",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0.2rem",
        borderRadius: "4px",
        transition: "color 0.2s",
      }}
      className="btn-hover-scale"
      title={copied ? "Copied!" : "Copy to clipboard"}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}
