// =============================================================================
// Tablecast — Homebrew Content Manager (DM Only)
// §4.3: Manage custom races, classes, feats, spells, magic items, and monsters.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import {
  Beaker,
  Plus,
  Search,
  Download,
  Upload,
  Edit3,
  Trash2,
  X,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  FileJson,
  Copy,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getAuthHeaders, getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/homebrew";

const TYPES = ["RACE", "CLASS", "FEAT", "SPELL", "MAGIC_ITEM", "MONSTER"];
const TYPE_COLORS = {
  RACE: "#4a9eff",
  CLASS: "#ff6b6b",
  FEAT: "#ffd93d",
  SPELL: "#6bff6b",
  MAGIC_ITEM: "#ff9ff3",
  MONSTER: "#ff6b35",
};

const EMPTY_CONTENT = {
  RACE: { abilityBonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, speed: 30, size: "Medium", traits: [], languages: [] },
  CLASS: { hitDie: "d8", proficiencies: { armor: [], weapons: [], tools: [], saves: [] }, spellcastingAbility: "", features: [] },
  FEAT: { prerequisites: [], description: "", abilityBonus: {} },
  SPELL: { level: 1, school: "Evocation", castingTime: "1 action", range: "Self", components: "V, S, M", duration: "Instant", description: "", higherLevels: "", damage: "", saveType: "", attackType: "" },
  MAGIC_ITEM: { type: "WONDROUS", rarity: "UNCOMMON", attunement: false, description: "", properties: [] },
  MONSTER: { hp: 10, ac: 10, cr: "0", strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10, actions: [], description: "" },
};

