// =============================================================================
// Tablecast  Encounter Initiative Tracker Panel
// Dedicated combat management: initiative order, HP tracking, turn control.
// Condition tracker & death saves features.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Flag,
  Heart,
  Lightbulb,
  Plus,
  Shield,
  Skull,
  Swords,
  Trash2,
  UserPlus,
  X,
  Zap,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useSocket } from "../context/SocketContext";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { encounterStyles, hpColor, badgeColor } from "./encounters/encounterStyles";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import AiBuilderModal from "./encounters/AiBuilderModal";
import AddParticipantPanel from "./encounters/AddParticipantPanel";

// ── Helpers ──
function parseJson(value, fallback) {
  try { return JSON.parse(value || ""); } catch { return fallback; }
}

const CONDITION_OPTIONS = [
  "Blinded", "Charmed", "Deafened", "Frightened", "Grappled",
  "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned",
  "Prone", "Restrained", "Stunned", "Unconscious", "Exhaustion",
];

const CONDITION_COLORS = {
  "Blinded": "#94a3b8", "Charmed": "#f472b6", "Deafened": "#64748b",
  "Frightened": "#a78bfa", "Grappled": "#fb923c", "Incapacitated": "#6b7280",
  "Invisible": "#c084fc", "Paralyzed": "#fbbf24", "Petrified": "#9ca3af",
  "Poisoned": "#22c55e", "Prone": "#eab308", "Restrained": "#f97316",
  "Stunned": "#38bdf8", "Unconscious": "#64748b", "Exhaustion": "#ef4444",
};
const DEFAULT_COND_COLOR = "#a855f7";
const SELECTED_ENCOUNTER_STORAGE_KEY = "tablecast.selectedEncounterId";
const MAP_FILTER_STORAGE_KEY = "tablecast.encounterMapFilter";

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function EncountersPanel({
  user,
  readOnly = false,
  isPopout = false,
}) {
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();
  const { socket, isConnected } = useSocket();
  const isDm = user?.role === "DM" && !readOnly;
  const navigate = useNavigate();
  const { id: routeEncounterId } = useParams();
  const location = useLocation();
  const basePath = location.pathname.replace(/\/\d+$/, "");

  /* ---- auth headers ---- */
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  /* ---- state ---- */
  const [maps, setMaps] = useState([]);
  const [selectedMapId, setSelectedMapId] = useState(() => {
    return localStorage.getItem(MAP_FILTER_STORAGE_KEY) || "";
  });
  const [encounters, setEncounters] = useState([]);
  const [selectedEncounter, setSelectedEncounter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  /* participant-addition state */
  const [showAddParticipant, setShowAddParticipant] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [characters, setCharacters] = useState([]);

  /* initiative editing */
  const [editingInitiative, setEditingInitiative] = useState(null);

  /* deploy state */
  const [deployX, setDeployX] = useState(0);
  const [deployY, setDeployY] = useState(0);

  /* AI builder visibility */
  const [showAiBuilder, setShowAiBuilder] = useState(false);

  /* condition picker */
  const [conditionPickerParticipant, setConditionPickerParticipant] = useState(null);
  const [conditionPickerDuration, setConditionPickerDuration] = useState(1);

  /* suggest action */
  const [suggestingAction, setSuggestingAction] = useState(null); // participant id being loaded
  const [actionSuggestion, setActionSuggestion] = useState(null); // { participantId, recommended, alternatives } or null
  const [actionLoading, setActionLoading] = useState(false);

  /* ---- helpers ---- */
  const handleApiError = (err, fallback) => {
    setError(err.message || fallback);
  };

  /* ---- data fetching ---- */
  const fetchMaps = useCallback(async () => {
    try {
      const res = await fetch("/api/maps", { headers: authHeaders });
      if (res.ok) setMaps(await res.json());
    } catch { /* silent */ }
  }, [authHeaders]);

  const fetchEncounters = useCallback(
    async (mapId) => {
      try {
        setLoading(true);
        setError(null);
        const q = mapId ? `?mapId=${mapId}` : "";
        const res = await fetch(`/api/encounters${q}`, { headers: authHeaders });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Failed to load encounters.");
        }
        setEncounters(await res.json());
      } catch (err) {
        handleApiError(err, "Could not load encounters.");
      } finally {
        setLoading(false);
      }
    },
    [authHeaders]
  );

  const fetchEncounter = useCallback(
    async (id) => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/encounters/${id}`, { headers: authHeaders });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || "Encounter not found.");
        }
        const data = await res.json();
        setSelectedEncounter(data);
        localStorage.setItem(SELECTED_ENCOUNTER_STORAGE_KEY, String(data.id));
      } catch (err) {
        handleApiError(err, "Could not load encounter.");
        setSelectedEncounter(null);
        localStorage.removeItem(SELECTED_ENCOUNTER_STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    },
    [authHeaders]
  );

  const fetchResources = useCallback(async () => {
    if (!isDm) return;
    try {
      const [npcRes, charRes] = await Promise.all([
        fetch("/api/npcs", { headers: authHeaders }),
        fetch("/api/characters", { headers: authHeaders }),
      ]);
      if (npcRes.ok) setNpcs(await npcRes.json());
      if (charRes.ok) setCharacters(await charRes.json());
    } catch { /* silent */ }
  }, [authHeaders, isDm]);

  /* ---- initial load ---- */
  useEffect(() => {
    fetchMaps();
    fetchResources();
    // Restore previously selected encounter from URL or localStorage
    if (routeEncounterId) {
      fetchEncounter(Number(routeEncounterId));
    } else {
      const storedEncId = localStorage.getItem(SELECTED_ENCOUNTER_STORAGE_KEY);
      if (storedEncId) {
        fetchEncounter(Number(storedEncId));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchMaps, fetchResources]);

  // Sync route encounterId → selected encounter
  useEffect(() => {
    if (routeEncounterId) {
      fetchEncounter(Number(routeEncounterId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeEncounterId]);

  useEffect(() => {
    fetchEncounters(selectedMapId || undefined);
  }, [selectedMapId, fetchEncounters]);

  // Persist selected map filter
  useEffect(() => {
    if (selectedMapId) {
      localStorage.setItem(MAP_FILTER_STORAGE_KEY, selectedMapId);
    } else {
      localStorage.removeItem(MAP_FILTER_STORAGE_KEY);
    }
  }, [selectedMapId]);

  /* ---- Socket listeners ---- */
  useEffect(() => {
    if (!socket) return;

    const onEncounterUpdated = (payload) => {
      // Patch the single encounter in local state instead of a full refetch
      if (payload.encounter) {
        setEncounters(prev =>
          prev.map(e => e.id === payload.encounter.id ? payload.encounter : e)
        );
      } else if (payload.encounterId) {
        // Single-encounter payload: fetch just that encounter and patch
        fetch(`/api/encounters/${payload.encounterId}`, { headers: authHeaders })
          .then(r => r.ok ? r.json() : null)
          .then(updated => {
            if (updated) {
              setEncounters(prev =>
                prev.map(e => e.id === updated.id ? updated : e)
              );
            }
          })
          .catch(() => {});
      }
      // Update selected encounter if it matches
      if (
        selectedEncounter &&
        Number(payload.encounterId) === Number(selectedEncounter.id)
      ) {
        fetchEncounter(selectedEncounter.id);
      }
    };

    socket.on("encounter:updated", onEncounterUpdated);
    socket.on("encounter:turnChanged", onEncounterUpdated);

    return () => {
      socket.off("encounter:updated", onEncounterUpdated);
      socket.off("encounter:turnChanged", onEncounterUpdated);
    };
  }, [socket, selectedEncounter, selectedMapId, fetchEncounter, authHeaders]);

  /* ---- actions ---- */
  const notifyRefresh = (encounterId) => {
    if (socket && isConnected && encounterId) {
      socket.emit("encounter:refresh", {
        userId: Number(user?.id),
        encounterId: Number(encounterId),
      });
    }
  };

  const handleCreateEncounter = async () => {
    if (!isDm || busy) return;
    setBusy(true);
    try {
      const mapId = selectedMapId || (maps[0]?.id);
      if (!mapId) {
        addToast("Select a map first.", "warning");
        return;
      }
      const map = maps.find((m) => Number(m.id) === Number(mapId));
      const res = await fetch("/api/encounters", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          mapId: Number(mapId),
          name: map ? `${map.name} Encounter` : "New Encounter",
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to create encounter.");
      }
      const created = await res.json();
      await fetchEncounters(selectedMapId || undefined);
      fetchEncounter(created.id);
      notifyRefresh(created.id);
    } catch (err) {
      handleApiError(err, "Could not create encounter.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEncounter = async (id) => {
    if (!isDm || busy || !(await showConfirm("Delete Encounter?", "Delete this encounter?"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/${id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to delete encounter.");
      setSelectedEncounter(null);
      localStorage.removeItem(SELECTED_ENCOUNTER_STORAGE_KEY);
      fetchEncounters(selectedMapId || undefined);
    } catch (err) {
      handleApiError(err, "Could not delete encounter.");
    } finally {
      setBusy(false);
    }
  };

  const handleSetStatus = async (status) => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/${selectedEncounter.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update status.");
      const updated = await res.json();
      setSelectedEncounter(updated);
      notifyRefresh(updated.id);
      fetchEncounters(selectedMapId || undefined);
    } catch (err) {
      handleApiError(err, "Could not update encounter.");
    } finally {
      setBusy(false);
    }
  };

  const handleStartEncounter = async () => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/${selectedEncounter.id}/start`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ rollInitiative: true }),
      });
      if (!res.ok) throw new Error("Failed to start encounter.");
      const updated = await res.json();
      setSelectedEncounter(updated);
      notifyRefresh(updated.id);
      fetchEncounters(selectedMapId || undefined);
    } catch (err) {
      handleApiError(err, "Could not start encounter.");
    } finally {
      setBusy(false);
    }
  };

  const handleAdvanceTurn = async (direction = "next") => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/${selectedEncounter.id}/turn`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ direction }),
      });
      if (!res.ok) throw new Error("Failed to advance turn.");
      const updated = await res.json();
      setSelectedEncounter(updated);
      socket?.emit("encounter:turn", {
        userId: Number(user?.id),
        encounterId: Number(updated.id),
      });
    } catch (err) {
      handleApiError(err, "Could not advance turn.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateParticipantHp = async (participant, delta) => {
    if (!isDm || !selectedEncounter || busy) return;
    const next = Math.max(0, Math.min(participant.maxHp || 1, participant.currentHp + delta));
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/participants/${participant.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ currentHp: next }),
      });
      if (!res.ok) throw new Error("Failed to update HP.");
      setSelectedEncounter(await res.json());
      notifyRefresh(selectedEncounter.id);
    } catch (err) {
      handleApiError(err, "Could not update HP.");
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateParticipant = async (participant, updates) => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/participants/${participant.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update participant.");
      setSelectedEncounter(await res.json());
      notifyRefresh(selectedEncounter.id);
    } catch (err) {
      handleApiError(err, "Could not update participant.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteParticipant = async (participantId) => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/participants/${participantId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) throw new Error("Failed to remove participant.");
      setSelectedEncounter(await res.json());
      notifyRefresh(selectedEncounter.id);
    } catch (err) {
      handleApiError(err, "Could not remove participant.");
    } finally {
      setBusy(false);
    }
  };

  const handleDeploy = async () => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/encounters/${selectedEncounter.id}/deploy`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ startX: deployX, startY: deployY }),
      });
      if (!res.ok) throw new Error("Failed to deploy tokens.");
      const updated = await res.json();
      setSelectedEncounter(updated);
      notifyRefresh(updated.id);
    } catch (err) {
      handleApiError(err, "Could not deploy tokens.");
    } finally {
      setBusy(false);
    }
  };

  /* ── Suggest Action handler ── */
  async function handleSuggestAction(participant) {
    if (!selectedEncounter) return;
    setSuggestingAction(participant.id);
    setActionSuggestion(null);
    setActionLoading(true);
    try {
      const response = await fetch(`/api/encounters/${selectedEncounter.id}/suggest-action`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": "1",
        },
        body: JSON.stringify({ participantId: participant.id }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      setActionSuggestion({ participantId: participant.id, ...data });
    } catch (err) {
      setActionSuggestion({ participantId: participant.id, recommended: "Failed to get suggestion", alternatives: [] });
    } finally {
      setSuggestingAction(null);
      setActionLoading(false);
    }
  }

  /* ── Death Save handlers ── */
  const handleDeathSave = async (participant, type) => {
    if (!isDm || busy) return;
    const ds = parseJson(participant.deathSaves, { successes: 0, failures: 0, isStable: false });
    if (ds.isStable) return;
    const updated = { ...ds };
    if (type === "success") {
      updated.successes = Math.min(updated.successes + 1, 3);
      if (updated.successes >= 3) updated.isStable = true;
    } else if (type === "failure") {
      updated.failures = Math.min(updated.failures + 1, 3);
    }
    await handleUpdateParticipant(participant, { deathSaves: JSON.stringify(updated) });
  };

  const handleResetDeathSaves = async (participant) => {
    if (!isDm || busy) return;
    await handleUpdateParticipant(participant, {
      deathSaves: JSON.stringify({ successes: 0, failures: 0, isStable: false }),
    });
  };

  /* ── Condition handlers ── */
  const handleAddCondition = async (participant, conditionName, duration) => {
    if (!isDm || busy) return;
    const conditions = parseJson(participant.conditions, []);
    // Prevent duplicates (update duration instead)
    const existing = conditions.findIndex(c => c.name === conditionName);
    if (existing >= 0) {
      conditions[existing].duration = duration;
    } else {
      conditions.push({ name: conditionName, duration: duration || null });
    }
    await handleUpdateParticipant(participant, { conditions: JSON.stringify(conditions) });
    setConditionPickerParticipant(null);
    setConditionPickerDuration(1);
  };

  const handleRemoveCondition = async (participant, conditionName) => {
    if (!isDm || busy) return;
    const conditions = parseJson(participant.conditions, []).filter(c => c.name !== conditionName);
    await handleUpdateParticipant(participant, { conditions: JSON.stringify(conditions) });
  };

  /* ---- derived data ---- */
  const sortedParticipants = useMemo(() => {
    if (!selectedEncounter?.participants) return [];
    return [...selectedEncounter.participants].sort(
      (a, b) => b.initiative - a.initiative
    );
  }, [selectedEncounter]);

  const statusMeta = selectedEncounter ? badgeColor(selectedEncounter.status) : null;

  const currentParticipantId =
    selectedEncounter && selectedEncounter.participants?.length > 0
      ? sortedParticipants[selectedEncounter.turnIndex % sortedParticipants.length]?.id
      : null;

  /* ---- render: list view ---- */
  if (!selectedEncounter) {
    return (
      <div style={encounterStyles.container}>
        {/* header */}
        <div style={encounterStyles.header}>
          <Swords size={22} color="#4ade80" />
          <h2 style={encounterStyles.headerTitle}>Encounters</h2>
          {isDm && (
            <>
              <button
                style={encounterStyles.btnSecondary}
                onClick={() => setShowAiBuilder(true)}
              >
                ✨ AI Build
              </button>
              <button style={encounterStyles.btnPrimary} onClick={handleCreateEncounter}>
                <Plus size={18} />
                New
              </button>
            </>
          )}
        </div>

        {/* map selector */}
        <div style={encounterStyles.mapBar}>
          <label style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>
            Map:
          </label>
          <select
            style={encounterStyles.mapSelect}
            value={selectedMapId}
            onChange={(e) => setSelectedMapId(e.target.value)}
          >
            <option value="">All Maps</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* error */}
        {error && <div style={encounterStyles.error}>{error}</div>}

        {/* encounter list */}
        <div style={encounterStyles.listArea}>
          {loading && <div style={encounterStyles.empty}>Loading encounters…</div>}

          {!loading && encounters.length === 0 && (
            <div style={encounterStyles.empty}>
              <p>No encounters yet.</p>
              {isDm && <p style={{ fontSize: 13, marginTop: 8 }}>Click "New" to create one for the selected map.</p>}
            </div>
          )}

          {encounters.map((enc) => {
            const meta = badgeColor(enc.status);
            const isActive = enc.status === "ACTIVE";
            return (
              <div
                key={enc.id}
                style={{ ...encounterStyles.card, ...(isActive ? encounterStyles.cardActive : {}) }}
                onClick={() => {
                  fetchEncounter(enc.id);
                  if (!isPopout) navigate(`${basePath}/${enc.id}`, { replace: true });
                }}
              >
                <div style={{ ...encounterStyles.cardIcon, background: meta.bg }}>
                  <Swords size={20} color={meta.fg} />
                </div>
                <div style={encounterStyles.cardInfo}>
                  <div style={encounterStyles.cardName}>{enc.name}</div>
                  <div style={encounterStyles.cardMeta}>
                    Round {enc.round} &middot;{" "}
                    {enc.participants?.length ?? 0} combatants
                  </div>
                </div>
                <span style={{ ...encounterStyles.badge, color: meta.fg, background: meta.bg }}>
                  {enc.status}
                </span>
              </div>
            );
          })}
        </div>

        <AiBuilderModal
          show={showAiBuilder}
          onClose={() => setShowAiBuilder(false)}
          authHeaders={authHeaders}
          maps={maps}
          selectedMapId={selectedMapId}
          npcs={npcs}
          addToast={addToast}
          fetchEncounters={fetchEncounters}
          fetchEncounter={fetchEncounter}
          notifyRefresh={notifyRefresh}
        />
      </div>
    );
  }

  /* ---- render: detail view ---- */
  return (
    <div style={encounterStyles.container}>
      {/* detail header */}
      <div style={encounterStyles.detailHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <button
            onClick={() => { setSelectedEncounter(null); localStorage.removeItem(SELECTED_ENCOUNTER_STORAGE_KEY); if (!isPopout) navigate(basePath, { replace: true }); }}
            style={{
              background: "none",
              border: "none",
              color: "#94a3b8",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              minWidth: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
            }}
            aria-label="Back to encounter list"
          >
            <ArrowLeft size={20} />
          </button>
          <div style={encounterStyles.detailNameRow}>
            <span style={encounterStyles.detailName}>{selectedEncounter.name}</span>
            {statusMeta && (
              <span
                style={{
                  ...encounterStyles.badge,
                  color: statusMeta.fg,
                  background: statusMeta.bg,
                }}
              >
                {selectedEncounter.status}
              </span>
            )}
          </div>
        </div>
        <div style={encounterStyles.detailMeta}>
          Round {selectedEncounter.round} &middot;{" "}
          {selectedEncounter.participants?.length || 0} combatants
          {selectedEncounter.map?.name ? ` · Map: ${selectedEncounter.map.name}` : ""}
        </div>
        {isDm && (
          <div style={encounterStyles.statusRow}>
            {["DRAFT", "ACTIVE", "COMPLETE"].map((s) => (
              <button
                key={s}
                style={
                  selectedEncounter.status === s
                    ? encounterStyles.statusBtnActive(s)
                    : encounterStyles.statusBtn
                }
                onClick={() => handleSetStatus(s)}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* error */}
      {error && <div style={encounterStyles.error}>{error}</div>}

      {isDm && selectedEncounter.status !== "COMPLETE" && showAddParticipant && (
        <AddParticipantPanel
          encounterId={selectedEncounter.id}
          authHeaders={authHeaders}
          npcs={npcs}
          characters={characters}
          addToast={addToast}
          onParticipantAdded={(updated) => {
            setSelectedEncounter(updated);
            notifyRefresh(updated.id);
            setShowAddParticipant(false);
          }}
          onCancel={() => setShowAddParticipant(false)}
        />
      )}

      {/* initiative tracker table */}
      <div style={encounterStyles.tableWrap}>
        {sortedParticipants.length === 0 && (
          <div style={encounterStyles.empty}>
            <p>No combatants in this encounter.</p>
            {isDm && selectedEncounter.status !== "COMPLETE" && (
              <p style={{ fontSize: 13, marginTop: 8 }}>
                Add monsters, NPCs, or player characters to build the roster.
              </p>
            )}
          </div>
        )}

        {sortedParticipants.length > 0 && (
          <table style={encounterStyles.table}>
            <thead>
              <tr>
                <th style={{ ...encounterStyles.th, width: 30 }}></th>
                <th style={encounterStyles.th}>Name</th>
                <th style={{ ...encounterStyles.th, width: 54, textAlign: "center" }}>Init</th>
                <th style={encounterStyles.th}>HP</th>
                <th style={{ ...encounterStyles.th, width: 40, textAlign: "center" }}>AC</th>
                {isDm && selectedEncounter.status !== "COMPLETE" && (
                  <th style={{ ...encounterStyles.th, width: 30 }}></th>
                )}
              </tr>
            </thead>
            <tbody>
              {sortedParticipants.map((p) => {
                const isCurrent = p.id === currentParticipantId;
                const hpPct = p.maxHp
                  ? Math.max(0, Math.min(100, (p.currentHp / p.maxHp) * 100))
                  : 100;
                const editing = editingInitiative === p.id;

                return (
                  <tr key={p.id} style={encounterStyles.trRow(isCurrent)}>
                    {/* current turn indicator */}
                    <td style={encounterStyles.td}>
                      {isCurrent && (
                        <Zap size={16} color="#4ade80" style={{ display: "block" }} />
                      )}
                    </td>

                    {/* name + conditions */}
                    <td style={encounterStyles.td}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      {p.isHidden && (
                        <span style={{ fontSize: 10, color: "#64748b" }}>Hidden</span>
                      )}
                      {/* Condition pills */}
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
                        {parseJson(p.conditions, []).map((cond) => {
                          const condColor = CONDITION_COLORS[cond.name] || DEFAULT_COND_COLOR;
                          return (
                            <span
                              key={cond.name}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                                fontSize: 9,
                                padding: "1px 5px",
                                borderRadius: 3,
                                background: condColor + "22",
                                border: "1px solid " + condColor + "66",
                                color: condColor,
                                fontWeight: 600,
                              }}
                            >
                              {cond.name}
                              {cond.duration !== undefined && cond.duration !== null && (
                                <span style={{ opacity: 0.7, marginLeft: 2 }}>
                                  ({cond.duration})
                                </span>
                              )}
                              {isDm && selectedEncounter.status !== "COMPLETE" && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemoveCondition(p, cond.name); }}
                                  style={{
                                    background: "none", border: "none", color: condColor,
                                    cursor: "pointer", padding: 0, marginLeft: 2,
                                    fontSize: 10, lineHeight: 1,
                                  }}
                                  title={`Remove ${cond.name}`}
                                >
                                  ×
                                </button>
                              )}
                            </span>
                          );
                        })}
                        {isDm && selectedEncounter.status !== "COMPLETE" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConditionPickerParticipant(p.id === conditionPickerParticipant ? null : p.id); setConditionPickerDuration(1); }}
                            style={{
                              fontSize: 9, padding: "1px 5px", borderRadius: 3,
                              background: "rgba(255,255,255,0.06)",
                              border: "1px dashed rgba(255,255,255,0.2)",
                              color: "#94a3b8", cursor: "pointer", fontWeight: 600,
                            }}
                            title="Add condition"
                          >
                            +Condition
                          </button>
                        )}
                      </div>
                      {/* Condition picker dropdown */}
                      {conditionPickerParticipant === p.id && (
                        <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 3 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                            {CONDITION_OPTIONS.map((cName) => {
                              const cColor = CONDITION_COLORS[cName] || DEFAULT_COND_COLOR;
                              const hasIt = parseJson(p.conditions, []).some(c => c.name === cName);
                              return (
                                <button
                                  key={cName}
                                  onClick={(e) => { e.stopPropagation(); if (!hasIt) handleAddCondition(p, cName, conditionPickerDuration); }}
                                  disabled={hasIt}
                                  style={{
                                    fontSize: 9, padding: "2px 5px", borderRadius: 3,
                                    background: hasIt ? cColor + "44" : "transparent",
                                    border: "1px solid " + cColor + "66",
                                    color: hasIt ? cColor : cColor + "aa",
                                    cursor: hasIt ? "default" : "pointer", fontWeight: 600,
                                    opacity: hasIt ? 0.5 : 1,
                                  }}
                                >
                                  {cName}
                                </button>
                              );
                            })}
                          </div>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
                            <span style={{ color: "#94a3b8" }}>Duration (rounds):</span>
                            <input
                              type="number"
                              min={1}
                              max={99}
                              style={{ width: 44, padding: "1px 3px", fontSize: 10 }}
                              value={conditionPickerDuration}
                              onChange={(e) => setConditionPickerDuration(Math.max(1, Number(e.target.value) || 1))}
                            />
                            <span style={{ color: "#64748b", fontSize: 9 }}>(leave blank = permanent)</span>
                            <input
                              type="checkbox"
                              style={{ margin: 0 }}
                              onChange={(e) => setConditionPickerDuration(e.target.checked ? null : 1)}
                            />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); setConditionPickerParticipant(null); }}
                            style={{ fontSize: 9, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </td>

                    {/* initiative */}
                    <td style={{ ...encounterStyles.td, textAlign: "center" }}>
                      {isDm && selectedEncounter.status !== "COMPLETE" ? (
                        editing ? (
                          <input
                            style={encounterStyles.initEdit}
                            type="number"
                            autoFocus
                            value={p.initiative}
                            onChange={(e) => {
                              handleUpdateParticipant(p, {
                                initiative: Number(e.target.value) || 0,
                              });
                            }}
                            onBlur={() => setEditingInitiative(null)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") setEditingInitiative(null);
                            }}
                          />
                        ) : (
                          <span
                            style={{
                              cursor: "pointer",
                              fontWeight: 700,
                              fontSize: 15,
                              color: "#e2e8f0",
                            }}
                            onClick={() => setEditingInitiative(p.id)}
                            title="Click to edit initiative"
                          >
                            {p.initiative}
                          </span>
                        )
                      ) : (
                        <span style={{ fontWeight: 700, fontSize: 15 }}>
                          {p.initiative}
                        </span>
                      )}
                    </td>

                    {/* HP */}
                    <td style={encounterStyles.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 56 }}>
                          {p.currentHp}/{p.maxHp}
                        </span>
                        {isDm && selectedEncounter.status !== "COMPLETE" && (
                          <>
                            <button
                              style={encounterStyles.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, -5)}
                              title="-5 HP"
                            >
                              -5
                            </button>
                            <button
                              style={encounterStyles.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, -1)}
                              title="-1 HP"
                            >
                              -1
                            </button>
                            <button
                              style={encounterStyles.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, 1)}
                              title="+1 HP"
                            >
                              +1
                            </button>
                            <button
                              style={encounterStyles.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, 5)}
                              title="+5 HP"
                            >
                              +5
                            </button>
                          </>
                        )}
                      </div>
                      <div style={encounterStyles.hpBarOuter}>
                        <div style={encounterStyles.hpBarInner(hpPct)} />
                      </div>
                      {/* ── Death Saves Widget ── */}
                      {p.currentHp === 0 && (
                        <div style={{ marginTop: 4 }}>
                          {(() => {
                            const ds = parseJson(p.deathSaves, { successes: 0, failures: 0, isStable: false });
                            if (ds.isStable) {
                              return (
                                <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>
                                  ✓ Stable
                                </span>
                              );
                            }
                            return (
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 9, color: "#94a3b8", fontWeight: 600 }}>DS:</span>
                                {/* Success boxes */}
                                {[1, 2, 3].map((i) => (
                                  <button
                                    key={`s${i}`}
                                    onClick={(e) => { e.stopPropagation(); handleDeathSave(p, "success"); }}
                                    disabled={!isDm}
                                    style={{
                                      width: 14, height: 14, borderRadius: 2, padding: 0,
                                      border: `1px solid ${i <= ds.successes ? "#22c55e" : "#4a5568"}`,
                                      background: i <= ds.successes ? "#22c55e33" : "transparent",
                                      cursor: isDm ? "pointer" : "default",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                    title={`Death save success ${i <= ds.successes ? "✓" : ""}`}
                                  >
                                    {i <= ds.successes && <span style={{ fontSize: 9, color: "#22c55e" }}>✓</span>}
                                  </button>
                                ))}
                                <span style={{ fontSize: 9, color: "#64748b" }}>/</span>
                                {/* Failure boxes */}
                                {[1, 2, 3].map((i) => (
                                  <button
                                    key={`f${i}`}
                                    onClick={(e) => { e.stopPropagation(); handleDeathSave(p, "failure"); }}
                                    disabled={!isDm}
                                    style={{
                                      width: 14, height: 14, borderRadius: 2, padding: 0,
                                      border: `1px solid ${i <= ds.failures ? "#ef4444" : "#4a5568"}`,
                                      background: i <= ds.failures ? "#ef444433" : "transparent",
                                      cursor: isDm ? "pointer" : "default",
                                      display: "flex", alignItems: "center", justifyContent: "center",
                                    }}
                                    title={`Death save failure ${i <= ds.failures ? "✗" : ""}`}
                                  >
                                    {i <= ds.failures && <span style={{ fontSize: 9, color: "#ef4444" }}>✗</span>}
                                  </button>
                                ))}
                                {isDm && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); handleResetDeathSaves(p); }}
                                    style={{
                                      background: "none", border: "none", color: "#64748b",
                                      cursor: "pointer", padding: 0, fontSize: 9,
                                      marginLeft: 2,
                                    }}
                                    title="Reset death saves"
                                  >
                                    ↺
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      )}
                    </td>

                    {/* AC */}
                    <td style={{ ...encounterStyles.td, textAlign: "center" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 2,
                          fontWeight: 700,
                          fontSize: 14,
                        }}
                      >
                        <Shield size={14} color="#94a3b8" />
                        {p.ac}
                      </div>
                    </td>

                    {/* actions: suggest + delete */}
                    {isDm && selectedEncounter.status !== "COMPLETE" && (
                      <td style={encounterStyles.td}>
                        <div style={{ display: "flex", gap: 2, alignItems: "center" }}>
                          <button
                            onClick={() => handleSuggestAction(p)}
                            disabled={suggestingAction === p.id}
                            style={{
                              background: "none",
                              border: "none",
                              color: suggestingAction === p.id ? "#c8973a" : "#94a3b8",
                              cursor: "pointer",
                              padding: 4,
                              minWidth: 30,
                              minHeight: 30,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            title="Suggest Action"
                            aria-label={`Suggest action for ${p.name}`}
                          >
                            <Lightbulb size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteParticipant(p.id)}
                            style={{
                              background: "none",
                              border: "none",
                              color: "#64748b",
                              cursor: "pointer",
                              padding: 4,
                              minWidth: 30,
                              minHeight: 30,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            aria-label={`Remove ${p.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* bottom bar: turn controls + actions */}
      {isDm && selectedEncounter.status !== "COMPLETE" && (
        <div style={encounterStyles.bottomBar}>
          {selectedEncounter.status === "ACTIVE" && sortedParticipants.length > 0 && (
            <>
              <button
                style={encounterStyles.btnSecondary}
                onClick={() => handleAdvanceTurn("previous")}
              >
                <ChevronLeft size={18} />
                Prev
              </button>
              <button
                style={{ ...encounterStyles.btnPrimary, flex: 1 }}
                onClick={() => handleAdvanceTurn("next")}
              >
                Next Turn
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {selectedEncounter.status === "DRAFT" && sortedParticipants.length > 0 && (
            <button
              style={{ ...encounterStyles.btnPrimary, flex: 1 }}
              onClick={handleStartEncounter}
            >
              <Zap size={18} />
              Roll Initiative &amp; Start
            </button>
          )}

          {selectedEncounter.status === "ACTIVE" && (
            <button
              style={encounterStyles.btnDanger}
              onClick={() => handleSetStatus("COMPLETE")}
            >
              <Flag size={16} />
              End Combat
            </button>
          )}

          {selectedEncounter.status === "DRAFT" && (
            <>
              <button
                style={encounterStyles.btnSecondary}
                onClick={() => setShowAddParticipant(!showAddParticipant)}
              >
                <UserPlus size={16} />
                Add Combatant
              </button>
              <div style={{ display: "flex", gap: 4, alignItems: "center", marginLeft: "auto" }}>
                <label style={{ fontSize: 12, color: "#94a3b8" }}>
                  Deploy at
                </label>
                <input
                  type="number"
                  style={{ ...encounterStyles.input, width: 56 }}
                  value={deployX}
                  onChange={(e) => setDeployX(Number(e.target.value) || 0)}
                  aria-label="Deploy X"
                  placeholder="X"
                />
                <input
                  type="number"
                  style={{ ...encounterStyles.input, width: 56 }}
                  value={deployY}
                  onChange={(e) => setDeployY(Number(e.target.value) || 0)}
                  aria-label="Deploy Y"
                  placeholder="Y"
                />
                <button style={encounterStyles.btnSecondary} onClick={handleDeploy}>
                  Deploy
                </button>
              </div>
              <button
                style={encounterStyles.btnDanger}
                onClick={() => handleDeleteEncounter(selectedEncounter.id)}
              >
                <Trash2 size={16} />
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Action Suggestion Popover ── */}
      {(actionLoading || actionSuggestion) && (
        <div
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setActionSuggestion(null)}
        >
          <div
            style={{
              background: "#1e293b",
              border: "1px solid #334155",
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: "90%",
              maxHeight: "80vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Lightbulb size={20} color="#eab308" />
                <span style={{ fontWeight: 700, fontSize: 16, color: "#e2e8f0" }}>
                  {actionSuggestion
                    ? `Suggest Action`
                    : "Thinking…"}
                </span>
              </div>
              <button
                onClick={() => setActionSuggestion(null)}
                style={{
                  background: "none", border: "none", color: "#94a3b8",
                  cursor: "pointer", padding: 4,
                  minWidth: 30, minHeight: 30,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Loading state */}
            {actionLoading && (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <div style={{ color: "#eab308", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Consulting tactical oracle…
                </div>
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Analyzing combat situation and statblock…
                </div>
              </div>
            )}

            {/* Result / Error */}
            {!actionLoading && actionSuggestion && (
              <>
                {/* Recomended action */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{
                    fontWeight: 600, fontSize: 11, color: "#4ade80",
                    marginBottom: 6, textTransform: "uppercase", letterSpacing: 1,
                  }}>
                    Recommended Action
                  </div>
                  <div style={{
                    color: "#e2e8f0", fontSize: 14, lineHeight: 1.6,
                    background: "#0f172a", borderRadius: 8, padding: 12,
                  }}>
                    {actionSuggestion.recommended || "No recommendation available."}
                  </div>
                </div>

                {/* Alternatives */}
                {actionSuggestion.alternatives && actionSuggestion.alternatives.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{
                      fontWeight: 600, fontSize: 11, color: "#94a3b8",
                      marginBottom: 6, textTransform: "uppercase", letterSpacing: 1,
                    }}>
                      Alternatives
                    </div>
                    <ul style={{ margin: 0, padding: "0 0 0 16px", color: "#cbd5e1", fontSize: 13, lineHeight: 1.8 }}>
                      {actionSuggestion.alternatives.map((alt, i) => (
                        <li key={i}>{alt}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Error state */}
                {actionSuggestion.recommended === "Failed to get suggestion" && (
                  <div style={{
                    marginTop: 8, padding: "8px 12px",
                    background: "#7f1d1d33", border: "1px solid #7f1d1d66",
                    borderRadius: 8, color: "#fca5a5", fontSize: 13,
                  }}>
                    Could not fetch AI suggestion. Check the server connection or AI settings.
                  </div>
                )}
              </>
            )}

            {/* Close button */}
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button
                onClick={() => setActionSuggestion(null)}
                style={{
                  background: "#334155", border: "none", color: "#e2e8f0",
                  padding: "8px 20px", borderRadius: 8, cursor: "pointer",
                  fontWeight: 600, fontSize: 14,
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
