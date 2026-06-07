// =============================================================================
// Tablecast - Interactive Dice Roller Panel
// A mobile-first interface for picking, compiling, and rolling dice.
// Emits the roll event via Socket.io and integrates with the 3D Dice Box.
// =============================================================================
import { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { useDiceBox } from "../context/DiceBoxContext";

function checkWebGLSupport() {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch (e) {
    return false;
  }
}

const DICE_TYPES = [
  {
    id: "d4",
    label: "d4",
    sides: 4,
    color: "#f43f5e",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 3 3 19 21 19" />
        <line x1="12" y1="3" x2="12" y2="19" />
        <line x1="3" y1="19" x2="12" y2="10" />
        <line x1="21" y1="19" x2="12" y2="10" />
      </svg>
    ),
  },
  {
    id: "d6",
    label: "d6",
    sides: 6,
    color: "#3b82f6",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <circle cx="8" cy="8" r="1.5" fill={color} stroke="none" />
        <circle cx="16" cy="16" r="1.5" fill={color} stroke="none" />
        <circle cx="12" cy="12" r="1.5" fill={color} stroke="none" />
      </svg>
    ),
  },
  {
    id: "d8",
    label: "d8",
    sides: 8,
    color: "#10b981",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 2 22 12 12 22 2 12" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="2" y1="12" x2="22" y2="12" />
      </svg>
    ),
  },
  {
    id: "d10",
    label: "d10",
    sides: 10,
    color: "#f59e0b",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 2 21 9 12 22 3 9" />
        <line x1="12" y1="2" x2="12" y2="22" />
        <line x1="3" y1="9" x2="21" y2="9" />
      </svg>
    ),
  },
  {
    id: "d12",
    label: "d12",
    sides: 12,
    color: "#ec4899",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 2 21 8 18 20 6 20 3 8" />
        <line x1="12" y1="2" x2="12" y2="9" />
        <line x1="3" y1="8" x2="12" y2="9" />
        <line x1="21" y1="8" x2="12" y2="9" />
        <line x1="6" y1="20" x2="12" y2="9" />
        <line x1="18" y1="20" x2="12" y2="9" />
      </svg>
    ),
  },
  {
    id: "d20",
    label: "d20",
    sides: 20,
    color: "#a855f7",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 2 22 7 22 17 12 22 2 17 2 7" />
        <polygon points="12 2 12 22" strokeDasharray="1,1" />
        <polygon points="2 7 12 11 22 7" />
        <polygon points="2 17 12 11 22 17" />
      </svg>
    ),
  },
  {
    id: "d100",
    label: "d100",
    sides: 100,
    color: "#14b8a6",
    svg: (color) => (
      <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke={color} strokeWidth="1.5">
        <polygon points="12 2 21 9 12 22 3 9" />
        <text x="12" y="14" fontSize="6.5" textAnchor="middle" fill={color} stroke="none" fontWeight="bold">00</text>
      </svg>
    ),
  },
];

