// =============================================================================
// Tablecast — DM Settings & Cloud Backups Panel (Phase 6)
// Provides controls for zip compression & rclone Google Drive synchronization.
// =============================================================================
import React, { useState } from "react";

function SettingsPanel({ user }) {
  const [remote, setRemote] = useState("gdrive:tablecast-backups");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleBackup = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remote: remote.trim() }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        message: "Failed to connect to backend server backup service.",
        stderr: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div style={styles.container} className="fade-in">
      <header style={styles.header}>
        <h1 style={styles.title}>🧙‍♂️ Dungeon Master Sanctum</h1>
        <p style={styles.subtitle}>Manage cloud backups, database archives, and campaign sync settings.</p>
      </header>

      <div style={styles.content}>
        {/* Backup configuration card */}
        <section style={styles.card} className="glass-panel gold-border-glow">
          <h2 style={styles.cardTitle}>🎲 Campaign Cloud Backup</h2>
          <p style={styles.cardDesc}>
            Zips the active SQLite database file (<code style={styles.codeInline}>tablecast.db</code>)
            and all uploaded campaign assets (<code style={styles.codeInline}>uploads/</code> directory)
            into a timestamped archive, then syncs it using <code style={styles.codeInline}>rclone</code>.
          </p>

          <form onSubmit={handleBackup} style={styles.form}>
            <div style={styles.inputGroup}>
              <label htmlFor="rclone-remote-input" style={styles.label}>
                rclone Remote Destination
              </label>
              <input
                id="rclone-remote-input"
                type="text"
                placeholder="e.g. gdrive:tablecast-backups"
                value={remote}
                onChange={(e) => setRemote(e.target.value)}
                style={styles.input}
                className="form-input"
                required
                disabled={loading}
              />
              <small style={styles.helpText}>
                Format: <code style={styles.codeInline}>remoteName:folderPath</code>. Make sure this matches a profile defined in your <code style={styles.codeInline}>rclone.conf</code>.
              </small>
            </div>

            <button
              id="trigger-backup-btn"
              type="submit"
              disabled={loading || !remote.trim()}
              style={{
                ...styles.backupBtn,
                background: loading
                  ? "rgba(200, 151, 58, 0.2)"
                  : "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
                cursor: loading ? "not-allowed" : "pointer",
                color: loading ? "var(--color-muted)" : "#0f0e17",
              }}
              className="touch-target btn-hover-scale"
            >
              {loading ? (
                <div style={styles.loadingSpinnerContainer}>
                  <div style={styles.spinner}></div>
                  <span>Brewing Backup Archive...</span>
                </div>
              ) : (
                "🛡️ Backup Server Now"
              )}
            </button>
          </form>
        </section>

        {/* Live Terminal Console and Status Report */}
        {result && (
          <section style={styles.card} className="glass-panel gold-border-glow">
            <h2 style={styles.cardTitle}>📊 Backup Result Status</h2>
            
            {/* Status indicator banner */}
            <div
              style={{
                ...styles.statusBanner,
                backgroundColor: result.success
                  ? "rgba(111, 207, 151, 0.15)"
                  : result.zipName
                  ? "rgba(200, 151, 58, 0.15)" // partial: zip success, cloud fail
                  : "rgba(235, 87, 87, 0.15)",
                borderColor: result.success
                  ? "var(--color-success)"
                  : result.zipName
                  ? "var(--color-accent)"
                  : "var(--color-danger)",
              }}
            >
              <div style={styles.bannerHeader}>
                <span style={styles.bannerIcon}>
                  {result.success ? "✅" : result.zipName ? "⚠️" : "❌"}
                </span>
                <span
                  style={{
                    ...styles.bannerText,
                    color: result.success
                      ? "var(--color-success)"
                      : result.zipName
                      ? "var(--color-accent)"
                      : "var(--color-danger)",
                  }}
                >
                  {result.success
                    ? "Backup Complete & Synchronized!"
                    : result.zipName
                    ? "Local Backup Created, Cloud Sync Skipped/Failed"
                    : "Backup Failed"}
                </span>
              </div>
              <p style={styles.bannerMessage}>{result.message}</p>
            </div>

            {/* Archive Details table */}
            {result.zipName && (
              <div style={styles.detailsTable}>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>Archive Name:</span>
                  <span style={styles.detailsVal} id="backup-zip-name">{result.zipName}</span>
                </div>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>Archive Size:</span>
                  <span style={styles.detailsVal}>{formatBytes(result.zipSize)}</span>
                </div>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>Remote Destination:</span>
                  <span style={styles.detailsVal}>{result.remote}</span>
                </div>
              </div>
            )}

            {/* Terminal output console */}
            <h3 style={styles.consoleTitle}>📟 rclone Server Output Log</h3>
            <div style={styles.console} id="backup-console-log">
              {result.stdout && (
                <div style={styles.consoleStdout}>{result.stdout}</div>
              )}
              {result.stderr && (
                <div style={styles.consoleStderr}>{result.stderr}</div>
              )}
              {!result.stdout && !result.stderr && (
                <div style={styles.consoleMuted}>[No terminal output received]</div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "1.25rem",
    overflowY: "auto",
    background: "var(--color-bg)",
    gap: "1.5rem",
  },
  header: {
    borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
    paddingBottom: "0.75rem",
  },
  title: {
    fontSize: "1.5rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    marginBottom: "0.25rem",
  },
  subtitle: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
  },
  content: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    maxWidth: "600px",
    width: "100%",
    margin: "0 auto",
  },
  card: {
    borderRadius: "8px",
    padding: "1.25rem",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  cardTitle: {
    fontSize: "1.1rem",
    color: "var(--color-text)",
    fontWeight: "bold",
  },
  cardDesc: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    lineHeight: "1.4",
  },
  codeInline: {
    fontFamily: "monospace",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: "0.15rem 0.3rem",
    borderRadius: "3px",
    color: "var(--color-accent)",
    fontSize: "0.8rem",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  label: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--color-text)",
  },
  input: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "0.9rem",
  },
  helpText: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    marginTop: "0.15rem",
  },
  backupBtn: {
    width: "100%",
    border: "none",
    borderRadius: "6px",
    fontWeight: "bold",
    fontSize: "0.95rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  loadingSpinnerContainer: {
    display: "flex",
    alignItems: "center",
    gap: "0.6rem",
  },
  spinner: {
    width: "18px",
    height: "18px",
    border: "2px solid rgba(255,255,255,0.3)",
    borderTop: "2px solid var(--color-text)",
    borderRadius: "50%",
    animation: "shake 0.8s linear infinite", // Fallback microanimation
  },
  statusBanner: {
    borderWidth: "1px",
    borderStyle: "solid",
    borderRadius: "6px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  bannerHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  bannerIcon: {
    fontSize: "1.2rem",
  },
  bannerText: {
    fontWeight: "bold",
    fontSize: "0.95rem",
  },
  bannerMessage: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
    lineHeight: "1.3",
  },
  detailsTable: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    background: "rgba(0, 0, 0, 0.2)",
    padding: "0.75rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.03)",
  },
  detailsRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.8rem",
  },
  detailsLabel: {
    color: "var(--color-muted)",
  },
  detailsVal: {
    color: "var(--color-text)",
    fontFamily: "monospace",
    fontWeight: "bold",
  },
  consoleTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginTop: "0.5rem",
  },
  console: {
    background: "#05030a",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    borderRadius: "6px",
    padding: "0.85rem",
    fontFamily: "Courier New, Courier, monospace",
    fontSize: "0.8rem",
    maxHeight: "180px",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  consoleStdout: {
    color: "var(--color-success)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  consoleStderr: {
    color: "var(--color-danger)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  consoleMuted: {
    color: "var(--color-muted)",
    fontStyle: "italic",
  },
};

export default SettingsPanel;
