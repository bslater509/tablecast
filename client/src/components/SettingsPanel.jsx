// =============================================================================
// Tablecast  DM Settings & Cloud Backups Panel (Phase 6)
// Provides controls for zip compression & rclone Google Drive synchronization.
// =============================================================================
import React, { useState, useEffect } from "react";

function SettingsPanel({ user }) {
  const [remote, setRemote] = useState("gdrive:tablecast-backups");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);
  
  // Reference sync status states
  const [refStatus, setRefStatus] = useState(null);
  const [syncingRef, setSyncingRef] = useState(false);
  const [allowedSourcesInput, setAllowedSourcesInput] = useState("");
  const [availableSources, setAvailableSources] = useState([]);
  const [savingSources, setSavingSources] = useState(false);
  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };

  const fetchRefStatus = async () => {
    try {
      const res = await fetch("/api/reference/status");
      if (res.ok) {
        const data = await res.json();
        setRefStatus(data);
        setSyncingRef(data.isSyncing);
      }
    } catch (err) {
      console.error("Failed to load reference status:", err);
    }
  };

  const fetchBackupStatus = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/backup/status?remote=${encodeURIComponent(remote.trim())}`, {
        headers: authHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        setBackupStatus(data);
      }
    } catch (err) {
      console.error("Failed to load backup status:", err);
    }
  };

  const fetchReferenceSettings = async () => {
    try {
      const res = await fetch("/api/reference/settings");
      if (res.ok) {
        const data = await res.json();
        setAllowedSourcesInput((data.allowedSources || []).join(", "));
        setAvailableSources(data.availableSources || []);
      }
    } catch (err) {
      console.error("Failed to load reference settings:", err);
    }
  };

  useEffect(() => {
    fetchRefStatus();
    fetchReferenceSettings();
    fetchBackupStatus();
  }, [user?.id]);

  // Poll backend sync logs if in-progress
  useEffect(() => {
    let interval;
    if (syncingRef) {
      interval = setInterval(() => {
        fetchRefStatus();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncingRef]);

  const handleSyncReferences = async () => {
    if (syncingRef) return;
    setSyncingRef(true);
    try {
      const res = await fetch("/api/reference/sync", {
        method: "POST",
        headers: authHeaders,
      });
      if (res.ok) {
        fetchRefStatus();
      } else {
        const err = await res.json();
        alert(`Error starting sync: ${err.error || "Unknown"}`);
        setSyncingRef(false);
      }
    } catch (err) {
      alert(`Network error starting sync: ${err.message}`);
      setSyncingRef(false);
    }
  };

  const parseAllowedSources = () => (
    allowedSourcesInput
      .split(/[,\s]+/)
      .map((source) => source.trim().toUpperCase())
      .filter(Boolean)
  );

  const handleSaveReferenceSources = async () => {
    if (savingSources) return;
    setSavingSources(true);

    try {
      const res = await fetch("/api/reference/settings", {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ allowedSources: parseAllowedSources() }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save source settings.");
      }

      setAllowedSourcesInput((data.allowedSources || []).join(", "));
      fetchRefStatus();
    } catch (err) {
      alert(`Error saving sources: ${err.message}`);
    } finally {
      setSavingSources(false);
    }
  };

  const handleBackup = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ remote: remote.trim() }),
      });

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      setResult(data);
      setBackupStatus((prev) => ({
        ...(prev || {}),
        inProgress: false,
        rclone: data.rclone || prev?.rclone,
        history: data.history || prev?.history || [],
      }));
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
        <h1 style={styles.title}>Dungeon Master Sanctum</h1>
        <p style={styles.subtitle}>Manage cloud backups, database archives, and campaign sync settings.</p>
      </header>

      <div style={styles.content}>
        {/* Backup configuration card */}
        <section style={styles.card} className="glass-panel gold-border-glow">
          <h2 style={styles.cardTitle}>Campaign Cloud Backup</h2>
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
                onBlur={fetchBackupStatus}
                style={styles.input}
                className="form-input"
                required
                disabled={loading}
              />
              <small style={styles.helpText}>
                Format: <code style={styles.codeInline}>remoteName:folderPath</code>. Make sure this matches a profile defined in your <code style={styles.codeInline}>rclone.conf</code>.
              </small>
            </div>

            {backupStatus?.rclone && (
              <div style={styles.detailsTable}>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>rclone Installed:</span>
                  <span style={{ ...styles.detailsVal, color: backupStatus.rclone.installed ? "var(--color-success)" : "var(--color-danger)" }}>
                    {backupStatus.rclone.installed ? "Yes" : "No"}
                  </span>
                </div>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>Remote Configured:</span>
                  <span style={{ ...styles.detailsVal, color: backupStatus.rclone.configured ? "var(--color-success)" : "var(--color-danger)" }}>
                    {backupStatus.rclone.configured ? "Yes" : "No"}
                  </span>
                </div>
                <div style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>Backup Job:</span>
                  <span style={styles.detailsVal}>{backupStatus.inProgress ? "Running" : "Idle"}</span>
                </div>
              </div>
            )}

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
                "Backup Server Now"
              )}
            </button>
          </form>
        </section>

        {/* D&D 5e Reference Library Sync Card */}
        <section style={styles.card} className="glass-panel gold-border-glow">
          <h2 style={styles.cardTitle}>D&D 5e Reference Library Sync</h2>
          <p style={styles.cardDesc}>
            Clones or pulls the latest D&D rules data (<code style={styles.codeInline}>5etoolssrc</code>)
            and VTT token images (<code style={styles.codeInline}>5etoolsimg</code>) from remote repositories.
            Runs asynchronously in the background.
          </p>

          {refStatus && (
            <div style={styles.detailsTable}>
              <div style={styles.detailsRow}>
                <span style={styles.detailsLabel}>Data Repository (5etoolssrc):</span>
                <span style={{ ...styles.detailsVal, color: refStatus.srcExists ? "var(--color-success)" : "var(--color-danger)" }}>
                  {refStatus.srcExists ? "Cloned (Ready)" : "Missing"}
                </span>
              </div>
              <div style={styles.detailsRow}>
                <span style={styles.detailsLabel}>Images Repository (5etoolsimg):</span>
                <span style={{ ...styles.detailsVal, color: refStatus.imgExists ? "var(--color-success)" : "var(--color-danger)" }}>
                  {refStatus.imgExists ? "Cloned (Ready)" : "Missing"}
                </span>
              </div>
              <div style={styles.detailsRow}>
                <span style={styles.detailsLabel}>Current Status:</span>
                <span style={styles.detailsVal}>{refStatus.progress}</span>
              </div>
              <div style={styles.detailsRow}>
                <span style={styles.detailsLabel}>Startup Sync:</span>
                <span style={styles.detailsVal}>{refStatus.syncOnStartup ? "Enabled" : "Manual only"}</span>
              </div>
              <div style={styles.detailsRow}>
                <span style={styles.detailsLabel}>Allowed Sources:</span>
                <span style={styles.detailsVal}>
                  {refStatus.allowedSources?.length ? refStatus.allowedSources.join(", ") : "All"}
                </span>
              </div>
            </div>
          )}

          <div style={styles.inputGroup}>
            <label htmlFor="reference-source-input" style={styles.label}>
              5etools Source Filter
            </label>
            <input
              id="reference-source-input"
              type="text"
              placeholder="e.g. XDMG, XMM, XPHB"
              value={allowedSourcesInput}
              onChange={(e) => setAllowedSourcesInput(e.target.value)}
              style={styles.input}
              className="form-input"
              disabled={savingSources}
            />
            <small style={styles.helpText}>
              Leave blank to allow every source. Use comma-separated 5etools source codes.
            </small>
          </div>

          <button
            id="save-ref-sources-btn"
            onClick={handleSaveReferenceSources}
            disabled={savingSources}
            style={{
              ...styles.secondaryBtn,
              cursor: savingSources ? "not-allowed" : "pointer",
              opacity: savingSources ? 0.7 : 1,
            }}
            className="touch-target btn-hover-scale"
          >
            {savingSources ? "Saving Sources..." : "Save Source Filter"}
          </button>

          {availableSources.length > 0 && (
            <div style={styles.sourceCloud}>
              {availableSources.slice(0, 40).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => {
                    const current = new Set(parseAllowedSources());
                    if (current.has(source)) current.delete(source);
                    else current.add(source);
                    setAllowedSourcesInput(Array.from(current).sort().join(", "));
                  }}
                  style={{
                    ...styles.sourceChip,
                    borderColor: parseAllowedSources().includes(source) ? "var(--color-accent)" : "rgba(255,255,255,0.08)",
                    color: parseAllowedSources().includes(source) ? "var(--color-accent)" : "var(--color-muted)",
                  }}
                  className="touch-target"
                >
                  {source}
                </button>
              ))}
            </div>
          )}

          <button
            id="trigger-ref-sync-btn"
            onClick={handleSyncReferences}
            disabled={syncingRef}
            style={{
              ...styles.backupBtn,
              background: syncingRef
                ? "rgba(200, 151, 58, 0.2)"
                : "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
              cursor: syncingRef ? "not-allowed" : "pointer",
              color: syncingRef ? "var(--color-muted)" : "#0f0e17",
            }}
            className="touch-target btn-hover-scale"
          >
            {syncingRef ? (
              <div style={styles.loadingSpinnerContainer}>
                <div style={styles.spinner}></div>
                <span>Syncing Repositories...</span>
              </div>
            ) : (
              "Update References Now"
            )}
          </button>

          {refStatus && refStatus.logs && refStatus.logs.length > 0 && (
            <>
              <h3 style={styles.consoleTitle}>git sync Output Log</h3>
              <div style={{ ...styles.console, maxHeight: "250px" }} id="ref-console-log">
                <div style={styles.consoleStdout}>
                  {refStatus.logs.map((logLine, idx) => (
                    <div key={idx}>{logLine}</div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* Live Terminal Console and Status Report */}
        {result && (
          <section style={styles.card} className="glass-panel gold-border-glow">
            <h2 style={styles.cardTitle}>Backup Result Status</h2>
            
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
                  {result.success ? "OK" : result.zipName ? "WARN" : "FAIL"}
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
            <h3 style={styles.consoleTitle}>rclone Server Output Log</h3>
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

        {backupStatus?.history?.length > 0 && (
          <section style={styles.card} className="glass-panel gold-border-glow">
            <h2 style={styles.cardTitle}>Recent Local Backups</h2>
            <div style={styles.detailsTable}>
              {backupStatus.history.map((backup) => (
                <div key={backup.name} style={styles.detailsRow}>
                  <span style={styles.detailsLabel}>{backup.name}</span>
                  <span style={styles.detailsVal}>{formatBytes(backup.size)}</span>
                </div>
              ))}
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
  secondaryBtn: {
    width: "100%",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    borderRadius: "6px",
    background: "rgba(200, 151, 58, 0.08)",
    color: "var(--color-accent)",
    fontWeight: "bold",
    fontSize: "0.9rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s",
  },
  sourceCloud: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.4rem",
  },
  sourceChip: {
    minHeight: "44px",
    padding: "0.45rem 0.7rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    fontSize: "0.75rem",
    fontWeight: 700,
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
