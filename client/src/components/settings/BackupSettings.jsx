// =============================================================================
// Tablecast — Backup & Reference Cache Settings (Extracted from SettingsPanel)
// Self-contained component for rclone backup configuration, cloud remotes,
// and D&D 5e reference data cache management.
// =============================================================================
import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { styles } from "./settingsStyles";
import {
  fetchRefStatus as apiFetchRefStatus,
  fetchBackupConfig as apiFetchBackupConfig,
  fetchProviders as apiFetchProviders,
  fetchConfiguredRemotes as apiFetchConfiguredRemotes,
  fetchBackupStatus as apiFetchBackupStatus,
  fetchReferenceSettings as apiFetchReferenceSettings,
} from "./settingsApi";

export default function BackupSettings({ user, authHeaders, jsonAuthHeaders, addToast }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [backupStatus, setBackupStatus] = useState(null);

  // rclone configuration states
  const [rcloneConfig, setRcloneConfig] = useState("");
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [remoteName, setRemoteName] = useState("gdrive");
  const [remotePath, setRemotePath] = useState("tablecast-backups");
  const [configMessage, setConfigMessage] = useState(null);
  const [configError, setConfigError] = useState(null);

  // Universal rclone remote management states
  const [showAddRemoteModal, setShowAddRemoteModal] = useState(false);
  const [providers, setProviders] = useState([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [remoteStep, setRemoteStep] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [providerOptions, setProviderOptions] = useState({});
  const [newRemoteName, setNewRemoteName] = useState("");
  const [savingRemote, setSavingRemote] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [remoteSuccess, setRemoteSuccess] = useState("");
  const [showManageRemotes, setShowManageRemotes] = useState(false);
  const [configuredRemotes, setConfiguredRemotes] = useState([]);
  const [deletingRemote, setDeletingRemote] = useState(null);
  const [providerSearch, setProviderSearch] = useState("");

  // Reference cache status states
  const [refStatus, setRefStatus] = useState(null);
  const [syncingRef, setSyncingRef] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [allowedSourcesInput, setAllowedSourcesInput] = useState("");
  const [availableSources, setAvailableSources] = useState([]);
  const [savingSources, setSavingSources] = useState(false);

  /** Load all initial data on mount / user change */
  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetchRefStatus(authHeaders);
        if (data) { setRefStatus(data); setSyncingRef(data.isSyncing); }
      } catch (err) { console.error("Failed to load reference status:", err); }
    })();
    (async () => {
      try {
        const data = await apiFetchReferenceSettings(authHeaders);
        if (data) { setAllowedSourcesInput((data.allowedSources || []).join(", ")); setAvailableSources(data.availableSources || []); }
      } catch (err) { console.error("Failed to load reference settings:", err); }
    })();
    (async () => {
      try {
        const data = await apiFetchBackupConfig(authHeaders);
        if (data) {
          setRcloneConfig(data.config || "");
          const fullRemote = data.remote || "gdrive:tablecast-backups";
          const colonIndex = fullRemote.indexOf(":");
          if (colonIndex !== -1) {
            setRemoteName(fullRemote.substring(0, colonIndex));
            setRemotePath(fullRemote.substring(colonIndex + 1));
          } else {
            setRemoteName(fullRemote);
            setRemotePath("");
          }
        }
      } catch (err) { console.error("Failed to load backup config:", err); }
    })();
  }, [user?.id]);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetchBackupStatus(authHeaders, remoteName, remotePath);
        if (data) setBackupStatus(data);
      } catch (err) { console.error("Failed to load backup status:", err); }
    })();
    (async () => {
      try {
        const data = await apiFetchConfiguredRemotes(authHeaders);
        if (data) setConfiguredRemotes(data.remotes || []);
      } catch (err) { console.error("Failed to load configured remotes:", err); }
    })();
  }, [user?.id, remoteName, remotePath]);

  // Poll backend sync logs if in-progress
  useEffect(() => {
    let interval;
    if (syncingRef) {
      interval = setInterval(() => {
        (async () => {
          try {
            const data = await apiFetchRefStatus(authHeaders);
            if (data) { setRefStatus(data); setSyncingRef(data.isSyncing); }
          } catch (err) { console.error("Failed to load reference status:", err); }
        })();
      }, 2000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [syncingRef]);

  const handleOpenAddRemote = () => {
    setShowAddRemoteModal(true);
    setRemoteStep(1);
    setSelectedProvider(null);
    setProviderOptions({});
    setNewRemoteName("");
    setRemoteError("");
    setRemoteSuccess("");
    setProviderSearch("");
    setLoadingProviders(true);
    (async () => {
      try {
        const data = await apiFetchProviders(authHeaders);
        if (data) setProviders(data.providers || []);
      } catch (err) {
        console.error("Failed to load rclone providers:", err);
      } finally {
        setLoadingProviders(false);
      }
    })();
  };

  const handleSelectProvider = (provider) => {
    setSelectedProvider(provider);
    const defaults = {};
    if (provider.Options) {
      provider.Options.forEach(opt => {
        if (opt.Default !== null && opt.Default !== undefined && opt.Default !== "") {
          defaults[opt.Name] = opt.Default;
        } else {
          defaults[opt.Name] = "";
        }
      });
    }
    setProviderOptions(defaults);
    setNewRemoteName("");
    setRemoteError("");
    setRemoteStep(2);
  };

  const handleProviderOptionChange = (name, value) => {
    setProviderOptions(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveRemote = async () => {
    if (!newRemoteName.trim()) {
      setRemoteError("Please enter a remote name.");
      return;
    }
    if (!selectedProvider) {
      setRemoteError("No provider selected.");
      return;
    }

    setSavingRemote(true);
    setRemoteError("");
    setRemoteSuccess("");

    try {
      const options = {};
      Object.entries(providerOptions).forEach(([key, val]) => {
        if (val !== "" && val !== null && val !== undefined) {
          options[key] = val;
        }
      });

      const res = await fetch("/api/backup/remotes", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          name: newRemoteName.trim(),
          type: selectedProvider.Name,
          options,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to configure remote.");
      }

      setRemoteSuccess(`Remote "${newRemoteName.trim()}" (${selectedProvider.Description || selectedProvider.Name}) configured successfully!`);
      setRemoteStep(3);
      (async () => {
        try {
          const data = await apiFetchBackupConfig(authHeaders);
          if (data) {
            setRcloneConfig(data.config || "");
            const fullRemote = data.remote || "gdrive:tablecast-backups";
            const colonIndex = fullRemote.indexOf(":");
            if (colonIndex !== -1) {
              setRemoteName(fullRemote.substring(0, colonIndex));
              setRemotePath(fullRemote.substring(colonIndex + 1));
            } else {
              setRemoteName(fullRemote);
              setRemotePath("");
            }
          }
        } catch (err) { console.error("Failed to load backup config:", err); }
      })();
      (async () => {
        try {
          const data = await apiFetchBackupStatus(authHeaders, remoteName, remotePath);
          if (data) setBackupStatus(data);
        } catch (err) { console.error("Failed to load backup status:", err); }
      })();
      (async () => {
        try {
          const data = await apiFetchConfiguredRemotes(authHeaders);
          if (data) setConfiguredRemotes(data.remotes || []);
        } catch (err) { console.error("Failed to load configured remotes:", err); }
      })();
    } catch (err) {
      setRemoteError(err.message);
    } finally {
      setSavingRemote(false);
    }
  };

  const handleDeleteRemote = async (name) => {
    if (!window.confirm(`Delete remote "${name}"? This cannot be undone.`)) return;
    setDeletingRemote(name);
    try {
      const res = await fetch(`/api/backup/remotes/${encodeURIComponent(name)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (res.ok) {
        (async () => {
          try {
            const data = await apiFetchConfiguredRemotes(authHeaders);
            if (data) setConfiguredRemotes(data.remotes || []);
          } catch (err) { console.error("Failed to load configured remotes:", err); }
        })();
        (async () => {
          try {
            const data = await apiFetchBackupStatus(authHeaders, remoteName, remotePath);
            if (data) setBackupStatus(data);
          } catch (err) { console.error("Failed to load backup status:", err); }
        })();
        (async () => {
          try {
            const data = await apiFetchBackupConfig(authHeaders);
            if (data) {
              setRcloneConfig(data.config || "");
              const fullRemote = data.remote || "gdrive:tablecast-backups";
              const colonIndex = fullRemote.indexOf(":");
              if (colonIndex !== -1) {
                setRemoteName(fullRemote.substring(0, colonIndex));
                setRemotePath(fullRemote.substring(colonIndex + 1));
              } else {
                setRemoteName(fullRemote);
                setRemotePath("");
              }
            }
          } catch (err) { console.error("Failed to load backup config:", err); }
        })();
      } else {
        const data = await res.json();
        alert(`Failed to delete remote: ${data.error || "Unknown error"}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    } finally {
      setDeletingRemote(null);
    }
  };

  const handleBackToProviders = () => {
    setRemoteStep(1);
    setSelectedProvider(null);
    setProviderOptions({});
    setNewRemoteName("");
    setRemoteError("");
    setRemoteSuccess("");
  };

  // Filtered provider list for search
  const filteredProviders = providers.filter(p => {
    const q = providerSearch.toLowerCase();
    return p.Name.toLowerCase().includes(q) || (p.Description && p.Description.toLowerCase().includes(q));
  });

  const handleSyncReferences = async () => {
    if (syncingRef) return;
    setSyncingRef(true);
    try {
      const res = await fetch("/api/reference/sync", {
        method: "POST",
        headers: authHeaders,
      });
      if (res.ok) {
        (async () => {
          try {
            const data = await apiFetchRefStatus(authHeaders);
            if (data) { setRefStatus(data); setSyncingRef(data.isSyncing); }
          } catch (err) { console.error("Failed to load reference status:", err); }
        })();
      } else {
        const err = await res.json();
        addToast(`Error starting cache refresh: ${err.error || "Unknown"}`, "error");
        setSyncingRef(false);
      }
    } catch (err) {
      addToast(`Network error starting cache refresh: ${err.message}`, "error");
      setSyncingRef(false);
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      const res = await fetch("/api/reference/clear-cache", {
        method: "POST",
        headers: authHeaders,
      });
      if (res.ok) {
        addToast("Cache cleared. Data will be re-fetched on next search.", "success");
        (async () => {
          try {
            const data = await apiFetchRefStatus(authHeaders);
            if (data) { setRefStatus(data); setSyncingRef(data.isSyncing); }
          } catch (err) { console.error("Failed to load reference status:", err); }
        })();
      } else {
        const err = await res.json();
        addToast(`Error clearing cache: ${err.error || "Unknown"}`, "error");
      }
    } catch (err) {
      addToast(`Network error clearing cache: ${err.message}`, "error");
    } finally {
      setClearingCache(false);
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
      (async () => {
        try {
          const d = await apiFetchRefStatus(authHeaders);
          if (d) { setRefStatus(d); setSyncingRef(d.isSyncing); }
        } catch (err) { console.error("Failed to load reference status:", err); }
      })();
    } catch (err) {
      addToast(`Error saving sources: ${err.message}`, "error");
    } finally {
      setSavingSources(false);
    }
  };

  const handleSaveBackupConfig = async (e) => {
    if (e) e.preventDefault();
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigMessage(null);
    setConfigError(null);
    try {
      const fullRemote = `${remoteName}:${remotePath}`;
      const res = await fetch("/api/backup/config", {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          config: rcloneConfig,
          remote: fullRemote.trim(),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setConfigMessage("rclone configuration saved successfully!");
        setShowConfigEditor(false);
        setTimeout(() => {
          (async () => {
            try {
              const data = await apiFetchBackupStatus(authHeaders, remoteName, remotePath);
              if (data) setBackupStatus(data);
            } catch (err) { console.error("Failed to load backup status:", err); }
          })();
        }, 500);
      } else {
        setConfigError(data.error || "Failed to save configuration.");
      }
    } catch (err) {
      setConfigError(`Network error: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleBackup = async (e) => {
    e.preventDefault();
    if (loading) return;

    setLoading(true);
    setResult(null);

    try {
      const fullRemote = `${remoteName}:${remotePath}`;
      // Save settings before running backup
      await fetch("/api/backup/config", {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          remote: fullRemote.trim(),
        }),
      });

      const res = await fetch("/api/backup", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ remote: fullRemote.trim() }),
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
    <div style={styles.content}>
      {showAddRemoteModal && (
        <div style={styles.modalOverlay} onClick={() => { if (!savingRemote) setShowAddRemoteModal(false); }}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <header style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {remoteStep === 1 ? "Select Storage Provider" :
                 remoteStep === 2 ? `Configure ${selectedProvider?.Description || selectedProvider?.Name || ""}` :
                 "Remote Configured"}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddRemoteModal(false)}
                disabled={savingRemote}
                style={styles.modalCloseBtn}
                className="touch-target"
              >
                &times;
              </button>
            </header>

            {remoteStep === 1 && (
              <>
                <p style={{ fontSize: "0.85rem", color: "var(--color-muted)", margin: 0 }}>
                  Select a cloud storage provider. You'll configure the connection details in the next step.
                </p>

                <div style={styles.inputGroup}>
                  <input
                    type="text"
                    placeholder="Search providers..."
                    value={providerSearch}
                    onChange={(e) => setProviderSearch(e.target.value)}
                    style={styles.input}
                    className="form-input"
                  />
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxHeight: "300px", overflowY: "auto" }}>
                  {loadingProviders ? (
                    <div style={{ textAlign: "center", color: "var(--color-muted)", padding: "2rem" }}>
                      Loading providers...
                    </div>
                  ) : filteredProviders.length === 0 ? (
                    <div style={{ textAlign: "center", color: "var(--color-muted)", padding: "2rem" }}>
                      {providerSearch ? "No providers match your search." : "No providers available."}
                    </div>
                  ) : (
                    filteredProviders.map((provider) => (
                      <button
                        key={provider.Name}
                        type="button"
                        onClick={() => handleSelectProvider(provider)}
                        style={{
                          textAlign: "left",
                          padding: "0.75rem",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "6px",
                          background: "rgba(255,255,255,0.03)",
                          color: "var(--color-text)",
                          cursor: "pointer",
                          fontSize: "0.85rem",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.2rem",
                          minHeight: "44px",
                        }}
                        className="touch-target btn-hover-scale"
                      >
                        <span style={{ fontWeight: "bold", color: "var(--color-accent)" }}>
                          {provider.Description || provider.Name}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", fontFamily: "monospace" }}>
                          {provider.Name}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}

            {remoteStep === 2 && selectedProvider && (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={handleBackToProviders}
                    disabled={savingRemote}
                    style={{ background: "transparent", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.85rem", padding: "0.25rem" }}
                    className="touch-target"
                  >
                    &larr; Back
                  </button>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                    Provider: <strong style={{ color: "var(--color-text)" }}>{selectedProvider.Description || selectedProvider.Name}</strong>
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: "400px", overflowY: "auto" }}>
                  <div style={styles.inputGroup}>
                    <label style={styles.label}>Remote Name *</label>
                    <input
                      type="text"
                      placeholder="e.g. mydrive, backups, nas"
                      value={newRemoteName}
                      onChange={(e) => setNewRemoteName(e.target.value)}
                      style={styles.input}
                      className="form-input"
                      disabled={savingRemote}
                    />
                    <small style={styles.helpText}>
                      A short name to identify this remote (letters, numbers, underscores only).
                    </small>
                  </div>

                  {selectedProvider.Options && selectedProvider.Options
                    .filter(opt => !opt.Advanced)
                    .map((opt) => (
                      <div key={opt.Name} style={styles.inputGroup}>
                        <label style={styles.label}>
                          {opt.Name.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                          {opt.Required ? " *" : ""}
                          {opt.IsPassword ? " (Password/Secret)" : ""}
                        </label>
                        {opt.IsPassword ? (
                          <input
                            type="password"
                            placeholder={opt.Help ? opt.Help.substring(0, 80) : `Enter ${opt.Name}`}
                            value={providerOptions[opt.Name] || ""}
                            onChange={(e) => handleProviderOptionChange(opt.Name, e.target.value)}
                            style={styles.input}
                            className="form-input"
                            disabled={savingRemote}
                          />
                        ) : opt.Type === "bool" || opt.Type === "boolean" ? (
                          <select
                            value={providerOptions[opt.Name] || "false"}
                            onChange={(e) => handleProviderOptionChange(opt.Name, e.target.value)}
                            style={{ ...styles.input, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                            disabled={savingRemote}
                          >
                            <option value="false">False</option>
                            <option value="true">True</option>
                          </select>
                        ) : opt.Examples && opt.Examples.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                            <select
                              value={providerOptions[opt.Name] || ""}
                              onChange={(e) => {
                                const val = e.target.value;
                                if (val === "__custom__") {
                                  handleProviderOptionChange(opt.Name, "");
                                } else {
                                  handleProviderOptionChange(opt.Name, val);
                                }
                              }}
                              style={{ ...styles.input, background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                              disabled={savingRemote}
                            >
                              <option value="">-- Select value --</option>
                              {opt.Examples.map((ex, i) => (
                                <option key={i} value={ex.Value !== undefined ? ex.Value : ex.Help}>
                                  {ex.Help}
                                </option>
                              ))}
                              <option value="__custom__">Custom value...</option>
                            </select>
                            {providerOptions[opt.Name] === "" && (
                              <input
                                type="text"
                                placeholder="Enter custom value"
                                value={providerOptions[opt.Name] || ""}
                                onChange={(e) => handleProviderOptionChange(opt.Name, e.target.value)}
                                style={styles.input}
                                className="form-input"
                                disabled={savingRemote}
                              />
                            )}
                          </div>
                        ) : (
                          <input
                            type="text"
                            placeholder={opt.Help ? opt.Help.substring(0, 80) : `Enter ${opt.Name}`}
                            value={providerOptions[opt.Name] || ""}
                            onChange={(e) => handleProviderOptionChange(opt.Name, e.target.value)}
                            style={styles.input}
                            className="form-input"
                            disabled={savingRemote}
                          />
                        )}
                        <small style={styles.helpText}>
                          {opt.Help ? opt.Help.substring(0, 200) : ""}
                          {opt.Default !== null && opt.Default !== undefined && opt.Default !== "" ? ` (Default: ${opt.Default})` : ""}
                        </small>
                      </div>
                    ))}
                </div>

                {remoteError && (
                  <div style={{ ...styles.statusBanner, backgroundColor: "rgba(235, 87, 87, 0.15)", borderColor: "var(--color-danger)", color: "var(--color-danger)", fontSize: "0.85rem", padding: "0.5rem" }}>
                    {remoteError}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddRemoteModal(false)}
                    disabled={savingRemote}
                    style={{ ...styles.secondaryBtn, width: "auto", padding: "0.6rem 1.25rem" }}
                    className="touch-target"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveRemote}
                    disabled={savingRemote || !newRemoteName.trim()}
                    style={{
                      ...styles.backupBtn,
                      width: "auto",
                      padding: "0.6rem 1.5rem",
                      background: savingRemote ? "var(--color-accent-dim)" : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                      color: savingRemote ? "var(--color-muted)" : "var(--color-bg)"
                    }}
                    className="touch-target btn-hover-scale"
                  >
                    {savingRemote ? "Configuring..." : "Save Remote"}
                  </button>
                </div>
              </>
            )}

            {remoteStep === 3 && (
              <>
                <div style={{ textAlign: "center", padding: "1.5rem" }}>
                  <div style={{ fontSize: "3rem", marginBottom: "1rem", color: "var(--color-success)" }}>&#10003;</div>
                  <p style={{ color: "var(--color-success)", fontWeight: "bold", fontSize: "1.1rem", margin: 0 }}>
                    {remoteSuccess}
                  </p>
                  <p style={{ color: "var(--color-muted)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
                    You can now select this remote as the backup destination.
                  </p>
                </div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddRemoteModal(false)}
                    style={{ ...styles.backupBtn, width: "auto", padding: "0.6rem 2rem", background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)", color: "var(--color-bg)" }}
                    className="touch-target btn-hover-scale"
                  >
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Backup configuration card */}
      <section style={styles.card} className="glass-panel gold-border-glow">
        <h2 style={styles.cardTitle}>Campaign Cloud Backup</h2>
        <p style={styles.cardDesc}>
          Zips the active SQLite database file (<code style={styles.codeInline}>tablecast.db</code>)
          and all uploaded campaign assets (<code style={styles.codeInline}>uploads/</code> directory)
          into a timestamped archive, then syncs it using <code style={styles.codeInline}>rclone</code>.
        </p>

        <form onSubmit={handleBackup} style={styles.form}>
          {/* Config Editor Row and Setup Wizard */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", width: "100%", flexWrap: "wrap" }}>
              <button
                type="button"
                id="add-remote-btn"
                onClick={handleOpenAddRemote}
                style={{
                  ...styles.backupBtn,
                  flex: "1 1 200px",
                  background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                  color: "var(--color-bg)",
                  minHeight: "44px"
                }}
                className="touch-target btn-hover-scale"
              >
                <Plus size={16} />
                <span>Add Cloud Storage Remote</span>
              </button>
              <button
                type="button"
                id="toggle-rclone-config-btn"
                onClick={() => {
                  setShowConfigEditor(!showConfigEditor);
                  setConfigMessage(null);
                  setConfigError(null);
                }}
                style={{ ...styles.secondaryBtn, flex: "1 1 200px", minHeight: "44px" }}
                className="touch-target btn-hover-scale"
              >
                {showConfigEditor ? "Hide Configuration Editor" : "Show/Edit rclone.conf"}
              </button>
              <button
                type="button"
                id="manage-remotes-btn"
                onClick={() => {
                  setShowManageRemotes(!showManageRemotes);
                  if (!showManageRemotes) {
                    (async () => {
                      try {
                        const data = await apiFetchConfiguredRemotes(authHeaders);
                        if (data) setConfiguredRemotes(data.remotes || []);
                      } catch (err) { console.error("Failed to load configured remotes:", err); }
                    })();
                  }
                }}
                style={{ ...styles.secondaryBtn, flex: "1 1 200px", minHeight: "44px" }}
                className="touch-target btn-hover-scale"
              >
                {showManageRemotes ? "Hide Remote Manager" : "Manage Remotes"}
              </button>
            </div>

            {showConfigEditor && (
              <div style={styles.configEditorContainer}>
                <label htmlFor="rclone-config-textarea" style={styles.label}>
                  rclone.conf File Content
                </label>
                <textarea
                  id="rclone-config-textarea"
                  rows={8}
                  value={rcloneConfig}
                  onChange={(e) => setRcloneConfig(e.target.value)}
                  placeholder="[gdrive]&#10;type = drive&#10;client_id = ...&#10;client_secret = ...&#10;token = ..."
                  style={{ ...styles.input, fontFamily: "monospace", minHeight: "150px", resize: "vertical" }}
                  className="form-input"
                  disabled={savingConfig}
                />
                <button
                  type="button"
                  id="save-rclone-config-btn"
                  onClick={handleSaveBackupConfig}
                  disabled={savingConfig}
                  style={{
                    ...styles.backupBtn,
                    marginTop: "0.5rem",
                    background: savingConfig ? "var(--color-accent-dim)" : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                    color: savingConfig ? "var(--color-muted)" : "var(--color-bg)"
                  }}
                  className="touch-target btn-hover-scale"
                >
                  {savingConfig ? "Saving Configuration..." : "Save Configuration"}
                </button>
              </div>
            )}

            {configMessage && (
              <div style={{ ...styles.statusBanner, backgroundColor: "rgba(111, 207, 151, 0.1)", borderColor: "var(--color-success)", color: "var(--color-success)", fontSize: "0.85rem", padding: "0.5rem" }}>
                {configMessage}
              </div>
            )}
            {configError && (
              <div style={{ ...styles.statusBanner, backgroundColor: "rgba(235, 87, 87, 0.1)", borderColor: "var(--color-danger)", color: "var(--color-danger)", fontSize: "0.85rem", padding: "0.5rem" }}>
                {configError}
              </div>
            )}
          </div>

          {showManageRemotes && (
            <div style={styles.configEditorContainer}>
              <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.9rem", color: "var(--color-text)" }}>
                Configured Remotes
              </h4>
              {configuredRemotes.length === 0 ? (
                <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", margin: 0 }}>
                  No remotes configured. Click "Add Cloud Storage Remote" to set one up.
                </p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                  {configuredRemotes.map((name) => (
                    <div
                      key={name}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "0.5rem 0.75rem",
                        background: "rgba(0,0,0,0.2)",
                        borderRadius: "6px",
                        border: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <span style={{ fontFamily: "monospace", fontSize: "0.85rem", color: "var(--color-text)" }}>
                        {name}:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteRemote(name)}
                        disabled={deletingRemote === name}
                        style={{
                          padding: "0.3rem 0.75rem",
                          border: "1px solid rgba(235, 87, 87, 0.35)",
                          borderRadius: "4px",
                          background: "rgba(235, 87, 87, 0.1)",
                          color: "var(--color-danger)",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          cursor: "pointer",
                          minHeight: "36px",
                        }}
                        className="touch-target"
                      >
                        {deletingRemote === name ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={styles.inputGroup}>
            <label style={styles.label}>rclone Remote Destination</label>

            {backupStatus?.rclone?.remotes && backupStatus.rclone.remotes.length > 0 ? (
              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <select
                  id="rclone-remote-select"
                  value={remoteName}
                  onChange={(e) => setRemoteName(e.target.value)}
                  style={{ ...styles.input, flex: "1", padding: "0.75rem", background: "var(--color-bg)", color: "var(--color-text)", border: "1px solid var(--color-border)" }}
                  disabled={loading}
                >
                  {backupStatus.rclone.remotes.map((rem) => {
                    const name = rem.endsWith(":") ? rem.substring(0, rem.length - 1) : rem;
                    return (
                      <option key={name} value={name}>
                        {rem}
                      </option>
                    );
                  })}
                </select>
                <span style={{ alignSelf: "center", color: "var(--color-muted)" }}>/</span>
                <input
                  id="rclone-path-input"
                  type="text"
                  placeholder="e.g. tablecast-backups"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  style={{ ...styles.input, flex: "2" }}
                  className="form-input"
                  disabled={loading}
                />
              </div>
            ) : (
              <div style={{ display: "flex", gap: "0.5rem", width: "100%" }}>
                <input
                  id="rclone-remote-name-fallback"
                  type="text"
                  placeholder="e.g. gdrive"
                  value={remoteName}
                  onChange={(e) => setRemoteName(e.target.value)}
                  style={{ ...styles.input, flex: "1" }}
                  className="form-input"
                  disabled={loading}
                />
                <span style={{ alignSelf: "center", color: "var(--color-muted)" }}>/</span>
                <input
                  id="rclone-remote-path-fallback"
                  type="text"
                  placeholder="e.g. tablecast-backups"
                  value={remotePath}
                  onChange={(e) => setRemotePath(e.target.value)}
                  style={{ ...styles.input, flex: "2" }}
                  className="form-input"
                  disabled={loading}
                />
              </div>
            )}

            <small style={styles.helpText}>
              Format: <code style={styles.codeInline}>remoteName:folderPath</code>. Remote name must match a profile defined in your configuration.
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
            disabled={loading || !remoteName.trim()}
            style={{
              ...styles.backupBtn,
              background: loading
                ? "var(--color-accent-dim)"
                : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
              cursor: loading ? "not-allowed" : "pointer",
              color: loading ? "var(--color-muted)" : "var(--color-bg)",
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

      {/* D&D 5e Reference Library Cache Card */}
      <section style={styles.card} className="glass-panel gold-border-glow">
        <h2 style={styles.cardTitle}>D&D 5e Reference Data Cache</h2>
        <p style={styles.cardDesc}>
          Fetches D&D 5e rules data (spells, monsters, items, races, classes)
          and token images from <code style={styles.codeInline}>https://5e.tools</code> and
          caches them on the server. Data is stored in memory and on disk for offline access.
        </p>

        {refStatus && (
          <div style={styles.detailsTable}>
            <div style={styles.detailsRow}>
              <span style={styles.detailsLabel}>Current Status:</span>
              <span style={styles.detailsVal}>{refStatus.progress}</span>
            </div>
            <div style={styles.detailsRow}>
              <span style={styles.detailsLabel}>Cached Files:</span>
              <span style={styles.detailsVal}>{refStatus.cacheFileCount ?? 0}</span>
            </div>
            <div style={styles.detailsRow}>
              <span style={styles.detailsLabel}>Cache Size:</span>
              <span style={styles.detailsVal}>
                {refStatus.cachedBytes ? formatBytes(refStatus.cachedBytes) : "0 B"}
              </span>
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

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            id="trigger-ref-sync-btn"
            onClick={handleSyncReferences}
            disabled={syncingRef}
            style={{
              ...styles.backupBtn,
              flex: 2,
              background: syncingRef
                ? "var(--color-accent-dim)"
                : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
              cursor: syncingRef ? "not-allowed" : "pointer",
              color: syncingRef ? "var(--color-muted)" : "var(--color-bg)",
            }}
            className="touch-target btn-hover-scale"
          >
            {syncingRef ? (
              <div style={styles.loadingSpinnerContainer}>
                <div style={styles.spinner}></div>
                <span>Refreshing Cache...</span>
              </div>
            ) : (
              "Refresh Cache Now"
            )}
          </button>

          <button
            id="clear-ref-cache-btn"
            onClick={handleClearCache}
            disabled={clearingCache || syncingRef}
            style={{
              ...styles.secondaryBtn,
              flex: 1,
              cursor: (clearingCache || syncingRef) ? "not-allowed" : "pointer",
              opacity: (clearingCache || syncingRef) ? 0.7 : 1,
            }}
            className="touch-target btn-hover-scale"
          >
            {clearingCache ? "Clearing..." : "Clear Cache"}
          </button>
        </div>

        {refStatus && refStatus.logs && refStatus.logs.length > 0 && (
          <>
            <h3 style={styles.consoleTitle}>Cache Refresh Log</h3>
            <div style={{ ...styles.console, maxHeight: "250px" }} id="ref-console-log">
              <div style={styles.consoleStdout}>
                {refStatus.logs.map((logLine, idx) => (
                  <div key={`${idx}-${logLine.substring(0, 20)}`}>{logLine}</div>
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
  );
}
