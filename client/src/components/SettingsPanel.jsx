// =============================================================================
// Tablecast — DM Settings Panel (Phase 6)
// Orchestrator for backup, reference, and AI sub-panels.
// =============================================================================
import { useState, useEffect } from "react";
import { Bot, Cloud, Map } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getAuthHeaders, getJsonAuthHeaders } from "../utils/authHeaders";
import { styles } from "./settings/settingsStyles";
import BackupSettings from "./settings/BackupSettings";
import AiSetup from "./settings/AiSetup";
import FeatureRoadmap from "./settings/FeatureRoadmap";

const SETTINGS_TAB_STORAGE_KEY = "tablecast.settingsTab";

function SettingsPanel({ user }) {
  const { addToast } = useToast();
  const [activeSettingsTab, setActiveSettingsTab] = useState(() => localStorage.getItem(SETTINGS_TAB_STORAGE_KEY) || "backups");

  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = getJsonAuthHeaders(user);

  useEffect(() => {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, activeSettingsTab);
  }, [activeSettingsTab]);

  return (
    <div style={styles.container} className="fade-in">
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
          <button
            id="dm-settings-roadmap-tab"
            onClick={() => setActiveSettingsTab("roadmap")}
            style={{
              ...styles.subTabBtn,
              background: activeSettingsTab === "roadmap" ? "var(--color-accent-dim)" : "transparent",
              color: activeSettingsTab === "roadmap" ? "var(--color-accent)" : "var(--color-muted)",
              border: activeSettingsTab === "roadmap" ? "1px solid var(--color-border)" : "1px solid transparent",
            }}
            className="touch-target"
          >
            <Map size={16} />
            Roadmap
          </button>
        </div>
      </header>

      {activeSettingsTab === "backups" && (
        <BackupSettings user={user} authHeaders={authHeaders} jsonAuthHeaders={jsonAuthHeaders} addToast={addToast} />
      )}

      {activeSettingsTab === "ai" && (
        <AiSetup authHeaders={authHeaders} jsonAuthHeaders={jsonAuthHeaders} addToast={addToast} />
      )}

      {activeSettingsTab === "roadmap" && (
        <FeatureRoadmap user={user} />
      )}
    </div>
  );
}

export default SettingsPanel;
