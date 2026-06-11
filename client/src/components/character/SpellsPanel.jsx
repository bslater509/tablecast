// =============================================================================
// Tablecast — Spells Panel (Enhanced)
// Spellcasting ability config, spell slot tracker, spell library manager,
// spell casting with slot consumption, damage/attack rolling, filtering/sorting
// =============================================================================
import { useState, useEffect } from "react";
import { Trash2, Search } from "lucide-react";
import { formatMod } from "./characterUtils";
import { styles } from "./characterStyles";
import Autocomplete from "../Autocomplete";

const SPELL_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

// School badge colors from features.md §2.4
const SCHOOL_COLORS = {
  Abjuration: "#4a90d9",
  Conjuration: "#e8a838",
  Divination: "#8e6ccf",
  Enchantment: "#c47eb3",
  Evocation: "#d94a4a",
  Illusion: "#c45ec4",
  Necromancy: "#5a8a5a",
  Transmutation: "#5ab4b4",
};

const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "cantrips", label: "Cantrips" },
  { key: "prepared", label: "Prepared" },
  { key: "concentration", label: "Concentration" },
  { key: "ritual", label: "Ritual" },
];

export default function SpellsPanel({
  character,
  spellSlots,
  spells,
  spellcastingAbility,
  spellSaveDc,
  spellAttackBonus,
  showAddSpell,
  expandedSpell,
  onCastingAbilityChange,
  onSlotToggle,
  onRecoverSlot,
  onResetSlots,
  onToggleAddSpell,
  onSpellSelect,
  onTogglePrepared,
  onRemoveSpell,
  onToggleExpand,
  onCastSpell,
  onSpellDamage,
  onSpellAttack,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("level");
  const [filterTab, setFilterTab] = useState("all");
  const [castLevel, setCastLevel] = useState(null);
  const [toast, setToast] = useState(null);

  const preparedCount = spells.filter((s) => s.prepared || s.level === 0).length;

  // Auto-dismiss toast after 2.5s
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  function showToastMessage(message, type = "success") {
    setToast({ message, type });
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  function getFilteredSpells() {
    return spells.filter((spell) => {
      // Tab filter
      if (filterTab === "cantrips" && spell.level !== 0) return false;
      if (filterTab === "prepared" && spell.level !== 0 && !spell.prepared) return false;
      if (filterTab === "concentration" && !spell.concentration) return false;
      if (filterTab === "ritual" && !spell.ritual) return false;
      // Search filter
      if (searchQuery && !spell.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }

  // ── Sorting ────────────────────────────────────────────────────────────────
  function getSortedSpells() {
    const filtered = getFilteredSpells();
    return [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "school") {
        const schoolA = a.school || "";
        const schoolB = b.school || "";
        const cmp = schoolA.localeCompare(schoolB);
        if (cmp !== 0) return cmp;
        return a.name.localeCompare(b.name);
      }
      // Default: by level ascending, then by name
      if (a.level !== b.level) return a.level - b.level;
      return a.name.localeCompare(b.name);
    });
  }

  const sortedSpells = getSortedSpells();

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Group sorted spells by level for the grouped display
  function getGroupedSpells() {
    const groups = {};
    for (const spell of sortedSpells) {
      const level = spell.level;
      if (!groups[level]) groups[level] = [];
      groups[level].push(spell);
    }
    return groups;
  }

  // Get available slot levels for upcast dropdown (slots >= spell.level that have remaining uses)
  function getAvailableSlotLevels(spellLevel) {
    return Object.entries(spellSlots)
      .map(([lvl, slot]) => ({ level: Number(lvl), available: (slot.total || 0) - (slot.used || 0) }))
      .filter((s) => s.level >= spellLevel && s.available > 0)
      .map((s) => s.level)
      .sort((a, b) => a - b);
  }

  // Get school color with fallback
  function getSchoolColor(school) {
    return SCHOOL_COLORS[school] || "#888";
  }

  // ── Cast / Damage / Attack Handlers ────────────────────────────────────────

  async function handleCast(spell, spellIndex) {
    const useLevel = castLevel !== null ? castLevel : spell.level;
    if (spell.level === 0) {
      // Cantrip — no slot consumption
      if (onCastSpell) {
        await onCastSpell(spell, 0, true);
      }
      showToastMessage(`Cast ${spell.name} (cantrip) ✨`);
    } else {
      if (!onCastSpell) return;
      const success = await onCastSpell(spellIndex, useLevel);
      if (success) {
        showToastMessage(`Cast ${spell.name} at level ${useLevel} ✨`);
      } else {
        showToastMessage(`No available level ${useLevel} slot!`, "error");
      }
    }
  }

  async function handleDamage(spell) {
    if (!onSpellDamage) return;
    const useLevel = castLevel !== null ? castLevel : spell.level;
    await onSpellDamage(spell, useLevel);
    showToastMessage(`Rolled damage for ${spell.name} 🎲`);
  }

  async function handleAttack(spell) {
    if (!onSpellAttack) return;
    await onSpellAttack(spell);
    showToastMessage(`Rolled attack for ${spell.name} 🎯`);
  }

  const groupedSpells = getGroupedSpells();

  return (
    <div style={styles.spellsContainer} className="fade-in">
      {/* Spellcasting Header */}
      <div style={styles.spellHeaderRow}>
        <div style={styles.spellAbilityGroup}>
          <label style={styles.spellLabel}>Casting Ability</label>
          <select
            id="spell-ability-select"
            value={spellcastingAbility}
            onChange={(e) => onCastingAbilityChange(e.target.value)}
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
              onClick={onResetSlots}
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
                          onClick={() => (i < remaining ? onSlotToggle(level) : onRecoverSlot(level))}
                          style={{
                            ...styles.slotDot,
                            background: i < remaining
                              ? "var(--color-accent)"
                              : "rgba(255,255,255,0.08)",
                          }}
                          className="touch-target"
                          title={i < remaining
                            ? `Use level ${level} slot`
                            : `Recover level ${level} slot`}
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

      {/* Enhanced Filter Row: Tabs + Search + Sort */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {/* Filter Tabs */}
        <div style={styles.filterTabRow}>
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilterTab(tab.key)}
              style={{
                ...styles.filterTab,
                ...(filterTab === tab.key ? styles.filterTabActive : {}),
              }}
              className="touch-target"
            >
              {tab.label}
              {tab.key === "all" && ` (${spells.length})`}
              {tab.key === "prepared" && ` (${preparedCount})`}
            </button>
          ))}
        </div>

        {/* Search + Sort + Add Spell Row */}
        <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <Search
              size={12}
              style={{
                position: "absolute",
                left: "0.4rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--color-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              type="search"
              placeholder="Search spells..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                ...styles.spellSearchInput,
                paddingLeft: "1.3rem",
              }}
              className="form-input"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={styles.sortDropdown}
          >
            <option value="level">By Level</option>
            <option value="name">A–Z</option>
            <option value="school">By School</option>
          </select>
          {!showAddSpell && (
            <button
              id="add-spell-btn"
              onClick={() => onToggleAddSpell(true)}
              style={styles.addBtn}
              className="touch-target btn-hover-scale"
            >
              + Add Spell
            </button>
          )}
        </div>
      </div>

      {/* Add Spell Form */}
      {showAddSpell && (
        <div
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
              onClick={() => onToggleAddSpell(false)}
              style={styles.subCancelBtn}
              className="touch-target btn-hover-scale"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Spell List — Grouped by Level */}
      {sortedSpells.length === 0 ? (
        <div style={styles.spellEmpty}>
          {spells.length === 0
            ? "No spells yet. Add spells from the 5e reference library above."
            : "No spells match your filters."}
        </div>
      ) : (
        <div style={styles.spellList}>
          {/* When sorting by name or school, show flat list instead of level groups */}
          {sortBy !== "level" ? (
            sortedSpells.map((spell, idx) => {
              const spellIndex = spells.indexOf(spell);
              const isExpanded = expandedSpell === spellIndex;
              return renderSpellCard(spell, spellIndex, isExpanded);
            })
          ) : (
            SPELL_LEVELS.map((level) => {
              const levelSpells = groupedSpells[level];
              if (!levelSpells || levelSpells.length === 0) return null;
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
                    return renderSpellCard(spell, spellIndex, isExpanded);
                  })}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          style={{
            ...styles.toastContainer,
            ...(toast.type === "success" ? styles.toastSuccess : styles.toastError),
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );

  // ── Spell Card Renderer ──────────────────────────────────────────────────
  function renderSpellCard(spell, spellIndex, isExpanded) {
    const schoolColor = getSchoolColor(spell.school);
    const isCantrip = spell.level === 0;
    const availableLevels = isCantrip ? [] : getAvailableSlotLevels(spell.level);
    const defaultCastLevel = castLevel !== null ? castLevel : spell.level;

    // Reset castLevel when spell changes
    function handleToggleExpand() {
      onToggleExpand(isExpanded ? null : spellIndex);
      setCastLevel(null);
    }

    return (
      <div key={spell.name + spellIndex} style={styles.spellCard} className="glass-panel">
        {/* Card Header */}
        <div
          style={styles.spellCardHeader}
          onClick={handleToggleExpand}
        >
          <div style={styles.spellCardLeft}>
            {!isCantrip && (
              <input
                id={`prepared-${spell.name.toLowerCase().replace(/\s/g, "")}`}
                type="checkbox"
                checked={spell.prepared}
                onChange={() => onTogglePrepared(spellIndex)}
                onClick={(e) => e.stopPropagation()}
                style={styles.checkbox}
                title="Toggle prepared"
              />
            )}
            <div style={styles.spellCardInfo}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
                <span style={styles.spellCardName}>{spell.name}</span>
                {spell.school && (
                  <span
                    style={{
                      ...styles.schoolBadge,
                      background: schoolColor,
                    }}
                  >
                    {spell.school.slice(0, 4)}
                  </span>
                )}
              </div>
              <span style={styles.spellCardMeta}>
                {!isCantrip && `Lv ${spell.level} · `}
                {spell.school}
                {spell.concentration && " · Concentration"}
                {spell.ritual && " · Ritual"}
              </span>
            </div>
          </div>
          <div style={styles.spellCardActions}>
            <span style={styles.expandIcon}>{isExpanded ? "▲" : "▼"}</span>
            <button
              id={`remove-spell-${spell.name.toLowerCase().replace(/\s/g, "")}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemoveSpell(spellIndex);
              }}
              style={styles.deleteBtn}
              className="touch-target btn-hover-scale"
              title="Remove spell"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* Expanded Spell Detail */}
        {isExpanded && (
          <div style={styles.spellDetail}>
            {/* Meta Grid */}
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

            {/* Description */}
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

            {/* Higher Levels */}
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

            {/* Cast Actions Row */}
            <div style={styles.castActionsRow}>
              {/* Cast Spell — non-cantrip with slot level dropdown */}
              {!isCantrip && onCastSpell && (
                <>
                  <select
                    value={defaultCastLevel}
                    onChange={(e) => setCastLevel(Number(e.target.value))}
                    style={styles.castLevelDropdown}
                    title="Select spell slot level to use"
                  >
                    {availableLevels.length > 0 ? (
                      availableLevels.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          Lv {lvl}
                        </option>
                      ))
                    ) : (
                      <option value={spell.level}>Lv {spell.level}</option>
                    )}
                  </select>
                  <button
                    onClick={() => handleCast(spell, spellIndex)}
                    style={{
                      ...styles.castBtn,
                      ...(availableLevels.length === 0 ? styles.castBtnDisabled : {}),
                    }}
                    disabled={availableLevels.length === 0}
                    className="touch-target btn-hover-scale"
                    title={
                      availableLevels.length === 0
                        ? "No available spell slots at or above this spell's level"
                        : `Cast ${spell.name} at level ${defaultCastLevel}`
                    }
                  >
                    Cast Spell
                  </button>
                </>
              )}

              {/* Cantrip cast — no slot needed */}
              {isCantrip && onCastSpell && (
                <button
                  onClick={() => handleCast(spell, spellIndex)}
                  style={styles.castBtn}
                  className="touch-target btn-hover-scale"
                >
                  Cast
                </button>
              )}

              {/* Roll Damage */}
              {onSpellDamage && (
                <button
                  onClick={() => handleDamage(spell)}
                  style={styles.damageBtn}
                  className="touch-target btn-hover-scale"
                  title="Roll damage dice for this spell"
                >
                  Roll Damage
                </button>
              )}

              {/* Roll Attack */}
              {onSpellAttack && (
                <button
                  onClick={() => handleAttack(spell)}
                  style={styles.attackBtn}
                  className="touch-target btn-hover-scale"
                  title="Roll spell attack"
                >
                  Roll Attack
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
}
