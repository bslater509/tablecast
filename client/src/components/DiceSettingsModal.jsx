import React, { useState } from "react";
import { Check, Dices, X } from "lucide-react";
import {
  DICE_COLOR_PRESETS,
  DICE_THEME_OPTIONS,
  getDiceThemeOption,
  getDiceThemePreviewStyles,
  normalizeDiceTheme,
} from "../lib/diceThemes";

export default function DiceSettingsModal({ user, onClose, onSave }) {
  const initialTheme = normalizeDiceTheme(user?.diceTheme || "default");
  const initialThemeOption = getDiceThemeOption(initialTheme);
  const [diceTheme, setDiceTheme] = useState(initialTheme);
  const [diceColor, setDiceColor] = useState(user?.diceColor || initialThemeOption.defaultColor);
  const [saving, setSaving] = useState(false);

  const selectedTheme = getDiceThemeOption(diceTheme);
  const themeStyle = getDiceThemePreviewStyles(diceTheme, diceColor);

  const handleThemeChange = (newTheme) => {
    const option = getDiceThemeOption(newTheme);
    setDiceTheme(option.id);
    setDiceColor(option.defaultColor);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const saved = await onSave(diceTheme, diceColor);
    setSaving(false);
    if (saved) {
      onClose();
    }
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div
        style={styles.modalContent}
        className="glass-panel gold-border-glow"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.modalHeader}>
          <div style={styles.titleGroup}>
            <Dices size={20} color="var(--color-accent)" />
            <h3 style={styles.modalTitle}>Dice Appearance</h3>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Close dice settings">
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.previewBox}>
            <div style={{ ...styles.previewStage, ...themeStyle.box }}>
              <div style={{ ...styles.previewDie, ...themeStyle.die }}>
                <span style={{ ...styles.previewDieText, ...themeStyle.text }}>20</span>
              </div>
              <div style={styles.previewMeta}>
                <span style={styles.previewName}>{selectedTheme.name}</span>
                <span style={{ ...styles.previewChip, ...themeStyle.chip }}>{selectedTheme.materialLabel}</span>
              </div>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Theme</label>
            <div style={styles.themeGrid} className="dice-theme-grid">
              {DICE_THEME_OPTIONS.map((theme) => {
                const active = diceTheme === theme.id;
                const preview = getDiceThemePreviewStyles(theme.id, theme.defaultColor);
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => handleThemeChange(theme.id)}
                    style={{
                      ...styles.themeCard,
                      borderColor: active ? theme.accent : "rgba(255,255,255,0.08)",
                      background: active ? theme.surface : "rgba(255,255,255,0.035)",
                      boxShadow: active ? `0 0 18px ${theme.glow}` : "none",
                    }}
                    className="touch-target btn-hover-scale"
                    aria-pressed={active}
                  >
                    <span style={{ ...styles.themeDie, ...preview.die }}>
                      <span style={{ ...styles.themeDieText, ...preview.text }}>8</span>
                    </span>
                    <span style={styles.themeTextGroup}>
                      <span style={styles.themeName}>{theme.shortName}</span>
                      <span style={styles.themeMaterial}>{theme.materialLabel}</span>
                    </span>
                    {active && (
                      <span style={styles.checkMark}>
                        <Check size={14} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Color</label>
            <div style={styles.presetGrid}>
              {DICE_COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setDiceColor(preset.value)}
                  style={{
                    ...styles.presetBtn,
                    background: `linear-gradient(145deg, ${preset.value}, rgba(0,0,0,0.55))`,
                    border: diceColor === preset.value
                      ? "3px solid var(--color-accent)"
                      : "1px solid rgba(255,255,255,0.14)",
                  }}
                  title={preset.name}
                  aria-label={preset.name}
                  className="btn-hover-scale"
                />
              ))}
            </div>

            <div style={styles.customColorRow}>
              <input
                type="color"
                value={diceColor}
                onChange={(e) => setDiceColor(e.target.value)}
                style={styles.colorPicker}
                aria-label="Custom dice color"
              />
              <span style={styles.hexValue}>{diceColor.toUpperCase()}</span>
            </div>
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn} className="touch-target">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
              className="touch-target btn-hover-scale"
            >
              {saving ? "Saving" : "Save"}
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
    backgroundColor: "rgba(0, 0, 0, 0.62)",
    backdropFilter: "blur(5px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 10000,
    padding: "0.75rem",
  },
  modalContent: {
    width: "100%",
    maxWidth: "560px",
    maxHeight: "92dvh",
    overflowY: "auto",
    padding: "1rem",
    borderRadius: "8px",
    color: "#ffffff",
    animation: "fadeIn 0.2s ease-out",
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
    marginBottom: "0.9rem",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    paddingBottom: "0.75rem",
  },
  titleGroup: {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    minWidth: 0,
  },
  modalTitle: {
    margin: 0,
    fontSize: "1.08rem",
    fontWeight: 800,
    letterSpacing: 0,
  },
  closeBtn: {
    width: "44px",
    height: "44px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "rgba(255, 255, 255, 0.72)",
    borderRadius: "6px",
    cursor: "pointer",
    flexShrink: 0,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.6rem",
  },
  label: {
    fontSize: "0.78rem",
    fontWeight: 800,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  previewBox: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  previewStage: {
    minHeight: "128px",
    borderRadius: "8px",
    padding: "1rem",
    display: "grid",
    gridTemplateColumns: "80px minmax(0, 1fr)",
    alignItems: "center",
    gap: "1rem",
  },
  previewDie: {
    width: "68px",
    height: "68px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "rotate(12deg)",
  },
  previewDieText: {
    fontWeight: 900,
    fontSize: "1.42rem",
    lineHeight: 1,
  },
  previewMeta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "0.45rem",
    minWidth: 0,
  },
  previewName: {
    fontSize: "1.1rem",
    fontWeight: 800,
    color: "var(--color-text)",
  },
  previewChip: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "28px",
    borderRadius: "999px",
    padding: "0.25rem 0.65rem",
    fontSize: "0.72rem",
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  themeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "0.55rem",
  },
  themeCard: {
    position: "relative",
    minHeight: "74px",
    borderRadius: "8px",
    border: "1px solid",
    padding: "0.65rem",
    color: "var(--color-text)",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "42px minmax(0, 1fr)",
    alignItems: "center",
    justifyContent: "initial",
    gap: "0.6rem",
    textAlign: "left",
  },
  themeDie: {
    width: "38px",
    height: "38px",
    borderRadius: "7px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transform: "rotate(10deg)",
  },
  themeDieText: {
    fontSize: "0.86rem",
    fontWeight: 900,
    lineHeight: 1,
  },
  themeTextGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    minWidth: 0,
  },
  themeName: {
    fontSize: "0.88rem",
    fontWeight: 800,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  themeMaterial: {
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  checkMark: {
    position: "absolute",
    top: "0.45rem",
    right: "0.45rem",
    width: "22px",
    height: "22px",
    borderRadius: "999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "var(--color-accent)",
    color: "#12100a",
  },
  presetGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(44px, 1fr))",
    gap: "0.5rem",
  },
  presetBtn: {
    minHeight: "44px",
    borderRadius: "7px",
    cursor: "pointer",
    padding: 0,
  },
  customColorRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  colorPicker: {
    width: "52px",
    height: "44px",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: "7px",
    backgroundColor: "transparent",
    cursor: "pointer",
  },
  hexValue: {
    fontFamily: "monospace",
    fontSize: "0.9rem",
    color: "var(--color-accent)",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.65rem",
    paddingTop: "0.25rem",
  },
  cancelBtn: {
    padding: "0.65rem 1rem",
    borderRadius: "6px",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#ffffff",
    cursor: "pointer",
  },
  saveBtn: {
    padding: "0.65rem 1.1rem",
    borderRadius: "6px",
    background: "linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))",
    border: "none",
    color: "#14100a",
    fontWeight: 900,
    cursor: "pointer",
  },
};