function HomebrewManager({ user }) {
  const { addToast } = useToast();
  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = getJsonAuthHeaders(user);

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [formData, setFormData] = useState({ type: "SPELL", name: "", source: "", version: "1.0.0", content: {}, tags: [], isActive: true });
  const [tagInput, setTagInput] = useState("");

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (typeFilter) params.set("type", typeFilter);
      const res = await fetch(`${API}?${params}`, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to fetch homebrew entries");
      const data = await res.json();
      setEntries(data);
    } catch (err) {
      addToast?.({ id: "hb-fetch-err", message: err.message, type: "error" });
    } finally {
      setLoading(false);
    }
  }, [typeFilter, authHeaders, addToast]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const filteredEntries = entries.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return e.name.toLowerCase().includes(q) || e.source.toLowerCase().includes(q) || (e.tags || []).some((t) => t.toLowerCase().includes(q));
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingEntry(null);
    setFormData({ type: "SPELL", name: "", source: "", version: "1.0.0", content: {}, tags: [], isActive: true });
    setTagInput("");
  };

  const openEditForm = (entry) => {
    setEditingEntry(entry);
    setFormData({
      type: entry.type,
      name: entry.name,
      source: entry.source || "",
      version: entry.version || "1.0.0",
      content: entry.content || {},
      tags: entry.tags || [],
      isActive: entry.isActive !== false,
    });
    setShowForm(true);
  };

  const handleTypeChange = (type) => {
    setFormData((prev) => ({
      ...prev,
      type,
      content: EMPTY_CONTENT[type] || {},
    }));
  };

  const handleContentChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      content: { ...prev.content, [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      addToast?.({ id: "hb-name-err", message: "Name is required.", type: "error" });
      return;
    }
    try {
      const body = {
        type: formData.type,
        name: formData.name.trim(),
        source: formData.source,
        version: formData.version,
        content: formData.content,
        tags: formData.tags,
        isActive: formData.isActive,
      };

      let res;
      if (editingEntry) {
        res = await fetch(`${API}/${editingEntry.id}`, {
          method: "PUT",
          headers: jsonAuthHeaders,
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(API, {
          method: "POST",
          headers: jsonAuthHeaders,
          body: JSON.stringify(body),
        });
      }

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save");
      }

      addToast?.({ id: "hb-saved", message: editingEntry ? "Entry updated." : "Entry created.", type: "success" });
      resetForm();
      fetchEntries();
    } catch (err) {
      addToast?.({ id: "hb-save-err", message: err.message, type: "error" });
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error("Failed to delete");
      addToast?.({ id: "hb-deleted", message: "Entry deleted.", type: "success" });
      fetchEntries();
    } catch (err) {
      addToast?.({ id: "hb-del-err", message: err.message, type: "error" });
    }
  };

  const handleToggleActive = async (entry) => {
    try {
      const res = await fetch(`${API}/${entry.id}`, {
        method: "PUT",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ isActive: !entry.isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle");
      fetchEntries();
    } catch (err) {
      addToast?.({ id: "hb-toggle-err", message: err.message, type: "error" });
    }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API}/export`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `homebrew-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast?.({ id: "hb-exported", message: `Exported ${data.entries.length} entries.`, type: "success" });
    } catch (err) {
      addToast?.({ id: "hb-export-err", message: err.message, type: "error" });
    }
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const entries = data.entries || data;
        if (!Array.isArray(entries)) throw new Error("Invalid format: expected entries array");

        const overwrite = window.confirm("Overwrite existing entries with the same name+type?");
        const res = await fetch(`${API}/import`, {
          method: "POST",
          headers: jsonAuthHeaders,
          body: JSON.stringify({ entries, overwrite }),
        });
        if (!res.ok) throw new Error("Import failed");
        const result = await res.json();
        addToast?.({
          id: "hb-imported",
          message: `Imported: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
          type: "success",
        });
        fetchEntries();
      } catch (err) {
        addToast?.({ id: "hb-import-err", message: `Import error: ${err.message}`, type: "error" });
      }
    };
    input.click();
  };

  const addTag = () => {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput("");
  };

  const removeTag = (tag) => {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  // Style constants
  const s = {
    container: { padding: "16px", maxWidth: "1200px", margin: "0 auto", color: "var(--color-text)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" },
    title: { fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" },
    toolbar: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
    searchInput: { padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", minWidth: "200px" },
    filterSelect: { padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px" },
    btn: { padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" },
    btnPrimary: { background: "var(--color-accent)", color: "#fff" },
    btnSecondary: { background: "var(--color-accent-dim)", color: "var(--color-accent)", border: "1px solid var(--color-border)" },
    btnDanger: { background: "#ff444433", color: "#ff4444", border: "1px solid #ff4444" },
    card: { background: "var(--color-surface)", borderRadius: "12px", padding: "16px", marginBottom: "8px", border: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" },
    badge: (type) => ({ padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: `${TYPE_COLORS[type]}22`, color: TYPE_COLORS[type], border: `1px solid ${TYPE_COLORS[type]}44` }),
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" },
    modalContent: { background: "var(--color-surface)", borderRadius: "16px", padding: "24px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid var(--color-border)" },
    field: { marginBottom: "12px" },
    label: { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "4px" },
    input: { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", boxSizing: "border-box" },
    textarea: { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", minHeight: "80px", fontFamily: "inherit", boxSizing: "border-box", resize: "vertical" },
    tag: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", background: "var(--color-accent-dim)", color: "var(--color-accent)", fontSize: "12px", margin: "2px" },
    empty: { textAlign: "center", padding: "48px", color: "var(--color-muted)" },
    spinner: { width: "24px", height: "24px", border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "24px auto" },
  };

  if (!user || user.role !== "DM") {
    return (
      <div style={s.container} className="fade-in">
        <div style={s.empty}>
          <AlertCircle size={48} />
          <p>Only the DM can manage homebrew content.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container} className="fade-in">
      {/* Header */}
      <div style={s.header}>
        <div style={s.title}>
          <Beaker size={24} />
          Homebrew Content
        </div>
        <div style={s.toolbar}>
          <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleExport} className="touch-target">
            <Download size={16} /> Export
          </button>
          <button style={{ ...s.btn, ...s.btnSecondary }} onClick={handleImport} className="touch-target">
            <Upload size={16} /> Import
          </button>
          <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => { resetForm(); setShowForm(true); }} className="touch-target">
            <Plus size={16} /> New Entry
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "200px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <input
            style={{ ...s.searchInput, width: "100%", paddingLeft: "32px", boxSizing: "border-box" }}
            placeholder="Search by name, source, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select style={s.filterSelect} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">All Types</option>
          {TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
        </select>
      </div>

      {/* Entry List */}
      {loading ? (
        <div style={s.spinner} />
      ) : filteredEntries.length === 0 ? (
        <div style={s.empty}>
          <Beaker size={48} style={{ opacity: 0.3 }} />
          <p style={{ marginTop: "12px" }}>{entries.length === 0 ? "No homebrew entries yet. Create your first one!" : "No entries match your search."}</p>
        </div>
      ) : (
        filteredEntries.map((entry) => (
          <div key={entry.id} style={{ ...s.card, opacity: entry.isActive ? 1 : 0.5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
              <span style={s.badge(entry.type)}>{entry.type}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</div>
                <div style={{ fontSize: "12px", color: "var(--color-muted)" }}>
                  v{entry.version}{entry.source ? ` · ${entry.source}` : ""}
                </div>
              </div>
              {Array.isArray(entry.tags) && entry.tags.slice(0, 3).map((tag) => (
                <span key={tag} style={s.tag}>{tag}</span>
              ))}
              {Array.isArray(entry.tags) && entry.tags.length > 3 && (
                <span style={{ fontSize: "11px", color: "var(--color-muted)" }}>+{entry.tags.length - 3}</span>
              )}
            </div>
            <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
              <button
                style={{ ...s.btn, padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-muted)" }}
                onClick={() => handleToggleActive(entry)}
                title={entry.isActive ? "Deactivate" : "Activate"}
                className="touch-target"
              >
                {entry.isActive ? <Eye size={16} /> : <EyeOff size={16} />}
              </button>
              <button
                style={{ ...s.btn, padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-accent)" }}
                onClick={() => openEditForm(entry)}
                className="touch-target"
              >
                <Edit3 size={16} />
              </button>
              <button
                style={{ ...s.btn, padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", color: "#ff4444" }}
                onClick={() => handleDelete(entry.id, entry.name)}
                className="touch-target"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div style={s.modal} onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div style={s.modalContent} className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>{editingEntry ? "Edit Entry" : "New Homebrew Entry"}</h2>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)" }} onClick={resetForm} className="touch-target">
                <X size={24} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Type */}
              <div style={s.field}>
                <label style={s.label}>Type</label>
                <select style={s.input} value={formData.type} onChange={(e) => handleTypeChange(e.target.value)}>
                  {TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
                </select>
              </div>
              {/* Name */}
              <div style={s.field}>
                <label style={s.label}>Name</label>
                <input style={s.input} value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} placeholder="Entry name" />
              </div>
              {/* Source */}
              <div style={s.field}>
                <label style={s.label}>Source</label>
                <input style={s.input} value={formData.source} onChange={(e) => setFormData((p) => ({ ...p, source: e.target.value }))} placeholder="e.g., My Campaign" />
              </div>
              {/* Version */}
              <div style={s.field}>
                <label style={s.label}>Version</label>
                <input style={s.input} value={formData.version} onChange={(e) => setFormData((p) => ({ ...p, version: e.target.value }))} placeholder="1.0.0" />
              </div>
            </div>

            {/* Tags */}
            <div style={s.field}>
              <label style={s.label}>Tags</label>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                {formData.tags.map((tag) => (
                  <span key={tag} style={s.tag}>
                    {tag}
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: "14px", lineHeight: 1 }} onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <input style={{ ...s.input, flex: 1 }} value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }} placeholder="Add tag..." />
                <button style={{ ...s.btn, ...s.btnSecondary, padding: "8px" }} onClick={addTag} className="touch-target"><Plus size={16} /></button>
              </div>
            </div>

            {/* Type-Specific Content Fields */}
            {formData.type === "RACE" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Race Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "8px" }}>
                  {["str","dex","con","int","wis","cha"].map((ab) => (
                    <div key={ab}>
                      <label style={{ ...s.label, fontSize: "11px" }}>{ab.toUpperCase()} Bonus</label>
                      <input type="number" style={s.input} value={formData.content?.abilityBonuses?.[ab] ?? 0} onChange={(e) => { const v = {...formData.content?.abilityBonuses}; v[ab] = parseInt(e.target.value) || 0; handleContentChange("abilityBonuses", v); }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Speed (ft)</label>
                    <input type="number" style={s.input} value={formData.content?.speed ?? 30} onChange={(e) => handleContentChange("speed", parseInt(e.target.value) || 30)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Size</label>
                    <select style={s.input} value={formData.content?.size || "Medium"} onChange={(e) => handleContentChange("size", e.target.value)}>
                      {["Tiny", "Small", "Medium", "Large"].map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: "11px" }}>Traits (JSON array)</label>
                  <textarea style={s.textarea} value={JSON.stringify(formData.content?.traits || [], null, 2)} onChange={(e) => { try { handleContentChange("traits", JSON.parse(e.target.value)); } catch {} }} />
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: "11px" }}>Languages</label>
                  <input style={s.input} value={(formData.content?.languages || []).join(", ")} onChange={(e) => handleContentChange("languages", e.target.value.split(",").map((l) => l.trim()).filter(Boolean))} placeholder="Common, Elvish, Dwarvish" />
                </div>
              </div>
            )}

            {formData.type === "CLASS" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Class Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Hit Die</label>
                    <select style={s.input} value={formData.content?.hitDie || "d8"} onChange={(e) => handleContentChange("hitDie", e.target.value)}>
                      {["d6", "d8", "d10", "d12"].map((d) => (<option key={d} value={d}>{d}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Spellcasting Ability</label>
                    <select style={s.input} value={formData.content?.spellcastingAbility || ""} onChange={(e) => handleContentChange("spellcastingAbility", e.target.value)}>
                      <option value="">None</option>
                      {["INT", "WIS", "CHA"].map((a) => (<option key={a} value={a}>{a}</option>))}
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Features (JSON array)</label>
                  <textarea style={s.textarea} value={JSON.stringify(formData.content?.features || [], null, 2)} onChange={(e) => { try { handleContentChange("features", JSON.parse(e.target.value)); } catch {} }} />
                </div>
              </div>
            )}

            {formData.type === "FEAT" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Feat Details</h4>
                <div>
                  <label style={{ ...s.label, fontSize: "11px" }}>Description</label>
                  <textarea style={s.textarea} value={formData.content?.description || ""} onChange={(e) => handleContentChange("description", e.target.value)} />
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Prerequisites (JSON array)</label>
                  <textarea style={s.textarea} value={JSON.stringify(formData.content?.prerequisites || [], null, 2)} onChange={(e) => { try { handleContentChange("prerequisites", JSON.parse(e.target.value)); } catch {} }} />
                </div>
              </div>
            )}

            {formData.type === "SPELL" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Spell Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Level</label>
                    <input type="number" min="0" max="9" style={s.input} value={formData.content?.level ?? 1} onChange={(e) => handleContentChange("level", parseInt(e.target.value) || 0)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>School</label>
                    <select style={s.input} value={formData.content?.school || "Evocation"} onChange={(e) => handleContentChange("school", e.target.value)}>
                      {["Abjuration","Conjuration","Divination","Enchantment","Evocation","Illusion","Necromancy","Transmutation"].map((s) => (<option key={s} value={s}>{s}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Casting Time</label>
                    <input style={s.input} value={formData.content?.castingTime || "1 action"} onChange={(e) => handleContentChange("castingTime", e.target.value)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Range</label>
                    <input style={s.input} value={formData.content?.range || "Self"} onChange={(e) => handleContentChange("range", e.target.value)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Components</label>
                    <input style={s.input} value={formData.content?.components || "V, S, M"} onChange={(e) => handleContentChange("components", e.target.value)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Duration</label>
                    <input style={s.input} value={formData.content?.duration || "Instant"} onChange={(e) => handleContentChange("duration", e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Description</label>
                  <textarea style={s.textarea} value={formData.content?.description || ""} onChange={(e) => handleContentChange("description", e.target.value)} />
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Higher Levels</label>
                  <input style={s.input} value={formData.content?.higherLevels || ""} onChange={(e) => handleContentChange("higherLevels", e.target.value)} placeholder="e.g., +1d6 per slot level" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Damage</label>
                    <input style={s.input} value={formData.content?.damage || ""} onChange={(e) => handleContentChange("damage", e.target.value)} placeholder="e.g., 8d6" />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Save Type</label>
                    <input style={s.input} value={formData.content?.saveType || ""} onChange={(e) => handleContentChange("saveType", e.target.value)} placeholder="e.g., DEX" />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Attack Type</label>
                    <input style={s.input} value={formData.content?.attackType || ""} onChange={(e) => handleContentChange("attackType", e.target.value)} placeholder="Ranged/Melee" />
                  </div>
                </div>
              </div>
            )}

            {formData.type === "MAGIC_ITEM" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Magic Item Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Item Type</label>
                    <select style={s.input} value={formData.content?.type || "WONDROUS"} onChange={(e) => handleContentChange("type", e.target.value)}>
                      {["ARMOR","WEAPON","WAND","RING","ROD","STAFF","SCROLL","POTION","WONDROUS"].map((t) => (<option key={t} value={t}>{t}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Rarity</label>
                    <select style={s.input} value={formData.content?.rarity || "UNCOMMON"} onChange={(e) => handleContentChange("rarity", e.target.value)}>
                      {["COMMON","UNCOMMON","RARE","VERY_RARE","LEGENDARY","ARTIFACT"].map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>Attunement</label>
                    <select style={s.input} value={formData.content?.attunement ? "yes" : "no"} onChange={(e) => handleContentChange("attunement", e.target.value === "yes")}>
                      <option value="no">No</option>
                      <option value="yes">Required</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Description</label>
                  <textarea style={s.textarea} value={formData.content?.description || ""} onChange={(e) => handleContentChange("description", e.target.value)} />
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Properties (JSON array)</label>
                  <textarea style={s.textarea} value={JSON.stringify(formData.content?.properties || [], null, 2)} onChange={(e) => { try { handleContentChange("properties", JSON.parse(e.target.value)); } catch {} }} />
                </div>
              </div>
            )}

            {formData.type === "MONSTER" && (
              <div style={{ ...s.field, border: "1px solid var(--color-border)", borderRadius: "8px", padding: "12px" }}>
                <h4 style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600 }}>Monster Details</h4>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "8px" }}>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>HP</label>
                    <input type="number" style={s.input} value={formData.content?.hp ?? 10} onChange={(e) => handleContentChange("hp", parseInt(e.target.value) || 10)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>AC</label>
                    <input type="number" style={s.input} value={formData.content?.ac ?? 10} onChange={(e) => handleContentChange("ac", parseInt(e.target.value) || 10)} />
                  </div>
                  <div>
                    <label style={{ ...s.label, fontSize: "11px" }}>CR</label>
                    <input style={s.input} value={formData.content?.cr || "0"} onChange={(e) => handleContentChange("cr", e.target.value)} placeholder="e.g., 1, 1/4" />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "8px" }}>
                  {["strength","dexterity","constitution","intelligence","wisdom","charisma"].map((ab) => (
                    <div key={ab}>
                      <label style={{ ...s.label, fontSize: "11px" }}>{ab.slice(0, 3).toUpperCase()}</label>
                      <input type="number" style={s.input} value={formData.content?.[ab] ?? 10} onChange={(e) => handleContentChange(ab, parseInt(e.target.value) || 10)} />
                    </div>
                  ))}
                </div>
                <div>
                  <label style={{ ...s.label, fontSize: "11px" }}>Actions (JSON array)</label>
                  <textarea style={s.textarea} value={JSON.stringify(formData.content?.actions || [], null, 2)} onChange={(e) => { try { handleContentChange("actions", JSON.parse(e.target.value)); } catch {} }} />
                </div>
                <div style={{ marginTop: "8px" }}>
                  <label style={{ ...s.label, fontSize: "11px" }}>Description</label>
                  <textarea style={s.textarea} value={formData.content?.description || ""} onChange={(e) => handleContentChange("description", e.target.value)} />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={resetForm} className="touch-target">Cancel</button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSave} className="touch-target">
                <Check size={16} /> {editingEntry ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSS animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default HomebrewManager;
