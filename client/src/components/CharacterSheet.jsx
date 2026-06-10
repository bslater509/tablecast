// =============================================================================
// Tablecast  Character Sheet Component (Phase 4)
// An interactive, auto-calculating D&D 5e Character Sheet.
// Integrates click-to-roll with Socket.io and auto-saves to backend SQLite.
// =============================================================================
import { useState, useEffect } from "react";
import { useSocket } from "../context/SocketContext";
import { useDiceBox } from "../context/DiceBoxContext";
import Autocomplete from "./Autocomplete";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";
import { getJsonAuthHeaders } from "../utils/authHeaders";

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
      const match = results.results[0];
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
        {["stats", "skills", "attacks", "inventory", "spells"].map((tab) => (
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

        {/*  SPELLS TAB  */}
        {sheetTab === "spells" && (
          <div style={styles.spellsContainer} className="fade-in">

            {/* Spellcasting Header */}
            <div style={styles.spellHeaderRow}>
              <div style={styles.spellAbilityGroup}>
                <label style={styles.spellLabel}>Casting Ability</label>
                <select
                  id="spell-ability-select"
                  value={spellcastingAbility}
                  onChange={(e) => handleSpellcastingAbilityChange(e.target.value)}
                  style={styles.spellSelect}
                >
                  <option value="">— None —</option>
                  <option value="intelligence">Intelligence</option>
                  <option value="wisdom">Wisdom</option>
                  <option value="charisma">Charisma</option>
                </select>
              </div>
              <div style={styles.spellStatBox}>
                <span style={styles.spellStatLabel}>Save DC</span>
                <span style={styles.spellStatValue}>{spellSaveDc}</span>
              </div>
              <div style={styles.spellStatBox}>
                <span style={styles.spellStatLabel}>Attack</span>
                <span style={styles.spellStatValue}>{formatMod(spellAttackBonus)}</span>
              </div>
            </div>

            {/* Spell Slots Tracker */}
            {Object.keys(spellSlots).length > 0 && (
              <div style={styles.spellSlotsSection} className="glass-panel">
                <div style={styles.spellSlotsHeader}>
                  <span style={styles.spellSectionTitle}>Spell Slots</span>
                  <button
                    id="reset-slots-btn"
                    onClick={handleResetSlots}
                    style={styles.spellSmallBtn}
                    className="touch-target"
                  >
                    Reset (Long Rest)
                  </button>
                </div>
                <div style={styles.spellSlotsGrid}>
                  {Object.entries(spellSlots)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([level, slot]) => {
                      const used = slot.used || 0;
                      const total = slot.total || 0;
                      const remaining = total - used;
                      return (
                        <div key={level} style={styles.slotRow}>
                          <span style={styles.slotLevelLabel}>Lv {level}</span>
                          <div style={styles.slotDots}>
                            {Array.from({ length: total }, (_, i) => (
                              <button
                                key={i}
                                id={`slot-${level}-${i}`}
                                onClick={() => i < remaining ? handleSlotToggle(level) : handleRecoverSlot(level)}
                                style={{
                                  ...styles.slotDot,
                                  background: i < remaining
                                    ? "var(--color-accent)"
                                    : "rgba(255,255,255,0.08)",
                                }}
                                className="touch-target"
                                title={i < remaining ? `Use level ${level} slot` : `Recover level ${level} slot`}
                              />
                            ))}
                          </div>
                          <span style={styles.slotCount}>
                            {used}/{total}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Add Spell Button */}
            <div style={styles.spellAddRow}>
              <h3 style={styles.spellSectionTitle}>Spells</h3>
              {!showAddSpell && (
                <button
                  id="add-spell-btn"
                  onClick={() => setShowAddSpell(true)}
                  style={styles.addBtn}
                  className="touch-target btn-hover-scale"
                >
                  + Add Spell
                </button>
              )}
            </div>

            {/* Add Spell Form */}
            {showAddSpell && (
              <form
                onSubmit={(e) => { e.preventDefault(); }}
                style={styles.subForm}
                className="glass-panel gold-border-glow"
              >
                <h4 style={styles.subFormTitle}>Add Spell</h4>
                <div style={styles.inputGroup}>
                  <label style={styles.subLabel}>Search Spell</label>
                  <Autocomplete
                    id="spell-search-input"
                    category="spells"
                    placeholder="e.g. Fireball, Cure Wounds..."
                    onSelect={onSpellSelect}
                    className="form-input"
                    inputStyle={styles.subInput}
                  />
                </div>
                <div style={styles.subBtnRow}>
                  <button
                    type="button"
                    onClick={() => setShowAddSpell(false)}
                    style={styles.subCancelBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {/* Spell List Grouped by Level */}
            {spells.length === 0 ? (
              <div style={styles.spellEmpty}>
                No spells yet. Add spells from the 5e reference library above.
              </div>
            ) : (
              <div style={styles.spellList}>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => {
                  const levelSpells = spells.filter((s) => s.level === level);
                  if (levelSpells.length === 0) return null;
                  return (
                    <div key={level} style={styles.spellGroup}>
                      <div style={styles.spellGroupHeader}>
                        <span style={styles.spellGroupTitle}>
                          {level === 0 ? "Cantrips" : `Level ${level}`}
                        </span>
                        <span style={styles.spellGroupCount}>{levelSpells.length}</span>
                      </div>
                      {levelSpells.map((spell, idx) => {
                        const spellIndex = spells.indexOf(spell);
                        const isExpanded = expandedSpell === spellIndex;
                        return (
                          <div key={spell.name + idx} style={styles.spellCard} className="glass-panel">
                            <div
                              style={styles.spellCardHeader}
                              onClick={() => setExpandedSpell(isExpanded ? null : spellIndex)}
                            >
                              <div style={styles.spellCardLeft}>
                                {spell.level > 0 && (
                                  <input
                                    id={`prepared-${spell.name.toLowerCase().replace(/\s/g, "")}`}
                                    type="checkbox"
                                    checked={spell.prepared}
                                    onChange={() => handleTogglePrepared(spellIndex)}
                                    onClick={(e) => e.stopPropagation()}
                                    style={styles.checkbox}
                                    title="Toggle prepared"
                                  />
                                )}
                                <div style={styles.spellCardInfo}>
                                  <span style={styles.spellCardName}>{spell.name}</span>
                                  <span style={styles.spellCardMeta}>
                                    {spell.school}
                                    {spell.concentration && " • Concentration"}
                                    {spell.ritual && " • Ritual"}
                                  </span>
                                </div>
                              </div>
                              <div style={styles.spellCardActions}>
                                <span style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</span>
                                <button
                                  id={`remove-spell-${spell.name.toLowerCase().replace(/\s/g, "")}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveSpell(spellIndex);
                                  }}
                                  style={styles.deleteBtn}
                                  className="touch-target"
                                  title="Remove spell"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>

                            {/* Expanded Spell Detail */}
                            {isExpanded && (
                              <div style={styles.spellDetail}>
                                <div style={styles.spellMetaGrid}>
                                  {spell.castingTime && (
                                    <div style={styles.spellMetaItem}>
                                      <span style={styles.spellMetaLabel}>Casting Time</span>
                                      <span style={styles.spellMetaVal}>{spell.castingTime}</span>
                                    </div>
                                  )}
                                  {spell.range && (
                                    <div style={styles.spellMetaItem}>
                                      <span style={styles.spellMetaLabel}>Range</span>
                                      <span style={styles.spellMetaVal}>{spell.range}</span>
                                    </div>
                                  )}
                                  {spell.components && (
                                    <div style={styles.spellMetaItem}>
                                      <span style={styles.spellMetaLabel}>Components</span>
                                      <span style={styles.spellMetaVal}>{spell.components}</span>
                                    </div>
                                  )}
                                  {spell.duration && (
                                    <div style={styles.spellMetaItem}>
                                      <span style={styles.spellMetaLabel}>Duration</span>
                                      <span style={styles.spellMetaVal}>{spell.duration}</span>
                                    </div>
                                  )}
                                </div>
                                {spell.description && spell.description.length > 0 && (
                                  <div style={styles.spellDescSection}>
                                    <span style={styles.spellDescLabel}>Description</span>
                                    <div style={styles.spellDescText}>
                                      {Array.isArray(spell.description)
                                        ? spell.description.map((entry, ei) => (
                                            <p key={ei} style={{ margin: "0.25rem 0" }}>
                                              {typeof entry === "string" ? entry : entry.name || ""}
                                            </p>
                                          ))
                                        : typeof spell.description === "string"
                                          ? <p style={{ margin: "0.25rem 0" }}>{spell.description}</p>
                                          : null}
                                    </div>
                                  </div>
                                )}
                                {spell.higherLevels && spell.higherLevels.length > 0 && (
                                  <div style={styles.spellDescSection}>
                                    <span style={styles.spellDescLabel}>At Higher Levels</span>
                                    <div style={styles.spellDescText}>
                                      {Array.isArray(spell.higherLevels)
                                        ? spell.higherLevels.map((entry, hi) => (
                                            <p key={hi} style={{ margin: "0.25rem 0" }}>
                                              {typeof entry === "string" ? entry : entry.name || ""}
                                            </p>
                                          ))
                                        : typeof spell.higherLevels === "string"
                                          ? <p style={{ margin: "0.25rem 0" }}>{spell.higherLevels}</p>
                                          : null}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
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

  /* Spells Tab */
  spellsContainer: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    paddingBottom: "1rem",
  },
  spellHeaderRow: {
    display: "flex",
    gap: "0.5rem",
    alignItems: "center",
  },
  spellAbilityGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
    flex: 1,
  },
  spellLabel: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  spellSelect: {
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    padding: "0.45rem",
    fontSize: "0.85rem",
    outline: "none",
  },
  spellStatBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: "rgba(200,151,58,0.08)",
    border: "1px solid rgba(200,151,58,0.2)",
    borderRadius: "6px",
    padding: "0.4rem 0.7rem",
    minWidth: "60px",
  },
  spellStatLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  spellStatValue: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  spellSectionTitle: {
    fontSize: "0.9rem",
    color: "var(--color-accent)",
    fontWeight: 600,
  },
  /* Spell Slots */
  spellSlotsSection: {
    padding: "0.6rem 0.75rem",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  spellSlotsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spellSmallBtn: {
    padding: "0.25rem 0.5rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "var(--color-muted)",
    cursor: "pointer",
    fontSize: "0.65rem",
  },
  spellSlotsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  slotRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  slotLevelLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    minWidth: "28px",
  },
  slotDots: {
    display: "flex",
    gap: "0.3rem",
    flex: 1,
  },
  slotDot: {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    padding: 0,
    transition: "background 0.15s ease",
  },
  slotCount: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    minWidth: "30px",
    textAlign: "right",
  },
  /* Spell Add */
  spellAddRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  /* Spell List */
  spellEmpty: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.8rem",
    padding: "2rem 0",
  },
  spellList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  spellGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  spellGroupHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.25rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  spellGroupTitle: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  spellGroupCount: {
    fontSize: "0.7rem",
    color: "var(--color-muted)",
    background: "rgba(255,255,255,0.05)",
    padding: "0.1rem 0.4rem",
    borderRadius: "8px",
  },
  spellCard: {
    borderRadius: "6px",
    overflow: "hidden",
  },
  spellCardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.6rem 0.75rem",
    cursor: "pointer",
    gap: "0.5rem",
  },
  spellCardLeft: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flex: 1,
    minWidth: 0,
  },
  spellCardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
    minWidth: 0,
  },
  spellCardName: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-text)",
  },
  spellCardMeta: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
  },
  spellCardActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    flexShrink: 0,
  },
  expandIcon: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
  },
  spellDetail: {
    borderTop: "1px solid rgba(255,255,255,0.06)",
    padding: "0.6rem 0.75rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  spellMetaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: "0.35rem",
  },
  spellMetaItem: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
  },
  spellMetaLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  spellMetaVal: {
    fontSize: "0.75rem",
    color: "var(--color-text)",
  },
  spellDescSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  spellDescLabel: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  spellDescText: {
    fontSize: "0.78rem",
    color: "var(--color-text)",
    lineHeight: 1.4,
  },
};
