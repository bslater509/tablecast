// =============================================================================
// Tablecast  Character Sheet Component (Phase 4)
// An interactive, auto-calculating D&D 5e Character Sheet.
// Integrates click-to-roll with Socket.io and auto-saves to backend SQLite.
// =============================================================================
import { useState, useEffect, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { useDiceBox } from "../context/DiceBoxContext";
import { Brain, Swords, Backpack, BookOpen, UserRound, Zap, ChevronLeft } from "lucide-react";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { styles } from "./character/characterStyles";
import { getMod, formatMod, getProficiencyBonus } from "./character/characterUtils";
import AbilityScoresPanel from "./character/AbilityScoresPanel";
import SkillsPanel from "./character/SkillsPanel";
import AttacksPanel from "./character/AttacksPanel";
import InventoryPanel from "./character/InventoryPanel";
import SpellsPanel from "./character/SpellsPanel";

function BioTabs({ character, onUpdate, onError, user, styles }) {
  const [bioTab, setBioTab] = useState("backstory");
  const bioFields = [
    { key: "backstory", label: "Backstory", actions: AI_FIELD_ACTIONS.backstory },
    { key: "personality", label: "Personality", actions: AI_FIELD_ACTIONS.personality },
    { key: "appearance", label: "Appearance", actions: AI_FIELD_ACTIONS.appearance },
  ];
  return (
    <div style={{ ...styles.narrativeCard, gridColumn: "1 / -1" }}>
      <nav style={{ display: "flex", gap: "0.25rem", marginBottom: "0.25rem" }}>
        {bioFields.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setBioTab(key)}
            style={{
              padding: "0.35rem 0.65rem",
              fontSize: "0.75rem",
              fontWeight: bioTab === key ? 700 : 600,
              borderRadius: "6px",
              border: "1px solid transparent",
              background: bioTab === key ? "var(--color-accent-dim)" : "transparent",
              color: bioTab === key ? "var(--color-accent)" : "var(--color-muted)",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
            className="touch-target"
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <AiAssistButton
          fieldName={bioTab}
          actions={bioFields.find((f) => f.key === bioTab)?.actions || []}
          currentText={character?.[bioTab] || ""}
          context={{ entityType: "character", character: { name: character?.name, race: character?.race, class: character?.class, level: character?.level, backstory: character?.backstory, personality: character?.personality, appearance: character?.appearance } }}
          onApply={(reply) => onUpdate(bioTab, reply)}
          onError={onError}
          user={user}
        />
      </nav>
      <textarea
        value={character?.[bioTab] || ""}
        onChange={(e) => onUpdate(bioTab, e.target.value)}
        placeholder={`${bioFields.find((f) => f.key === bioTab)?.label}...`}
        style={styles.narrativeTextArea}
        className="form-input"
        rows={4}
      />
    </div>
  );
}

export default function CharacterSheet({ characterId, onBack, user }) {
  const { socket } = useSocket();
  const { rollDice } = useDiceBox();
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
  
  // Debounce ref for save-to-server to avoid flood on keystrokes
  const saveTimerRef = useRef(null);
  const charRef = useRef(null);

  // Keep charRef synced with the latest character state
  useEffect(() => {
    charRef.current = character;
  }, [character]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

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

  // Keep a reference to the active layout tab on the sheet (Stats, Skills, Attacks, Inventory, Spells)
  const [sheetTab, setSheetTab] = useState("stats");
  
  // Spellcasting state
  const [spellSlots, setSpellSlots] = useState({});
  const [spells, setSpells] = useState([]);
  const [spellcastingAbility, setSpellcastingAbility] = useState("");
  const [spellSaveDc, setSpellSaveDc] = useState(10);
  const [spellAttackBonus, setSpellAttackBonus] = useState(5);
  
  // Spell add form
  const [showAddSpell, setShowAddSpell] = useState(false);
  
  // Expanded spell card tracking
  const [expandedSpell, setExpandedSpell] = useState(null);

  // Fetch character details from backend on mount/ID change
  useEffect(() => {
    async function loadCharacter() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/characters/${characterId}`, {
          headers: getJsonAuthHeaders(user),
        });
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

        // Parse spell JSON blobs
        let parsedSpellSlots = {};
        let parsedSpells = [];
        try {
          parsedSpellSlots = JSON.parse(data.spellSlots || "{}");
        } catch (e) {}
        try {
          parsedSpells = JSON.parse(data.spells || "[]");
        } catch (e) {}
        setSpellSlots(parsedSpellSlots);
        setSpells(parsedSpells);
        setSpellcastingAbility(data.spellcastingAbility || "");
        setSpellSaveDc(data.spellSaveDc || 10);
        setSpellAttackBonus(data.spellAttackBonus || 5);

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

  // Recalculate spell save DC and attack bonus when level or casting ability changes
  useEffect(() => {
    recalcSpellStats(spellcastingAbility);
  }, [character?.level, character?.strength, character?.dexterity, character?.constitution, character?.intelligence, character?.wisdom, character?.charisma, spellcastingAbility]);

  // Default weapon templates if character has none
  function getDefaultAttacks() {
    return [
      { name: "Greatsword", ability: "strength", dice: "2d6", proficient: true },
      { name: "Longbow", ability: "dexterity", dice: "1d8", proficient: true },
      { name: "Dagger", ability: "dexterity", dice: "1d4", proficient: true },
    ];
  }

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
        spellSlots: JSON.stringify(spellSlots),
        spells: JSON.stringify(spells),
        spellcastingAbility: spellcastingAbility,
        spellSaveDc: Number(spellSaveDc),
        spellAttackBonus: Number(spellAttackBonus),
        backstory: updatedChar.backstory || "",
        personality: updatedChar.personality || "",
        appearance: updatedChar.appearance || "",
      };

      const res = await fetch(`/api/characters/${updatedChar.id}`, {
        method: "PUT",
        headers: getJsonAuthHeaders(user),
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

  // Trigger state update and debounced save (500ms debounce avoids flood on keystrokes)
  function updateCharacterState(updater) {
    const next = updater(character);
    setCharacter(next);
    // Reset and re-arm debounce timer — only the last change triggers a save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveToServer(next);
    }, 500);
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
        headers: getJsonAuthHeaders(user),
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
        headers: getJsonAuthHeaders(user),
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

  // Parse a dice expression like "2d6" or "1d10"
  function parseDiceExpression(expr) {
    const match = expr.trim().toLowerCase().match(/^(\d+)d(\d+)$/);
    if (match) {
      return { count: parseInt(match[1]), sides: parseInt(match[2]) };
    }
    return { count: 1, sides: 8 }; // Fallback
  }

  async function extractD20FromPhysics(results) {
    // Extract first d20 value from physics groups
    for (const group of results.groups) {
      if (group.sides === 20 && group.rolls?.length > 0) {
        return group.rolls[0].value;
      }
    }
    // Fallback: use the first roll if no d20 found
    return results.allRolls[0] || 1;
  }

  // Roll an Ability Check (STR, DEX, etc.)
  async function handleAbilityRoll(statName, score) {
    const modifier = getMod(score);
    let d20, total;
    try {
      const results = await rollDice(["1d20"], {
        theme: user?.diceTheme || "default",
        color: user?.diceColor || "#7c3aed",
      });
      d20 = await extractD20FromPhysics(results);
      total = d20 + modifier;
    } catch (err) {
      console.error("[CharacterSheet] rollDice failed:", err);
      return;
    }
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
          status: "rolled",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
        },
      });
    }
  }

  // Roll a Saving Throw
  async function handleSavingThrowRoll(statName, score) {
    const modifier = getMod(score);
    const profBonus = getProficiencyBonus(character.level);
    const isProf = character.modifiers.saveProficiencies.includes(statName);
    const finalMod = modifier + (isProf ? profBonus : 0);
    let d20, total;
    try {
      const results = await rollDice(["1d20"], {
        theme: user?.diceTheme || "default",
        color: user?.diceColor || "#7c3aed",
      });
      d20 = await extractD20FromPhysics(results);
      total = d20 + finalMod;
    } catch (err) {
      console.error("[CharacterSheet] rollDice failed:", err);
      return;
    }
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
          status: "rolled",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
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
  async function handleSkillRoll(skill) {
    const baseStat = character[skill.ability];
    const modifier = getMod(baseStat);
    const profBonus = getProficiencyBonus(character.level);
    const isProf = character.modifiers.proficiencies.includes(skill.name);
    const finalMod = modifier + (isProf ? profBonus : 0);
    let d20, total;
    try {
      const results = await rollDice(["1d20"], {
        theme: user?.diceTheme || "default",
        color: user?.diceColor || "#7c3aed",
      });
      d20 = await extractD20FromPhysics(results);
      total = d20 + finalMod;
    } catch (err) {
      console.error("[CharacterSheet] rollDice failed:", err);
      return;
    }

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
          status: "rolled",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
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
  async function handleAttackRoll(atk) {
    const abilityScore = character[atk.ability];
    const abilityMod = getMod(abilityScore);
    const profBonus = getProficiencyBonus(character.level);
    
    // To Hit Math
    const toHitMod = abilityMod + (atk.proficient ? profBonus : 0);
    const { count, sides } = parseDiceExpression(atk.dice);
    let toHitD20, dmgRolls;
    try {
      // Roll to-hit and damage dice together in one physics batch
      const notation = ["1d20"];
      // Only add damage dice if sides > 0 and count > 0
      if (sides > 0 && count > 0) {
        notation.push(`${count}d${sides}`);
      }
      const results = await rollDice(notation, {
        theme: user?.diceTheme || "default",
        color: user?.diceColor || "#7c3aed",
      });
      toHitD20 = await extractD20FromPhysics(results);
      // Extract damage rolls: all non-d20 rolls
      dmgRolls = [];
      for (const group of results.groups) {
        if (group.sides !== 20 && group.rolls) {
          for (const die of group.rolls) {
            dmgRolls.push(die.value);
          }
        }
      }
    } catch (err) {
      console.error("[CharacterSheet] rollDice failed:", err);
      return;
    }

    const toHitTotal = toHitD20 + toHitMod;
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
          status: "rolled",
          diceTheme: user?.diceTheme || "default",
          diceColor: user?.diceColor || "#7c3aed",
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

  // ─── SPELLCASTING HANDLERS ───────────────────────────────────────────────

  // Recalculate spell save DC and attack bonus when ability or level changes
  function recalcSpellStats(ability) {
    const abil = ability || spellcastingAbility;
    if (!abil || !character) {
      setSpellSaveDc(10);
      setSpellAttackBonus(5);
      return;
    }
    const mod = getMod(character[abil] || 10);
    const prof = getProficiencyBonus(character.level);
    setSpellSaveDc(8 + mod + prof);
    setSpellAttackBonus(mod + prof);
  }

  // Handle spellcasting ability dropdown change
  function handleSpellcastingAbilityChange(newAbility) {
    setSpellcastingAbility(newAbility);
    recalcSpellStats(newAbility);
    // Trigger save
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Toggle a spell slot as used/recovered
  function handleSlotToggle(level) {
    const slotKey = String(level);
    const current = spellSlots[slotKey];
    if (!current) return;
    const updated = { ...spellSlots };
    if (current.used < current.total) {
      // Use a slot
      updated[slotKey] = { ...current, used: current.used + 1 };
    }
    setSpellSlots(updated);
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Recover a used spell slot
  function handleRecoverSlot(level) {
    const slotKey = String(level);
    const current = spellSlots[slotKey];
    if (!current || current.used <= 0) return;
    const updated = { ...spellSlots };
    updated[slotKey] = { ...current, used: Math.max(0, current.used - 1) };
    setSpellSlots(updated);
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Reset all spell slots (long rest)
  function handleResetSlots() {
    const reset = {};
    for (const [level, slot] of Object.entries(spellSlots)) {
      reset[level] = { total: slot.total, used: 0 };
    }
    setSpellSlots(reset);
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Add spell to the character's spell list
  function handleAddSpell(spellData) {
    const newSpell = {
      name: spellData.name,
      level: spellData.level !== undefined ? spellData.level : 0,
      school: spellData.school || "Magic",
      prepared: spellData.level === 0, // Cantrips always prepared
      ritual: spellData.ritual || false,
      concentration: spellData.concentration || false,
      castingTime: spellData.time?.[0]?.number + " " + spellData.time?.[0]?.unit || "",
      range: spellData.range?.distance?.amount + " " + spellData.range?.distance?.type || spellData.range?.type || "",
      components: spellData.components?.required?.join(", ") || "",
      duration: spellData.duration?.[0]?.duration?.amount + " " + spellData.duration?.[0]?.duration?.type || spellData.duration?.[0]?.type || "",
      description: spellData.entries || [],
      higherLevels: spellData.entriesHigherLevel?.[0]?.entries || [],
      source: spellData.source || "",
    };
    const updatedSpells = [...spells, newSpell];
    setSpells(updatedSpells);
    updateCharacterState((prev) => ({ ...prev }));
    setShowAddSpell(false);
  }

  // Remove spell from the character's spell list
  function handleRemoveSpell(index) {
    const updated = spells.filter((_, i) => i !== index);
    setSpells(updated);
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Toggle prepared status of a spell
  function handleTogglePrepared(index) {
    const updated = spells.map((s, i) =>
      i === index ? { ...s, prepared: !s.prepared } : s
    );
    setSpells(updated);
    updateCharacterState((prev) => ({ ...prev }));
  }

  // Fetch spell detail from reference API
  async function fetchSpellDetail(spellName) {
    try {
      const res = await fetch(`/api/reference/search?category=spells&q=${encodeURIComponent(spellName)}&limit=5`);
      if (!res.ok) return null;
      const results = await res.json();
      if (!results?.length) return null;
      // Get the detail for the first match
      const match = results[0];
      const detailRes = await fetch(`/api/reference/detail?category=spells&source=${encodeURIComponent(match.source || "")}&name=${encodeURIComponent(match.name)}`);
      if (!detailRes.ok) return match;
      const detail = await detailRes.json();
      return detail || match;
    } catch (e) {
      console.error("[CharacterSheet] fetchSpellDetail error:", e);
      return null;
    }
  }

  // Handle autocomplete spell selection
  async function onSpellSelect(spellItem) {
    const detail = await fetchSpellDetail(spellItem.name);
    if (detail) {
      handleAddSpell(detail);
    } else {
      // Fallback: add what we have from search results
      handleAddSpell(spellItem);
    }
  }

  // Check state loading / error
  if (loading) return <div style={styles.stateContainer}><p>Consulting character scrolls</p></div>;
  if (error) return <div style={styles.stateContainer}><p style={{ color: "var(--color-danger)" }}> Error: {error}</p></div>;
  if (!character) return null;

  return (
    <div style={styles.sheet} className="fade-in">
      {/* Top Banner Header */}
      <header style={styles.header} className="glass-panel gold-border-glow">
        <div style={styles.headerLeft}>
          {onBack && (
            <button onClick={onBack} style={styles.backBtn} className="touch-target btn-hover-scale">
              <ChevronLeft size={16} />
            </button>
          )}
          <div style={styles.portrait}>
            {character.tokenImage ? (
              <img src={character.tokenImage} alt="" style={styles.portraitImg} />
            ) : (
              <UserRound size={24} />
            )}
          </div>
          <div style={styles.headerStats}>
            <h2 style={styles.charName}>{character.name}</h2>
            <span style={styles.charSummary}>
              Lvl {character.level}  {character.race} {character.class}
            </span>
          </div>
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
        <BioTabs
          character={character}
          onUpdate={(field, value) => { setCharacter((prev) => ({ ...prev, [field]: value })); handleFieldChange(field, value); }}
          onError={setError}
          user={user}
          styles={styles}
        />
      </section>

      {/* Internal Tabs (Stats, Skills, Attacks, Inventory) */}
      <nav style={styles.tabNav}>
        {[
          { key: "stats", label: "Stats", Icon: Brain },
          { key: "skills", label: "Skills", Icon: Zap },
          { key: "attacks", label: "Attacks", Icon: Swords },
          { key: "inventory", label: "Items", Icon: Backpack },
          { key: "spells", label: "Spells", Icon: BookOpen },
        ].map(({ key, label, Icon }) => (
          <button
            key={key}
            id={`sheet-tab-${key}`}
            onClick={() => setSheetTab(key)}
            style={{
              ...styles.tabBtn,
              ...(sheetTab === key ? styles.tabBtnActive : {}),
            }}
            className="touch-target"
          >
            <Icon size={16} style={styles.tabIcon} />
            {label}
          </button>
        ))}
      </nav>

      {/* Sheet Content Scroll Area */}
      <div style={styles.scrollArea}>
        
        {/*  STATS TAB  */}
        {sheetTab === "stats" && (
          <AbilityScoresPanel
            character={character}
            onAbilityRoll={handleAbilityRoll}
            onStatChange={handleStatChange}
            onToggleSave={toggleSaveProficiency}
            onSaveRoll={handleSavingThrowRoll}
          />
        )}

        {/*  SKILLS TAB  */}
        {sheetTab === "skills" && (
          <SkillsPanel
            character={character}
            onSkillRoll={handleSkillRoll}
            onToggleProficiency={toggleSkillProficiency}
          />
        )}

        {/*  ATTACKS TAB  */}
        {sheetTab === "attacks" && (
          <AttacksPanel
            character={character}
            showAddAttack={showAddAttack}
            atkName={atkName}
            atkAbility={atkAbility}
            atkDice={atkDice}
            atkProficient={atkProficient}
            onToggleForm={setShowAddAttack}
            onSetAtkName={setAtkName}
            onSetAtkAbility={setAtkAbility}
            onSetAtkDice={setAtkDice}
            onSetAtkProficient={setAtkProficient}
            onAddAttack={handleAddAttack}
            onAttackRoll={handleAttackRoll}
            onDeleteAttack={handleDeleteAttack}
          />
        )}

        {/*  INVENTORY TAB  */}
        {sheetTab === "inventory" && (
          <InventoryPanel
            character={character}
            showAddItem={showAddItem}
            itemName={itemName}
            itemQty={itemQty}
            itemWeight={itemWeight}
            totalWeight={totalWeight}
            onToggleForm={setShowAddItem}
            onSetItemName={setItemName}
            onSetItemQty={setItemQty}
            onSetItemWeight={setItemWeight}
            onAddItem={handleAddItem}
            onDeleteItem={handleDeleteItem}
          />
        )}

        {/*  SPELLS TAB  */}
        {sheetTab === "spells" && (
          <SpellsPanel
            character={character}
            spellSlots={spellSlots}
            spells={spells}
            spellcastingAbility={spellcastingAbility}
            spellSaveDc={spellSaveDc}
            spellAttackBonus={spellAttackBonus}
            showAddSpell={showAddSpell}
            expandedSpell={expandedSpell}
            onCastingAbilityChange={handleSpellcastingAbilityChange}
            onSlotToggle={handleSlotToggle}
            onRecoverSlot={handleRecoverSlot}
            onResetSlots={handleResetSlots}
            onToggleAddSpell={setShowAddSpell}
            onSpellSelect={onSpellSelect}
            onTogglePrepared={handleTogglePrepared}
            onRemoveSpell={handleRemoveSpell}
            onToggleExpand={setExpandedSpell}
          />
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

// styles have been moved to ./character/characterStyles.js
