import React, { useState } from "react";

const PRESET_COLORS = [
  { name: "Purple Accent", value: "#7c3aed" },
  { name: "Fighter Red", value: "#ef4444" },
  { name: "Ranger Green", value: "#10b981" },
  { name: "Paladin Gold", value: "#f59e0b" },
  { name: "Rogue Black", value: "#1f2937" },
  { name: "Wizard Blue", value: "#3b82f6" },
];

export default function DiceSettingsModal({ user, onClose, onSave }) {
  const [diceTheme, setDiceTheme] = useState(user?.diceTheme || "default");
  const [diceColor, setDiceColor] = useState(user?.diceColor || "#7c3aed");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    await onSave(diceTheme, diceColor);
    setSaving(false);
    onClose();
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div 
        style={styles.modalContent} 
        className="glass-panel gold-border-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>🎲 3D Dice Customization</h3>
          <button style={styles.closeBtn} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Dice Theme / Style</label>
            <select
              value={diceTheme}
              onChange={(e) => setDiceTheme(e.target.value)}
              style={styles.select}
            >
              <option value="default">Default Solid</option>
            </select>
            <small style={styles.helpText}>
              The solid theme uses physics-simulated shading and customizable color.
            </small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Dice Color</label>
            
            {/* Presets Grid */}
            <div style={styles.presetGrid}>
              {PRESET_COLORS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setDiceColor(preset.value)}
                  style={{
                    ...styles.presetBtn,
                    backgroundColor: preset.value,
                    border: diceColor === preset.value 
                      ? "3px solid var(--color-accent, #c5a880)" 
                      : "2px solid rgba(255, 255, 255, 0.1)",
                  }}
                  title={preset.name}
                />
              ))}
            </div>

            {/* Custom Color Input */}
            <div style={styles.customColorRow}>
              <span style={styles.colorLabel}>Custom Color:</span>
              <input
                type="color"
                value={diceColor}
                onChange={(e) => setDiceColor(e.target.value)}
                style={styles.colorPicker}
              />
              <span style={styles.hexValue}>{diceColor.toUpperCase()}</span>
            </div>
          </div>

          {/* Preview Dice Render */}
          <div style={styles.previewBox}>
            <div style={{ ...styles.previewDie, backgroundColor: diceColor }}>
              <span style={styles.previewDieText}>20</span>
            </div>
            <span style={styles.previewLabel}>Visual Preview</span>
          </div>

          <div style={styles.actions}>
            <button 
              type="button" 
              onClick={onClose} 
              style={styles.cancelBtn}
              className="touch-target"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={saving} 
              style={styles.saveBtn}
              className="touch-target btn-hover-scale"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    backdropFilter: "blur(4px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000,
  },
  modalContent: {
    width: "90%",
    maxWidth: "400px",
    padding: "24px",
    borderRadius: "12px",
    color: "#ffffff",
    boxShadow: "0 10px 25px rgba(0, 0, 0, 0.5)",
    animation: "fadeIn 0.2s ease-out",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    paddingBottom: "10px",
  },
  modalTitle: {
    margin: 0,
    fontSize: "1.2rem",
    fontWeight: "bold",
    letterSpacing: "0.5px",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "rgba(255, 255, 255, 0.6)",
    fontSize: "24px",
    cursor: "pointer",
    padding: "0 5px",
    lineHeight: 1,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  label: {
    fontSize: "0.9rem",
    fontWeight: "bold",
    color: "#e2e8f0",
  },
  select: {
    padding: "10px",
    borderRadius: "6px",
    backgroundColor: "#1e293b",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    fontSize: "0.95rem",
    outline: "none",
  },
  helpText: {
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "8px",
    marginBottom: "8px",
  },
  presetBtn: {
    height: "36px",
    borderRadius: "6px",
    cursor: "pointer",
    padding: 0,
    transition: "transform 0.1s ease",
  },
  customColorRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "4px",
  },
  colorLabel: {
    fontSize: "0.85rem",
    color: "#94a3b8",
  },
  colorPicker: {
    width: "36px",
    height: "36px",
    border: "none",
    borderRadius: "6px",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  hexValue: {
    fontFamily: "monospace",
    fontSize: "0.9rem",
    color: "var(--color-accent, #c5a880)",
  },
  previewBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0, 0, 0, 0.2)",
    padding: "16px",
    borderRadius: "8px",
    border: "1px dashed rgba(255, 255, 255, 0.1)",
    margin: "8px 0",
    gap: "8px",
  },
  previewDie: {
    width: "48px",
    height: "48px",
    borderRadius: "8px",
    boxShadow: "inset 0 0 10px rgba(0,0,0,0.5), 0 4px 6px rgba(0,0,0,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "rotate(15deg)",
    border: "1px solid rgba(255,255,255,0.3)",
  },
  previewDieText: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: "1.2rem",
    textShadow: "0 1px 2px rgba(0,0,0,0.8)",
  },
  previewLabel: {
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px",
    marginTop: "10px",
  },
  cancelBtn: {
    padding: "10px 16px",
    borderRadius: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    border: "none",
    color: "#ffffff",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "10px 16px",
    borderRadius: "6px",
    backgroundColor: "var(--color-accent, #c5a880)",
    border: "none",
    color: "#1a1a1a",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
