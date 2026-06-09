// =============================================================================
// Tablecast  DM Settings & Cloud Backups Panel (Phase 6)
// Provides controls for zip compression & rclone Google Drive synchronization.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { Bot, Cloud, KeyRound } from "lucide-react";
import { useToast } from "../context/ToastContext";

function SettingsPanel({ user }) {
  const { addToast } = useToast();
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

  // Google Drive OAuth wizard states
  const [showOAuthWizard, setShowOAuthWizard] = useState(false);
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthRemoteName, setOauthRemoteName] = useState("gdrive");
  const [oauthRemotePath, setOauthRemotePath] = useState("tablecast-backups");
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthMessage, setOauthMessage] = useState("");
  const [oauthError, setOauthError] = useState("");
  const oauthTimeoutRef = useRef(null);
  
  // Reference cache status states
  const [refStatus, setRefStatus] = useState(null);
  const [syncingRef, setSyncingRef] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [allowedSourcesInput, setAllowedSourcesInput] = useState("");
  const [availableSources, setAvailableSources] = useState([]);
  const [savingSources, setSavingSources] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState("backups");

  // AI settings states
  const [aiProvider, setAiProvider] = useState("gemini");
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiOllamaUrl, setAiOllamaUrl] = useState("http://localhost:11434");
  const [aiOllamaModel, setAiOllamaModel] = useState("llama3");
  const [aiModel, setAiModel] = useState("gpt-5-nano");
  const [aiImagePromptStyle, setAiImagePromptStyle] = useState("");
  const [aiTesting, setAiTesting] = useState(false);
  const [aiTestResult, setAiTestResult] = useState(null);
  const [savingAi, setSavingAi] = useState(false);
  const [availableAiModels, setAvailableAiModels] = useState([]);
  const [fetchingAiModels, setFetchingAiModels] = useState(false);
  const [availableZenModels, setAvailableZenModels] = useState([]);
  const [fetchingZenModels, setFetchingZenModels] = useState(false);

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

  const fetchBackupConfig = async () => {
    try {
      const res = await fetch("/api/backup/config", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
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
    } catch (err) {
      console.error("Failed to load backup config:", err);
    }
  };

  const fetchBackupStatus = async () => {
    if (!user?.id) return;
    try {
      const fullRemote = `${remoteName}:${remotePath}`;
      const res = await fetch(`/api/backup/status?remote=${encodeURIComponent(fullRemote.trim())}`, {
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

  const fetchAiSettings = async () => {
    try {
      const res = await fetch("/api/ai/settings", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setAiProvider(data.provider || "gemini");
        setAiApiKey(data.apiKey || "");
        setAiOllamaUrl(data.ollamaUrl || "http://localhost:11434");
        setAiOllamaModel(data.ollamaModel || "llama3");
        setAiModel(data.model || "gpt-5-nano");
        setAiImagePromptStyle(data.imagePromptStyle || "");
      }
    } catch (err) {
      console.error("Failed to load AI settings:", err);
    }
  };

  useEffect(() => {
    fetchRefStatus();
    fetchReferenceSettings();
    fetchBackupConfig();
    fetchAiSettings();
  }, [user?.id]);

  useEffect(() => {
    fetchBackupStatus();
  }, [user?.id, remoteName, remotePath]);

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

  // Google Drive OAuth callback message handler
  useEffect(() => {
    const handleOAuthMessage = (event) => {
      if (event.data && event.data.type === "RCLONE_AUTH_SUCCESS") {
        setOauthMessage("Authentication successful! Saving configuration and refreshing backup status...");
        setOauthError("");
        oauthTimeoutRef.current = setTimeout(() => {
          setShowOAuthWizard(false);
          setOauthMessage("");
          fetchBackupConfig();
          setRemoteName(oauthRemoteName);
          setRemotePath(oauthRemotePath);
          fetchBackupStatus();
        }, 2500);
      }
    };
    window.addEventListener("message", handleOAuthMessage);
    return () => {
      if (oauthTimeoutRef.current) clearTimeout(oauthTimeoutRef.current);
      window.removeEventListener("message", handleOAuthMessage);
    };
  }, [oauthRemoteName, oauthRemotePath]);

  const handleStartOAuth = async () => {
    if (!oauthClientId.trim() || !oauthClientSecret.trim() || !oauthRemoteName.trim()) {
      setOauthError("Please fill in all required fields (Client ID, Client Secret, and Remote Name).");
      return;
    }

    setOauthLoading(true);
    setOauthError("");
    setOauthMessage("Contacting server to start Google authorization flow...");

    try {
      const redirectUri = `${window.location.origin}/api/backup/oauth-callback`;
      const res = await fetch("/api/backup/oauth-init", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          client_id: oauthClientId.trim(),
          client_secret: oauthClientSecret.trim(),
          remote_name: oauthRemoteName.trim(),
          remote_path: oauthRemotePath.trim(),
          redirect_uri: redirectUri,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to initialize Google Drive link flow.");
      }

      setOauthMessage("Popup opened. Complete authorization in the Google accounts page.");
      
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      window.open(
        data.authUrl,
        "tablecast_rclone_auth",
        `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,status=yes`
      );
    } catch (err) {
      setOauthError(err.message);
      setOauthMessage("");
    } finally {
      setOauthLoading(false);
    }
  };

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
        fetchRefStatus();
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
      fetchRefStatus();
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
          fetchBackupStatus();
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

  const handleSaveAiSettings = async (e) => {
    e.preventDefault();
    if (savingAi) return;
    setSavingAi(true);
    try {
      // First, persist settings to the database
      const saveRes = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          ollamaUrl: aiOllamaUrl,
          ollamaModel: aiOllamaModel,
          model: aiModel,
          imagePromptStyle: aiImagePromptStyle,
        }),
      });

      if (!saveRes.ok) {
        const err = await saveRes.json();
        addToast(`Error saving AI settings: ${err.error || "Unknown"}`, "error");
        return;
      }

      // Then test the connection with the newly saved settings
      const testRes = await fetch("/api/ai/test", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          ollamaUrl: aiOllamaUrl,
          ollamaModel: aiOllamaModel,
          model: aiModel,
        }),
      });

      if (testRes.ok) {
        addToast("AI settings saved and connection successful!", "success");
      } else {
        const testErr = await testRes.json();
        addToast(`AI settings saved, but connection test failed: ${testErr.error || "Unknown"}`, "warning");
      }

      // Reload from DB to reflect saved state
      fetchAiSettings();
    } catch (err) {
      addToast(`Network error saving AI settings: ${err.message}`, "error");
    } finally {
      setSavingAi(false);
    }
  };

  const handleFetchAiModels = async () => {
    if (fetchingAiModels) return;
    setFetchingAiModels(true);
    setAvailableAiModels([]);
    try {
      const res = await fetch(`/api/ai/models?provider=${aiProvider}&url=${encodeURIComponent(aiOllamaUrl)}`, {
        headers: authHeaders
      });
      const data = await res.json();
      if (res.ok) {
        setAvailableAiModels(data.models || []);
        if (data.models && data.models.length > 0) {
          if (!data.models.includes(aiOllamaModel)) {
            setAiOllamaModel(data.models[0]);
          }
        } else {
          addToast("No loaded models found. Make sure your local server has a model active/loaded.", "warning");
        }
      } else {
        addToast(`Failed to fetch models: ${data.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      addToast(`Network error fetching models: ${err.message}`, "error");
    } finally {
      setFetchingAiModels(false);
    }
  };

  const handleFetchZenModels = async () => {
    if (fetchingZenModels) return;
    setFetchingZenModels(true);
    setAvailableZenModels([]);
    try {
      const res = await fetch("/api/ai/zen-models", { headers: authHeaders });
      const data = await res.json();
      if (res.ok) {
        setAvailableZenModels(data.models || []);
        if (data.models && data.models.length > 0) {
          if (!data.models.includes(aiModel)) {
            setAiModel(data.models[0]);
          }
        }
      } else {
        addToast(`Failed to fetch Zen models: ${data.error || "Unknown error"}`, "error");
      }
    } catch (err) {
      addToast(`Network error fetching Zen models: ${err.message}`, "error");
    } finally {
      setFetchingZenModels(false);
    }
  };

  const handleTestAiSettings = async () => {
    if (aiTesting) return;
    setAiTesting(true);
    setAiTestResult(null);
    try {
      const res = await fetch("/api/ai/test", {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          provider: aiProvider,
          apiKey: aiApiKey,
          ollamaUrl: aiOllamaUrl,
          ollamaModel: aiOllamaModel,
          model: aiModel,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiTestResult({ success: true, message: `Connection test successful! Reply: ${data.reply}` });
      } else {
        setAiTestResult({ success: false, message: `Connection test failed: ${data.error}` });
      }
    } catch (err) {
      setAiTestResult({ success: false, message: `Network error: ${err.message}` });
    } finally {
      setAiTesting(false);
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
      {showOAuthWizard && (
        <div style={styles.modalOverlay} onClick={() => { if (!oauthLoading) setShowOAuthWizard(false); }}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <header style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Google Drive Cloud Backup Setup</h3>
              <button
                type="button"
                onClick={() => setShowOAuthWizard(false)}
                disabled={oauthLoading}
                style={styles.modalCloseBtn}
                className="touch-target"
              >
                &times;
              </button>
            </header>
            
            <div style={styles.tutorialContainer}>
              <strong style={{ color: "var(--color-accent)", display: "block", marginBottom: "0.25rem" }}>
                Step-by-step Setup Guide:
              </strong>
              <ol style={{ margin: "0", paddingLeft: "1.2rem", fontSize: "0.82rem", display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                <li>Go to the <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)", textDecoration: "underline" }}>Google Cloud Console</a>.</li>
                <li>Create a new Project (or select an existing one).</li>
                <li>In the <strong>API Library</strong>, search for <strong>Google Drive API</strong> and click <strong>Enable</strong>.</li>
                <li>Configure the <strong>OAuth Consent Screen</strong>: set type to <strong>External</strong>, input an App Name (e.g. <code>Tablecast</code>), and add your Google email address as a <strong>Test User</strong>.</li>
                <li>Create credentials: click <strong>Create Credentials</strong> &rarr; <strong>OAuth client ID</strong>. Set type to <strong>Web application</strong>.</li>
                <li>Add the following URL under <strong>Authorized redirect URIs</strong>:
                  <div style={styles.copyGroup}>
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/backup/oauth-callback`}
                      style={styles.copyInput}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/backup/oauth-callback`);
                        addToast("Redirect URI copied to clipboard!", "info");
                      }}
                      style={styles.copyBtn}
                      className="touch-target"
                    >
                      Copy
                    </button>
                  </div>
                </li>
                <li>Copy the generated <strong>Client ID</strong> and <strong>Client Secret</strong>, and enter them below.</li>
              </ol>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>Google OAuth Client ID *</label>
                <input
                  type="text"
                  placeholder="Paste your Google OAuth Client ID"
                  value={oauthClientId}
                  onChange={(e) => setOauthClientId(e.target.value)}
                  style={styles.input}
                  className="form-input"
                  disabled={oauthLoading}
                />
              </div>

              <div style={styles.inputGroup}>
                <label style={styles.label}>Google OAuth Client Secret *</label>
                <input
                  type="password"
                  placeholder="Paste your Google OAuth Client Secret"
                  value={oauthClientSecret}
                  onChange={(e) => setOauthClientSecret(e.target.value)}
                  style={styles.input}
                  className="form-input"
                  disabled={oauthLoading}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem" }}>
                <div style={{ ...styles.inputGroup, flex: 1 }}>
                  <label style={styles.label}>Remote Profile Name</label>
                  <input
                    type="text"
                    placeholder="e.g. gdrive"
                    value={oauthRemoteName}
                    onChange={(e) => setOauthRemoteName(e.target.value)}
                    style={styles.input}
                    className="form-input"
                    disabled={oauthLoading}
                  />
                </div>

                <div style={{ ...styles.inputGroup, flex: 2 }}>
                  <label style={styles.label}>Backup Folder Path</label>
                  <input
                    type="text"
                    placeholder="e.g. tablecast-backups"
                    value={oauthRemotePath}
                    onChange={(e) => setOauthRemotePath(e.target.value)}
                    style={styles.input}
                    className="form-input"
                    disabled={oauthLoading}
                  />
                </div>
              </div>
            </div>

            {oauthError && (
              <div style={{ ...styles.statusBanner, backgroundColor: "rgba(235, 87, 87, 0.15)", borderColor: "var(--color-danger)", color: "var(--color-danger)", fontSize: "0.85rem", padding: "0.5rem" }}>
                {oauthError}
              </div>
            )}

            {oauthMessage && (
              <div style={{ ...styles.statusBanner, backgroundColor: "rgba(111, 207, 151, 0.15)", borderColor: "var(--color-success)", color: "var(--color-success)", fontSize: "0.85rem", padding: "0.5rem" }}>
                {oauthMessage}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "0.75rem" }}>
              <button
                type="button"
                onClick={() => setShowOAuthWizard(false)}
                disabled={oauthLoading}
                style={{ ...styles.secondaryBtn, width: "auto", padding: "0.6rem 1.25rem" }}
                className="touch-target"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartOAuth}
                disabled={oauthLoading}
                style={{
                  ...styles.backupBtn,
                  width: "auto",
                  padding: "0.6rem 1.5rem",
                  background: oauthLoading ? "var(--color-accent-dim)" : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                  color: oauthLoading ? "var(--color-muted)" : "var(--color-bg)"
                }}
                className="touch-target btn-hover-scale"
              >
                {oauthLoading ? "Connecting..." : "Authenticate & Save"}
              </button>
            </div>
          </div>
        </div>
      )}
      <header style={styles.header}>
        <h1 style={styles.title}>DM Control Settings</h1>
        <p style={styles.subtitle}>Manage backups, reference sync, AI configuration, and campaign operations.</p>
        
        {/* Sub-tab navigation */}
        <div style={styles.subTabNav}>
          <button
            id="dm-settings-backups-tab"
            onClick={() => setActiveSettingsTab("backups")}
            style={{
              ...styles.subTabBtn,
              background: activeSettingsTab === "backups" ? "var(--color-accent-dim)" : "transparent",
              color: activeSettingsTab === "backups" ? "var(--color-accent)" : "var(--color-muted)",
              border: activeSettingsTab === "backups" ? "1px solid var(--color-border)" : "1px solid transparent",
            }}
            className="touch-target"
          >
            <Cloud size={16} />
            Backups & Sync
          </button>
          <button
            id="dm-settings-ai-tab"
            onClick={() => setActiveSettingsTab("ai")}
            style={{
              ...styles.subTabBtn,
              background: activeSettingsTab === "ai" ? "var(--color-accent-dim)" : "transparent",
              color: activeSettingsTab === "ai" ? "var(--color-accent)" : "var(--color-muted)",
              border: activeSettingsTab === "ai" ? "1px solid var(--color-border)" : "1px solid transparent",
            }}
            className="touch-target"
          >
            <Bot size={16} />
            AI Setup
          </button>

        </div>
      </header>

      {activeSettingsTab === "backups" && (
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
            {/* Config Editor Row and Setup Wizard */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", width: "100%", flexWrap: "wrap" }}>
                <button
                  type="button"
                  id="link-google-drive-btn"
                  onClick={() => {
                    setOauthClientId("");
                    setOauthClientSecret("");
                    setOauthRemoteName("gdrive");
                    setOauthRemotePath("tablecast-backups");
                    setOauthError("");
                    setOauthMessage("");
                    setShowOAuthWizard(true);
                  }}
                  style={{
                    ...styles.backupBtn,
                    flex: "1 1 200px",
                    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                    color: "var(--color-bg)",
                    minHeight: "44px"
                  }}
                  className="touch-target btn-hover-scale"
                >
                  <KeyRound size={16} />
                  <span>Link Google Drive Backup</span>
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
      )}

      {activeSettingsTab === "ai" && (
        <div style={styles.content}>
          <section style={styles.card} className="glass-panel gold-border-glow">
            <h2 style={styles.cardTitle}>D&D AI Companion Setup</h2>
            <p style={styles.cardDesc}>
              Configure your preferred LLM provider for the AI Companion chat and slash commands.
              API credentials are saved securely in the database and never sent to players.
            </p>

            <form onSubmit={handleSaveAiSettings} style={styles.form}>
              <div style={styles.inputGroup}>
                <label style={styles.label}>AI Provider</label>
                <select
                  value={aiProvider}
                  onChange={(e) => setAiProvider(e.target.value)}
                  style={styles.select}
                  disabled={savingAi}
                >
                  <option value="gemini">Google Gemini (1.5 Flash)</option>
                  <option value="openai">OpenAI (GPT-4o mini)</option>
                  <option value="anthropic">Anthropic (Claude 3.5 Sonnet)</option>
                  <option value="ollama">Local Ollama (Offline LAN)</option>
                  <option value="lmstudio">LM Studio (Local OpenAI-compatible)</option>
                  <option value="opencode">OpenCode Zen (Multi-Model LLM Gateway)</option>
                </select>
              </div>

              {aiProvider === "ollama" || aiProvider === "lmstudio" ? (
                <>
                  <div style={styles.inputGroup}>
                    <label htmlFor="ai-ollama-url-input" style={styles.label}>
                      {aiProvider === "lmstudio" ? "LM Studio API Endpoint URL" : "Ollama API Endpoint URL"}
                    </label>
                    <input
                      id="ai-ollama-url-input"
                      type="text"
                      placeholder={aiProvider === "lmstudio" ? "e.g. http://host.docker.internal:1234" : "e.g. http://localhost:11434"}
                      value={aiOllamaUrl}
                      onChange={(e) => setAiOllamaUrl(e.target.value)}
                      style={styles.input}
                      className="form-input"
                      disabled={savingAi}
                      required
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label htmlFor="ai-ollama-model-input" style={styles.label}>
                      Model Name / Identifier
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        id="ai-ollama-model-input"
                        type="text"
                        placeholder={aiProvider === "lmstudio" ? "e.g. meta-llama-3-8b-instruct" : "e.g. llama3, mistral, gemma"}
                        value={aiOllamaModel}
                        onChange={(e) => setAiOllamaModel(e.target.value)}
                        style={{ ...styles.input, flex: 1 }}
                        className="form-input"
                        disabled={savingAi}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleFetchAiModels}
                        disabled={fetchingAiModels || !aiOllamaUrl}
                        style={{
                          padding: "0.5rem 0.75rem",
                          border: "1px solid rgba(200, 151, 58, 0.35)",
                          borderRadius: "6px",
                          background: "rgba(200, 151, 58, 0.08)",
                          color: "var(--color-accent)",
                          fontWeight: "bold",
                          fontSize: "0.8rem",
                          cursor: "pointer",
                          minHeight: "44px",
                          whiteSpace: "nowrap"
                        }}
                        className="touch-target btn-hover-scale"
                      >
                        {fetchingAiModels ? "Fetching..." : "Fetch Models"}
                      </button>
                    </div>

                    {availableAiModels.length > 0 && (
                      <div style={{ marginTop: "0.35rem" }}>
                        <label htmlFor="ai-model-select" style={{ ...styles.label, fontSize: "0.75rem", color: "var(--color-muted)" }}>
                          Select from loaded models:
                        </label>
                        <select
                          id="ai-model-select"
                          value={aiOllamaModel}
                          onChange={(e) => setAiOllamaModel(e.target.value)}
                          style={{
                            ...styles.input,
                            padding: "0.5rem",
                            fontSize: "0.85rem",
                            marginTop: "0.15rem",
                            background: "rgba(0, 0, 0, 0.3)",
                            color: "var(--color-text)",
                            border: "1px solid var(--color-border)"
                          }}
                        >
                          {!availableAiModels.includes(aiOllamaModel) && (
                            <option value={aiOllamaModel}>{aiOllamaModel || "(None Selected)"}</option>
                          )}
                          {availableAiModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={styles.inputGroup}>
                  <label htmlFor="ai-key-input" style={styles.label}>
                    API Key
                  </label>
                  <input
                    id="ai-key-input"
                    type="password"
                    placeholder={aiApiKey ? "Leave empty to keep saved key" : "Enter API Key"}
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    style={styles.input}
                    className="form-input"
                    disabled={savingAi}
                  />
                  <small style={styles.helpText}>
                    API key will be saved securely. If you see a masked key (e.g. `abcd...1234`), leave it unchanged to keep the saved key.
                  </small>
                </div>
              )}

              {aiProvider === "opencode" && (
                <div style={styles.inputGroup}>
                  <label htmlFor="ai-zen-model-input" style={styles.label}>
                    Zen Model Name
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      id="ai-zen-model-input"
                      type="text"
                      placeholder="e.g. gpt-5-nano, claude-sonnet-4-6, gemini-3.1-pro"
                      value={aiModel}
                      onChange={(e) => setAiModel(e.target.value)}
                      style={{ ...styles.input, flex: 1 }}
                      className="form-input"
                      disabled={savingAi}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleFetchZenModels}
                      disabled={fetchingZenModels}
                      style={{
                        padding: "0.5rem 0.75rem",
                        border: "1px solid rgba(200, 151, 58, 0.35)",
                        borderRadius: "6px",
                        background: "rgba(200, 151, 58, 0.08)",
                        color: "var(--color-accent)",
                        fontWeight: "bold",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                        minHeight: "44px",
                        whiteSpace: "nowrap"
                      }}
                      className="touch-target btn-hover-scale"
                    >
                      {fetchingZenModels ? "Fetching..." : "Fetch Models"}
                    </button>
                  </div>
                  <small style={styles.helpText}>
                    Model ID from OpenCode Zen. See <a href="https://opencode.ai/zen" target="_blank" rel="noopener noreferrer" style={{ color: "var(--color-accent)" }}>Zen model list</a> for available models.
                  </small>

                  {availableZenModels.length > 0 && (
                    <div style={{ marginTop: "0.35rem" }}>
                      <label style={{ ...styles.label, fontSize: "0.75rem", color: "var(--color-muted)" }}>
                        Select from available models:
                      </label>
                      <select
                        value={aiModel}
                        onChange={(e) => setAiModel(e.target.value)}
                        style={{
                          ...styles.input,
                          padding: "0.5rem",
                          fontSize: "0.85rem",
                          marginTop: "0.15rem",
                          background: "rgba(0, 0, 0, 0.3)",
                          color: "var(--color-text)",
                          border: "1px solid var(--color-border)"
                        }}
                      >
                        {availableZenModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Image Prompt Style Setting */}
              <div style={{ ...styles.inputGroup, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                <label htmlFor="ai-image-prompt-style" style={styles.label}>
                  🎨 NPC Image Prompt Style
                </label>
                <textarea
                  id="ai-image-prompt-style"
                  rows={3}
                  value={aiImagePromptStyle}
                  onChange={(e) => setAiImagePromptStyle(e.target.value)}
                  placeholder="e.g. fantasy digital painting, dramatic lighting, detailed, in the style of Greg Rutkowski, 4k, ultra detailed --ar 2:3"
                  style={{ ...styles.input, width: "100%", resize: "vertical", fontSize: "0.85rem" }}
                  className="form-input"
                  disabled={savingAi}
                />
                <small style={styles.helpText}>
                  This style text is appended to every "Copy Image Prompt" action for NPCs. 
                  Set your preferred art style, medium, aspect ratio, or artist reference. 
                  Leave empty for no style suffix.
                </small>
              </div>

              {aiTestResult && (
                <div
                  style={{
                    ...styles.statusBanner,
                    backgroundColor: aiTestResult.success ? "rgba(111, 207, 151, 0.1)" : "rgba(235, 87, 87, 0.1)",
                    borderColor: aiTestResult.success ? "var(--color-success)" : "var(--color-danger)",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: aiTestResult.success ? "var(--color-success)" : "var(--color-danger)", fontWeight: "bold" }}>
                    {aiTestResult.success ? "Test Passed" : "Test Failed"}
                  </span>
                  <p style={{ ...styles.bannerMessage, fontSize: "0.8rem", marginTop: "0.2rem" }}>{aiTestResult.message}</p>
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick={handleTestAiSettings}
                  disabled={aiTesting || savingAi}
                  style={{ ...styles.secondaryBtn, flex: 1, minHeight: "44px" }}
                  className="touch-target btn-hover-scale"
                >
                  {aiTesting ? "Testing..." : "Test Connection"}
                </button>
                <button
                  type="submit"
                  disabled={savingAi || aiTesting}
                  style={{
                    ...styles.backupBtn,
                    flex: 1,
                    minHeight: "44px",
                    background: savingAi ? "var(--color-accent-dim)" : "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                    color: savingAi ? "var(--color-muted)" : "var(--color-bg)"
                  }}
                  className="touch-target btn-hover-scale"
                >
                  {savingAi ? "Saving..." : "Save Config"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}


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
    gap: "0.4rem",
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
    background: "var(--color-bg)",
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

  subTabNav: {
    display: "flex",
    padding: "0.5rem 0",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  subTabBtn: {
    flex: 1,
    maxWidth: "200px",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0.45rem",
    transition: "all 0.2s",
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
  },
  configEditorContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    background: "rgba(0, 0, 0, 0.15)",
    padding: "1rem",
    borderRadius: "6px",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    marginTop: "0.25rem",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(5, 3, 10, 0.8)",
    backdropFilter: "blur(6px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  modalContent: {
    background: "rgba(15, 14, 23, 0.95)",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    boxShadow: "0 0 30px rgba(200, 151, 58, 0.25)",
    borderRadius: "12px",
    maxWidth: "600px",
    width: "100%",
    maxHeight: "90vh",
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
    padding: "1.75rem",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    paddingBottom: "0.75rem",
  },
  modalTitle: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    margin: 0,
  },
  modalCloseBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "1.5rem",
    cursor: "pointer",
    lineHeight: 1,
  },
  tutorialContainer: {
    background: "rgba(0, 0, 0, 0.2)",
    padding: "1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255, 255, 255, 0.03)",
    fontSize: "0.85rem",
    color: "var(--color-text)",
    lineHeight: "1.45",
  },
  copyGroup: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  copyInput: {
    flex: 1,
    background: "rgba(0,0,0,0.4)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    padding: "0.45rem",
    fontSize: "0.75rem",
    color: "var(--color-text)",
    fontFamily: "monospace",
  },
  copyBtn: {
    padding: "0 0.75rem",
    background: "rgba(200, 151, 58, 0.15)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: "bold",
    cursor: "pointer",
    minHeight: "36px",
  },
};

export default SettingsPanel;
