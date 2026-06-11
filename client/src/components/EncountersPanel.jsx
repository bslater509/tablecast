// =============================================================================
// Tablecast  Encounter Initiative Tracker Panel
// Dedicated combat management: initiative order, HP tracking, turn control.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Flag,
  Plus,
  Shield,
  Swords,
  Trash2,
  UserPlus,
  Zap,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useSocket } from "../context/SocketContext";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { encounterStyles, hpColor, badgeColor } from "./encounters/encounterStyles";
import AiBuilderModal from "./encounters/AiBuilderModal";
import AddParticipantPanel from "./encounters/AddParticipantPanel";

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

  /* ---- auth headers ---- */
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  /* ---- state ---- */
  const [maps, setMaps] = useState([]);
  const [selectedMapId, setSelectedMapId] = useState("");
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
      } catch (err) {
        handleApiError(err, "Could not load encounter.");
        setSelectedEncounter(null);
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
  }, [fetchMaps, fetchResources]);

  useEffect(() => {
    fetchEncounters(selectedMapId || undefined);
  }, [selectedMapId, fetchEncounters]);

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
                onClick={() => fetchEncounter(enc.id)}
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
            onClick={() => setSelectedEncounter(null)}
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

                    {/* name */}
                    <td style={encounterStyles.td}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      {p.isHidden && (
                        <span style={{ fontSize: 10, color: "#64748b" }}>Hidden</span>
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

                    {/* delete */}
                    {isDm && selectedEncounter.status !== "COMPLETE" && (
                      <td style={encounterStyles.td}>
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
    </div>
  );
}
