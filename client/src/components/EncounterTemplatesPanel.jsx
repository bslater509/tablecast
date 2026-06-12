// =============================================================================
// Tablecast — Encounter Templates Panel (DM Only)
// §4.4: Manage reusable encounter templates with create, edit, delete, apply,
// and built-in template seeding.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  Edit3,
  Trash2,
  X,
  Check,
  AlertCircle,
  Play,
  Swords,
  Tag,
  Shield,
  Bug,
  Flame,
  Skull,
  ExternalLink,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useNavigate } from "react-router-dom";
import { getAuthHeaders, getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/encounter-templates";

const VALID_DIFFICULTIES = ["easy", "medium", "hard", "deadly"];
const DIFFICULTY_COLORS = {
  easy: "#22c55e",
  medium: "#eab308",
  hard: "#f97316",
  deadly: "#ef4444",
};
const DIFFICULTY_ICONS = {
  easy: Shield,
  medium: Bug,
  hard: Flame,
  deadly: Skull,
};

const EMPTY_FORM = {
  name: "",
  description: "",
  difficulty: "medium",
  recommendedLevel: 1,
  tags: [],
  participants: "[]",
  mapId: "",
};

const BUILT_IN_TEMPLATES = [
  {
    name: "Goblin Ambush (CR 1-2)",
    description: "A classic goblin ambush encounter. Goblins hide in bushes and attack travelers on a forest road.",
    difficulty: "easy",
    recommendedLevel: 1,
    tags: ["goblin", "ambush", "low-level", "forest"],
    participants: JSON.stringify([
      { sourceType: "monster", name: "Goblin", count: 4 },
      { sourceType: "monster", name: "Goblin Boss", count: 1 },
    ]),
  },
  {
    name: "Bandit Camp (CR 3-4)",
    description: "A bandit camp hidden in the woods. The bandit captain leads a group of thugs who ambush travelers.",
    difficulty: "medium",
    recommendedLevel: 3,
    tags: ["bandit", "camp", "mid-level", "forest"],
    participants: JSON.stringify([
      { sourceType: "monster", name: "Bandit", count: 6 },
      { sourceType: "monster", name: "Bandit Captain", count: 1 },
    ]),
  },
  {
    name: "Kobold Warren (CR 1-2)",
    description: "A trap-filled kobold warren beneath an old ruin. Kobolds use cunning traps and hit-and-run tactics.",
    difficulty: "easy",
    recommendedLevel: 1,
    tags: ["kobold", "dungeon", "low-level", "traps"],
    participants: JSON.stringify([
      { sourceType: "monster", name: "Kobold", count: 6 },
      { sourceType: "placeholder", name: "Traps", count: 1, cr: "0" },
    ]),
  },
  {
    name: "Dragon's Lair (CR 5+)",
    description: "A fearsome dragon's lair filled with minions, traps, and the dragon itself. For higher-level parties.",
    difficulty: "deadly",
    recommendedLevel: 5,
    tags: ["dragon", "lair", "high-level", "boss"],
    participants: JSON.stringify([
      { sourceType: "placeholder", name: "Dragon", count: 1, cr: "5+" },
      { sourceType: "placeholder", name: "Dragon Minions", count: 4, cr: "2" },
    ]),
  },
  {
    name: "Orc Raid (CR 2-3)",
    description: "An orc raiding party attacking a village. The orc eye of Gruumsh leads the charge.",
    difficulty: "medium",
    recommendedLevel: 2,
    tags: ["orc", "raid", "mid-level", "village"],
    participants: JSON.stringify([
      { sourceType: "monster", name: "Orc", count: 4 },
      { sourceType: "monster", name: "Orc Eye of Gruumsh", count: 1 },
    ]),
  },
];

function EncounterTemplatesPanel({ user }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = getJsonAuthHeaders(user);

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applyTemplateId, setApplyTemplateId] = useState(null);
  const [applyFormData, setApplyFormData] = useState({ name: "", mapId: "" });
  const [applying, setApplying] = useState(false);
  const [seeding, setSeeding] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(API, { headers: authHeaders });
      if (!res.ok) throw new Error("Failed to fetch encounter templates");
      const data = await res.json();
      setTemplates(data);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  }, [authHeaders, addToast]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const filteredTemplates = templates.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const tags = parseTags(t.tags);
    return (
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      tags.some((tag) => tag.toLowerCase().includes(q))
    );
  });

  function parseTags(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function parseParticipants(raw) {
    try {
      const parsed = JSON.parse(raw || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function resetForm() {
    setShowForm(false);
    setEditingTemplate(null);
    setFormData({ ...EMPTY_FORM });
    setTagInput("");
  }

  function openEditForm(template) {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      difficulty: template.difficulty || "medium",
      recommendedLevel: template.recommendedLevel || 1,
      tags: parseTags(template.tags),
      participants: (() => {
        const p = parseParticipants(template.participants);
        return p.length > 0 ? JSON.stringify(p, null, 2) : "[]";
      })(),
      mapId: template.mapId != null ? String(template.mapId) : "",
    });
    setShowForm(true);
  }

  function addTag() {
    const tag = tagInput.trim().toLowerCase();
    if (tag && !formData.tags.includes(tag)) {
      setFormData((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
    }
    setTagInput("");
  }

  function removeTag(tag) {
    setFormData((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      addToast("Name is required.", "error");
      return;
    }

    let parsedParticipants;
    try {
      parsedParticipants = JSON.parse(formData.participants || "[]");
      if (!Array.isArray(parsedParticipants)) throw new Error("Not an array");
    } catch {
      addToast("Participants must be valid JSON array.", "error");
      return;
    }

    try {
      const body = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        difficulty: formData.difficulty,
        recommendedLevel: Number(formData.recommendedLevel) || 1,
        tags: formData.tags,
        participants: parsedParticipants,
        mapId: formData.mapId ? Number(formData.mapId) : undefined,
      };

      let res;
      if (editingTemplate) {
        res = await fetch(`${API}/${editingTemplate.id}`, {
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
        throw new Error(errData.error || "Failed to save template");
      }

      addToast(editingTemplate ? "Template updated." : "Template created.", "success");
      resetForm();
      fetchTemplates();
    } catch (err) {
      addToast(err.message, "error");
    }
  }

  async function handleDelete(id, name) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`${API}/${id}`, { method: "DELETE", headers: authHeaders });
      if (!res.ok) throw new Error("Failed to delete template");
      addToast("Template deleted.", "success");
      fetchTemplates();
    } catch (err) {
      addToast(err.message, "error");
    }
  }

  function openApplyModal(template) {
    setApplyTemplateId(template.id);
    setApplyFormData({ name: template.name, mapId: template.mapId ? String(template.mapId) : "" });
    setShowApplyModal(true);
  }

  async function handleApply() {
    if (!applyTemplateId) return;
    setApplying(true);
    try {
      const body = {};
      if (applyFormData.name.trim()) body.name = applyFormData.name.trim();
      if (applyFormData.mapId) body.mapId = Number(applyFormData.mapId);

      const res = await fetch(`${API}/${applyTemplateId}/apply`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to apply template");
      }

      const result = await res.json();
      const encounterId = result.encounterId || result.id;
      addToast("Template applied! Encounter created.", "success");
      setShowApplyModal(false);
      setApplyTemplateId(null);
      navigate(`/dm/encounters/${encounterId}`);
    } catch (err) {
      addToast(err.message, "error");
    } finally {
      setApplying(false);
    }
  }

  async function handleSeedBuiltIn() {
    if (!window.confirm("Create all 5 built-in templates? This will not overwrite existing templates.")) return;
    setSeeding(true);
    let created = 0;
    let errors = 0;
    for (const tmpl of BUILT_IN_TEMPLATES) {
      try {
        const body = {
          name: tmpl.name,
          description: tmpl.description,
          difficulty: tmpl.difficulty,
          recommendedLevel: tmpl.recommendedLevel,
          tags: tmpl.tags,
          participants: JSON.parse(tmpl.participants),
        };
        const res = await fetch(API, {
          method: "POST",
          headers: jsonAuthHeaders,
          body: JSON.stringify(body),
        });
        if (res.ok) {
          created += 1;
        } else {
          errors += 1;
        }
      } catch {
        errors += 1;
      }
    }
    setSeeding(false);
    addToast(`Seeded ${created} built-in template(s).${errors > 0 ? ` ${errors} failed.` : ""}`, errors > 0 ? "warning" : "success");
    fetchTemplates();
  }

  // ── Style constants (matching HomebrewManager patterns) ──
  const s = {
    container: { padding: "16px", maxWidth: "1200px", margin: "0 auto", color: "var(--color-text)" },
    header: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", marginBottom: "20px" },
    title: { fontSize: "1.5rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" },
    toolbar: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" },
    searchInput: { padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", minWidth: "200px" },
    btn: { padding: "8px 16px", borderRadius: "8px", border: "none", cursor: "pointer", fontSize: "14px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" },
    btnPrimary: { background: "var(--color-accent)", color: "#fff" },
    btnSecondary: { background: "var(--color-accent-dim)", color: "var(--color-accent)", border: "1px solid var(--color-border)" },
    btnDanger: { background: "#ff444433", color: "#ff4444", border: "1px solid #ff4444" },
    btnSuccess: { background: "#22c55e33", color: "#22c55e", border: "1px solid #22c55e" },
    card: { background: "var(--color-surface)", borderRadius: "12px", padding: "16px", marginBottom: "8px", border: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" },
    cardVertical: { background: "var(--color-surface)", borderRadius: "12px", padding: "16px", border: "1px solid var(--color-border)", display: "flex", flexDirection: "column", gap: "8px" },
    badge: (difficulty) => {
      const color = DIFFICULTY_COLORS[difficulty] || "#6b7280";
      return { padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44`, display: "inline-flex", alignItems: "center", gap: "4px" };
    },
    tag: { display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", background: "var(--color-accent-dim)", color: "var(--color-accent)", fontSize: "12px", margin: "2px" },
    modal: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" },
    modalContent: { background: "var(--color-surface)", borderRadius: "16px", padding: "24px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid var(--color-border)" },
    field: { marginBottom: "12px" },
    label: { display: "block", fontSize: "13px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "4px" },
    input: { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", boxSizing: "border-box" },
    textarea: { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", minHeight: "80px", fontFamily: "monospace", boxSizing: "border-box", resize: "vertical" },
    select: { width: "100%", padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text)", fontSize: "14px", boxSizing: "border-box" },
    empty: { textAlign: "center", padding: "48px", color: "var(--color-muted)" },
    spinner: { width: "24px", height: "24px", border: "3px solid var(--color-border)", borderTopColor: "var(--color-accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "24px auto" },
    level: { fontSize: "12px", color: "var(--color-muted)", fontWeight: 500 },
    desc: { fontSize: "13px", color: "var(--color-muted)", lineHeight: "1.4", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  };

  if (!user || user.role !== "DM") {
    return (
      <div style={s.container} className="fade-in">
        <div style={s.empty}>
          <AlertCircle size={48} />
          <p>Only the DM can manage encounter templates.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={s.container} className="fade-in">
      {/* ── Header ── */}
      <div style={s.header}>
        <div style={s.title}>
          <Swords size={24} />
          Encounter Templates
        </div>
        <div style={s.toolbar}>
          {templates.length === 0 && !loading && (
            <button
              style={{ ...s.btn, ...s.btnSuccess }}
              onClick={handleSeedBuiltIn}
              disabled={seeding}
              className="touch-target"
            >
              <Shield size={16} /> {seeding ? "Seeding..." : "Seed Built-in Templates"}
            </button>
          )}
          <button
            style={{ ...s.btn, ...s.btnPrimary }}
            onClick={() => { resetForm(); setShowForm(true); }}
            className="touch-target"
          >
            <Plus size={16} /> New Template
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      {templates.length > 0 && (
        <div style={{ position: "relative", marginBottom: "16px", maxWidth: "400px" }}>
          <Search size={16} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)" }} />
          <input
            style={{ ...s.searchInput, width: "100%", paddingLeft: "32px", boxSizing: "border-box" }}
            placeholder="Search by name, description, or tag..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* ── Template Grid ── */}
      {loading ? (
        <div style={s.spinner} />
      ) : filteredTemplates.length === 0 ? (
        <div style={s.empty}>
          <Swords size={48} style={{ opacity: 0.3 }} />
          <p style={{ marginTop: "12px" }}>
            {templates.length === 0
              ? "No encounter templates yet. Create your first one or seed the built-in templates!"
              : "No templates match your search."}
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "12px" }}>
          {filteredTemplates.map((template) => {
            const tags = parseTags(template.tags);
            const participants = parseParticipants(template.participants);
            const DifficultyIcon = DIFFICULTY_ICONS[template.difficulty] || Shield;
            return (
              <div key={template.id} style={s.cardVertical} className="fade-in">
                {/* Top row: name + difficulty */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ fontWeight: 600, fontSize: "15px", flex: 1, minWidth: 0 }}>{template.name}</div>
                  <span style={s.badge(template.difficulty)}>
                    <DifficultyIcon size={12} />
                    {template.difficulty}
                  </span>
                </div>

                {/* Description */}
                {template.description && (
                  <div style={s.desc}>{template.description}</div>
                )}

                {/* Level + participants count */}
                <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                  <span style={s.level}>Level {template.recommendedLevel}</span>
                  <span style={s.level}>
                    {participants.reduce((sum, p) => sum + (p.count || 1), 0)} participant
                    {participants.reduce((sum, p) => sum + (p.count || 1), 0) !== 1 ? "s" : ""}
                  </span>
                </div>

                {/* Tags */}
                {tags.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px" }}>
                    {tags.slice(0, 4).map((tag) => (
                      <span key={tag} style={s.tag}><Tag size={10} />{tag}</span>
                    ))}
                    {tags.length > 4 && (
                      <span style={{ fontSize: "11px", color: "var(--color-muted)", alignSelf: "center" }}>+{tags.length - 4}</span>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div style={{ display: "flex", gap: "6px", marginTop: "4px", flexWrap: "wrap" }}>
                  <button
                    style={{ ...s.btn, padding: "6px 12px", background: "var(--color-accent-dim)", color: "var(--color-accent)", border: "1px solid var(--color-border)" }}
                    onClick={() => openApplyModal(template)}
                    className="touch-target"
                    title="Apply template to create encounter"
                  >
                    <Play size={14} /> Apply
                  </button>
                  <button
                    style={{ ...s.btn, padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", color: "var(--color-accent)" }}
                    onClick={() => openEditForm(template)}
                    className="touch-target"
                    title="Edit template"
                  >
                    <Edit3 size={16} />
                  </button>
                  <button
                    style={{ ...s.btn, padding: "6px 10px", background: "transparent", border: "none", cursor: "pointer", color: "#ff4444" }}
                    onClick={() => handleDelete(template.id, template.name)}
                    className="touch-target"
                    title="Delete template"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Create/Edit Modal ── */}
      {showForm && (
        <div style={s.modal} onClick={(e) => { if (e.target === e.currentTarget) resetForm(); }}>
          <div style={s.modalContent} className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0 }}>
                {editingTemplate ? "Edit Template" : "New Encounter Template"}
              </h2>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)" }} onClick={resetForm} className="touch-target">
                <X size={24} />
              </button>
            </div>

            {/* Name */}
            <div style={s.field}>
              <label style={s.label}>Name *</label>
              <input
                style={s.input}
                value={formData.name}
                onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Goblin Ambush (CR 1-2)"
              />
            </div>

            {/* Description */}
            <div style={s.field}>
              <label style={s.label}>Description</label>
              <textarea
                style={{ ...s.textarea, fontFamily: "inherit", minHeight: "60px" }}
                value={formData.description}
                onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
                placeholder="Describe the encounter scenario..."
              />
            </div>

            {/* Row: Difficulty + Level */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div style={s.field}>
                <label style={s.label}>Difficulty</label>
                <select
                  style={s.select}
                  value={formData.difficulty}
                  onChange={(e) => setFormData((p) => ({ ...p, difficulty: e.target.value }))}
                >
                  {VALID_DIFFICULTIES.map((d) => (
                    <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div style={s.field}>
                <label style={s.label}>Recommended Level</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  style={s.input}
                  value={formData.recommendedLevel}
                  onChange={(e) => setFormData((p) => ({ ...p, recommendedLevel: parseInt(e.target.value, 10) || 1 }))}
                />
              </div>
            </div>

            {/* Tags */}
            <div style={s.field}>
              <label style={s.label}>Tags</label>
              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "4px" }}>
                {formData.tags.map((tag) => (
                  <span key={tag} style={s.tag}>
                    <Tag size={10} />
                    {tag}
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, fontSize: "14px", lineHeight: 1 }} onClick={() => removeTag(tag)}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "4px" }}>
                <input
                  style={{ ...s.input, flex: 1 }}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  placeholder="Add tag..."
                />
                <button style={{ ...s.btn, ...s.btnSecondary, padding: "8px" }} onClick={addTag} className="touch-target"><Plus size={16} /></button>
              </div>
            </div>

            {/* Participants (JSON textarea) */}
            <div style={s.field}>
              <label style={s.label}>
                Participants (JSON array)
                <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--color-muted)", marginLeft: "6px" }}>
                  [{`{ sourceType, sourceId?, name, count }`}]
                </span>
              </label>
              <textarea
                style={{ ...s.textarea, minHeight: "100px" }}
                value={formData.participants}
                onChange={(e) => setFormData((p) => ({ ...p, participants: e.target.value }))}
                placeholder='[{ "sourceType": "monster", "name": "Goblin", "count": 4 }]'
              />
            </div>

            {/* Map ID (optional) */}
            <div style={s.field}>
              <label style={s.label}>Map ID (optional)</label>
              <input
                type="number"
                min="0"
                style={s.input}
                value={formData.mapId}
                onChange={(e) => setFormData((p) => ({ ...p, mapId: e.target.value }))}
                placeholder="Leave empty to choose later"
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button style={{ ...s.btn, ...s.btnSecondary }} onClick={resetForm} className="touch-target">Cancel</button>
              <button style={{ ...s.btn, ...s.btnPrimary }} onClick={handleSave} className="touch-target">
                <Check size={16} /> {editingTemplate ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Apply Modal ── */}
      {showApplyModal && (
        <div style={s.modal} onClick={(e) => { if (e.target === e.currentTarget) { setShowApplyModal(false); setApplyTemplateId(null); } }}>
          <div style={{ ...s.modalContent, maxWidth: "480px" }} className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
                <Play size={20} /> Apply Template
              </h2>
              <button style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-muted)" }} onClick={() => { setShowApplyModal(false); setApplyTemplateId(null); }} className="touch-target">
                <X size={24} />
              </button>
            </div>

            <p style={{ fontSize: "14px", color: "var(--color-muted)", marginBottom: "16px" }}>
              This will create a new encounter from the template. You can override the name and map.
            </p>

            <div style={s.field}>
              <label style={s.label}>Encounter Name</label>
              <input
                style={s.input}
                value={applyFormData.name}
                onChange={(e) => setApplyFormData((p) => ({ ...p, name: e.target.value }))}
                placeholder="Leave blank to use template name"
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Map ID (optional)</label>
              <input
                type="number"
                min="0"
                style={s.input}
                value={applyFormData.mapId}
                onChange={(e) => setApplyFormData((p) => ({ ...p, mapId: e.target.value }))}
                placeholder="Leave empty to choose later"
              />
            </div>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "20px" }}>
              <button
                style={{ ...s.btn, ...s.btnSecondary }}
                onClick={() => { setShowApplyModal(false); setApplyTemplateId(null); }}
                className="touch-target"
                disabled={applying}
              >
                Cancel
              </button>
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                onClick={handleApply}
                className="touch-target"
                disabled={applying}
              >
                {applying ? "Applying..." : <><Play size={16} /> Apply &amp; Go to Encounter</>}
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

export default EncounterTemplatesPanel;
