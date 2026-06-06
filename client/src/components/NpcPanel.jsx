// =============================================================================
// Tablecast  DM NPC Manager & Statblock Editor
// Allows creating custom NPCs, importing from Bestiary, and managing sheets.
// =============================================================================
import React, { useState, useEffect } from "react";
import Autocomplete from "./Autocomplete";

function NpcPanel({ user }) {
  const [npcs, setNpcs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingNpc, setEditingNpc] = useState(null); // When editing or creating new
  const [importQuery, setImportQuery] = useState("");
  const [isNew, setIsNew] = useState(false);

  const authHeaders = { "x-tablecast-user-id": String(user?.id || "") };
  const jsonAuthHeaders = { "Content-Type": "application/json", ...authHeaders };

  useEffect(() => {
    fetchNpcs();
  }, []);

  const fetchNpcs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/npcs", { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setNpcs(data);
      }
    } catch (err) {
      console.error("Failed to fetch NPCs:", err);
    } finally {
      setLoading(false);
    }
  };

  const calculateModifier = (score) => {
    const mod = Math.floor((Number(score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const handleStartCreate = () => {
    setIsNew(true);
    setEditingNpc({
      name: "",
      race: "Humanoid",
      class: "Commoner",
      level: 1,
      hp: 10,
      maxHp: 10,
      ac: 10,
      cr: "0",
      imageUrl: "",
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10,
      inventory: "[]",
      modifiers: "{}",
      actions: JSON.stringify([
        { name: "Club", description: "Melee Weapon Attack: one target.", toHit: 2, damage: "1d4" }
      ]),
    });
  };

  const handleStartEdit = (npc) => {
    setIsNew(false);
    setEditingNpc({
      ...npc,
    });
  };

  const handleBestiaryImport = async (bestiaryItem) => {
    try {
      const res = await fetch(`/api/reference/detail?category=monsters&name=${encodeURIComponent(bestiaryItem.name)}&source=${encodeURIComponent(bestiaryItem.source)}`, {
        headers: authHeaders
      });
      if (!res.ok) throw new Error("Failed to load monster details.");
      
      const details = await res.json();
      
      // Map bestiary stats to NPC model fields
      const hpVal = details.hp?.average || 10;
      const acVal = details.ac?.[0]?.ac || details.ac?.[0] || 10;
      
      // Map actions
      const actionsList = [];
      if (Array.isArray(details.action)) {
        details.action.forEach(act => {
          const entriesStr = Array.isArray(act.entries) ? act.entries.join(" ") : String(act.entries || "");
          
          // Try to extract basic hit and damage
          const hitMatch = entriesStr.match(/\{@hit (\d+)\}/);
          const toHit = hitMatch ? parseInt(hitMatch[1]) : 0;
          const dmgMatch = entriesStr.match(/\{@damage ([^}]+)\}/);
          const damage = dmgMatch ? dmgMatch[1].trim() : "";
          
          actionsList.push({
            name: act.name || "Action",
            description: entriesStr.replace(/\{@[a-z]+ ([^}]+)\}/g, "$1").replace(/\{@hit (\d+)\}/g, "+$1").replace(/\{@damage ([^}]+)\}/g, "$1"),
            toHit,
            damage
          });
        });
      }

      setIsNew(true);
      setEditingNpc({
        name: details.name || "",
        race: Array.isArray(details.type) ? details.type.join(", ") : (details.type?.type || "Monster"),
        class: "Monster",
        level: Math.max(1, Math.floor(hpVal / 6)), // rough level estimation
        hp: hpVal,
        maxHp: hpVal,
        ac: acVal,
        cr: details.cr || "0",
        imageUrl: details.imageUrl || details.tokenUrl || "",
        strength: details.str || 10,
        dexterity: details.dex || 10,
        constitution: details.con || 10,
        intelligence: details.int || 10,
        wisdom: details.wis || 10,
        charisma: details.cha || 10,
        inventory: "[]",
        modifiers: JSON.stringify({
          strength: calculateModifier(details.str || 10),
          dexterity: calculateModifier(details.dex || 10),
          constitution: calculateModifier(details.con || 10),
          intelligence: calculateModifier(details.int || 10),
          wisdom: calculateModifier(details.wis || 10),
          charisma: calculateModifier(details.cha || 10),
        }),
        actions: JSON.stringify(actionsList.length ? actionsList : [
          { name: "Bite", description: "Melee Weapon Attack.", toHit: 2, damage: "1d4" }
        ]),
      });
      setImportQuery("");
    } catch (err) {
      alert(`Import error: ${err.message}`);
    }
  };

  const handleFieldChange = (key, value) => {
    setEditingNpc((prev) => {
      const updated = { ...prev, [key]: value };
      
      // Auto-recalculate modifiers if ability scores changed
      const abilityFields = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
      if (abilityFields.includes(key)) {
        const mods = {};
        abilityFields.forEach(f => {
          mods[f] = calculateModifier(f === key ? value : prev[f]);
        });
        updated.modifiers = JSON.stringify(mods);
      }
      return updated;
    });
  };

  const handleActionChange = (index, key, value) => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray[index][key] = value;
    handleFieldChange("actions", JSON.stringify(actionsArray));
  };

  const handleAddAction = () => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray.push({ name: "New Action", description: "Description", toHit: 0, damage: "" });
    handleFieldChange("actions", JSON.stringify(actionsArray));
  };

  const handleRemoveAction = (index) => {
    let actionsArray = [];
    try {
      actionsArray = JSON.parse(editingNpc.actions);
    } catch (e) {}

    actionsArray.splice(index, 1);
    handleFieldChange("actions", JSON.stringify(actionsArray));
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Are you sure you want to delete the NPC "${name}"?`)) return;

    try {
      const res = await fetch(`/api/npcs/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });

      if (res.ok) {
        setNpcs((prev) => prev.filter((n) => n.id !== id));
      } else {
        const err = await res.json();
        alert(`Failed to delete NPC: ${err.error || "Unknown"}`);
      }
    } catch (err) {
      alert(`Network error deleting NPC: ${err.message}`);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!editingNpc.name.trim()) return;

    const url = isNew ? "/api/npcs" : `/api/npcs/${editingNpc.id}`;
    const method = isNew ? "POST" : "PUT";

    // Prepare numeric values
    const payload = {
      ...editingNpc,
      level: Number(editingNpc.level),
      hp: Number(editingNpc.hp),
      maxHp: Number(editingNpc.maxHp),
      ac: Number(editingNpc.ac),
      strength: Number(editingNpc.strength),
      dexterity: Number(editingNpc.dexterity),
      constitution: Number(editingNpc.constitution),
      intelligence: Number(editingNpc.intelligence),
      wisdom: Number(editingNpc.wisdom),
      charisma: Number(editingNpc.charisma),
    };

    try {
      const res = await fetch(url, {
        method,
        headers: jsonAuthHeaders,
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const saved = await res.json();
        if (isNew) {
          setNpcs((prev) => [...prev, saved]);
        } else {
          setNpcs((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
        }
        setEditingNpc(null);
      } else {
        const err = await res.json();
        alert(`Failed to save NPC: ${err.error || "Unknown"}`);
      }
    } catch (err) {
      alert(`Network error saving NPC: ${err.message}`);
    }
  };

  // Extract parsed actions for editor rendering
  let actionsList = [];
  if (editingNpc) {
    try {
      actionsList = JSON.parse(editingNpc.actions);
    } catch (e) {}
  }

  return (
    <div style={styles.container}>
      {!editingNpc ? (
        <>
          <div style={styles.headerControls}>
            <div style={styles.searchContainer}>
              <Autocomplete
                category="monsters"
                value={importQuery}
                onChange={(val) => setImportQuery(val)}
                onSelect={handleBestiaryImport}
                placeholder="Import from Bestiary (e.g. Goblin, Orc...)"
                className="form-input touch-target"
                inputStyle={styles.importInput}
              />
            </div>
            <button
              onClick={handleStartCreate}
              style={styles.createBtn}
              className="touch-target btn-hover-scale"
            >
              + Create NPC Sheet
            </button>
          </div>

          <h2 style={styles.sectionTitle}>Campaign NPC Database</h2>
          
          {loading ? (
            <p style={styles.infoText}>Loading NPCs...</p>
          ) : npcs.length === 0 ? (
            <div style={styles.emptyState}>
              <p>No NPCs created yet.</p>
              <p style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                Create a custom NPC or search the bestiary above to import one.
              </p>
            </div>
          ) : (
            <div style={styles.npcGrid}>
              {npcs.map((npc) => (
                <div key={npc.id} style={styles.npcCard} className="glass-panel gold-border-glow">
                  <div style={styles.cardHeader}>
                    <div style={styles.avatarContainer}>
                      {npc.imageUrl ? (
                        <img src={npc.imageUrl} alt={npc.name} style={styles.avatarImg} />
                      ) : (
                        <div style={styles.avatarPlaceholder}>👤</div>
                      )}
                    </div>
                    <div style={styles.cardHeaderMeta}>
                      <h3 style={styles.npcName}>{npc.name}</h3>
                      <span style={styles.npcSub}>
                        CR {npc.cr} • {npc.race} {npc.class}
                      </span>
                    </div>
                  </div>
                  
                  <div style={styles.cardStats}>
                    <div><strong>AC:</strong> {npc.ac}</div>
                    <div><strong>HP:</strong> {npc.hp} / {npc.maxHp}</div>
                  </div>

                  <div style={styles.cardActions}>
                    <button
                      onClick={() => handleStartEdit(npc)}
                      style={styles.editBtn}
                      className="touch-target btn-hover-scale"
                    >
                      Edit Statblock
                    </button>
                    <button
                      onClick={() => handleDelete(npc.id, npc.name)}
                      style={styles.deleteBtn}
                      className="touch-target btn-hover-scale"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        /* Statblock Editor Form */
        <form onSubmit={handleSave} style={styles.editorForm} className="glass-panel gold-border-glow fade-in">
          <header style={styles.editorHeader}>
            <h2 style={styles.editorTitle}>
              {isNew ? "Create NPC Statblock" : `Edit NPC: ${editingNpc.name}`}
            </h2>
            <button
              type="button"
              onClick={() => setEditingNpc(null)}
              style={styles.closeBtn}
              className="touch-target"
            >
              Close
            </button>
          </header>

          <div style={styles.editorBody}>
            {/* Identity Group */}
            <div style={styles.editorSection}>
              <h3 style={styles.subSectionTitle}>1. Basic Information</h3>
              <div style={styles.formGrid}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Name *</label>
                  <input
                    type="text"
                    value={editingNpc.name}
                    onChange={(e) => handleFieldChange("name", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    required
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Challenge Rating (CR)</label>
                  <input
                    type="text"
                    value={editingNpc.cr}
                    onChange={(e) => handleFieldChange("cr", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    placeholder="e.g. 1/4, 2, 12"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Race / Type</label>
                  <input
                    type="text"
                    value={editingNpc.race}
                    onChange={(e) => handleFieldChange("race", e.target.value)}
                    style={styles.input}
                    className="form-input"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Class / Role</label>
                  <input
                    type="text"
                    value={editingNpc.class}
                    onChange={(e) => handleFieldChange("class", e.target.value)}
                    style={styles.input}
                    className="form-input"
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Level</label>
                  <input
                    type="number"
                    value={editingNpc.level}
                    onChange={(e) => handleFieldChange("level", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    min={1}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Armor Class (AC)</label>
                  <input
                    type="number"
                    value={editingNpc.ac}
                    onChange={(e) => handleFieldChange("ac", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    min={1}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Current HP</label>
                  <input
                    type="number"
                    value={editingNpc.hp}
                    onChange={(e) => handleFieldChange("hp", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    min={0}
                  />
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Max HP</label>
                  <input
                    type="number"
                    value={editingNpc.maxHp}
                    onChange={(e) => handleFieldChange("maxHp", e.target.value)}
                    style={styles.input}
                    className="form-input"
                    min={1}
                  />
                </div>
              </div>

              <div style={{ ...styles.formGroup, marginTop: "0.75rem" }}>
                <label style={styles.label}>Avatar / Token Image URL (Optional)</label>
                <input
                  type="text"
                  value={editingNpc.imageUrl}
                  onChange={(e) => handleFieldChange("imageUrl", e.target.value)}
                  style={styles.input}
                  className="form-input"
                  placeholder="https://example.com/avatar.png or /uploads/..."
                />
              </div>
            </div>

            {/* Core Stats Group */}
            <div style={styles.editorSection}>
              <h3 style={styles.subSectionTitle}>2. Ability Scores & Modifiers</h3>
              <div style={styles.abilityGrid}>
                {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => (
                  <div key={stat} style={styles.abilityBox} className="glass-panel">
                    <span style={styles.abilityLabel}>{stat.slice(0, 3).toUpperCase()}</span>
                    <input
                      type="number"
                      value={editingNpc[stat]}
                      onChange={(e) => handleFieldChange(stat, e.target.value)}
                      style={styles.abilityInput}
                      min={1}
                      max={30}
                    />
                    <span style={styles.abilityModBadge}>
                      {calculateModifier(editingNpc[stat])}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Group */}
            <div style={styles.editorSection}>
              <div style={styles.actionsHeaderRow}>
                <h3 style={styles.subSectionTitle}>3. Custom Actions & Attacks</h3>
                <button
                  type="button"
                  onClick={handleAddAction}
                  style={styles.addActionBtn}
                  className="touch-target btn-hover-scale"
                >
                  + Add Action
                </button>
              </div>

              {actionsList.length === 0 ? (
                <p style={styles.infoText}>No actions defined. Add at least one action for VTT rolling.</p>
              ) : (
                <div style={styles.actionsEditorList}>
                  {actionsList.map((action, index) => (
                    <div key={index} style={styles.actionItemBox} className="glass-panel">
                      <div style={styles.actionHeaderRow}>
                        <h4 style={styles.actionIdxLabel}>Action #{index + 1}</h4>
                        <button
                          type="button"
                          onClick={() => handleRemoveAction(index)}
                          style={styles.removeActionBtn}
                          className="touch-target"
                        >
                          Remove
                        </button>
                      </div>
                      <div style={styles.actionFieldsGrid}>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Action Name</label>
                          <input
                            type="text"
                            value={action.name}
                            onChange={(e) => handleActionChange(index, "name", e.target.value)}
                            style={styles.input}
                            className="form-input"
                            placeholder="e.g. Longsword, Fire Bolt"
                            required
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>To-Hit Bonus (optional)</label>
                          <input
                            type="number"
                            value={action.toHit || 0}
                            onChange={(e) => handleActionChange(index, "toHit", Number(e.target.value))}
                            style={styles.input}
                            className="form-input"
                            placeholder="e.g. 5"
                          />
                        </div>
                        <div style={styles.formGroup}>
                          <label style={styles.label}>Damage Formula (optional)</label>
                          <input
                            type="text"
                            value={action.damage || ""}
                            onChange={(e) => handleActionChange(index, "damage", e.target.value)}
                            style={styles.input}
                            className="form-input"
                            placeholder="e.g. 1d8+3, 2d6"
                          />
                        </div>
                      </div>
                      <div style={{ ...styles.formGroup, marginTop: "0.5rem" }}>
                        <label style={styles.label}>Description / Effect text</label>
                        <textarea
                          value={action.description || ""}
                          onChange={(e) => handleActionChange(index, "description", e.target.value)}
                          style={styles.textarea}
                          className="form-input"
                          placeholder="e.g. Melee Weapon Attack: +5 to hit, reach 5 ft., one target."
                          rows={2}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <footer style={styles.editorFooter}>
            <button
              type="button"
              onClick={() => setEditingNpc(null)}
              style={styles.cancelBtn}
              className="touch-target"
            >
              Cancel
            </button>
            <button
              type="submit"
              style={styles.saveBtn}
              className="touch-target btn-hover-scale"
            >
              Save Statblock
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: "0.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.25rem",
  },
  headerControls: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "1rem",
  },
  searchContainer: {
    flex: 1,
    minWidth: "260px",
  },
  importInput: {
    padding: "0.6rem 1rem",
    fontSize: "0.85rem",
  },
  createBtn: {
    padding: "0.6rem 1.25rem",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#0f0e17",
    fontWeight: "bold",
    fontSize: "0.85rem",
    cursor: "pointer",
    minHeight: "44px",
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.35rem",
  },
  infoText: {
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    textAlign: "center",
  },
  emptyState: {
    textAlign: "center",
    padding: "2rem",
    color: "var(--color-muted)",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  npcGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "1rem",
  },
  npcCard: {
    borderRadius: "10px",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    background: "rgba(10, 8, 20, 0.4)",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  avatarContainer: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    overflow: "hidden",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(200,151,58,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  avatarPlaceholder: {
    fontSize: "1.5rem",
  },
  cardHeaderMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  npcName: {
    fontSize: "0.95rem",
    color: "var(--color-text)",
    fontWeight: "bold",
    margin: 0,
  },
  npcSub: {
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  cardStats: {
    display: "flex",
    gap: "1.5rem",
    fontSize: "0.8rem",
    color: "var(--color-text)",
    borderTop: "1px solid rgba(255,255,255,0.03)",
    paddingTop: "0.5rem",
  },
  cardActions: {
    display: "flex",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  editBtn: {
    flex: 1,
    padding: "0.45rem",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    background: "rgba(200, 151, 58, 0.08)",
    borderRadius: "6px",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "44px",
  },
  deleteBtn: {
    padding: "0.45rem 0.75rem",
    border: "1px solid rgba(235, 87, 87, 0.35)",
    background: "rgba(235, 87, 87, 0.08)",
    borderRadius: "6px",
    color: "var(--color-danger)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "44px",
  },

  // Editor Styles
  editorForm: {
    borderRadius: "12px",
    padding: "1.5rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    background: "rgba(10, 8, 20, 0.85)",
  },
  editorHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.75rem",
  },
  editorTitle: {
    fontSize: "1.2rem",
    color: "var(--color-accent)",
    fontWeight: 700,
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  editorBody: {
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    maxHeight: "60vh",
    overflowY: "auto",
    paddingRight: "0.25rem",
  },
  editorSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  subSectionTitle: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    paddingBottom: "0.25rem",
  },
  formGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
    gap: "0.75rem",
  },
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  input: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
  },
  textarea: {
    padding: "0.55rem 0.75rem",
    fontSize: "0.85rem",
    resize: "vertical",
  },

  // Ability Grid
  abilityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.5rem",
    "@media (max-width: 600px)": {
      gridTemplateColumns: "repeat(3, 1fr)",
    },
  },
  abilityBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.6rem 0.4rem",
    borderRadius: "8px",
    gap: "0.25rem",
  },
  abilityLabel: {
    fontSize: "0.65rem",
    fontWeight: 700,
    color: "var(--color-muted)",
  },
  abilityInput: {
    width: "45px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.15)",
    textAlign: "center",
    color: "var(--color-text)",
    fontSize: "1rem",
    fontWeight: "bold",
    outline: "none",
    padding: "0.1rem 0",
  },
  abilityModBadge: {
    fontSize: "0.72rem",
    color: "var(--color-accent)",
    background: "rgba(200,151,58,0.1)",
    padding: "0.05rem 0.35rem",
    borderRadius: "4px",
    fontWeight: 600,
  },

  // Actions Editor
  actionsHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  addActionBtn: {
    padding: "0.4rem 0.85rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200,151,58,0.35)",
    borderRadius: "6px",
    color: "var(--color-accent)",
    fontSize: "0.75rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "36px",
  },
  actionsEditorList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
  },
  actionItemBox: {
    borderRadius: "8px",
    padding: "0.85rem",
    background: "rgba(255,255,255,0.01)",
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  actionHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionIdxLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    margin: 0,
  },
  removeActionBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-danger)",
    fontSize: "0.7rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  actionFieldsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 120px 150px",
    gap: "0.75rem",
  },

  // Footer
  editorFooter: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "0.75rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    paddingTop: "0.75rem",
  },
  cancelBtn: {
    padding: "0.6rem 1.25rem",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: "44px",
  },
  saveBtn: {
    padding: "0.6rem 1.5rem",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#0f0e17",
    fontWeight: "bold",
    fontSize: "0.85rem",
    cursor: "pointer",
    minHeight: "44px",
  },
};

export default NpcPanel;
