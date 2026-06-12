// =============================================================================
// Tablecast — Character Builder Wizard (Section 4.2)
// 7-step guided character creation: Name/Race → Class → Ability Scores →
// Skills → Equipment → Spells (caster only) → Review & Create
// =============================================================================
import { useState, useEffect, useRef } from "react";
import {
  UserRound, Shield,
  ChevronLeft, ChevronRight, Check, Sparkles, RefreshCw,
} from "lucide-react";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { getMod, formatMod, getProficiencyBonus, SKILL_DEFINITIONS } from "./character/characterUtils";

// =============================================================================
// Constants
// =============================================================================
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];
const POINT_BUY_COSTS = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUY_MAX = 27;
const ABILITY_KEYS = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const ABILITY_LABELS = { strength: "STR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "WIS", charisma: "CHA" };
const ABILITY_FULL = { strength: "Strength", dexterity: "Dexterity", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Wisdom", charisma: "Charisma" };
// eslint-disable-next-line unused-imports/no-unused-vars
const MAX_SPELL_SEARCH = 50;
const STEP_LABELS = ["Name & Race", "Class", "Ability Scores", "Skills", "Equipment", "Spells", "Review"];

// Class levels that grant ASI
// eslint-disable-next-line unused-imports/no-unused-vars
const FULL_CASTER_LEVELS = { 1: { cantrips: 3, slots: { 1: 2 } } };
const KNOWN_CASTER_CANTRIPS = { bard: 2, sorcerer: 4, warlock: 2, ranger: 0, artificer: 0 };
const KNOWN_CASTER_SPELLS = {
  bard: 4, sorcerer: 2, warlock: 2, ranger: 0, artificer: 2,
  paladin: 0, eldritch_knight: 0, arcane_trickster: 0,
};

// =============================================================================
// Helper Functions
// =============================================================================

/** Compute point buy total spent */
function getPointBuyTotal(scores) {
  return ABILITY_KEYS.reduce((sum, k) => sum + (POINT_BUY_COSTS[scores[k]] || 0), 0);
}

/** Roll 4d6 drop lowest */
function rollAbility() {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return rolls[0] + rolls[1] + rolls[2];
}

/** Extract racial ability bonuses from a race object */
function parseRacialBonuses(race) {
  const bonuses = { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  const ability = race?.ability || [];
  for (const entry of ability) {
    for (const [key, val] of Object.entries(entry)) {
      if (key === "choose") continue;
      if (bonuses[key] !== undefined) bonuses[key] += val;
    }
  }
  return bonuses;
}

/** Parse class starting skill choices */
function parseSkillChoices(classData) {
  const profs = classData?.startingProficiencies || {};
  const skills = profs.skills || [];
  const choices = [];
  for (const entry of skills) {
    if (entry.choose && Array.isArray(entry.from)) {
      choices.push({ choose: entry.choose, from: entry.from });
    }
  }
  return choices;
}

/** Get starting HP for level 1 (max hit die + CON mod) */
function getStartingHp(hitDieFaces, conScore) {
  return hitDieFaces + Math.floor((conScore - 10) / 2);
}

/** Determine if a class has spellcasting at level 1 */
function hasSpellcasting(classData) {
  if (!classData?.classFeatures) return false;
  return classData.classFeatures.some((f) => {
    if (f.level !== 1) return false;
    const name = (f.name || "").toLowerCase();
    return name.includes("spellcasting") || name.includes("spellcasting");
  });
}

/** Get the class's spellcasting ability */
function getSpellcastingAbility(classData) {
  if (!classData) return "intelligence";
  const name = (classData.name || "").toLowerCase();
  const abilityMap = {
    wizard: "intelligence",
    artificer: "intelligence",
    cleric: "wisdom",
    druid: "wisdom",
    ranger: "wisdom",
    paladin: "charisma",
    sorcerer: "charisma",
    warlock: "charisma",
    bard: "charisma",
  };
  return abilityMap[name] || "intelligence";
}

/** Parse class features for level 1 */
function getLevel1Features(classData) {
  if (!classData?.classFeatures) return [];
  return classData.classFeatures.filter((f) => f.level === 1);
}

/** Parse class entries into displayable text */
function parseEntries(entries) {
  if (!entries) return [];
  if (typeof entries === "string") return [{ text: entries }];
  if (!Array.isArray(entries)) return [];
  const result = [];
  for (const entry of entries) {
    if (typeof entry === "string") {
      result.push({ text: entry });
    } else if (entry?.type === "list" && Array.isArray(entry.items)) {
      result.push({ text: entry.items.map((i) => typeof i === "string" ? `• ${i}` : i?.name || "").filter(Boolean).join("\n") });
    } else if (entry?.name) {
      result.push({ text: entry.name, subtext: entry.entries ? parseEntries(entry.entries).map((e) => e.text).join("\n") : "" });
    }
  }
  return result;
}

// =============================================================================
// Step 1: Name & Race Selector
// =============================================================================
function StepNameRace({ form, setForm, onError }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [raceResults, setRaceResults] = useState([]);
  const [raceSearching, setRaceSearching] = useState(false);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [raceTraits, setRaceTraits] = useState(null);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [loadingDetail, setLoadingDetail] = useState(false);
  const searchTimer = useRef(null);

  // Search races via 5etools
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setRaceResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setRaceSearching(true);
      try {
        const res = await fetch(`/api/reference/search?category=races&q=${encodeURIComponent(searchQuery)}&limit=10&summary=false`);
        if (res.ok) {
          const data = await res.json();
          setRaceResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("[Builder] Race search error:", err);
      } finally {
        setRaceSearching(false);
      }
    }, 300);
  }, [searchQuery]);

  // Fetch full race details when selected
  async function handleSelectRace(raceItem) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/reference/detail?category=races&name=${encodeURIComponent(raceItem.name)}&source=${raceItem.source || ""}`);
      if (res.ok) {
        const full = await res.json();
        setForm((prev) => ({ ...prev, race: full, subrace: null }));
        setRaceTraits(full);
      } else {
        // Fallback to search result
        setForm((prev) => ({ ...prev, race: raceItem, subrace: null }));
        setRaceTraits(raceItem);
      }
    } catch (err) {
      onError?.("Failed to load race details");
      setForm((prev) => ({ ...prev, race: raceItem, subrace: null }));
      setRaceTraits(raceItem);
    } finally {
      setLoadingDetail(false);
      setSearchQuery(raceItem.name);
      setRaceResults([]);
    }
  }

  function handleSelectSubrace(subrace) {
    setForm((prev) => ({ ...prev, subrace }));
  }

  function clearRace() {
    setForm((prev) => ({ ...prev, race: null, subrace: null }));
    setRaceTraits(null);
    setSearchQuery("");
    setRaceResults([]);
  }

  const {race} = form;
  const subraces = race?.subrace || [];

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 1: Choose a Name & Race</h3>

      <div style={stepStyles.inputGroup}>
        <label style={stepStyles.label}>Character Name</label>
        <input
          type="text"
          placeholder="e.g. Thorin Ironforge"
          value={form.name}
          onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          style={stepStyles.input}
          className="form-input"
          maxLength={32}
          autoFocus
        />
      </div>

      <div style={stepStyles.inputGroup}>
        <label style={stepStyles.label}>Race</label>
        {!race ? (
          <>
            <input
              type="text"
              placeholder="Search races (e.g. Dwarf, Elf, Human)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={stepStyles.input}
              className="form-input"
            />
            {raceSearching && <span style={stepStyles.hint}>Searching...</span>}
            {raceResults.length > 0 && (
              <ul style={stepStyles.dropdown} className="glass-panel gold-border-glow">
                {raceResults.map((r, i) => (
                  <li key={r.name + (r.source || "") + i} style={stepStyles.dropdownItem}>
                    <button
                      type="button"
                      onClick={() => handleSelectRace(r)}
                      style={stepStyles.dropdownBtn}
                      className="touch-target"
                    >
                      <span style={stepStyles.itemName}>{r.name}</span>
                      {r.source && <span style={stepStyles.sourceTag}>{r.source}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div style={stepStyles.selectedCard} className="glass-panel">
            <div style={stepStyles.selectedHeader}>
              <strong style={stepStyles.selectedName}>{race.name}</strong>
              {race.source && <span style={stepStyles.sourceTag}>{race.source}</span>}
              <button type="button" onClick={clearRace} style={stepStyles.clearBtn} className="touch-target">✕</button>
            </div>
            {race.size && <div style={stepStyles.statRow}><span>Size:</span> <span>{Array.isArray(race.size) ? race.size.join(", ") : race.size}</span></div>}
            {race.speed && <div style={stepStyles.statRow}><span>Speed:</span> <span>{typeof race.speed === "object" ? race.speed.walk || 30 : race.speed} ft.</span></div>}
            {race.ability && race.ability.length > 0 && (
              <div style={stepStyles.statRow}>
                <span>Ability Bonuses:</span>
                <span style={stepStyles.abilityBonuses}>
                  {Object.entries(parseRacialBonuses(race)).filter(([, v]) => v !== 0).map(([k, v]) => (
                    <span key={k} style={stepStyles.abilityBadge}>{ABILITY_LABELS[k]}: +{v}</span>
                  ))}
                </span>
              </div>
            )}

            {/* Subrace selection */}
            {subraces.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <label style={{ ...stepStyles.label, marginBottom: "0.35rem", display: "block" }}>Subrace</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                  {subraces.map((sr) => (
                    <button
                      key={sr.name}
                      type="button"
                      onClick={() => handleSelectSubrace(sr)}
                      style={{
                        ...stepStyles.optionBtn,
                        background: form.subrace?.name === sr.name ? "var(--color-accent-dim)" : "rgba(255,255,255,0.05)",
                        borderColor: form.subrace?.name === sr.name ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
                      }}
                      className="touch-target"
                    >
                      {sr.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Traits */}
            {race.entries && race.entries.length > 0 && (
              <div style={{ marginTop: "0.75rem" }}>
                <label style={{ ...stepStyles.label, marginBottom: "0.35rem", display: "block" }}>Racial Traits</label>
                <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                  {race.entries.map((entry, i) => {
                    if (typeof entry === "string") return <p key={i} style={{ color: "var(--color-text)", opacity: 0.85 }}>{entry}</p>;
                    if (entry.type === "list" && Array.isArray(entry.items)) {
                      return (
                        <div key={i}>
                          <strong style={stepStyles.traitName}>{entry.name || "Features"}</strong>
                          <ul style={{ margin: "0.25rem 0 0 1rem", padding: 0, listStyle: "disc" }}>
                            {entry.items.map((item, j) => (
                              <li key={j} style={{ color: "var(--color-text)", opacity: 0.8, fontSize: "0.8rem" }}>
                                {typeof item === "string" ? item : item.name || ""}
                                {item.entries && parseEntries(item.entries).map((p, k) => <p key={k} style={{ margin: 0 }}>{p.text}</p>)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    }
                    if (entry.name) {
                      return <p key={i}><strong style={stepStyles.traitName}>{entry.name}:</strong> <span style={{ color: "var(--color-text)", opacity: 0.85 }}>{typeof entry.entry === "string" ? entry.entry : entry.entries ? entry.entries.join(" ") : ""}</span></p>;
                    }
                    return null;
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Step 2: Class Selector
// =============================================================================
function StepClass({ form, setForm, onError }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [classResults, setClassResults] = useState([]);
  const [classSearching, setClassSearching] = useState(false);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [loadingDetail, setLoadingDetail] = useState(false);
  const searchTimer = useRef(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setClassResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setClassSearching(true);
      try {
        const res = await fetch(`/api/reference/search?category=classes&q=${encodeURIComponent(searchQuery)}&limit=10&summary=false`);
        if (res.ok) {
          const data = await res.json();
          setClassResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("[Builder] Class search error:", err);
      } finally {
        setClassSearching(false);
      }
    }, 300);
  }, [searchQuery]);

  async function handleSelectClass(classItem) {
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/reference/detail?category=classes&name=${encodeURIComponent(classItem.name)}&source=${classItem.source || ""}`);
      if (res.ok) {
        const full = await res.json();
        setForm((prev) => ({ ...prev, classData: full }));
      } else {
        setForm((prev) => ({ ...prev, classData: classItem }));
      }
    } catch (err) {
      onError?.("Failed to load class details");
      setForm((prev) => ({ ...prev, classData: classItem }));
    } finally {
      setLoadingDetail(false);
      setSearchQuery(classItem.name);
      setClassResults([]);
    }
  }

  function clearClass() {
    setForm((prev) => ({ ...prev, classData: null }));
    setSearchQuery("");
    setClassResults([]);
  }

  const cls = form.classData;
  const hitDie = cls?.hd?.faces || 10;
  const features = cls ? getLevel1Features(cls) : [];
  const skillChoices = cls ? parseSkillChoices(cls) : [];
  const proficiencies = cls?.startingProficiencies || {};
  const isCaster = cls ? hasSpellcasting(cls) : false;
  const spellAbility = cls ? getSpellcastingAbility(cls) : "intelligence";

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 2: Choose a Class</h3>

      {!cls ? (
        <>
          <input
            type="text"
            placeholder="Search class (e.g. Fighter, Wizard, Rogue)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={stepStyles.input}
            className="form-input"
            autoFocus
          />
          {classSearching && <span style={stepStyles.hint}>Searching...</span>}
          {classResults.length > 0 && (
            <ul style={stepStyles.dropdown} className="glass-panel gold-border-glow">
              {classResults.map((c, i) => (
                <li key={c.name + (c.source || "") + i} style={stepStyles.dropdownItem}>
                  <button type="button" onClick={() => handleSelectClass(c)} style={stepStyles.dropdownBtn} className="touch-target">
                    <span style={stepStyles.itemName}>{c.name}</span>
                    {c.source && <span style={stepStyles.sourceTag}>{c.source}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <div style={stepStyles.selectedCard} className="glass-panel">
          <div style={stepStyles.selectedHeader}>
            <strong style={stepStyles.selectedName}>{cls.name}</strong>
            {cls.source && <span style={stepStyles.sourceTag}>{cls.source}</span>}
            <button type="button" onClick={clearClass} style={stepStyles.clearBtn} className="touch-target">✕</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem", marginTop: "0.5rem", fontSize: "0.8rem" }}>
            <div style={stepStyles.statRow}><span>Hit Die:</span> <strong>d{hitDie}</strong></div>
            {isCaster && <div style={stepStyles.statRow}><span>Spellcasting:</span> <strong>{ABILITY_FULL[spellAbility]}</strong></div>}
          </div>

          {/* Proficiencies */}
          <div style={{ marginTop: "0.75rem" }}>
            <label style={{ ...stepStyles.label, marginBottom: "0.35rem", display: "block" }}>Proficiencies</label>
            <div style={{ fontSize: "0.8rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {proficiencies.armor && Array.isArray(proficiencies.armor) && (
                <div><span style={{ color: "var(--color-muted)" }}>Armor: </span>{proficiencies.armor.join(", ")}</div>
              )}
              {proficiencies.weapons && Array.isArray(proficiencies.weapons) && (
                <div><span style={{ color: "var(--color-muted)" }}>Weapons: </span>{proficiencies.weapons.join(", ")}</div>
              )}
              {proficiencies.tools && Array.isArray(proficiencies.tools) && proficiencies.tools.length > 0 && (
                <div><span style={{ color: "var(--color-muted)" }}>Tools: </span>{proficiencies.tools.join(", ")}</div>
              )}
              {proficiencies.savingThrows && Array.isArray(proficiencies.savingThrows) && (
                <div><span style={{ color: "var(--color-muted)" }}>Saving Throws: </span>{proficiencies.savingThrows.map((s) => ABILITY_FULL[s] || s).join(", ")}</div>
              )}
              {skillChoices.length > 0 && (
                <div><span style={{ color: "var(--color-muted)" }}>Skill Choices: </span>Choose {skillChoices[0]?.choose || 2} from {skillChoices[0]?.from?.join(", ") || "various"}</div>
              )}
            </div>
          </div>

          {/* Level 1 Features */}
          {features.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <label style={{ ...stepStyles.label, marginBottom: "0.35rem", display: "block" }}>Level 1 Features</label>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {features.map((f, i) => (
                  <div key={i} style={stepStyles.featureCard} className="glass-panel">
                    <strong style={{ color: "var(--color-accent)", fontSize: "0.8rem" }}>{f.name}</strong>
                    {f.entries && Array.isArray(f.entries) && f.entries.map((e, j) => {
                      if (typeof e === "string") return <p key={j} style={{ fontSize: "0.75rem", color: "var(--color-text)", opacity: 0.85, margin: "0.2rem 0" }}>{e}</p>;
                      if (e.name) return <p key={j} style={{ fontSize: "0.75rem", color: "var(--color-text)", opacity: 0.85, margin: "0.2rem 0" }}><strong>{e.name}:</strong> {typeof e.entry === "string" ? e.entry : ""}</p>;
                      return null;
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Step 3: Ability Scores
// =============================================================================
function StepAbilityScores({ form, setForm }) {
  const [method, setMethod] = useState(form.abilityMethod || "standard");
  const [scores, setScores] = useState(form.abilityScores || { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 });
  const [remainingPoints, setRemainingPoints] = useState(POINT_BUY_MAX);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [rolledDraft, setRolledDraft] = useState(form.rolledDraft || null);
  const racialBonuses = form.race ? parseRacialBonuses(form.race) : { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  // Also include subrace bonuses
  const subraceBonuses = form.subrace ? parseRacialBonuses(form.subrace) : { strength: 0, dexterity: 0, constitution: 0, intelligence: 0, wisdom: 0, charisma: 0 };
  for (const k of ABILITY_KEYS) {
    racialBonuses[k] += subraceBonuses[k];
  }

  // Sync to form
  useEffect(() => {
    setForm((prev) => ({ ...prev, abilityMethod: method, abilityScores: scores }));
  }, [method, scores, setForm]);

  // Update point buy
  useEffect(() => {
    if (method === "pointbuy") {
      setRemainingPoints(POINT_BUY_MAX - getPointBuyTotal(scores));
    }
  }, [method, scores]);

  function handleScoreChange(key, delta) {
    setScores((prev) => {
      const current = prev[key];
      const newVal = current + delta;
      // Clamp 3-20 for rolled, 8-15 for point buy and standard
      if (method === "rolled") {
        if (newVal < 3 || newVal > 20) return prev;
      } else if (newVal < 8 || newVal > 15) return prev;
      if (method === "pointbuy") {
        const cost = POINT_BUY_COSTS[newVal];
        const currentCost = POINT_BUY_COSTS[current];
        if (cost === undefined) return prev;
        const newRemaining = remainingPoints + (currentCost - cost);
        if (newRemaining < 0) return prev;
      }
      return { ...prev, [key]: newVal };
    });
  }

  function applyStandardArray() {
    setScores({ strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 });
    setMethod("standard");
  }

  function applyRolled() {
    const newScores = { strength: rollAbility(), dexterity: rollAbility(), constitution: rollAbility(), intelligence: rollAbility(), wisdom: rollAbility(), charisma: rollAbility() };
    setRolledDraft(newScores);
    setScores(newScores);
    setMethod("rolled");
  }

  function applyPointBuy() {
    applyStandardArray();
    setMethod("pointbuy");
  }

  // Standard array assignment UI
  // eslint-disable-next-line unused-imports/no-unused-vars
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [standardAssignments, setStandardAssignments] = useState(form.standardAssignments || {});
  const [availablePool, setAvailablePool] = useState([...STANDARD_ARRAY]);

  function assignStandard(key) {
    if (method !== "standard") return;
    const pool = [...availablePool];
    if (pool.length === 0) return;
    // Pick highest remaining or let user click
    setScores((prev) => {
      if (prev[key] !== 8) return prev; // already assigned
      const val = pool.shift();
      setAvailablePool(pool);
      return { ...prev, [key]: val };
    });
  }

  function resetStandardAssignment() {
    setAvailablePool([...STANDARD_ARRAY]);
    setScores({ strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 });
  }

  // For standard array - show pool
  if (method === "standard" && availablePool.length > 0 && scores.strength === 8 && scores.dexterity === 8 && scores.constitution === 8 && scores.intelligence === 8 && scores.wisdom === 8 && scores.charisma === 8) {
    // Initial state - nothing assigned yet
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  const totalWithBonuses = ABILITY_KEYS.reduce((acc, k) => ({ ...acc, [k]: scores[k] + racialBonuses[k] }), {});

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 3: Ability Scores</h3>

      {/* Method selector */}
      <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        {[
          { id: "standard", label: "Standard Array", icon: Check },
          { id: "pointbuy", label: "Point Buy", icon: Shield },
          { id: "rolled", label: "Rolled", icon: Sparkles },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              if (m.id === "standard") { applyStandardArray(); }
              else if (m.id === "pointbuy") { applyPointBuy(); }
              else { applyRolled(); }
            }}
            style={{
              ...stepStyles.methodBtn,
              background: method === m.id ? "var(--color-accent-dim)" : "rgba(255,255,255,0.05)",
              borderColor: method === m.id ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
            }}
            className="touch-target"
          >
            <m.icon size={14} />
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* Point buy remaining */}
      {method === "pointbuy" && (
        <div style={stepStyles.hint}>Points remaining: <strong>{remainingPoints}</strong> / {POINT_BUY_MAX}</div>
      )}
      {method === "standard" && availablePool.length > 0 && (
        <div style={stepStyles.hint}>
          Available values: <strong>[{availablePool.join(", ")}]</strong>
          <button type="button" onClick={resetStandardAssignment} style={{ marginLeft: "0.5rem", background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.75rem" }} className="touch-target">Reset</button>
        </div>
      )}
      {method === "rolled" && (
        <div style={stepStyles.hint}>
          <button type="button" onClick={applyRolled} style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: "0.75rem", display: "inline-flex", alignItems: "center", gap: "0.25rem" }} className="touch-target">
            <RefreshCw size={12} /> Re-roll all
          </button>
        </div>
      )}

      {/* Score grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        {ABILITY_KEYS.map((key) => {
          const base = scores[key];
          const racial = racialBonuses[key];
          const total = base + racial;
          const mod = getMod(total);
          return (
            <div key={key} style={stepStyles.scoreCard} className="glass-panel">
              <div style={stepStyles.scoreLabel}>{ABILITY_LABELS[key]}</div>
              <div style={stepStyles.scoreTotal}>{total}</div>
              <div style={stepStyles.scoreMod}>{formatMod(mod)}</div>
              <div style={stepStyles.scoreBase}>
                Base: {base}
                {racial !== 0 && <span style={{ color: "var(--color-accent)" }}> {racial > 0 ? `+${racial}` : racial}</span>}
              </div>
              <div style={{ display: "flex", gap: "0.25rem", justifyContent: "center", marginTop: "0.25rem" }}>
                <button
                  type="button"
                  onClick={() => handleScoreChange(key, -1)}
                  disabled={method === "standard"}
                  style={stepStyles.scoreAdjBtn}
                  className="touch-target"
                >−</button>
                <button
                  type="button"
                  onClick={() => handleScoreChange(key, 1)}
                  disabled={method === "standard"}
                  style={stepStyles.scoreAdjBtn}
                  className="touch-target"
                >+</button>
              </div>
              {method === "standard" && (
                <button
                  type="button"
                  onClick={() => assignStandard(key)}
                  disabled={base !== 8 || availablePool.length === 0}
                  style={{ ...stepStyles.assignBtn, opacity: base !== 8 || availablePool.length === 0 ? 0.4 : 1 }}
                  className="touch-target"
                >Assign Value</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// Step 4: Skills & Proficiencies
// =============================================================================
function StepSkills({ form, setForm }) {
  const cls = form.classData;
  const skillChoices = cls ? parseSkillChoices(cls) : [];
  const numChoices = skillChoices.length > 0 ? skillChoices[0].choose : 2;
  const availableSkills = skillChoices.length > 0 ? skillChoices[0].from : SKILL_DEFINITIONS.map((s) => s.name);
  const [selected, setSelected] = useState(form.selectedSkills || []);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [savingThrows, setSavingThrows] = useState(form.savingThrows || []);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [toolChoices, setToolChoices] = useState(form.toolChoices || []);

  const classSaveProfs = cls?.startingProficiencies?.savingThrows || [];

  useEffect(() => {
    setForm((prev) => ({ ...prev, selectedSkills: selected, savingThrows, toolChoices }));
  }, [selected, savingThrows, toolChoices, setForm]);

  function toggleSkill(skill) {
    setSelected((prev) => {
      if (prev.includes(skill)) return prev.filter((s) => s !== skill);
      if (prev.length >= numChoices) return prev;
      return [...prev, skill];
    });
  }

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 4: Skills & Proficiencies</h3>

      {cls && (
        <>
          {/* Saving Throws (from class) */}
          {classSaveProfs.length > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={stepStyles.label}>Saving Throw Proficiencies</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.25rem" }}>
                {classSaveProfs.map((s) => (
                  <span key={s} style={stepStyles.profBadge}>
                    {ABILITY_FULL[s] || s} ✓
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Skill Choices */}
          {skillChoices.length > 0 && (
            <div>
              <label style={stepStyles.label}>
                Skills (choose {numChoices})
                {selected.length > 0 && <span style={{ color: "var(--color-accent)", marginLeft: "0.35rem" }}>{selected.length}/{numChoices}</span>}
              </label>
              {selected.length > numChoices && (
                <p style={{ color: "var(--color-danger)", fontSize: "0.75rem" }}>Too many skills selected! Remove some.</p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.3rem", marginTop: "0.35rem" }}>
                {SKILL_DEFINITIONS.map((skill) => {
                  const isAvailable = availableSkills.includes(skill.name);
                  const isSelected = selected.includes(skill.name);
                  return (
                    <button
                      key={skill.name}
                      type="button"
                      onClick={() => isAvailable && toggleSkill(skill.name)}
                      disabled={!isAvailable}
                      style={{
                        ...stepStyles.skillBtn,
                        opacity: isAvailable ? 1 : 0.35,
                        background: isSelected ? "var(--color-accent-dim)" : "rgba(255,255,255,0.03)",
                        borderColor: isSelected ? "var(--color-accent)" : "rgba(255,255,255,0.08)",
                      }}
                      className="touch-target"
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        {isSelected && <Check size={12} style={{ color: "var(--color-accent)" }} />}
                        <span>{skill.name}</span>
                      </div>
                      <span style={{ fontSize: "0.65rem", color: "var(--color-muted)" }}>({skill.ability.substring(0, 3).toUpperCase()})</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Armor/Weapon/Tool proficiencies - display only */}
          {cls.startingProficiencies && (
            <div style={{ marginTop: "0.75rem" }}>
              <label style={stepStyles.label}>Automatic Proficiencies</label>
              <div style={{ fontSize: "0.8rem", marginTop: "0.25rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                {cls.startingProficiencies.armor && Array.isArray(cls.startingProficiencies.armor) && (
                  <div><span style={{ color: "var(--color-muted)" }}>Armor:</span> {cls.startingProficiencies.armor.join(", ")}</div>
                )}
                {cls.startingProficiencies.weapons && Array.isArray(cls.startingProficiencies.weapons) && (
                  <div><span style={{ color: "var(--color-muted)" }}>Weapons:</span> {cls.startingProficiencies.weapons.join(", ")}</div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!cls && <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>Select a class in the previous step to see available skills.</p>}
    </div>
  );
}

// =============================================================================
// Step 5: Equipment
// =============================================================================
function StepEquipment({ form, setForm }) {
  const cls = form.classData;
  const [equipment, setEquipment] = useState(form.equipment || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const searchTimer = useRef(null);

  useEffect(() => {
    setForm((prev) => ({ ...prev, equipment }));
  }, [equipment, setForm]);

  // Parse starting equipment from class
  useEffect(() => {
    if (cls?.startingEquipment && equipment.length === 0) {
      const items = [];
      const eq = cls.startingEquipment;
      if (eq.defaultData) {
        for (const d of eq.defaultData) {
          if (d.name && d.name !== "-") {
            items.push({ name: d.name, quantity: d.quantity || 1, fromClass: true });
          }
        }
      }
      if (eq.defaultArtisanTool && eq.defaultArtisanTool !== "--") {
        items.push({ name: eq.defaultArtisanTool, quantity: 1, fromClass: true });
      }
      if (items.length > 0) setEquipment(items);
    }
  }, [cls, equipment.length]);

  // Item search from 5etools
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/reference/search?category=items&q=${encodeURIComponent(searchQuery)}&limit=10&summary=false`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("[Builder] Item search error:", err);
      }
    }, 300);
  }, [searchQuery]);

  function addItem(item) {
    setEquipment((prev) => {
      const existing = prev.find((i) => i.name === item.name);
      if (existing) {
        return prev.map((i) => i.name === item.name ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { name: item.name, quantity: 1, fromClass: false }];
    });
    setSearchQuery("");
    setSearchResults([]);
  }

  function removeItem(idx) {
    setEquipment((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateQuantity(idx, delta) {
    setEquipment((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const newQty = Math.max(1, item.quantity + delta);
      return { ...item, quantity: newQty };
    }));
  }

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 5: Equipment</h3>

      {/* Starting equipment from class */}
      {equipment.filter((i) => i.fromClass).length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <label style={stepStyles.label}>Starting Equipment</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.25rem" }}>
            {equipment.filter((i) => i.fromClass).map((item, idx) => (
              <div key={idx} style={stepStyles.equipRow} className="glass-panel">
                <span style={{ flex: 1, fontSize: "0.85rem" }}>{item.name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginRight: "0.5rem" }}>x{item.quantity}</span>
                <button type="button" onClick={() => updateQuantity(idx, -1)} style={stepStyles.equipBtn} className="touch-target">−</button>
                <button type="button" onClick={() => updateQuantity(idx, 1)} style={stepStyles.equipBtn} className="touch-target">+</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add custom items */}
      <div style={stepStyles.inputGroup}>
        <label style={stepStyles.label}>Add Equipment & Gear</label>
        <input
          type="text"
          placeholder="Search items to add..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={stepStyles.input}
          className="form-input"
        />
        {searchResults.length > 0 && (
          <ul style={stepStyles.dropdown} className="glass-panel gold-border-glow">
            {searchResults.map((item, i) => (
              <li key={item.name + i} style={stepStyles.dropdownItem}>
                <button type="button" onClick={() => addItem(item)} style={stepStyles.dropdownBtn} className="touch-target">
                  <span style={stepStyles.itemName}>{item.name}</span>
                  {item.rarity && <span style={stepStyles.sourceTag}>{item.rarity}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Custom items list */}
      {equipment.filter((i) => !i.fromClass).length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <label style={stepStyles.label}>Additional Gear</label>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", marginTop: "0.25rem" }}>
            {equipment.filter((i) => !i.fromClass).map((item, idx) => (
              <div key={idx} style={stepStyles.equipRow} className="glass-panel">
                <span style={{ flex: 1, fontSize: "0.85rem" }}>{item.name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginRight: "0.5rem" }}>x{item.quantity}</span>
                <button type="button" onClick={() => removeItem(idx)} style={{ ...stepStyles.equipBtn, color: "var(--color-danger)" }} className="touch-target">✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Step 6: Spells (caster only)
// =============================================================================
// eslint-disable-next-line unused-imports/no-unused-vars
function StepSpells({ form, setForm, onError }) {
  const cls = form.classData;
  const isCaster = cls ? hasSpellcasting(cls) : false;
  const [cantrips, setCantrips] = useState(form.cantrips || []);
  const [spells, setSpells] = useState(form.spells || []);
  const [searchCantrip, setSearchCantrip] = useState("");
  const [searchSpell, setSearchSpell] = useState("");
  const [cantripResults, setCantripResults] = useState([]);
  const [spellResults, setSpellResults] = useState([]);
  const [tab, setTab] = useState("cantrips");
  const searchTimer = useRef(null);

  const spellAbility = cls ? getSpellcastingAbility(cls) : "intelligence";
  const spellMod = form.abilityScores ? getMod(form.abilityScores[spellAbility] + (parseRacialBonuses(form.race || {})[spellAbility] || 0)) : 0;
  const saveDc = 8 + getProficiencyBonus(1) + spellMod;
  const attackBonus = getProficiencyBonus(1) + spellMod;

  // Cantrips known at level 1
  const knownCantrips = cls ? (KNOWN_CASTER_CANTRIPS[(cls.name || "").toLowerCase()] || 0) : 0;
  // Spells known/prepared at level 1
  const knownSpells = cls ? (KNOWN_CASTER_SPELLS[(cls.name || "").toLowerCase()] || 0) : 0;

  // Actually for prepared casters (cleric, druid, paladin, wizard), they prepare from all class spells
  const isPreparedCaster = cls ? ["cleric", "druid", "paladin", "wizard"].includes((cls.name || "").toLowerCase()) : false;

  useEffect(() => {
    setForm((prev) => ({ ...prev, cantrips, spells }));
  }, [cantrips, spells, setForm]);

  // Search spells from 5etools
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const query = tab === "cantrips" ? searchCantrip : searchSpell;
    if (!query.trim() || query.length < 2) {
      if (tab === "cantrips") setCantripResults([]);
      else setSpellResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const isCantripSearch = tab === "cantrips";
        // For cantrips, filter by level=0
        const res = await fetch(`/api/reference/search?category=spells&q=${encodeURIComponent(query)}&limit=20&summary=false`);
        if (res.ok) {
          const data = await res.json();
          const filtered = Array.isArray(data) ? data.filter((s) => isCantripSearch ? s.level === 0 : s.level === 1) : [];
          if (tab === "cantrips") setCantripResults(filtered);
          else setSpellResults(filtered);
        }
      } catch (err) {
        console.error("[Builder] Spell search error:", err);
      }
    }, 300);
  }, [searchCantrip, searchSpell, tab]);

  function toggleCantrip(spell) {
    setCantrips((prev) => {
      if (prev.find((s) => s.name === spell.name)) return prev.filter((s) => s.name !== spell.name);
      if (prev.length >= knownCantrips) return prev;
      return [...prev, spell];
    });
  }

  function toggleSpell(spell) {
    setSpells((prev) => {
      if (prev.find((s) => s.name === spell.name)) return prev.filter((s) => s.name !== spell.name);
      if (!isPreparedCaster && prev.length >= knownSpells) return prev;
      return [...prev, spell];
    });
  }

  if (!cls || !isCaster) {
    return (
      <div style={stepStyles.stepContainer}>
        <h3 style={stepStyles.stepTitle}>Step 6: Spells</h3>
        <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>
          {cls ? `${cls.name} does not have the Spellcasting feature at level 1.` : "Select a class in Step 2 to configure spells."}
        </p>
      </div>
    );
  }

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 6: Spells</h3>

      <div style={stepStyles.selectedCard} className="glass-panel">
        <div style={{ fontSize: "0.8rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <span><strong>Spellcasting Ability:</strong> {ABILITY_FULL[spellAbility]}</span>
          <span><strong>Spell Save DC:</strong> {saveDc}</span>
          <span><strong>Spell Attack Bonus:</strong> +{attackBonus}</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0.35rem", margin: "0.75rem 0" }}>
        <button
          type="button"
          onClick={() => setTab("cantrips")}
          style={{
            ...stepStyles.tabBtn,
            background: tab === "cantrips" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.05)",
            borderColor: tab === "cantrips" ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
          }}
          className="touch-target"
        >
          Cantrips {cantrips.length}/{knownCantrips}
        </button>
        <button
          type="button"
          onClick={() => setTab("spells")}
          style={{
            ...stepStyles.tabBtn,
            background: tab === "spells" ? "var(--color-accent-dim)" : "rgba(255,255,255,0.05)",
            borderColor: tab === "spells" ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
          }}
          className="touch-target"
        >
          Level 1 Spells {spells.length}/{isPreparedCaster ? "∞" : knownSpells}
        </button>
      </div>

      {/* Search */}
      {tab === "cantrips" ? (
        <>
          <input
            type="text"
            placeholder="Search cantrips..."
            value={searchCantrip}
            onChange={(e) => setSearchCantrip(e.target.value)}
            style={stepStyles.input}
            className="form-input"
          />
          {cantripResults.length > 0 && (
            <ul style={stepStyles.dropdown} className="glass-panel gold-border-glow">
              {cantripResults.map((s, i) => {
                const isSelected = cantrips.find((c) => c.name === s.name);
                return (
                  <li key={s.name + i} style={stepStyles.dropdownItem}>
                    <button
                      type="button"
                      onClick={() => toggleCantrip(s)}
                      style={{
                        ...stepStyles.dropdownBtn,
                        background: isSelected ? "var(--color-accent-dim)" : "transparent",
                      }}
                      className="touch-target"
                    >
                      <span style={{ ...stepStyles.itemName, flex: 1 }}>
                        {isSelected && <Check size={12} style={{ marginRight: "0.35rem" }} />}
                        {s.name}
                      </span>
                      <span style={stepStyles.sourceTag}>Cantrip</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Selected cantrips */}
          {cantrips.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={stepStyles.label}>Selected Cantrips</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.25rem" }}>
                {cantrips.map((c, i) => (
                  <span key={i} style={stepStyles.spellChip}>
                    {c.name}
                    <button type="button" onClick={() => toggleCantrip(c)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: "0.7rem", marginLeft: "0.25rem" }}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <input
            type="text"
            placeholder="Search level 1 spells..."
            value={searchSpell}
            onChange={(e) => setSearchSpell(e.target.value)}
            style={stepStyles.input}
            className="form-input"
          />
          {spellResults.length > 0 && (
            <ul style={stepStyles.dropdown} className="glass-panel gold-border-glow">
              {spellResults.map((s, i) => {
                const isSelected = spells.find((sp) => sp.name === s.name);
                return (
                  <li key={s.name + i} style={stepStyles.dropdownItem}>
                    <button
                      type="button"
                      onClick={() => toggleSpell(s)}
                      style={{
                        ...stepStyles.dropdownBtn,
                        background: isSelected ? "var(--color-accent-dim)" : "transparent",
                      }}
                      className="touch-target"
                    >
                      <span style={{ ...stepStyles.itemName, flex: 1 }}>
                        {isSelected && <Check size={12} style={{ marginRight: "0.35rem" }} />}
                        {s.name}
                      </span>
                      <span style={stepStyles.sourceTag}>Level 1</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {spells.length > 0 && (
            <div style={{ marginTop: "0.5rem" }}>
              <label style={stepStyles.label}>Selected Spells</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.25rem" }}>
                {spells.map((s, i) => (
                  <span key={i} style={stepStyles.spellChip}>
                    {s.name}
                    <button type="button" onClick={() => toggleSpell(s)} style={{ background: "none", border: "none", color: "var(--color-danger)", cursor: "pointer", fontSize: "0.7rem", marginLeft: "0.25rem" }}>✕</button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// =============================================================================
// Step 7: Review & Create
// =============================================================================
// eslint-disable-next-line unused-imports/no-unused-vars
function StepReview({ form, onError }) {
  const racialBonuses = form.race ? parseRacialBonuses(form.race) : {};
  const subraceBonuses = form.subrace ? parseRacialBonuses(form.subrace) : {};
  for (const k of ABILITY_KEYS) {
    racialBonuses[k] += subraceBonuses[k];
  }
  const totalScores = {};
  for (const k of ABILITY_KEYS) {
    totalScores[k] = (form.abilityScores?.[k] || 8) + (racialBonuses[k] || 0);
  }
  const hitDie = form.classData?.hd?.faces || 10;
  const hp = getStartingHp(hitDie, totalScores.constitution);
  const profBonus = getProficiencyBonus(1);
  const isCaster = form.classData ? hasSpellcasting(form.classData) : false;
  const spellAbility = isCaster && form.classData ? getSpellcastingAbility(form.classData) : null;
  const spellMod = spellAbility ? getMod(totalScores[spellAbility]) : 0;
  const saveDc = spellAbility ? 8 + profBonus + spellMod : 0;
  const spellAtk = spellAbility ? profBonus + spellMod : 0;

  return (
    <div style={stepStyles.stepContainer}>
      <h3 style={stepStyles.stepTitle}>Step 7: Review Your Hero</h3>

      <div style={stepStyles.reviewCard} className="glass-panel">
        {/* Identity */}
        <div style={stepStyles.reviewSection}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <UserRound size={20} style={{ color: "var(--color-accent)" }} />
            <div>
              <strong style={{ fontSize: "1.1rem" }}>{form.name}</strong>
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                Level 1 {form.race?.name || "?"} {form.classData?.name || "?"}
                {form.subrace?.name ? ` (${form.subrace.name})` : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Hit Points */}
        <div style={stepStyles.reviewSection}>
          <strong style={stepStyles.reviewLabel}>Hit Points</strong>
          <span>HP: {hp} (d{hitDie} + {formatMod(getMod(totalScores.constitution))} CON)</span>
        </div>

        {/* Ability Scores */}
        <div style={stepStyles.reviewSection}>
          <strong style={stepStyles.reviewLabel}>Ability Scores</strong>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.25rem", marginTop: "0.25rem" }}>
            {ABILITY_KEYS.map((k) => (
              <div key={k} style={{ textAlign: "center", padding: "0.25rem", background: "rgba(255,255,255,0.03)", borderRadius: "4px" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--color-muted)", textTransform: "uppercase" }}>{k.substring(0, 3)}</div>
                <div style={{ fontSize: "1rem", fontWeight: 700 }}>{totalScores[k]}</div>
                <div style={{ fontSize: "0.7rem", color: "var(--color-accent)" }}>{formatMod(getMod(totalScores[k]))}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Skills */}
        {form.selectedSkills && form.selectedSkills.length > 0 && (
          <div style={stepStyles.reviewSection}>
            <strong style={stepStyles.reviewLabel}>Skill Proficiencies</strong>
            <div style={{ fontSize: "0.8rem", display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.2rem" }}>
              {form.selectedSkills.map((s) => (
                <span key={s} style={stepStyles.profBadge}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Saving Throws */}
        {form.classData?.startingProficiencies?.savingThrows?.length > 0 && (
          <div style={stepStyles.reviewSection}>
            <strong style={stepStyles.reviewLabel}>Saving Throw Proficiencies</strong>
            <div style={{ fontSize: "0.8rem", display: "flex", gap: "0.25rem", marginTop: "0.2rem" }}>
              {form.classData.startingProficiencies.savingThrows.map((s) => (
                <span key={s} style={stepStyles.profBadge}>{ABILITY_FULL[s] || s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Spells */}
        {isCaster && (
          <div style={stepStyles.reviewSection}>
            <strong style={stepStyles.reviewLabel}>Spellcasting</strong>
            <div style={{ fontSize: "0.8rem" }}>
              <span>Ability: {ABILITY_FULL[spellAbility]} | </span>
              <span>Save DC: {saveDc} | </span>
              <span>Atk Bonus: +{spellAtk}</span>
            </div>
            {form.cantrips?.length > 0 && (
              <div style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                <span style={{ color: "var(--color-muted)" }}>Cantrips: </span>
                {form.cantrips.map((c) => c.name).join(", ")}
              </div>
            )}
            {form.spells?.length > 0 && (
              <div style={{ fontSize: "0.75rem", marginTop: "0.15rem" }}>
                <span style={{ color: "var(--color-muted)" }}>Spells: </span>
                {form.spells.map((s) => s.name).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Equipment */}
        {form.equipment?.length > 0 && (
          <div style={stepStyles.reviewSection}>
            <strong style={stepStyles.reviewLabel}>Equipment</strong>
            <div style={{ fontSize: "0.75rem", display: "flex", flexDirection: "column", gap: "0.1rem", marginTop: "0.2rem" }}>
              {form.equipment.map((item, i) => (
                <span key={i}>{item.name} (x{item.quantity})</span>
              ))}
            </div>
          </div>
        )}

        {/* HP formula summary */}
        <div style={stepStyles.reviewSection}>
          <strong style={stepStyles.reviewLabel}>Combat Summary</strong>
          <div style={{ fontSize: "0.8rem" }}>
            <span>AC: 10 | </span>
            <span>Initiative: {formatMod(getMod(totalScores.dexterity))} | </span>
            <span>Prof. Bonus: +{profBonus}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Main Character Builder Wizard Component
// =============================================================================
export default function CharacterBuilderWizard({ user, onComplete, onCancel, onError }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: "",
    race: null,
    subrace: null,
    classData: null,
    abilityMethod: "standard",
    abilityScores: { strength: 8, dexterity: 8, constitution: 8, intelligence: 8, wisdom: 8, charisma: 8 },
    standardAssignments: {},
    selectedSkills: [],
    savingThrows: [],
    toolChoices: [],
    equipment: [],
    cantrips: [],
    spells: [],
  });

  // eslint-disable-next-line unused-imports/no-unused-vars
  const totalSteps = STEP_LABELS.length;
  const isCaster = form.classData ? hasSpellcasting(form.classData) : false;

  // Calculate which steps to show (skip spells if non-caster)
  const visibleSteps = isCaster ? STEP_LABELS : STEP_LABELS.filter((_, i) => i !== 5);
  const maxStep = visibleSteps.length - 1;

  // eslint-disable-next-line unused-imports/no-unused-vars
  function getStepIndex(stepIdx) {
    // Map visible step index back to actual component
    if (!isCaster && stepIdx >= 5) return stepIdx + 1; // skip spells
    return stepIdx;
  }

  function canProceed() {
    switch (step) {
      case 0: return form.name.trim().length > 0 && form.race !== null;
      case 1: return form.classData !== null;
      case 2: return form.abilityScores !== null;
      case 3: return true; // skills are optional
      case 4: return true; // equipment is optional
      case 5: return true; // spells are optional
      case 6: return true; // review
      default: return false;
    }
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);

    try {
      // Calculate full ability scores with racial bonuses
      const racialBonuses = form.race ? parseRacialBonuses(form.race) : {};
      const subraceBonuses = form.subrace ? parseRacialBonuses(form.subrace) : {};
      for (const k of ABILITY_KEYS) {
        racialBonuses[k] += subraceBonuses[k];
      }
      const totalScores = {};
      for (const k of ABILITY_KEYS) {
        totalScores[k] = (form.abilityScores?.[k] || 8) + (racialBonuses[k] || 0);
      }

      const hitDie = form.classData?.hd?.faces || 10;
      const hp = getStartingHp(hitDie, totalScores.constitution);
      const profBonus = getProficiencyBonus(1);

      // Build proficiencies list
      const autoProfs = [];
      if (form.classData?.startingProficiencies) {
        const p = form.classData.startingProficiencies;
        if (p.armor) autoProfs.push(...p.armor.map((a) => `Armor: ${a}`));
        if (p.weapons) autoProfs.push(...p.weapons.map((w) => `Weapon: ${w}`));
        if (p.tools) autoProfs.push(...p.tools.map((t) => `Tool: ${t}`));
        if (p.savingThrows) autoProfs.push(...p.savingThrows.map((s) => `Save: ${s}`));
      }

      const modifiers = {
        proficiencies: [...autoProfs, ...form.selectedSkills.map((s) => `Skill: ${s}`)],
        saveProficiencies: form.classData?.startingProficiencies?.savingThrows || [],
        attacks: [],
      };

      // Build equipment list
      const inventoryItems = form.equipment.map((item) => ({
        name: item.name,
        quantity: item.quantity || 1,
      }));

      // Build spells data
      const spellData = {
        cantrips: form.cantrips?.map((c) => ({ name: c.name, level: 0 })) || [],
        spells: form.spells?.map((s) => ({ name: s.name, level: 1 })) || [],
      };

      // Spellcasting fields
      const isCasterChar = form.classData ? hasSpellcasting(form.classData) : false;
      const spellAbility = isCasterChar ? getSpellcastingAbility(form.classData) : "";
      const spellMod = isCasterChar ? getMod(totalScores[spellAbility]) : 0;
      const spellSaveDc = isCasterChar ? 8 + profBonus + spellMod : 10;
      const spellAttackBonus = isCasterChar ? profBonus + spellMod : 5;

      // Build the payload
      const payload = {
        userId: user?.id || null,
        name: form.name.trim(),
        race: form.race?.name || "Unknown",
        class: form.classData?.name || "Commoner",
        level: 1,
        hp,
        maxHp: hp,
        strength: totalScores.strength,
        dexterity: totalScores.dexterity,
        constitution: totalScores.constitution,
        intelligence: totalScores.intelligence,
        wisdom: totalScores.wisdom,
        charisma: totalScores.charisma,
        hitDiceType: `d${hitDie}`,
        hitDiceTotal: 1,
        hitDiceUsed: 0,
        inventory: JSON.stringify(inventoryItems),
        modifiers: JSON.stringify(modifiers),
        spells: JSON.stringify(spellData.spells),
        spellSlots: JSON.stringify(isCasterChar ? { 1: { total: 2, used: 0 } } : {}),
        spellcastingAbility: spellAbility,
        spellSaveDc,
        spellAttackBonus,
        gold: 0,
        currency: JSON.stringify({ pp: 0, gp: 15, ep: 0, sp: 0, cp: 0 }),
      };

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getJsonAuthHeaders(user),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to create character.");
      }

      const newChar = await res.json();
      onComplete(newChar);
    } catch (err) {
      console.error("[Builder] Create error:", err);
      setError(err.message);
      onError?.(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Render current step component
  function renderStep() {
    switch (step) {
      case 0: return <StepNameRace form={form} setForm={setForm} onError={setError} />;
      case 1: return <StepClass form={form} setForm={setForm} onError={setError} />;
      case 2: return <StepAbilityScores form={form} setForm={setForm} />;
      case 3: return <StepSkills form={form} setForm={setForm} />;
      case 4: return <StepEquipment form={form} setForm={setForm} />;
      case 5:
        // If not caster, skip to review
        if (!isCaster) return <StepReview form={form} onError={setError} />;
        return <StepSpells form={form} setForm={setForm} onError={setError} />;
      case 6: return <StepReview form={form} onError={setError} />;
      default: return null;
    }
  }

  // Determine actual step label
  // eslint-disable-next-line unused-imports/no-unused-vars
  function getStepLabel(idx) {
    if (!isCaster && idx >= 5) return STEP_LABELS[idx + 1];
    return STEP_LABELS[idx];
  }

  return (
    <div style={styles.wizardContainer} className="fade-in">
      {/* Progress bar */}
      <div style={styles.progressContainer}>
        {visibleSteps.map((label, i) => (
          <div
            key={label}
            style={{
              ...styles.progressDot,
              background: i < step ? "var(--color-accent)" : i === step ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
              opacity: i <= step ? 1 : 0.4,
            }}
            title={label}
          >
            <span style={styles.progressDotInner}>{i + 1}</span>
          </div>
        ))}
      </div>
      <div style={styles.stepLabels}>
        {visibleSteps.map((label, i) => (
          <span
            key={label}
            style={{
              ...styles.stepLabelText,
              color: i === step ? "var(--color-accent)" : "var(--color-muted)",
              fontWeight: i === step ? 700 : 400,
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Error display */}
      {error && (
        <div style={styles.errorBar}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={styles.errorClose}>✕</button>
        </div>
      )}

      {/* Step content */}
      <div style={styles.stepContent}>
        {renderStep()}
      </div>

      {/* Navigation */}
      <div style={styles.navRow}>
        <button
          type="button"
          onClick={() => step === 0 ? onCancel?.() : setStep((s) => s - 1)}
          style={styles.navBtn}
          className="touch-target btn-hover-scale"
          disabled={loading}
        >
          <ChevronLeft size={16} />
          {step === 0 ? "Cancel" : "Back"}
        </button>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span style={styles.stepCounter}>{step + 1} / {visibleSteps.length}</span>
          {step < maxStep ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed() || loading}
              style={{
                ...styles.navBtn,
                background: canProceed() ? "var(--color-accent)" : "rgba(255,255,255,0.1)",
                color: canProceed() ? "var(--color-bg)" : "var(--color-muted)",
                opacity: canProceed() ? 1 : 0.5,
              }}
              className="touch-target btn-hover-scale"
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={loading}
              style={{
                ...styles.navBtn,
                background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
                color: "var(--color-bg)",
                fontWeight: "bold",
                opacity: loading ? 0.6 : 1,
              }}
              className="touch-target btn-hover-scale"
            >
              {loading ? "Creating..." : "Create Character"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Styles
// =============================================================================
const styles = {
  wizardContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.75rem",
    gap: "0.5rem",
    overflow: "hidden",
  },
  progressContainer: {
    display: "flex",
    justifyContent: "center",
    gap: "0.15rem",
    flexShrink: 0,
  },
  progressDot: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--color-bg)",
    cursor: "default",
    transition: "all 0.2s",
  },
  progressDotInner: {},
  stepLabels: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.6rem",
    padding: "0 0.25rem",
    flexShrink: 0,
    overflow: "hidden",
  },
  stepLabelText: {
    fontSize: "0.6rem",
    textAlign: "center",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "14%",
  },
  errorBar: {
    padding: "0.5rem 0.75rem",
    background: "rgba(220, 50, 50, 0.15)",
    border: "1px solid rgba(220, 50, 50, 0.3)",
    borderRadius: "6px",
    color: "var(--color-danger)",
    fontSize: "0.8rem",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  errorClose: {
    background: "none",
    border: "none",
    color: "var(--color-danger)",
    cursor: "pointer",
    fontSize: "0.8rem",
    padding: "0.25rem",
  },
  stepContent: {
    flex: 1,
    overflowY: "auto",
    minHeight: 0,
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
    paddingTop: "0.5rem",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    gap: "0.5rem",
  },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.55rem 0.85rem",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    fontSize: "0.85rem",
    background: "rgba(255,255,255,0.08)",
    color: "var(--color-text)",
    transition: "all 0.15s",
    minHeight: "44px",
  },
  stepCounter: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    whiteSpace: "nowrap",
  },
};

const stepStyles = {
  stepContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    paddingBottom: "0.5rem",
  },
  stepTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    margin: 0,
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.8rem",
    fontWeight: 600,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    padding: "0.65rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    outline: "none",
    boxSizing: "border-box",
  },
  hint: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  dropdown: {
    listStyle: "none",
    margin: "0.15rem 0 0 0",
    padding: "0.35rem",
    borderRadius: "8px",
    maxHeight: "220px",
    overflowY: "auto",
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 9999,
    background: "rgba(10, 8, 20, 0.96)",
  },
  dropdownItem: {
    margin: 0,
    padding: 0,
  },
  dropdownBtn: {
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    padding: "0.55rem 0.65rem",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.85rem",
    minHeight: "44px",
  },
  itemName: {
    fontWeight: 600,
  },
  sourceTag: {
    fontSize: "0.6rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.1)",
    padding: "0.05rem 0.25rem",
    borderRadius: "3px",
    whiteSpace: "nowrap",
  },
  selectedCard: {
    padding: "0.75rem",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  selectedHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  selectedName: {
    fontSize: "1rem",
    color: "var(--color-accent)",
  },
  clearBtn: {
    marginLeft: "auto",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-muted)",
    borderRadius: "4px",
    cursor: "pointer",
    padding: "0.2rem 0.4rem",
    fontSize: "0.75rem",
    minWidth: "44px",
    minHeight: "44px",
  },
  statRow: {
    fontSize: "0.8rem",
    display: "flex",
    gap: "0.35rem",
    color: "var(--color-text)",
    opacity: 0.85,
    flexWrap: "wrap",
    alignItems: "center",
  },
  abilityBonuses: {
    display: "flex",
    gap: "0.25rem",
    flexWrap: "wrap",
  },
  abilityBadge: {
    fontSize: "0.65rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.1)",
    padding: "0.1rem 0.3rem",
    borderRadius: "3px",
  },
  optionBtn: {
    padding: "0.45rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    fontSize: "0.8rem",
    color: "var(--color-text)",
    background: "rgba(255,255,255,0.05)",
    minHeight: "44px",
  },
  traitName: {
    color: "var(--color-accent)",
    fontSize: "0.8rem",
  },
  featureCard: {
    padding: "0.5rem",
    borderRadius: "6px",
  },
  methodBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.5rem 0.7rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    fontSize: "0.78rem",
    color: "var(--color-text)",
    background: "rgba(255,255,255,0.05)",
    flex: 1,
    justifyContent: "center",
    minHeight: "44px",
  },
  scoreCard: {
    padding: "0.65rem",
    borderRadius: "8px",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    alignItems: "center",
  },
  scoreLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  scoreTotal: {
    fontSize: "1.5rem",
    fontWeight: 800,
    color: "var(--color-accent)",
    lineHeight: 1.2,
  },
  scoreMod: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  scoreBase: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  scoreAdjBtn: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "1rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.1s",
  },
  assignBtn: {
    marginTop: "0.25rem",
    padding: "0.3rem 0.5rem",
    borderRadius: "4px",
    border: "1px solid var(--color-accent)",
    background: "transparent",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.65rem",
    fontWeight: 600,
    width: "100%",
    minHeight: "44px",
  },
  profBadge: {
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.1)",
    padding: "0.1rem 0.4rem",
    borderRadius: "4px",
    border: "1px solid rgba(200, 151, 58, 0.2)",
  },
  skillBtn: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.25rem",
    padding: "0.5rem 0.55rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    fontSize: "0.78rem",
    color: "var(--color-text)",
    background: "rgba(255,255,255,0.03)",
    textAlign: "left",
    minHeight: "44px",
  },
  equipRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    padding: "0.45rem 0.55rem",
    borderRadius: "6px",
  },
  equipBtn: {
    width: "32px",
    height: "32px",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tabBtn: {
    flex: 1,
    padding: "0.55rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.1)",
    cursor: "pointer",
    fontSize: "0.78rem",
    color: "var(--color-text)",
    background: "rgba(255,255,255,0.05)",
    textAlign: "center",
    minHeight: "44px",
    fontWeight: 600,
  },
  spellChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.15rem",
    padding: "0.25rem 0.5rem",
    borderRadius: "16px",
    background: "rgba(200, 151, 58, 0.1)",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
  },
  reviewCard: {
    padding: "1rem",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  reviewSection: {
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.5rem",
    fontSize: "0.85rem",
  },
  reviewLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    display: "block",
    marginBottom: "0.15rem",
  },
};
