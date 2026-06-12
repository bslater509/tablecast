// =============================================================================
// Tablecast  Add Participant Panel
// Self-contained form for adding monsters, NPCs, or characters to an encounter.
// =============================================================================
import { useState, useCallback } from "react";
import { UserPlus } from "lucide-react";
import { encounterStyles } from "./encounterStyles";

export default function AddParticipantPanel({
  encounterId,
  authHeaders,
  npcs,
  characters,
  addToast,
  onParticipantAdded,
  onCancel,
}) {
  /* ---- state ---- */
  const [addType, setAddType] = useState("monster");
  const [addMonsterQuery, setAddMonsterQuery] = useState("");
  const [addMonsterResults, setAddMonsterResults] = useState([]);
  const [addMonsterSelected, setAddMonsterSelected] = useState(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [addHidden, setAddHidden] = useState(false);
  const [addNpcId, setAddNpcId] = useState("");
  const [addCharId, setAddCharId] = useState("");

  /* ---- helpers ---- */
  const searchMonsters = useCallback(
    async (query) => {
      if (!query || query.length < 2) {
        setAddMonsterResults([]);
        return;
      }
      try {
        const res = await fetch(
          `/api/monsters?search=${encodeURIComponent(query)}`,
          { headers: authHeaders }
        );
        if (res.ok) setAddMonsterResults((await res.json()).slice(0, 10));
      } catch { /* silent */ }
    },
    [authHeaders]
  );

  const handleAddParticipant = async () => {
    try {
      const body = { isHidden: addHidden, quantity: addQuantity };
      if (addType === "monster" && addMonsterSelected) {
        body.type = "monster";
        body.monsterId = addMonsterSelected.id;
      } else if (addType === "npc" && addNpcId) {
        body.type = "npc";
        body.npcId = Number(addNpcId);
      } else if (addType === "character" && addCharId) {
        body.type = "character";
        body.characterId = Number(addCharId);
      } else {
        return;
      }
      const res = await fetch(
        `/api/encounters/${encounterId}/participants`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to add participant.");
      }
      const updated = await res.json();
      // Reset internal state
      setAddMonsterSelected(null);
      setAddMonsterQuery("");
      setAddMonsterResults([]);
      setAddQuantity(1);
      setAddHidden(false);
      setAddNpcId("");
      setAddCharId("");
      // Notify parent
      onParticipantAdded(updated);
    } catch (err) {
      addToast(err.message, "error");
    }
  };

  const s = encounterStyles;

  return (
    <div style={s.addPanel}>
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        {["monster", "npc", "character"].map((t) => (
          <button
            key={t}
            style={
              addType === t
                ? { ...s.statusBtn, borderColor: "#4ade80", color: "#4ade80" }
                : s.statusBtn
            }
            onClick={() => {
              setAddType(t);
              setAddMonsterSelected(null);
              setAddMonsterQuery("");
              setAddMonsterResults([]);
              setAddNpcId("");
              setAddCharId("");
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: "#94a3b8", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={addHidden}
            onChange={(e) => setAddHidden(e.target.checked)}
          />
          Hidden
        </label>
      </div>
      <div style={s.addRow}>
        {addType === "monster" && (
          <>
            <div style={{ flex: 1, position: "relative", minWidth: 140 }}>
              <input
                style={{ ...s.input, width: "100%", boxSizing: "border-box" }}
                placeholder="Search monsters..."
                value={addMonsterQuery}
                onChange={(e) => {
                  setAddMonsterQuery(e.target.value);
                  searchMonsters(e.target.value);
                }}
              />
              {addMonsterResults.length > 0 && !addMonsterSelected && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    background: "#1e293b",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    maxHeight: 180,
                    overflowY: "auto",
                    zIndex: 10,
                  }}
                >
                  {addMonsterResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => {
                        setAddMonsterSelected(m);
                        setAddMonsterQuery(m.name);
                        setAddMonsterResults([]);
                      }}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        fontSize: 13,
                        borderBottom: "1px solid #2d3748",
                        color: "#e2e8f0",
                      }}
                    >
                      {m.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input
              type="number"
              style={{ ...s.input, width: 50 }}
              min={1}
              max={20}
              value={addQuantity}
              onChange={(e) =>
                setAddQuantity(Math.max(1, Math.min(20, Number(e.target.value) || 1)))
              }
              aria-label="Quantity"
            />
          </>
        )}
        {addType === "npc" && (
          <select
            style={{ ...s.select, flex: 1, minWidth: 140 }}
            value={addNpcId}
            onChange={(e) => setAddNpcId(e.target.value)}
          >
            <option value="">Select NPC...</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        )}
        {addType === "character" && (
          <select
            style={{ ...s.select, flex: 1, minWidth: 140 }}
            value={addCharId}
            onChange={(e) => setAddCharId(e.target.value)}
          >
            <option value="">Select character...</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button style={s.btnPrimary} onClick={handleAddParticipant}>
          <UserPlus size={16} />
          Add
        </button>
        <button
          style={s.btnSecondary}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
