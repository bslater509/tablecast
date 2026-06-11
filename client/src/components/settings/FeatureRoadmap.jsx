// =============================================================================
// Tablecast — Feature Roadmap
// Displays features.md rendered as HTML in the DM settings panel.
// =============================================================================
import { useState, useEffect } from "react";
import { Map, Loader } from "lucide-react";
import { compileMarkdown } from "../../utils/markdown";
import { getJsonAuthHeaders } from "../../utils/authHeaders";

export default function FeatureRoadmap({ user }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/features", {
          headers: getJsonAuthHeaders(user),
        });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setContent(data.content || "");
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading) {
    return (
      <div style={styles.centerWrap}>
        <Loader size={20} style={styles.spinner} />
        <span style={styles.loadingText}>Loading roadmap...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.centerWrap}>
        <p style={styles.errorText}>Failed to load: {error}</p>
      </div>
    );
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.headerRow}>
        <Map size={18} color="var(--color-accent)" />
        <span style={styles.headerTitle}>Feature Roadmap</span>
      </div>
      <div
        className="wiki-content"
        style={styles.roadmapBody}
        dangerouslySetInnerHTML={{ __html: compileMarkdown(content) }}
      />
    </div>
  );
}

const styles = {
  wrapper: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    flex: 1,
    overflow: "hidden",
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    paddingBottom: "0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
  },
  roadmapBody: {
    flex: 1,
    overflowY: "auto",
    padding: "0.25rem 0",
    fontSize: "0.82rem",
    lineHeight: "1.55",
    color: "var(--color-text)",
  },
  centerWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "3rem 1rem",
    flex: 1,
  },
  loadingText: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
  },
  errorText: {
    fontSize: "0.85rem",
    color: "var(--color-danger)",
  },
  spinner: {
    animation: "spin 1s linear infinite",
    color: "var(--color-accent)",
  },
};
