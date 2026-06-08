// =============================================================================
// Tablecast  Character Sheet Component (Phase 4)
// An interactive, auto-calculating D&D 5e Character Sheet.
// Integrates click-to-roll with Socket.io and auto-saves to backend SQLite.
// =============================================================================
import { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import Autocomplete from "./Autocomplete";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";

// Define the 18 standard 5e skills and their associated abilities
const SKILL_DEFINITIONS = [
  { name: "Athletics", ability: "strength" },
  { name: "Acrobatics", ability: "dexterity" },
  { name: "Sleight of Hand", ability: "dexterity" },
  { name: "Stealth", ability: "dexterity" },
  { name: "Arcana", ability: "intelligence" },
  { name: "History", ability: "intelligence" },
  { name: "Investigation", ability: "intelligence" },
  { name: "Nature", ability: "intelligence" },
  { name: "Religion", ability: "intelligence" },
  { name: "Animal Handling", ability: "wisdom" },
  { name: "Insight", ability: "wisdom" },
  { name: "Medicine", ability: "wisdom" },
  { name: "Perception", ability: "wisdom" },
  { name: "Survival", ability: "wisdom" },
  { name: "Deception", ability: "charisma" },
  { name: "Intimidation", ability: "charisma" },
  { name: "Performance", ability: "charisma" },
  { name: "Persuasion", ability: "charisma" },
];

export default function CharacterSheet({ characterId, onBack, user }) {
  const { socket } = useSocket();
  const [character, setCharacter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // AI Character Generator states
  const [showCharGen, setShowCharGen] = useState(false);
  const [charGenPrompt, setCharGenPrompt] = useState("");
  const [charGenLoading, setCharGenLoading] = useState(false);
  const [charGenError, setCharGenError] = useState(null);
  const [charGenStep, setCharGenStep] = useState("prompt"); // "prompt" | "options" | "generating"
  const [charGenProgress, setCharGenProgress] = useState("");
  const [charGenOptions, setCharGenOptions] = useState([]);
  const [charGenSelected, setCharGenSelected] = useState(null);
  
  // Save status indicator
  const [saveStatus, setSaveStatus] = useState("Saved"); // "Saved", "Saving...", "Error"
  
  // Custom Attack creation form
  const [showAddAttack, setShowAddAttack] = useState(false);
  const [atkName, setAtkName] = useState("");
  const [atkAbility, setAtkAbility] = useState("strength");
  const [atkDice, setAtkDice] = useState("1d8");
  const [atkProficient, setAtkProficient] = useState(true);

  // Custom Inventory creation form
  const [showAddItem, setShowAddItem] = useState(false);
  const [itemName, setItemName] = useState("");
  const [itemQty, setItemQty] = useState(1);
  const [itemWeight, setItemWeight] = useState(0);

  // Keep a reference to the active layout tab on the sheet (Stats, Skills, Attacks, Inventory)
  const [sheetTab, setSheetTab] = useState("stats");

  // Fetch character details from backend on mount/ID change
  useEffect(() => {
    async function loadCharacter() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/characters/${characterId}`);
        if (!res.ok) {
          throw new Error("Failed to load character sheet.");
        }
        const data = await res.json();
        
        // Parse inventory and modifiers JSON blobs
        let parsedInventory = [];
        let parsedModifiers = { proficiencies: [], saveProficiencies: [], attacks: [] };
        
        try {
          parsedInventory = JSON.parse(data.inventory || "[]");
        } catch (e) {}
        
        try {
          const modObject = JSON.parse(data.modifiers || "{}");
          parsedModifiers = {
            proficiencies: modObject.proficiencies || [],
            saveProficiencies: modObject.saveProficiencies || [],
            attacks: modObject.attacks || getDefaultAttacks(),
          };
        } catch (e) {}

        setCharacter({
          ...data,
          inventory: parsedInventory,
          modifiers: parsedModifiers,
          backstory: data.backstory || "",
          personality: data.personality || "",
          appearance: data.appearance || "",
        });
      } catch (err) {
        console.error("[CharacterSheet] Load error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadCharacter();
  }, [characterId]);

  // Default weapon templates if character has none
  function getDefaultAttacks() {
    return [
      { name: "Greatsword", ability: "strength", dice: "2d6", proficient: true },
      { name: "Longbow", ability: "dexterity", dice: "1d8", proficient: true },
      { name: "Dagger", ability: "dexterity", dice: "1d4", proficient: true },
    ];
  }

  //  AUTO-CALCULATION HELPERS 
  const getMod = (score) => Math.floor((score - 10) / 2);
  const formatMod = (val) => (val >= 0 ? `+${val}` : `${val}`);
  
  // Proficiency Bonus based on level: Lvl 1-4 is +2, 5-8 is +3, 9-12 is +4...
  const getProficiencyBonus = (lvl) => Math.ceil((lvl || 1) / 4) + 1;

  //  SAVE STATE TO SERVER (DEBUNCED/ON-BLUR) 
  async function saveToServer(updatedChar) {
    if (!updatedChar) return;
    setSaveStatus("Saving...");
    try {
      const payload = {
        name: updatedChar.name,
        race: updatedChar.race,
        class: updatedChar.class,
        level: Number(updatedChar.level),
        hp: Number(updatedChar.hp),
        maxHp: Number(updatedChar.maxHp),
        strength: Number(updatedChar.strength),
        dexterity: Number(updatedChar.dexterity),
        constitution: Number(updatedChar.constitution),
        intelligence: Number(updatedChar.intelligence),
        wisdom: Number(updatedChar.wisdom),
        charisma: Number(updatedChar.charisma),
        inventory: JSON.stringify(updatedChar.inventory),
        modifiers: JSON.stringify(updatedChar.modifiers),
        backstory: updatedChar.backstory || "",
        personality: updatedChar.personality || "",
        appearance: updatedChar.appearance || "",
      };

      const res = await fetch(`/api/characters/${updatedChar.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": String(user?.id || ""),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("Save request failed.");
      }
      setSaveStatus("Saved");
    } catch (err) {
      console.error("[CharacterSheet] Save error:", err);
      setSaveStatus("Error");
    }
  }

  // Trigger state update and initiate save
  function updateCharacterState(updater) {
    const next = updater(character);
    setCharacter(next);
    saveToServer(next);
  }

  // AI Character generation helpers
  async function generateCharOptions() {
    if (!charGenPrompt.trim()) {
      setCharGenError("Describe the character you want to create.");
      return;
    }
    setCharGenLoading(true);
    setCharGenError(null);
    setCharGenProgress("Consulting campaign lore...");

    try {
      const res = await fetch("/api/ai/generate-character-options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({ prompt: charGenPrompt.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate options.");
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let result = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const event = JSON.parse(payload);
              if (event.type === "status") setCharGenProgress(event.message);
              if (event.type === "result") result = event.data;
              if (event.type === "error") throw new Error(event.message);
            } catch (e) { if (e.message) throw e; }
          }
        }
        if (result?.options?.length) {
          setCharGenOptions(result.options);
          setCharGenStep("options");
        } else {
          throw new Error("No character options received.");
        }
      } else {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.options?.length) {
          setCharGenOptions(data.options);
          setCharGenStep("options");
        }
      }
    } catch (err) {
      setCharGenError(err.message);
    } finally {
      setCharGenLoading(false);
    }
  }

  async function generateCharFromOption() {
    if (!charGenSelected) {
      setCharGenError("Select a character concept first.");
      return;
    }
    setCharGenLoading(true);
    setCharGenError(null);
    setCharGenProgress("Generating full character sheet...");

    try {
      const res = await fetch("/api/ai/generate-character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": String(user?.id || ""),
        },
        body: JSON.stringify({
          prompt: charGenPrompt.trim(),
          selectedOption: charGenSelected,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate character.");
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream")) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let result = null;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (!payload) continue;
            try {
              const event = JSON.parse(payload);
              if (event.type === "status") setCharGenProgress(event.message);
              if (event.type === "result") result = event.data;
              if (event.type === "error") throw new Error(event.message);
            } catch (e) { if (e.message) throw e; }
          }
        }
        if (result?.name) {
          applyGeneratedCharacter(result);
        } else {
          throw new Error("Invalid character data received.");
        }
      } else {
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        if (data.name) {
          applyGeneratedCharacter(data);
        }
      }
    } catch (err) {
      setCharGenError(err.message);
    } finally {
      setCharGenLoading(false);
    }
  }

  function applyGeneratedCharacter(data) {
    const nextCharacter = {
      ...(character || {}),
      id: character?.id,
      name: data.name || "New Character",
      race: data.race || "",
      class: data.class || "",
      level: Number(data.level) || 1,
      hp: Number(data.hp) || 10,
      maxHp: Number(data.maxHp) || 10,
      strength: Number(data.strength) || 10,
      dexterity: Number(data.dexterity) || 10,
      constitution: Number(data.constitution) || 10,
      intelligence: Number(data.intelligence) || 10,
      wisdom: Number(data.wisdom) || 10,
      charisma: Number(data.charisma) || 10,
      inventory: Array.isArray(data.inventory) ? data.inventory : [],
      modifiers: character?.modifiers || { proficiencies: [], saveProficiencies: [], attacks: [] },
      backstory: data.backstory || "",
      personality: data.personality || "",
      appearance: data.appearance || "",
    };
    setCharacter(nextCharacter);
    setShowCharGen(false);
    saveToServer(nextCharacter);
  }

  function resetCharGen() {
    setCharGenPrompt("");
    setCharGenLoading(false);
    setCharGenError(null);
    setCharGenStep("prompt");
    setCharGenProgress("");
    setCharGenOptions([]);
    setCharGenSelected(null);
  }

  // Handle direct field edits (blurs)
  function handleFieldChange(field, val) {
    updateCharacterState((prev) => ({
      ...prev,
      [field]: val,
    }));
  }

  // Handle ability score updates
  function handleStatChange(stat, val) {
    const numVal = Math.max(1, Math.min(30, Number(val) || 10));
    updateCharacterState((prev) => ({
      ...prev,
      [stat]: numVal,
    }));
  }

  //  DICE ROLLING LOGIC & WEB SOCKET EMITS 
  
  // Helper to roll a standard die (e.g. d20, d6)
  function rollDice(sides, count = 1) {
    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(Math.floor(Math.random() * sides) + 1);
    }
    return rolls;
  }

  // Parse a dice expression like "2d6" or "1d10"
  function parseDiceExpression(expr) {
    const match = expr.trim().toLowerCase().match(/^(\d+)d(\d+)$/);
    if (match) {
      return { count: parseInt(match[1]), sides: parseInt(match[2]) };
    }
    return { count: 1, sides: 8 }; // Fallback
  }

  // Roll an Ability Check (STR, DEX, etc.)
  function handleAbilityRoll(statName, score) {
    const modifier = getMod(score);
    const d20 = rollDice(20, 1)[0];
    const total = d20 + modifier;
    const cleanStatName = statName.charAt(0).toUpperCase() + statName.slice(1);

    if (socket) {
      socket.emit("chat:send", {
        sender: character.name,
        text: `rolled a ${cleanStatName} Check!  Total: ${total}`,
        type: "roll",
        rollDetails: {
          rollName: `${cleanStatName} Check`,
          formula: `1d20 + ${formatMod(modifier)}`,
          rolls: [d20],
          modifier,
          total,
          isAttack: false,
          status: "rolling",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
          dice3d: [`1d20@${d20}`],
        },
      });
    }
  }

  // Roll a Saving Throw
  function handleSavingThrowRoll(statName, score) {
    const modifier = getMod(score);
    const profBonus = getProficiencyBonus(character.level);
    const isProf = character.modifiers.saveProficiencies.includes(statName);
    const finalMod = modifier + (isProf ? profBonus : 0);
    const d20 = rollDice(20, 1)[0];
    const total = d20 + finalMod;
    const cleanStatName = statName.charAt(0).toUpperCase() + statName.slice(1);

    if (socket) {
      socket.emit("chat:send", {
        sender: character.name,
        text: `rolled a ${cleanStatName} Saving Throw!  Total: ${total}`,
        type: "roll",
        rollDetails: {
          rollName: `${cleanStatName} Saving Throw`,
          formula: `1d20 + ${formatMod(finalMod)} ${isProf ? "(Prof)" : ""}`,
          rolls: [d20],
          modifier: finalMod,
          total,
          isAttack: false,
          status: "rolling",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
          dice3d: [`1d20@${d20}`],
        },
      });
    }
  }

  // Toggle saving throw proficiency
  function toggleSaveProficiency(statName) {
    updateCharacterState((prev) => {
      const saveProf = prev.modifiers.saveProficiencies;
      const isProf = saveProf.includes(statName);
      const nextSaveProf = isProf
        ? saveProf.filter((s) => s !== statName)
        : [...saveProf, statName];
      return {
        ...prev,
        modifiers: {
          ...prev.modifiers,
          saveProficiencies: nextSaveProf,
        },
      };
    });
  }

  // Roll a Skill Check
  function handleSkillRoll(skill) {
    const baseStat = character[skill.ability];
    const modifier = getMod(baseStat);
    const profBonus = getProficiencyBonus(character.level);
    const isProf = character.modifiers.proficiencies.includes(skill.name);
    const finalMod = modifier + (isProf ? profBonus : 0);
    const d20 = rollDice(20, 1)[0];
    const total = d20 + finalMod;

    if (socket) {
      socket.emit("chat:send", {
        sender: character.name,
        text: `rolled an ${skill.name} Check!  Total: ${total}`,
        type: "roll",
        rollDetails: {
          rollName: `${skill.name} Check (${skill.ability.slice(0, 3).toUpperCase()})`,
          formula: `1d20 + ${formatMod(finalMod)} ${isProf ? "(Prof)" : ""}`,
          rolls: [d20],
          modifier: finalMod,
          total,
          isAttack: false,
          status: "rolling",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
          dice3d: [`1d20@${d20}`],
        },
      });
    }
  }

  // Toggle skill proficiency
  function toggleSkillProficiency(skillName) {
    updateCharacterState((prev) => {
      const skillProf = prev.modifiers.proficiencies;
      const isProf = skillProf.includes(skillName);
      const nextSkillProf = isProf
        ? skillProf.filter((s) => s !== skillName)
        : [...skillProf, skillName];
      return {
        ...prev,
        modifiers: {
          ...prev.modifiers,
          proficiencies: nextSkillProf,
        },
      };
    });
  }

  // Roll Weapon Attack (To Hit & Damage)
  function handleAttackRoll(atk) {
    const abilityScore = character[atk.ability];
    const abilityMod = getMod(abilityScore);
    const profBonus = getProficiencyBonus(character.level);
    
    // To Hit Math
    const toHitMod = abilityMod + (atk.proficient ? profBonus : 0);
    const toHitD20 = rollDice(20, 1)[0];
    const toHitTotal = toHitD20 + toHitMod;

    // Damage Math
    const { count, sides } = parseDiceExpression(atk.dice);
    const dmgRolls = rollDice(sides, count);
    const dmgRollsSum = dmgRolls.reduce((a, b) => a + b, 0);
    const damageTotal = dmgRollsSum + abilityMod;

    if (socket) {
      socket.emit("chat:send", {
        sender: character.name,
        text: `swings with their ${atk.name}!  Hit: ${toHitTotal} | Damage: ${damageTotal}`,
        type: "roll",
        rollDetails: {
          rollName: atk.name,
          formula: `Hit: 1d20 + ${toHitMod} | Dmg: ${atk.dice} + ${formatMod(abilityMod)}`,
          isAttack: true,
          toHitRoll: toHitD20,
          toHitMod,
          toHitTotal,
          damageRolls: dmgRolls,
          damageDice: atk.dice,
          damageMod: abilityMod,
          damageTotal,
          status: "rolling",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
          dice3d: [`1d20@${toHitD20}`, `${count}d${sides}@${dmgRolls.join(",")}`],
        },
      });
    }
  }

  // Add a Custom Weapon Attack
  function handleAddAttack(e) {
    e.preventDefault();
    if (!atkName.trim()) return;

    const newAttack = {
      name: atkName.trim(),
      ability: atkAbility,
      dice: atkDice.trim(),
      proficient: atkProficient,
    };

    updateCharacterState((prev) => ({
      ...prev,
      modifiers: {
        ...prev.modifiers,
        attacks: [...(prev.modifiers.attacks || []), newAttack],
      },
    }));

    setAtkName("");
    setAtkDice("1d8");
    setShowAddAttack(false);
  }

  // Delete a Weapon Attack
  function handleDeleteAttack(idxToDelete) {
    updateCharacterState((prev) => ({
      ...prev,
      modifiers: {
        ...prev.modifiers,
        attacks: prev.modifiers.attacks.filter((_, idx) => idx !== idxToDelete),
      },
    }));
  }

  // Add Item to Inventory
  function handleAddItem(e) {
    e.preventDefault();
    if (!itemName.trim()) return;

    const newItem = {
      name: itemName.trim(),
      quantity: Math.max(1, parseInt(itemQty) || 1),
      weight: Math.max(0, parseFloat(itemWeight) || 0),
    };

    updateCharacterState((prev) => ({
      ...prev,
      inventory: [...prev.inventory, newItem],
    }));

    setItemName("");
    setItemQty(1);
    setItemWeight(0);
    setShowAddItem(false);
  }

  // Delete Item from Inventory
  function handleDeleteItem(idxToDelete) {
    updateCharacterState((prev) => ({
      ...prev,
      inventory: prev.inventory.filter((_, idx) => idx !== idxToDelete),
    }));
  }

  // Calculate total inventory weight
  const totalWeight = character?.inventory
    ? character.inventory.reduce((sum, item) => sum + item.quantity * item.weight, 0).toFixed(1)
    : "0.0";

  // Check state loading / error
  if (loading) return <div style={styles.stateContainer}><p>Consulting character scrolls</p></div>;
  if (error) return <div style={styles.stateContainer}><p style={{ color: "var(--color-danger)" }}> Error: {error}</p></div>;
  if (!character) return null;

  return (
    <div style={styles.sheet} className="fade-in">
      {/* Top Banner Header */}
      <header style={styles.header} className="glass-panel gold-border-glow">
        {onBack && (
          <button onClick={onBack} style={styles.backBtn} className="touch-target btn-hover-scale">
            ◀ List
          </button>
        )}
        
        <div style={styles.headerStats}>
          <h2 style={styles.charName}>{character.name}</h2>
          <span style={styles.charSummary}>
            Lvl {character.level}  {character.race} {character.class}
          </span>
        </div>

        <div style={styles.headerActions}>
          {user?.role === "DM" && (
            <button
              type="button"
              onClick={() => { setShowCharGen(true); resetCharGen(); }}
              style={styles.aiGenerateBtn}
              className="touch-target"
            >
              ✨ AI Generate
            </button>
          )}
          <div style={styles.saveBadge}>
            {saveStatus === "Saving..." && <span style={styles.savingDot}> Saving...</span>}
            {saveStatus === "Saved" && <span style={styles.savedDot}> Saved</span>}
            {saveStatus === "Error" && <span style={styles.errorDot}> Retry</span>}
          </div>
        </div>
      </header>

      {/* Main Details Block (Level, Class, HP) */}
      <section style={styles.detailsBlock} className="glass-panel">
        {/* HP Widget */}
        <div style={styles.hpWidget}>
          <div style={styles.hpHeader}>
            <span style={styles.blockLabel}> Hit Points</span>
            <span style={styles.hpValues}>
              {character.hp} / {character.maxHp}
            </span>
          </div>
          <div style={styles.hpBarContainer}>
            <div
              style={{
                ...styles.hpBar,
                width: `${Math.max(0, Math.min(100, (character.hp / character.maxHp) * 100))}%`,
                background: character.hp < character.maxHp * 0.3 ? "var(--color-danger)" : "var(--color-success)",
              }}
            />
          </div>
          {/* HP Adjusters */}
          <div style={styles.hpControls}>
            <button
              id="hp-minus-btn"
              onClick={() => handleFieldChange("hp", Math.max(0, character.hp - 1))}
              style={styles.hpBtn}
              className="touch-target btn-hover-scale"
            >
              -1 HP
            </button>
            <input
              id="hp-input"
              type="number"
              value={character.hp}
              onChange={(e) => handleFieldChange("hp", Math.max(0, parseInt(e.target.value) || 0))}
              onBlur={(e) => handleFieldChange("hp", Math.max(0, parseInt(e.target.value) || 0))}
              style={styles.hpInput}
            />
            <button
              id="hp-plus-btn"
              onClick={() => handleFieldChange("hp", Math.min(character.maxHp, character.hp + 1))}
              style={styles.hpBtn}
              className="touch-target btn-hover-scale"
            >
              +1 HP
            </button>
          </div>
        </div>

        {/* Level / Max HP Settings */}
        <div style={styles.levelMaxHp}>
          <div style={styles.miniInputGroup}>
            <span style={styles.miniLabel}>Level</span>
            <input
              id="lvl-input"
              type="number"
              value={character.level}
              min={1}
              max={20}
              onChange={(e) => handleFieldChange("level", Math.max(1, parseInt(e.target.value) || 1))}
              onBlur={(e) => handleFieldChange("level", Math.max(1, parseInt(e.target.value) || 1))}
              style={styles.miniInput}
            />
          </div>
          <div style={styles.miniInputGroup}>
            <span style={styles.miniLabel}>Max HP</span>
            <input
              id="maxhp-input"
              type="number"
              value={character.maxHp}
              min={1}
              onChange={(e) => handleFieldChange("maxHp", Math.max(1, parseInt(e.target.value) || 1))}
              onBlur={(e) => handleFieldChange("maxHp", Math.max(1, parseInt(e.target.value) || 1))}
              style={styles.miniInput}
            />
          </div>
          <div style={styles.miniInputGroup}>
            <span style={styles.miniLabel}>Prof Bonus</span>
            <div style={styles.profBonusBox}>
              +{getProficiencyBonus(character.level)}
            </div>
          </div>
        </div>
      </section>

      <section style={styles.narrativeSection} className="glass-panel">
        <div style={styles.narrativeCard}>
          <div style={styles.narrativeHeader}>
            <span style={styles.narrativeLabel}>Backstory</span>
            <AiAssistButton
              fieldName="backstory"
              actions={AI_FIELD_ACTIONS.backstory}
              currentText={character?.backstory || ""}
              context={{ entityType: "character", character: { name: character?.name, race: character?.race, class: character?.class, level: character?.level, backstory: character?.backstory, personality: character?.personality, appearance: character?.appearance } }}
              onApply={(reply) => updateCharacterState((prev) => ({ ...prev, backstory: reply }))}
              onError={(msg) => setError(msg)}
              user={user}
            />
          </div>
          <textarea
            value={character.backstory || ""}
            onChange={(e) => setCharacter((prev) => ({ ...prev, backstory: e.target.value }))}
            onBlur={(e) => handleFieldChange("backstory", e.target.value)}
            placeholder="Character backstory..."
            style={styles.narrativeTextArea}
            className="form-input"
            rows={3}
          />
        </div>
        <div style={styles.narrativeCard}>
          <div style={styles.narrativeHeader}>
            <span style={styles.narrativeLabel}>Personality</span>
            <AiAssistButton
              fieldName="personality"
              actions={AI_FIELD_ACTIONS.personality}
              currentText={character?.personality || ""}
              context={{ entityType: "character", character: { name: character?.name, race: character?.race, class: character?.class, level: character?.level, backstory: character?.backstory, personality: character?.personality, appearance: character?.appearance } }}
              onApply={(reply) => updateCharacterState((prev) => ({ ...prev, personality: reply }))}
              onError={(msg) => setError(msg)}
              user={user}
            />
          </div>
          <textarea
            value={character.personality || ""}
            onChange={(e) => setCharacter((prev) => ({ ...prev, personality: e.target.value }))}
            onBlur={(e) => handleFieldChange("personality", e.target.value)}
            placeholder="Personality traits..."
            style={styles.narrativeTextArea}
            className="form-input"
            rows={3}
          />
        </div>
        <div style={styles.narrativeCard}>
          <div style={styles.narrativeHeader}>
            <span style={styles.narrativeLabel}>Appearance</span>
            <AiAssistButton
              fieldName="appearance"
              actions={AI_FIELD_ACTIONS.appearance}
              currentText={character?.appearance || ""}
              context={{ entityType: "character", character: { name: character?.name, race: character?.race, class: character?.class, level: character?.level, backstory: character?.backstory, personality: character?.personality, appearance: character?.appearance } }}
              onApply={(reply) => updateCharacterState((prev) => ({ ...prev, appearance: reply }))}
              onError={(msg) => setError(msg)}
              user={user}
            />
          </div>
          <textarea
            value={character.appearance || ""}
            onChange={(e) => setCharacter((prev) => ({ ...prev, appearance: e.target.value }))}
            onBlur={(e) => handleFieldChange("appearance", e.target.value)}
            placeholder="Physical appearance..."
            style={styles.narrativeTextArea}
            className="form-input"
            rows={3}
          />
        </div>
      </section>

      {/* Internal Tabs (Stats, Skills, Attacks, Inventory) */}
      <nav style={styles.tabNav}>
        {["stats", "skills", "attacks", "inventory"].map((tab) => (
          <button
            key={tab}
            id={`sheet-tab-${tab}`}
            onClick={() => setSheetTab(tab)}
            style={{
              ...styles.tabBtn,
              borderBottom: sheetTab === tab ? "2px solid var(--color-accent)" : "none",
              color: sheetTab === tab ? "var(--color-accent)" : "var(--color-muted)",
              fontWeight: sheetTab === tab ? "bold" : "normal",
            }}
            className="touch-target"
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {/* Sheet Content Scroll Area */}
      <div style={styles.scrollArea}>
        
        {/*  STATS TAB  */}
        {sheetTab === "stats" && (
          <div style={styles.statsGrid} className="fade-in">
            {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => {
              const score = character[stat];
              const mod = getMod(score);
              return (
                <div key={stat} style={styles.statBox} className="glass-panel">
                  <span style={styles.statNameLabel}>
                    {stat.slice(0, 3).toUpperCase()}
                  </span>
                  <button
                    id={`roll-stat-${stat}`}
                    onClick={() => handleAbilityRoll(stat, score)}
                    style={styles.statModBtn}
                    className="touch-target btn-hover-scale"
                    title="Click to Roll Check"
                  >
                    {formatMod(mod)}
                  </button>
                  <input
                    id={`input-stat-${stat}`}
                    type="number"
                    value={score}
                    min={1}
                    max={30}
                    onChange={(e) => handleStatChange(stat, e.target.value)}
                    onBlur={(e) => handleStatChange(stat, e.target.value)}
                    style={styles.statInput}
                  />

                  {/* Save Prof Checkbox */}
                  <div style={styles.saveProfRow}>
                    <input
                      id={`chk-saveprof-${stat}`}
                      type="checkbox"
                      checked={character.modifiers.saveProficiencies.includes(stat)}
                      onChange={() => toggleSaveProficiency(stat)}
                      style={styles.checkbox}
                    />
                    <button
                      id={`roll-save-${stat}`}
                      onClick={() => handleSavingThrowRoll(stat, score)}
                      style={styles.saveRollText}
                    >
                      Save: {formatMod(mod + (character.modifiers.saveProficiencies.includes(stat) ? getProficiencyBonus(character.level) : 0))}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/*  SKILLS TAB  */}
        {sheetTab === "skills" && (
          <div style={styles.skillsList} className="fade-in">
            {SKILL_DEFINITIONS.map((skill) => {
              const baseStat = character[skill.ability];
              const abilityMod = getMod(baseStat);
              const isProf = character.modifiers.proficiencies.includes(skill.name);
              const profBonus = getProficiencyBonus(character.level);
              const finalMod = abilityMod + (isProf ? profBonus : 0);

              return (
                <div key={skill.name} style={styles.skillRow} className="glass-panel">
                  <div style={styles.skillLeft}>
                    <input
                      id={`chk-skillprof-${skill.name.toLowerCase().replace(/\s/g, "")}`}
                      type="checkbox"
                      checked={isProf}
                      onChange={() => toggleSkillProficiency(skill.name)}
                      style={styles.checkbox}
                    />
                    <span style={styles.skillNameText}>{skill.name}</span>
                    <span style={styles.skillAbilityTag}>
                      {skill.ability.slice(0, 3).toUpperCase()}
                    </span>
                  </div>
                  <button
                    id={`roll-skill-${skill.name.toLowerCase().replace(/\s/g, "")}`}
                    onClick={() => handleSkillRoll(skill)}
                    style={styles.skillRollBtn}
                    className="touch-target btn-hover-scale"
                  >
                    {formatMod(finalMod)} 
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/*  ATTACKS TAB  */}
        {sheetTab === "attacks" && (
          <div style={styles.attacksContainer} className="fade-in">
            <div style={styles.attackSubHeader}>
              <h3 style={styles.subTitle}>Weapons & Spells</h3>
              {!showAddAttack && (
                <button
                  id="add-atk-form-btn"
                  onClick={() => setShowAddAttack(true)}
                  style={styles.addBtn}
                  className="touch-target btn-hover-scale"
                >
                  + Add Attack
                </button>
              )}
            </div>

            {/* Custom Attack Add Form */}
            {showAddAttack && (
              <form onSubmit={handleAddAttack} style={styles.subForm} className="glass-panel gold-border-glow">
                <h4 style={styles.subFormTitle}>Add Weapon/Spell</h4>
                
                <div style={styles.subFormRow}>
                  <div style={styles.inputGroup}>
                    <label style={styles.subLabel}>Name</label>
                    <Autocomplete
                      id="atk-name-input"
                      category="spells"
                      placeholder="e.g. Fireball, Broadsword..."
                      value={atkName}
                      onChange={(val) => setAtkName(val)}
                      onSelect={(spell) => {
                        setAtkName(spell.name);
                        // Auto extract dice if possible from spell or item entries
                        const entriesStr = JSON.stringify(spell.entries || []);
                        const diceMatch = entriesStr.match(/\b(\d+d\d+)\b/);
                        if (diceMatch) {
                          setAtkDice(diceMatch[1]);
                        } else {
                          setAtkDice("1d8"); // default fallback
                        }
                        
                        // Select casting attribute if it looks like a spell
                        if (spell.level !== undefined) {
                          const stats = {
                            intelligence: character.intelligence,
                            wisdom: character.wisdom,
                            charisma: character.charisma
                          };
                          let bestStat = "intelligence";
                          if (stats.wisdom > stats[bestStat]) bestStat = "wisdom";
                          if (stats.charisma > stats[bestStat]) bestStat = "charisma";
                          setAtkAbility(bestStat);
                        }
                      }}
                      className="form-input"
                      inputStyle={styles.subInput}
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.subLabel}>Damage Dice</label>
                    <input
                      id="atk-dice-input"
                      type="text"
                      placeholder="e.g. 1d8, 2d6"
                      value={atkDice}
                      onChange={(e) => setAtkDice(e.target.value)}
                      required
                      style={styles.subInput}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={styles.subFormRow}>
                  <div style={styles.inputGroup}>
                    <label style={styles.subLabel}>Attribute</label>
                    <select
                      id="atk-ability-select"
                      value={atkAbility}
                      onChange={(e) => setAtkAbility(e.target.value)}
                      style={styles.select}
                    >
                      <option value="strength">Strength</option>
                      <option value="dexterity">Dexterity</option>
                      <option value="constitution">Constitution</option>
                      <option value="intelligence">Intelligence</option>
                      <option value="wisdom">Wisdom</option>
                      <option value="charisma">Charisma</option>
                    </select>
                  </div>
                  <div style={{ ...styles.inputGroup, flexDirection: "row", alignItems: "center", gap: "0.5rem", marginTop: "1rem" }}>
                    <input
                      id="atk-prof-checkbox"
                      type="checkbox"
                      checked={atkProficient}
                      onChange={(e) => setAtkProficient(e.target.checked)}
                      style={styles.checkbox}
                    />
                    <label style={styles.subLabel}>Proficient</label>
                  </div>
                </div>

                <div style={styles.subBtnRow}>
                  <button
                    type="button"
                    onClick={() => setShowAddAttack(false)}
                    style={styles.subCancelBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-atk-btn"
                    type="submit"
                    style={styles.subSubmitBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Save Attack
                  </button>
                </div>
              </form>
            )}

            {/* List of Weapon Attacks */}
            <div style={styles.attacksList}>
              {(character.modifiers.attacks || []).map((atk, idx) => {
                const modifier = getMod(character[atk.ability]);
                const profBonus = getProficiencyBonus(character.level);
                const toHit = modifier + (atk.proficient ? profBonus : 0);

                return (
                  <div key={atk.name || idx} style={styles.attackCard} className="glass-panel">
                    <div style={styles.atkInfo}>
                      <span style={styles.atkName}>{atk.name}</span>
                      <span style={styles.atkFormula}>
                        Hit: {formatMod(toHit)} | Damage: {atk.dice} + {formatMod(modifier)}
                      </span>
                    </div>
                    <div style={styles.atkActions}>
                      <button
                        id={`roll-atk-${atk.name.toLowerCase().replace(/\s/g, "")}`}
                        onClick={() => handleAttackRoll(atk)}
                        style={styles.atkRollBtn}
                        className="touch-target btn-hover-scale"
                      >
                        Roll Attack 
                      </button>
                      <button
                        id={`delete-atk-${atk.name.toLowerCase().replace(/\s/g, "")}`}
                        onClick={() => handleDeleteAttack(idx)}
                        style={styles.deleteBtn}
                        className="touch-target"
                        title="Delete attack"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/*  INVENTORY TAB  */}
        {sheetTab === "inventory" && (
          <div style={styles.inventoryContainer} className="fade-in">
            <div style={styles.inventoryHeader}>
              <div style={styles.weightCard} className="glass-panel">
                <span style={styles.weightLabel}>Total Weight</span>
                <span style={styles.weightValue}>{totalWeight} lbs</span>
              </div>
              {!showAddItem && (
                <button
                  id="add-item-form-btn"
                  onClick={() => setShowAddItem(true)}
                  style={styles.addBtn}
                  className="touch-target btn-hover-scale"
                >
                  + Add Item
                </button>
              )}
            </div>

            {/* Item Creation Form */}
            {showAddItem && (
              <form onSubmit={handleAddItem} style={styles.subForm} className="glass-panel gold-border-glow">
                <h4 style={styles.subFormTitle}>Add Inventory Item</h4>
                
                <div style={styles.inputGroup}>
                  <label style={styles.subLabel}>Item Name</label>
                  <Autocomplete
                    id="item-name-input"
                    category="items"
                    placeholder="e.g. Iron Shield, Potion..."
                    value={itemName}
                    onChange={(val) => setItemName(val)}
                    onSelect={(item) => {
                      setItemName(item.name);
                      if (item.weight) {
                        setItemWeight(item.weight);
                      }
                    }}
                    className="form-input"
                    inputStyle={styles.subInput}
                  />
                </div>

                <div style={styles.subFormRow}>
                  <div style={styles.inputGroup}>
                    <label style={styles.subLabel}>Qty</label>
                    <input
                      id="item-qty-input"
                      type="number"
                      value={itemQty}
                      min={1}
                      onChange={(e) => setItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                      style={styles.subInput}
                      className="form-input"
                    />
                  </div>
                  <div style={styles.inputGroup}>
                    <label style={styles.subLabel}>Weight (lbs/ea)</label>
                    <input
                      id="item-weight-input"
                      type="number"
                      step="0.1"
                      value={itemWeight}
                      min={0}
                      onChange={(e) => setItemWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                      style={styles.subInput}
                      className="form-input"
                    />
                  </div>
                </div>

                <div style={styles.subBtnRow}>
                  <button
                    type="button"
                    onClick={() => setShowAddItem(false)}
                    style={styles.subCancelBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-item-btn"
                    type="submit"
                    style={styles.subSubmitBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Add Item
                  </button>
                </div>
              </form>
            )}

            {/* Inventory Items List */}
            <div style={styles.itemList}>
              {character.inventory.map((item, idx) => (
                <div key={item.name || idx} style={styles.itemCard} className="glass-panel">
                  <div style={styles.itemInfo}>
                    <span style={styles.itemName}>{item.name}</span>
                    <span style={styles.itemDetails}>
                      Qty: {item.quantity} | {item.weight > 0 ? `${(item.quantity * item.weight).toFixed(1)} lbs total` : "Weightless"}
                    </span>
                  </div>
                  <button
                    id={`delete-item-${item.name.toLowerCase().replace(/\s/g, "")}`}
                    onClick={() => handleDeleteItem(idx)}
                    style={styles.deleteBtn}
                    className="touch-target"
                    title="Remove item"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      {showCharGen && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center",
          justifyContent: "center", zIndex: 1000, padding: "1rem",
        }} onClick={() => !charGenLoading && setShowCharGen(false)}>
          <div style={{
            background: "var(--color-surface)", borderRadius: "12px",
            padding: "1.5rem", maxWidth: "500px", width: "100%",
            maxHeight: "90vh", overflow: "auto",
            border: "1px solid rgba(255,255,255,0.1)",
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "var(--color-accent)" }}>✨ AI Character Generator</h3>
              <button onClick={() => !charGenLoading && setShowCharGen(false)} style={{
                background: "transparent", border: "none", color: "var(--color-text)",
                fontSize: "1.25rem", cursor: "pointer", padding: "0.25rem",
              }} className="touch-target">✕</button>
            </div>

            {charGenStep === "prompt" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ color: "var(--color-text)", fontSize: "0.85rem" }}>
                  Describe the character you want to create. Include details about race, class, role, and personality.
                </p>
                <textarea
                  value={charGenPrompt}
                  onChange={(e) => setCharGenPrompt(e.target.value)}
                  placeholder="e.g. A cunning half-elf rogue who grew up on the streets of Waterdeep, skilled in deception and stealth..."
                  style={{
                    padding: "0.75rem", fontSize: "0.85rem", borderRadius: "6px",
                    background: "rgba(0,0,0,0.3)", color: "var(--color-text)",
                    border: "1px solid rgba(255,255,255,0.08)", minHeight: "80px",
                  }}
                  className="form-input"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={generateCharOptions}
                  disabled={charGenLoading || !charGenPrompt.trim()}
                  style={{
                    padding: "0.6rem 1.25rem", fontSize: "0.85rem", borderRadius: "6px",
                    background: "var(--color-accent)", color: "var(--color-bg)", border: "none",
                    cursor: "pointer", alignSelf: "flex-end",
                    opacity: charGenLoading || !charGenPrompt.trim() ? 0.5 : 1,
                  }}
                  className="touch-target"
                >
                  {charGenLoading ? "Thinking..." : "Generate Concepts"}
                </button>
              </div>
            )}

            {charGenStep === "options" && charGenOptions.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <p style={{ color: "var(--color-text)", fontSize: "0.85rem" }}>Select a concept:</p>
                {charGenOptions.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setCharGenSelected(opt)}
                    style={{
                      background: charGenSelected === opt ? "rgba(200, 151, 58, 0.12)" : "var(--color-surface)",
                      border: `1px solid ${charGenSelected === opt ? "var(--color-accent)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: "6px", padding: "0.75rem", textAlign: "left",
                      width: "100%", cursor: "pointer",
                    }}
                    className="touch-target"
                  >
                    <strong style={{ color: "var(--color-text)" }}>{opt.name}</strong>
                    <span style={{ color: "var(--color-muted)", fontSize: "0.8rem" }}>
                      {" "}— {opt.race} {opt.class} (Level {opt.level || 1})
                    </span>
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.8rem", color: "var(--color-muted)" }}>{opt.briefDescription}</p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={generateCharFromOption}
                  disabled={!charGenSelected || charGenLoading}
                  style={{
                    padding: "0.6rem 1.25rem", fontSize: "0.85rem", borderRadius: "6px",
                    background: "var(--color-accent)", color: "var(--color-bg)", border: "none",
                    cursor: "pointer", alignSelf: "flex-end",
                    opacity: !charGenSelected || charGenLoading ? 0.5 : 1,
                  }}
                  className="touch-target"
                >
                  {charGenLoading ? "Generating..." : "Generate Full Sheet"}
                </button>
              </div>
            )}

            {charGenProgress && (
              <p style={{ color: "var(--color-accent)", fontSize: "0.8rem", margin: "0.5rem 0" }}>{charGenProgress}</p>
            )}
            {charGenError && (
              <p style={{ color: "var(--color-danger)", fontSize: "0.8rem", margin: "0.5rem 0" }}>{charGenError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

//  INLINE STYLES 
const styles = {
  sheet: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "0.5rem",
    padding: "0.5rem",
  },
  stateContainer: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "var(--color-muted)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.6rem 0.85rem",
    borderRadius: "8px",
    flexShrink: 0,
    background: "rgba(0,0,0,0.2)",
  },
  backBtn: {
    padding: "0.45rem 0.75rem",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  headerStats: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  },
  charName: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  charSummary: {
    fontSize: "0.75rem",
    color: "var(--color-text)",
    opacity: 0.8,
  },
  saveBadge: {
    fontSize: "0.65rem",
    fontWeight: 600,
    minWidth: "60px",
    textAlign: "right",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  aiGenerateBtn: {
    padding: "0.45rem 0.75rem",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    borderRadius: "6px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 700,
  },
  savingDot: { color: "var(--color-info)" },
  savedDot: { color: "var(--color-success)" },
  errorDot: { color: "var(--color-danger)" },

  detailsBlock: {
    display: "grid",
    gridTemplateColumns: "1.2fr 1fr",
    gap: "0.75rem",
    padding: "0.75rem",
    borderRadius: "8px",
    flexShrink: 0,
  },
  narrativeSection: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "0.5rem",
    padding: "0.75rem",
    borderRadius: "8px",
    flexShrink: 0,
  },
  narrativeCard: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  narrativeHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  narrativeLabel: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  narrativeTextArea: {
    width: "100%",
    minHeight: "88px",
    resize: "vertical",
    padding: "0.6rem",
    background: "rgba(0,0,0,0.28)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    outline: "none",
  },
  hpWidget: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  hpHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  blockLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  hpValues: {
    fontSize: "0.85rem",
    fontWeight: 700,
  },
  hpBarContainer: {
    height: "6px",
    background: "rgba(0,0,0,0.4)",
    borderRadius: "3px",
    overflow: "hidden",
  },
  hpBar: {
    height: "100%",
    borderRadius: "3px",
    transition: "width 0.3s ease",
  },
  hpControls: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    marginTop: "0.25rem",
  },
  hpBtn: {
    padding: "0.2rem 0.5rem",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  hpInput: {
    width: "42px",
    padding: "0.2rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    textAlign: "center",
    borderRadius: "4px",
    fontSize: "0.8rem",
    outline: "none",
  },

  levelMaxHp: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.35rem",
  },
  miniInputGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.2rem",
    flex: 1,
  },
  miniLabel: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  miniInput: {
    width: "100%",
    maxWidth: "50px",
    padding: "0.35rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-text)",
    textAlign: "center",
    borderRadius: "4px",
    fontSize: "0.85rem",
    outline: "none",
  },
  profBonusBox: {
    width: "100%",
    maxWidth: "50px",
    padding: "0.35rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    color: "var(--color-accent)",
    textAlign: "center",
    borderRadius: "4px",
    fontSize: "0.85rem",
    fontWeight: "bold",
  },

  tabNav: {
    display: "flex",
    justifyContent: "space-around",
    borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
    flexShrink: 0,
  },
  tabBtn: {
    background: "transparent",
    border: "none",
    padding: "0.5rem 0.25rem",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    padding: "0.25rem",
  },

  /* Stats View */
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "0.5rem",
    paddingBottom: "1rem",
  },
  statBox: {
    borderRadius: "8px",
    padding: "0.6rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  },
  statNameLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  statModBtn: {
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    borderRadius: "6px",
    color: "var(--color-accent)",
    fontSize: "1.4rem",
    fontWeight: 700,
    margin: "0.35rem 0",
    width: "54px",
    height: "42px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
  },
  statInput: {
    width: "38px",
    border: "none",
    background: "rgba(255,255,255,0.03)",
    textAlign: "center",
    color: "var(--color-text)",
    fontSize: "0.8rem",
    outline: "none",
    borderRadius: "3px",
  },
  saveProfRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    marginTop: "0.45rem",
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    width: "100%",
    justifyContent: "center",
  },
  saveRollText: {
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: "inherit",
    cursor: "pointer",
  },
  checkbox: {
    width: "13px",
    height: "13px",
    accentColor: "var(--color-accent)",
    cursor: "pointer",
  },

  /* Skills View */
  skillsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
    paddingBottom: "1rem",
  },
  skillRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.55rem 0.75rem",
    borderRadius: "6px",
  },
  skillLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  skillNameText: {
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  skillAbilityTag: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    background: "rgba(255,255,255,0.05)",
    padding: "0.1rem 0.3rem",
    borderRadius: "3px",
  },
  skillRollBtn: {
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    padding: "0.3rem 0.6rem",
    borderRadius: "4px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },

  /* Attacks View */
  attacksContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    paddingBottom: "1rem",
  },
  attackSubHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subTitle: {
    fontSize: "0.95rem",
    color: "var(--color-accent)",
    fontWeight: 600,
  },
  addBtn: {
    padding: "0.35rem 0.65rem",
    background: "transparent",
    border: "1px solid var(--color-accent)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  attacksList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  attackCard: {
    padding: "0.75rem",
    borderRadius: "6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  atkInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  atkName: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-text)",
  },
  atkFormula: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  atkActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  atkRollBtn: {
    padding: "0.35rem 0.65rem",
    background: "rgba(200, 151, 58, 0.1)",
    border: "1px solid var(--color-border)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.75rem",
    fontWeight: 600,
  },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-danger)",
    opacity: 0.7,
    padding: "0.25rem 0.5rem",
    cursor: "pointer",
    fontSize: "0.95rem",
  },

  /* Inventory View */
  inventoryContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    paddingBottom: "1rem",
  },
  inventoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.75rem",
  },
  weightCard: {
    flex: 1,
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  weightLabel: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  weightValue: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    color: "var(--color-text)",
  },
  itemList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  itemCard: {
    padding: "0.6rem 0.75rem",
    borderRadius: "6px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  itemInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  itemName: {
    fontSize: "0.85rem",
    fontWeight: 600,
  },
  itemDetails: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
  },

  /* Subforms */
  subForm: {
    padding: "1rem",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginBottom: "0.5rem",
  },
  subFormTitle: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.25rem",
  },
  subFormRow: {
    display: "flex",
    gap: "0.5rem",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    flex: 1,
  },
  subLabel: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
  },
  subInput: {
    width: "100%",
    padding: "0.45rem",
    fontSize: "0.85rem",
  },
  select: {
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px",
    color: "var(--color-text)",
    padding: "0.45rem",
    fontSize: "0.85rem",
    outline: "none",
  },
  subBtnRow: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    marginTop: "0.25rem",
  },
  subCancelBtn: {
    padding: "0.4rem 0.8rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  subSubmitBtn: {
    padding: "0.4rem 0.8rem",
    background: "var(--color-accent)",
    border: "none",
    borderRadius: "4px",
    color: "var(--color-bg)",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
};