export default function DiceRollerPanel({ user }) {
  const { socket } = useSocket();
  const [quantities, setQuantities] = useState({
    d4: 0,
    d6: 0,
    d8: 0,
    d10: 0,
    d12: 0,
    d20: 0,
    d100: 0,
  });
  const [modifier, setModifier] = useState(0);
  const [rollLabel, setRollLabel] = useState("");
  const [advantage, setAdvantage] = useState("normal"); // "normal" | "advantage" | "disadvantage"
  const [recentRolls, setRecentRolls] = useState([]);
  const [webGlSupported, setWebGlSupported] = useState(true);

  useEffect(() => {
    setWebGlSupported(checkWebGLSupport());
  }, []);

  // Sender Name: Use the assigned character name (if any), fallback to username.
  const senderName = user?.characters?.[0]?.name || user?.username || "Anonymous";

  // Check if any dice are selected
  const hasDiceSelected = Object.values(quantities).some((qty) => qty > 0);

  // Helper to change individual quantities
  const adjustQuantity = (dieId, amount) => {
    setQuantities((prev) => {
      const current = prev[dieId] || 0;
      const next = Math.max(0, current + amount);
      return { ...prev, [dieId]: next };
    });
  };

  // Helper to direct-tap increment
  const handleDieTap = (dieId) => {
    adjustQuantity(dieId, 1);
  };

  // Reset all fields
  const handleClear = () => {
    setQuantities({
      d4: 0,
      d6: 0,
      d8: 0,
      d10: 0,
      d12: 0,
      d20: 0,
      d100: 0,
    });
    setModifier(0);
    setRollLabel("");
    setAdvantage("normal");
  };

  // Handle D20 Advantage/Disadvantage options (auto-adds a d20 if count is 0)
  const handleAdvantageToggle = (mode) => {
    setAdvantage(mode);
    if (mode !== "normal" && quantities.d20 === 0) {
      setQuantities((prev) => ({ ...prev, d20: 1 }));
    }
  };

  // Build formula text on the fly
  const getFormulaPreview = () => {
    const parts = [];
    Object.entries(quantities).forEach(([key, qty]) => {
      if (qty > 0) {
        if (key === "d20" && advantage !== "normal" && qty === 1) {
          parts.push(`1d20 (${advantage === "advantage" ? "Adv" : "Disadv"})`);
        } else {
          parts.push(`${qty}${key}`);
        }
      }
    });

    if (parts.length === 0) return "Select dice to roll...";

    let formula = parts.join(" + ");
    if (modifier !== 0) {
      formula += modifier > 0 ? ` + ${modifier}` : ` - ${Math.abs(modifier)}`;
    }
    return formula;
  };

  // Execute Roll
  const handleRoll = () => {
    if (!hasDiceSelected || !socket) return;

    const dice3d = [];
    const rolls = [];
    let formulaParts = [];
    let rollSum = 0;

    Object.entries(quantities).forEach(([key, qty]) => {
      if (qty <= 0) return;
      const dieConfig = DICE_TYPES.find((d) => d.id === key);
      const sides = dieConfig.sides;

      if (key === "d20" && advantage !== "normal" && qty === 1) {
        // Handle 1d20 with Advantage / Disadvantage
        const r1 = Math.floor(Math.random() * 20) + 1;
        const r2 = Math.floor(Math.random() * 20) + 1;
        const chosen = advantage === "advantage" ? Math.max(r1, r2) : Math.min(r1, r2);
        const discarded = advantage === "advantage" ? Math.min(r1, r2) : Math.max(r1, r2);

        rolls.push(chosen);
        rollSum += chosen;
        dice3d.push(`2d20@${r1},${r2}`);

        const advLabel = advantage === "advantage" ? "Adv" : "Disadv";
        formulaParts.push(`1d20 (${advLabel}: chose ${chosen}, dropped ${discarded})`);
      } else {
        const typeRolls = [];
        for (let i = 0; i < qty; i++) {
          const r = Math.floor(Math.random() * sides) + 1;
          typeRolls.push(r);
          rolls.push(r);
          rollSum += r;
        }
        dice3d.push(`${qty}${key}@${typeRolls.join(",")}`);
        formulaParts.push(`${qty}${key}`);
      }
    });

    const finalTotal = rollSum + modifier;
    if (modifier !== 0) {
      formulaParts.push(modifier > 0 ? `+ ${modifier}` : `- ${Math.abs(modifier)}`);
    }

    const completedFormula = formulaParts.join(" ");
    const modSign = modifier >= 0 ? "+" : "";
    const formattedMod = modifier !== 0 ? ` ${modSign} ${Math.abs(modifier)}` : "";
    
    // Create descriptive summary text
    let descriptionText = `rolled ${getFormulaPreview()}! Total: ${finalTotal}`;

    // Update local history
    const newRollRecord = {
      id: Date.now(),
      label: rollLabel.trim() || "Dice Roll",
      formula: completedFormula,
      total: finalTotal,
      rolls: rolls,
      modifier: modifier,
      timestamp: Date.now(),
    };
    setRecentRolls((prev) => [newRollRecord, ...prev].slice(0, 5));

    // Emit to socket server
    socket.emit("chat:send", {
      sender: senderName,
      text: descriptionText,
      type: "roll",
      rollDetails: {
        rollName: rollLabel.trim() || "Dice Roll",
        formula: completedFormula,
        rolls: rolls,
        modifier: modifier,
        total: finalTotal,
        isAttack: false,
        status: "rolling",
        diceTheme: user?.diceTheme || "default",
        diceColor: user?.diceColor || "#7c3aed",
        dice3d: dice3d,
      },
    });

    // Clear quantities after rolling for convenient next rolls (optional, but keep label/modifier)
    // Actually, keep them selected in case they want to roll again immediately! D&D combat often involves repeating the same rolls.
  };

  return (
    <div style={styles.container}>
      <div style={styles.scrollWrapper}>
        <div style={styles.content}>
          <div style={styles.headerRow}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2 style={styles.title}>Dice Roller</h2>
              <span
                style={{
                  fontSize: "0.68rem",
                  color: webGlSupported ? "var(--color-success)" : "var(--color-danger)",
                  background: webGlSupported ? "rgba(111, 207, 151, 0.1)" : "rgba(235, 87, 87, 0.1)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "4px",
                  border: webGlSupported ? "1px solid rgba(111, 207, 151, 0.25)" : "1px solid rgba(235, 87, 87, 0.25)",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                }}
              >
                {webGlSupported ? "● 3D Dice Active" : "● WebGL Offline"}
              </span>
            </div>
            <button
              onClick={handleClear}
              style={styles.clearBtn}
              className="touch-target btn-hover-scale glass-panel"
            >
              Clear Pool
            </button>
          </div>

          {/* Dice Selection Grid */}
          <div style={styles.diceGrid}>
            {DICE_TYPES.map((die) => {
              const qty = quantities[die.id] || 0;
              return (
                <div
                  key={die.id}
                  style={{
                    ...styles.dieCard,
                    borderColor: qty > 0 ? die.color : "rgba(255,255,255,0.06)",
                    background: qty > 0 ? `rgba(${hexToRgb(die.color)}, 0.08)` : "rgba(255,255,255,0.02)",
                  }}
                  className="glass-panel"
                >
                  <div
                    onClick={() => handleDieTap(die.id)}
                    style={styles.dieVisualArea}
                    title="Tap to add die"
                  >
                    {die.svg(qty > 0 ? die.color : "var(--color-muted)")}
                    <span style={{ ...styles.dieLabel, color: qty > 0 ? die.color : "var(--color-muted)" }}>
                      {die.label.toUpperCase()}
                    </span>
                  </div>

                  <div style={styles.controlsRow}>
                    <button
                      onClick={() => adjustQuantity(die.id, -1)}
                      style={styles.adjustBtn}
                      className="touch-target"
                      disabled={qty === 0}
                    >
                      －
                    </button>
                    <span style={{ ...styles.quantityDisplay, color: qty > 0 ? "var(--color-text)" : "var(--color-muted)" }}>
                      {qty}
                    </span>
                    <button
                      onClick={() => adjustQuantity(die.id, 1)}
                      style={styles.adjustBtn}
                      className="touch-target"
                    >
                      ＋
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modifier and Label Section */}
          <div style={styles.inputsSection} className="glass-panel">
            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Flat Modifier</label>
              <div style={styles.modifierControl}>
                <button
                  onClick={() => setModifier((m) => m - 1)}
                  style={styles.modAdjustBtn}
                  className="touch-target"
                >
                  －
                </button>
                <input
                  type="number"
                  value={modifier}
                  onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
                  style={styles.modInput}
                  className="form-input"
                />
                <button
                  onClick={() => setModifier((m) => m + 1)}
                  style={styles.modAdjustBtn}
                  className="touch-target"
                >
                  ＋
                </button>
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.inputLabel}>Roll Name / Purpose</label>
              <input
                type="text"
                placeholder="e.g. Stealth check, Fireball damage"
                value={rollLabel}
                onChange={(e) => setRollLabel(e.target.value)}
                style={styles.textInput}
                className="form-input"
                maxLength={40}
              />
            </div>
          </div>

          {/* D20 Advantage/Disadvantage Section */}
          <div style={styles.inputsSection} className="glass-panel">
            <label style={styles.inputLabel}>d20 Modifiers</label>
            <div style={styles.advantageGrid}>
              <button
                onClick={() => handleAdvantageToggle("normal")}
                style={{
                  ...styles.advBtn,
                  background: advantage === "normal" ? "rgba(255, 255, 255, 0.1)" : "transparent",
                  borderColor: advantage === "normal" ? "var(--color-accent)" : "rgba(255,255,255,0.06)",
                  color: advantage === "normal" ? "var(--color-accent)" : "var(--color-muted)",
                }}
                className="touch-target"
              >
                Normal
              </button>
              <button
                onClick={() => handleAdvantageToggle("advantage")}
                style={{
                  ...styles.advBtn,
                  background: advantage === "advantage" ? "rgba(111, 207, 151, 0.15)" : "transparent",
                  borderColor: advantage === "advantage" ? "var(--color-success)" : "rgba(255,255,255,0.06)",
                  color: advantage === "advantage" ? "var(--color-success)" : "var(--color-muted)",
                }}
                className="touch-target"
              >
                Advantage
              </button>
              <button
                onClick={() => handleAdvantageToggle("disadvantage")}
                style={{
                  ...styles.advBtn,
                  background: advantage === "disadvantage" ? "rgba(235, 87, 87, 0.15)" : "transparent",
                  borderColor: advantage === "disadvantage" ? "var(--color-danger)" : "rgba(255,255,255,0.06)",
                  color: advantage === "disadvantage" ? "var(--color-danger)" : "var(--color-muted)",
                }}
                className="touch-target"
              >
                Disadvantage
              </button>
            </div>
          </div>

          {/* Recent Rolls Section */}
          {recentRolls.length > 0 && (
            <div style={styles.inputsSection} className="glass-panel gold-border-glow">
              <label style={styles.inputLabel}>Recent Rolls</label>
              <div style={styles.rollsList}>
                {recentRolls.map((roll, idx) => (
                  <div
                    key={roll.id}
                    style={{
                      ...styles.rollResultItem,
                      borderBottom: idx < recentRolls.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none",
                      paddingTop: idx > 0 ? "0.75rem" : "0",
                      paddingBottom: "0.75rem",
                    }}
                    className={idx === 0 ? "fade-in" : ""}
                  >
                    <div style={styles.rollResultHeader}>
                      <span style={{
                        ...styles.rollResultLabel,
                        color: idx === 0 ? "var(--color-accent)" : "var(--color-text)",
                        fontWeight: idx === 0 ? "bold" : "600",
                      }}>
                        {roll.label}
                      </span>
                      <span style={{
                        ...styles.rollResultTotal,
                        color: idx === 0 ? "var(--color-accent)" : "var(--color-muted)",
                        fontSize: idx === 0 ? "1.5rem" : "1.1rem",
                        textShadow: idx === 0 ? "0 0 10px rgba(200,151,58,0.3)" : "none",
                      }}>
                        {roll.total}
                      </span>
                    </div>
                    <div style={styles.rollResultDetails}>
                      <span style={styles.rollResultFormula}>{roll.formula}</span>
                      <span style={styles.rollResultBreakdown}>
                        (Rolled: {roll.rolls.join(", ")} {roll.modifier >= 0 ? `+` : ``}{roll.modifier})
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action / Roll Summary Footer */}
      <div style={styles.footer} className="glass-panel gold-border-glow">
        <div style={styles.formulaPreview}>
          <span style={styles.formulaLabel}>Formula Preview</span>
          <span style={styles.formulaText}>{getFormulaPreview()}</span>
        </div>
        <button
          onClick={handleRoll}
          disabled={!hasDiceSelected}
          style={{
            ...styles.rollBtn,
            background: hasDiceSelected
              ? "linear-gradient(135deg, var(--color-accent) 0%, #a87427 100%)"
              : "rgba(255, 255, 255, 0.04)",
            color: hasDiceSelected ? "#0f0e17" : "var(--color-muted)",
            boxShadow: hasDiceSelected ? "0 0 15px rgba(200, 151, 58, 0.45)" : "none",
          }}
          className="touch-target btn-hover-scale"
        >
          ROLL DICE
        </button>
      </div>
    </div>
  );
}

// Helper to convert hex colors to RGB values for transparent backgrounds
function hexToRgb(hex) {
  const cleanHex = hex.replace("#", "");
  const bigint = parseInt(cleanHex, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `${r}, ${g}, ${b}`;
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    background: "var(--color-bg)",
  },
  scrollWrapper: {
    flex: 1,
    overflowY: "auto",
    padding: "1rem",
    paddingBottom: "130px", // space for footer
  },
  content: {
    maxWidth: "500px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: "1.25rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
  },
  clearBtn: {
    padding: "0.45rem 0.85rem",
    fontSize: "0.8rem",
    borderRadius: "6px",
    color: "var(--color-text)",
    cursor: "pointer",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  diceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
    gap: "0.75rem",
  },
  dieCard: {
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    padding: "0.75rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.5rem",
    transition: "all 0.2s ease",
  },
  dieVisualArea: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    cursor: "pointer",
    width: "100%",
    padding: "0.25rem 0",
    gap: "0.35rem",
  },
  dieLabel: {
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  controlsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    background: "rgba(0,0,0,0.2)",
    borderRadius: "6px",
    overflow: "hidden",
  },
  adjustBtn: {
    width: "44px",
    height: "44px",
    border: "none",
    background: "transparent",
    color: "var(--color-text)",
    fontSize: "1.1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
    transition: "background 0.15s",
    ":hover": {
      background: "rgba(255,255,255,0.05)",
    },
    ":active": {
      background: "rgba(255,255,255,0.1)",
    },
  },
  quantityDisplay: {
    fontSize: "1.1rem",
    fontWeight: "bold",
    minWidth: "24px",
    textAlign: "center",
  },
  inputsSection: {
    padding: "1rem",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    border: "1px solid var(--glass-border)",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.45rem",
  },
  inputLabel: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  modifierControl: {
    display: "flex",
    alignItems: "center",
    background: "rgba(0,0,0,0.15)",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    overflow: "hidden",
    maxWidth: "180px",
  },
  modAdjustBtn: {
    width: "44px",
    height: "44px",
    border: "none",
    background: "transparent",
    color: "var(--color-text)",
    fontSize: "1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    userSelect: "none",
  },
  modInput: {
    flex: 1,
    border: "none",
    background: "transparent",
    color: "var(--color-text)",
    textAlign: "center",
    fontSize: "1.1rem",
    fontWeight: "bold",
    outline: "none",
    width: "60px",
  },
  textInput: {
    width: "100%",
    padding: "0.75rem",
    fontSize: "0.9rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.15)",
    color: "var(--color-text)",
    outline: "none",
  },
  advantageGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: "0.5rem",
  },
  advBtn: {
    height: "44px",
    borderRadius: "6px",
    border: "1px solid",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: "bold",
    transition: "all 0.2s ease",
  },
  footer: {
    position: "fixed",
    bottom: "58px", // just above the bottom tab navigation bar
    left: 0,
    right: 0,
    height: "72px",
    background: "rgba(15, 14, 23, 0.95)",
    borderTop: "1px solid var(--color-border)",
    padding: "0.5rem 1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "1rem",
    zIndex: 1000,
  },
  formulaPreview: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    flex: 1,
    overflow: "hidden",
  },
  formulaLabel: {
    fontSize: "0.68rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  formulaText: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "var(--color-accent)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  rollBtn: {
    height: "48px",
    padding: "0 1.5rem",
    border: "none",
    borderRadius: "8px",
    fontWeight: "bold",
    fontSize: "0.95rem",
    cursor: "pointer",
    transition: "all 0.2s ease",
    whiteSpace: "nowrap",
  },
  rollsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    marginTop: "0.5rem",
  },
  rollResultItem: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  rollResultHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rollResultLabel: {
    fontSize: "0.9rem",
  },
  rollResultTotal: {
    fontWeight: 800,
    fontFamily: "monospace",
  },
  rollResultDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  rollResultFormula: {
    fontStyle: "italic",
  },
  rollResultBreakdown: {
    opacity: 0.8,
  },
};
