// =============================================================================
// Tablecast — Level-Up Wizard Component (M3.2)
// Multi-step guided level-up: HP, ASI/Feat, Review, Apply
// =============================================================================
import { useState, useEffect } from "react";
import { getJsonAuthHeaders } from "../../utils/authHeaders";
import { formatMod, getProficiencyBonus } from "./characterUtils";

const STEPS = ["Hit Points", "Ability Score", "Review & Apply"];
const ASI_LEVELS = new Set([4, 8, 12, 16, 19]);

const ABILITY_NAMES = [
  { key: "strength", label: "Strength" },
  { key: "dexterity", label: "Dexterity" },
  { key: "constitution", label: "Constitution" },
  { key: "intelligence", label: "Intelligence" },
  { key: "wisdom", label: "Wisdom" },
  { key: "charisma", label: "Charisma" },
];

export default function LevelUpWizard({ character, user, onClose, onApplied }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Step 1: HP
  const [hpMode, setHpMode] = useState("average");
  const [hpGain, setHpGain] = useState(0);

  // Step 2: ASI (only for ASI levels)
  const newLevel = character.level + 1;
  const isAsiLevel = ASI_LEVELS.has(newLevel);
  const [asiMode, setAsiMode] = useState("+2");
  const [asiPrimary, setAsiPrimary] = useState("");
  const [asiSecondary, setAsiSecondary] = useState("");
  const [featName, setFeatName] = useState("");

  // Spell slots progression table (PHB full casters)
  const getSpellSlotsForLevel = (lvl) => {
    const table = {
      1:  { "1": { total: 2, used: 0 } },
      2:  { "1": { total: 3, used: 0 } },
      3:  { "1": { total: 4, used: 0 }, "2": { total: 2, used: 0 } },
      4:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 } },
      5:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 2, used: 0 } },
      6:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 3, used: 0 } },
      7:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 3, used: 0 }, "4": { total: 1, used: 0 } },
      8:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 3, used: 0 }, "4": { total: 2, used: 0 } },
      9:  { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 3, used: 0 }, "4": { total: 3, used: 0 }, "5": { total: 1, used: 0 } },
      10: { "1": { total: 4, used: 0 }, "2": { total: 3, used: 0 }, "3": { total: 3, used: 0 }, "4": { total: 3, used: 0 }, "5": { total: 2, used: 0 } },
    };
    return table[lvl] || null;
  };

  // Initialize HP gain based on class hit die
  useEffect(() => {
    const dieSize = parseInt(character.hitDiceType?.replace("d", "") || "8", 10);
    const conMod = Math.floor((character.constitution - 10) / 2);
    if (hpMode === "average") {
      setHpGain(Math.floor(dieSize / 2) + 1 + conMod);
    }
  }, [hpMode, character.hitDiceType, character.constitution]);

  const dieSize = parseInt(character.hitDiceType?.replace("d", "") || "8", 10);
  const conMod = Math.floor((character.constitution - 10) / 2);
  const avgHpGain = Math.floor(dieSize / 2) + 1 + conMod;

  const getAbilityIncreases = () => {
    if (!isAsiLevel) return {};
    if (asiMode === "+2" && asiPrimary) {
      return { [asiPrimary]: 2 };
    }
    if (asiMode === "+1+1" && asiPrimary && asiSecondary) {
      return { [asiPrimary]: 1, [asiSecondary]: 1 };
    }
    return {};
  };

  const getReviewItems = () => [
    { label: "New Level", value: `${character.level} → ${newLevel}` },
    { label: "Max HP", value: `${character.maxHp} → ${character.maxHp + hpGain}` },
    { label: "HP Gained", value: String(hpGain) },
    { label: "Prof Bonus", value: `${getProficiencyBonus(character.level)} → ${getProficiencyBonus(newLevel)}` },
    ...(isAsiLevel && Object.keys(getAbilityIncreases()).length > 0
      ? Object.entries(getAbilityIncreases()).map(([abil, inc]) => ({
          label: abil.charAt(0).toUpperCase() + abil.slice(1),
          value: `${character[abil] || 10} → ${(character[abil] || 10) + inc}`,
        }))
      : []),
    ...(featName ? [{ label: "Feat", value: featName }] : []),
  ];

  async function handleApply() {
    setLoading(true);
    setError(null);
    try {
      const body = { newHp: hpGain };
      const increases = getAbilityIncreases();
      if (Object.keys(increases).length > 0) {
        body.abilityIncreases = increases;
      }
      if (featName) {
        body.featName = featName;
      }
      if (character.spellcastingAbility) {
        const newSlots = getSpellSlotsForLevel(newLevel);
        if (newSlots) {
          body.spellSlots = JSON.stringify(newSlots);
        }
      }
      const res = await fetch(`/api/characters/${character.id}/level-up`, {
        method: "POST",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Level-up failed");
      }
      const result = await res.json();
      if (onApplied) onApplied(result.character);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
      background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
      justifyContent: "center", zIndex: 1000, padding: "1rem",
    }} onClick={() => !loading && onClose()}>
      <div style={{
        background: "var(--color-surface)", borderRadius: "12px",
        padding: "1.5rem", maxWidth: "480px", width: "100%",
        maxHeight: "90vh", overflow: "auto",
        border: "1px solid rgba(255,255,255,0.1)",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ margin: 0, color: "var(--color-accent)", fontSize: "1rem" }}>
            Level Up! Lv {character.level} → Lv {newLevel}
          </h3>
          <button onClick={onClose} style={{
            background: "transparent", border: "none", color: "var(--color-text)",
            fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem",
          }} className="touch-target">✕</button>
        </div>

        <div style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{
              flex: 1, height: "3px", borderRadius: "2px",
              background: i <= step ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
              transition: "background 0.3s ease",
            }} />
          ))}
        </div>

        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <p style={{ color: "var(--color-text)", fontSize: "0.85rem", margin: 0 }}>
              Your class hit die is <strong>{character.hitDiceType}</strong> with a Constitution modifier of <strong>{formatMod(conMod)}</strong>.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                onClick={() => setHpMode("average")}
                style={{
                  flex: 1, padding: "0.5rem", borderRadius: "6px",
                  background: hpMode === "average" ? "rgba(200,151,58,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${hpMode === "average" ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                  color: "var(--color-text)", cursor: "pointer", textAlign: "center",
                }}
                className="touch-target"
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>Average</div>
                <div style={{ fontSize: "0.72rem", color: "var(--color-accent)", fontWeight: 600 }}>+{avgHpGain} HP</div>
              </button>
              <button
                onClick={() => setHpMode("manual")}
                style={{
                  flex: 1, padding: "0.5rem", borderRadius: "6px",
                  background: hpMode === "manual" ? "rgba(200,151,58,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${hpMode === "manual" ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                  color: "var(--color-text)", cursor: "pointer", textAlign: "center",
                }}
                className="touch-target"
              >
                <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>Manual</div>
                <input
                  type="number"
                  min={1}
                  value={hpGain}
                  onChange={(e) => setHpGain(Math.max(1, parseInt(e.target.value) || 1))}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "50px", padding: "0.2rem", marginTop: "0.2rem",
                    background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "4px", color: "var(--color-text)", textAlign: "center",
                    fontSize: "0.85rem", outline: "none",
                  }}
                />
              </button>
            </div>
            <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", textAlign: "center" }}>
              New max HP: <strong style={{ color: "var(--color-text)" }}>{character.maxHp} → {character.maxHp + hpGain}</strong>
            </div>
          </div>
        )}

        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {isAsiLevel ? (
              <>
                <p style={{ color: "var(--color-text)", fontSize: "0.85rem", margin: 0 }}>
                  Level {newLevel} grants an Ability Score Improvement! Choose how to apply:
                </p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={() => setAsiMode("+2")}
                    style={{
                      flex: 1, padding: "0.4rem", borderRadius: "6px",
                      background: asiMode === "+2" ? "rgba(200,151,58,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${asiMode === "+2" ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                      color: "var(--color-text)", cursor: "pointer", textAlign: "center", fontSize: "0.78rem", fontWeight: 600,
                    }}
                    className="touch-target"
                  >
                    +2 to One
                  </button>
                  <button
                    onClick={() => setAsiMode("+1+1")}
                    style={{
                      flex: 1, padding: "0.4rem", borderRadius: "6px",
                      background: asiMode === "+1+1" ? "rgba(200,151,58,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${asiMode === "+1+1" ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                      color: "var(--color-text)", cursor: "pointer", textAlign: "center", fontSize: "0.78rem", fontWeight: 600,
                    }}
                    className="touch-target"
                  >
                    +1 to Two
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  <div>
                    <label style={{ fontSize: "0.7rem", color: "var(--color-muted)", fontWeight: 600 }}>
                      {asiMode === "+2" ? "Ability (+2)" : "Primary Ability (+1)"}
                    </label>
                    <select
                      value={asiPrimary}
                      onChange={(e) => setAsiPrimary(e.target.value)}
                      style={{
                        width: "100%", padding: "0.4rem", marginTop: "0.15rem",
                        background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "4px", color: "var(--color-text)", outline: "none", fontSize: "0.8rem",
                      }}
                    >
                      <option value="">— Select —</option>
                      {ABILITY_NAMES.map((a) => (
                        <option key={a.key} value={a.key} disabled={(character[a.key] || 10) >= 20}>
                          {a.label} ({(character[a.key] || 10)}{(character[a.key] || 10) >= 20 ? " — MAX" : ""})
                        </option>
                      ))}
                    </select>
                  </div>
                  {asiMode === "+1+1" && (
                    <div>
                      <label style={{ fontSize: "0.7rem", color: "var(--color-muted)", fontWeight: 600 }}>
                        Secondary Ability (+1)
                      </label>
                      <select
                        value={asiSecondary}
                        onChange={(e) => setAsiSecondary(e.target.value)}
                        style={{
                          width: "100%", padding: "0.4rem", marginTop: "0.15rem",
                          background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: "4px", color: "var(--color-text)", outline: "none", fontSize: "0.8rem",
                        }}
                      >
                        <option value="">— Select —</option>
                        {ABILITY_NAMES.map((a) => (
                          <option key={a.key} value={a.key} disabled={a.key === asiPrimary || (character[a.key] || 10) >= 20}>
                            {a.label} ({(character[a.key] || 10)}{(character[a.key] || 10) >= 20 ? " — MAX" : ""})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: "0.7rem", color: "var(--color-muted)", fontWeight: 600 }}>Feat (optional)</label>
                  <input
                    type="text"
                    value={featName}
                    onChange={(e) => setFeatName(e.target.value)}
                    placeholder="e.g. Sharpshooter, War Caster..."
                    style={{
                      width: "100%", padding: "0.4rem", marginTop: "0.15rem", boxSizing: "border-box",
                      background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "4px", color: "var(--color-text)", outline: "none", fontSize: "0.8rem",
                    }}
                    className="form-input"
                  />
                </div>
              </>
            ) : (
              <p style={{ color: "var(--color-text)", fontSize: "0.85rem", margin: 0 }}>
                No Ability Score Improvement at level {newLevel}. ASIs are available at levels 4, 8, 12, 16, and 19.
              </p>
            )}
          </div>
        )}

        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <p style={{ color: "var(--color-text)", fontSize: "0.85rem", margin: 0, fontWeight: 600 }}>
              Review your changes:
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
              {getReviewItems().map((item, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.4rem 0.6rem", borderRadius: "4px",
                  background: "rgba(255,255,255,0.03)",
                }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--color-muted)" }}>{item.label}</span>
                  <span style={{ fontSize: "0.8rem", color: "var(--color-text)", fontWeight: 600 }}>{item.value}</span>
                </div>
              ))}
            </div>
            {error && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", margin: 0 }}>{error}</p>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between", marginTop: "1rem" }}>
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            style={{
              padding: "0.5rem 1rem", fontSize: "0.8rem", borderRadius: "6px",
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              color: "var(--color-text)", cursor: "pointer",
            }}
            className="touch-target"
          >
            {step === 0 ? "Cancel" : "Back"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              style={{
                padding: "0.5rem 1rem", fontSize: "0.8rem", borderRadius: "6px",
                background: "var(--color-accent)", color: "var(--color-bg)", border: "none",
                fontWeight: 700, cursor: "pointer",
              }}
              className="touch-target btn-hover-scale"
            >
              Next
            </button>
          ) : (
            <button
              onClick={handleApply}
              disabled={loading}
              style={{
                padding: "0.5rem 1rem", fontSize: "0.8rem", borderRadius: "6px",
                background: "var(--color-accent)", color: "var(--color-bg)", border: "none",
                fontWeight: 700, cursor: "pointer", opacity: loading ? 0.5 : 1,
              }}
              className="touch-target btn-hover-scale"
            >
              {loading ? "Applying..." : "Apply Level Up"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
