// =============================================================================
// Tablecast  Encounter Initiative Tracker Panel
// Dedicated combat management: initiative order, HP tracking, turn control.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

/* ------------------------------------------------------------------ */
/*  Colour helpers                                                     */
/* ------------------------------------------------------------------ */
function hpColor(pct) {
  if (pct > 66) return "#22c55e";
  if (pct > 33) return "#eab308";
  return "#ef4444";
}

function badgeColor(status) {
  switch (status) {
    case "DRAFT":    return { bg: "#334155", fg: "#94a3b8" };
    case "ACTIVE":   return { bg: "#166534", fg: "#4ade80" };
    case "COMPLETE":  return { bg: "#1e3a5f", fg: "#60a5fa" };
    default:         return { bg: "#334155", fg: "#94a3b8" };
  }
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */
export default function EncountersPanel({
  user,
  readOnly = false,
  isPopout = false,
  basePath = "/dm/encounters",
}) {
  const { addToast } = useToast();
  const { showConfirm } = useConfirm();
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();
  const isDm = user?.role === "DM" && !readOnly;

  /* ---- auth headers ---- */
  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-tablecast-user-id": String(user?.id || ""),
    }),
    [user?.id]
  );

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
  const [addType, setAddType] = useState("monster");
  const [addMonsterQuery, setAddMonsterQuery] = useState("");
  const [addMonsterResults, setAddMonsterResults] = useState([]);
  const [addMonsterSelected, setAddMonsterSelected] = useState(null);
  const [addQuantity, setAddQuantity] = useState(1);
  const [addHidden, setAddHidden] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [characters, setCharacters] = useState([]);
  const [addNpcId, setAddNpcId] = useState("");
  const [addCharId, setAddCharId] = useState("");

  /* initiative editing */
  const [editingInitiative, setEditingInitiative] = useState(null);

  /* deploy state */
  const [deployX, setDeployX] = useState(0);
  const [deployY, setDeployY] = useState(0);

  /* AI builder state */
  const [showAiBuilder, setShowAiBuilder] = useState(false);
  const [aiLevels, setAiLevels] = useState("");
  const [aiDifficulty, setAiDifficulty] = useState("medium");
  const [aiContext, setAiContext] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiProgress, setAiProgress] = useState("");
  const [aiResult, setAiResult] = useState(null);

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

  const handleAddParticipant = async () => {
    if (!isDm || !selectedEncounter || busy) return;
    setBusy(true);
    try {
      let body = { isHidden: addHidden, quantity: addQuantity };
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
        `/api/encounters/${selectedEncounter.id}/participants`,
        { method: "POST", headers: authHeaders, body: JSON.stringify(body) }
      );
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Failed to add participant.");
      }
      const updated = await res.json();
      setSelectedEncounter(updated);
      notifyRefresh(updated.id);
      setShowAddParticipant(false);
      setAddMonsterSelected(null);
      setAddMonsterQuery("");
      setAddMonsterResults([]);
      setAddQuantity(1);
      setAddHidden(false);
      setAddNpcId("");
      setAddCharId("");
    } catch (err) {
      handleApiError(err, "Could not add participant.");
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

  /* ---- AI Builder ---- */
  const handleAiBuild = async () => {
    const levels = aiLevels
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!levels.length) {
      setAiError("Enter at least one party level (e.g. 3, 5, 7).");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiProgress("Consulting your monster database...");
    try {
      const res = await fetch("/api/ai/build-encounter", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          partyLevels: levels,
          difficulty: aiDifficulty,
          context: aiContext.trim(),
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "AI build failed.");
      }
      const data = await res.json();
      if (data.encounter) {
        setAiResult(data.encounter);
      } else {
        throw new Error("No encounter data returned.");
      }
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
      setAiProgress("");
    }
  };

  const handleApplyAiResult = async () => {
    if (!aiResult || !isDm) return;
    setAiLoading(true);
    try {
      const mapId = selectedMapId || (maps[0]?.id);
      if (!mapId) { addToast("Select a map first.", "warning"); return; }
      const encRes = await fetch("/api/encounters", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          name: aiResult.name || "AI Encounter",
          mapId: Number(mapId),
        }),
      });
      if (!encRes.ok) throw new Error("Failed to create encounter.");
      const enc = await encRes.json();
      for (const p of aiResult.participants || []) {
        if (p.type === "monster") {
          try {
            const sr = await fetch(
              `/api/monsters?search=${encodeURIComponent(p.name)}`,
              { headers: authHeaders }
            );
            if (sr.ok) {
              const monsters = await sr.json();
              const m = monsters.find(
                (m) => m.name.toLowerCase() === p.name.toLowerCase()
              ) || monsters[0];
              if (m) {
                for (let i = 0; i < (p.quantity || 1); i++) {
                  await fetch(`/api/encounters/${enc.id}/participants`, {
                    method: "POST",
                    headers: authHeaders,
                    body: JSON.stringify({ type: "monster", monsterId: m.id, isHidden: false }),
                  });
                }
              }
            }
          } catch { /* skip */ }
        } else if (p.type === "npc") {
          const matched = npcs.find(
            (n) => n.name.toLowerCase() === String(p.name || "").toLowerCase()
          );
          if (matched) {
            await fetch(`/api/encounters/${enc.id}/participants`, {
              method: "POST",
              headers: authHeaders,
              body: JSON.stringify({ type: "npc", npcId: matched.id, isHidden: false }),
            });
          }
        }
      }
      setShowAiBuilder(false);
      setAiResult(null);
      await fetchEncounters(selectedMapId || undefined);
      fetchEncounter(enc.id);
      notifyRefresh(enc.id);
    } catch (err) {
      setAiError(err.message);
    } finally {
      setAiLoading(false);
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

  /* ---- shared base styles (outside useMemo to avoid circular refs) ---- */
  const baseInput = {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #334155",
    background: "#0f1117",
    color: "#e2e8f0",
    fontSize: 14,
  };

  /* ---- styles ---- */
  const styles = useMemo(
    () => ({
      /* ---------- layout ---------- */
      container: {
        display: "flex",
        flexDirection: "column",
        height: "100%",
        overflow: "hidden",
        background: "#0f1117",
        color: "#e2e8f0",
      },
      header: {
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      },
      headerTitle: {
        fontSize: isPopout ? 18 : 20,
        fontWeight: 700,
        margin: 0,
        flex: 1,
      },
      /* ---------- map selector ---------- */
      mapBar: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      },
      mapSelect: {
        flex: 1,
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #334155",
        background: "#1e293b",
        color: "#e2e8f0",
        fontSize: 14,
        minWidth: 0,
      },
      /* ---------- list ---------- */
      listArea: {
        flex: 1,
        overflowY: "auto",
        padding: 12,
      },
      card: {
        background: "#1a1f2e",
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        border: "1px solid #2d3748",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minHeight: 48, /* touch target */
      },
      cardActive: {
        borderColor: "#4ade80",
        boxShadow: "0 0 0 1px #4ade80",
      },
      cardIcon: {
        width: 40,
        height: 40,
        borderRadius: 10,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      },
      cardInfo: { flex: 1, minWidth: 0 },
      cardName: { fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
      cardMeta: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
      badge: {
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 20,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
      },
      /* ---------- detail header ---------- */
      detailHeader: {
        padding: "12px 16px",
        borderBottom: "1px solid #1e293b",
        flexShrink: 0,
      },
      detailNameRow: {
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      },
      detailName: { fontSize: 20, fontWeight: 700, flex: 1, minWidth: 0 },
      detailMeta: {
        fontSize: 13,
        color: "#94a3b8",
        marginTop: 4,
      },
      statusRow: {
        display: "flex",
        gap: 8,
        marginTop: 10,
        flexWrap: "wrap",
      },
      statusBtn: {
        padding: "4px 12px",
        borderRadius: 20,
        border: "1px solid #334155",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        background: "#1e293b",
        color: "#94a3b8",
      },
      statusBtnActive: (status) => ({
        padding: "4px 12px",
        borderRadius: 20,
        border: `1px solid ${badgeColor(status).fg}`,
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        background: badgeColor(status).bg,
        color: badgeColor(status).fg,
      }),
      /* ---------- initiative table ---------- */
      tableWrap: {
        flex: 1,
        overflowY: "auto",
        padding: "0 12px",
      },
      table: {
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 14,
      },
      th: {
        textAlign: "left",
        padding: "8px 6px",
        borderBottom: "2px solid #334155",
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.5px",
        color: "#64748b",
        position: "sticky",
        top: 0,
        background: "#0f1117",
        zIndex: 1,
      },
      trRow: (isCurrent) => ({
        borderBottom: "1px solid #1e293b",
        background: isCurrent ? "rgba(74,222,128,0.08)" : "transparent",
        transition: "background 0.15s",
      }),
      td: {
        padding: "8px 6px",
        verticalAlign: "middle",
      },
      hpBarOuter: {
        width: "100%",
        height: 6,
        borderRadius: 3,
        background: "#334155",
        overflow: "hidden",
        marginTop: 2,
      },
      hpBarInner: (pct) => ({
        height: "100%",
        width: `${Math.max(0, pct)}%`,
        background: hpColor(pct),
        transition: "width 0.3s",
        borderRadius: 3,
      }),
      hpBtn: {
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "1px solid #334155",
        background: "#1e293b",
        color: "#e2e8f0",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 2px",
      },
      hpBtnSm: {
        width: 24,
        height: 24,
        borderRadius: 5,
        border: "1px solid #334155",
        background: "#1e293b",
        color: "#94a3b8",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "0 1px",
      },
      /* ---------- bottom bar ---------- */
      bottomBar: {
        padding: "10px 16px",
        borderTop: "1px solid #1e293b",
        display: "flex",
        gap: 8,
        flexShrink: 0,
        flexWrap: "wrap",
      },
      btnPrimary: {
        padding: "8px 18px",
        borderRadius: 10,
        border: "none",
        background: "#4ade80",
        color: "#0f1117",
        fontSize: 14,
        fontWeight: 700,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
      },
      btnSecondary: {
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #334155",
        background: "#1e293b",
        color: "#e2e8f0",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
      },
      btnDanger: {
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #7f1d1d",
        background: "#1e293b",
        color: "#ef4444",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
      },
      /* ---------- add participant panel ---------- */
      addPanel: {
        padding: 12,
        borderBottom: "1px solid #1e293b",
        background: "#1a1f2e",
        flexShrink: 0,
      },
      addRow: {
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
      },
      input: {
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #334155",
        background: "#0f1117",
        color: "#e2e8f0",
        fontSize: 14,
      },
      select: {
        padding: "8px 12px",
        borderRadius: 8,
        border: "1px solid #334155",
        background: "#0f1117",
        color: "#e2e8f0",
        fontSize: 14,
      },
      /* ---------- AI modal ---------- */
      modalOverlay: {
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.7)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      },
      modal: {
        background: "#1a1f2e",
        borderRadius: 16,
        border: "1px solid #334155",
        width: "100%",
        maxWidth: 500,
        maxHeight: "90vh",
        overflowY: "auto",
        padding: 20,
      },
      modalTitle: {
        fontSize: 18,
        fontWeight: 700,
        margin: "0 0 16px 0",
        display: "flex",
        alignItems: "center",
        gap: 8,
      },
      textarea: {
        ...baseInput,
        width: "100%",
        resize: "vertical",
        minHeight: 60,
        boxSizing: "border-box",
      },
      /* ---------- misc ---------- */
      empty: {
        textAlign: "center",
        padding: 40,
        color: "#64748b",
      },
      error: {
        background: "rgba(239,68,68,0.15)",
        border: "1px solid rgba(239,68,68,0.3)",
        borderRadius: 10,
        padding: "10px 14px",
        margin: "0 12px 10px",
        fontSize: 13,
        color: "#fca5a5",
      },
      initEdit: {
        width: 40,
        padding: "4px 6px",
        borderRadius: 6,
        border: "1px solid #4ade80",
        background: "#0f1117",
        color: "#e2e8f0",
        fontSize: 13,
        textAlign: "center",
      },
    }),
    [isPopout]
  );
  const stylesObj = styles;

  /* ---- render: list view ---- */
  if (!selectedEncounter) {
    return (
      <div style={stylesObj.container}>
        {/* header */}
        <div style={stylesObj.header}>
          <Swords size={22} color="#4ade80" />
          <h2 style={stylesObj.headerTitle}>Encounters</h2>
          {isDm && (
            <>
              <button
                style={stylesObj.btnSecondary}
                onClick={() => setShowAiBuilder(true)}
              >
                ✨ AI Build
              </button>
              <button style={stylesObj.btnPrimary} onClick={handleCreateEncounter}>
                <Plus size={18} />
                New
              </button>
            </>
          )}
        </div>

        {/* map selector */}
        <div style={stylesObj.mapBar}>
          <label style={{ fontSize: 13, color: "#94a3b8", whiteSpace: "nowrap" }}>
            Map:
          </label>
          <select
            style={stylesObj.mapSelect}
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
        {error && <div style={stylesObj.error}>{error}</div>}

        {/* encounter list */}
        <div style={stylesObj.listArea}>
          {loading && <div style={stylesObj.empty}>Loading encounters…</div>}

          {!loading && encounters.length === 0 && (
            <div style={stylesObj.empty}>
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
                style={{ ...stylesObj.card, ...(isActive ? stylesObj.cardActive : {}) }}
                onClick={() => fetchEncounter(enc.id)}
              >
                <div style={{ ...stylesObj.cardIcon, background: meta.bg }}>
                  <Swords size={20} color={meta.fg} />
                </div>
                <div style={stylesObj.cardInfo}>
                  <div style={stylesObj.cardName}>{enc.name}</div>
                  <div style={stylesObj.cardMeta}>
                    Round {enc.round} &middot;{" "}
                    {enc.participants?.length ?? 0} combatants
                  </div>
                </div>
                <span style={{ ...stylesObj.badge, color: meta.fg, background: meta.bg }}>
                  {enc.status}
                </span>
              </div>
            );
          })}
        </div>

        {/* AI Builder modal */}
        {showAiBuilder && (
          <div
            style={stylesObj.modalOverlay}
            onClick={() => !aiLoading && setShowAiBuilder(false)}
          >
            <div style={stylesObj.modal} onClick={(e) => e.stopPropagation()}>
              <h3 style={stylesObj.modalTitle}>
                ✨ AI Encounter Builder
              </h3>
              {!aiResult ? (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Party Levels (comma-separated)
                    </label>
                    <input
                      style={stylesObj.input}
                      value={aiLevels}
                      onChange={(e) => setAiLevels(e.target.value)}
                      placeholder="e.g. 3, 3, 4"
                    />
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Difficulty
                    </label>
                    <select
                      style={stylesObj.select}
                      value={aiDifficulty}
                      onChange={(e) => setAiDifficulty(e.target.value)}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                      <option value="deadly">Deadly</option>
                    </select>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>
                      Context (optional)
                    </label>
                    <textarea
                      style={stylesObj.textarea}
                      value={aiContext}
                      onChange={(e) => setAiContext(e.target.value)}
                      placeholder="e.g. Forest encounter with goblins..."
                      rows={2}
                    />
                  </div>
                  <button
                    style={{ ...stylesObj.btnPrimary, width: "100%", justifyContent: "center" }}
                    onClick={handleAiBuild}
                    disabled={aiLoading}
                  >
                    {aiLoading ? "Building..." : "Build Encounter"}
                  </button>
                  {aiProgress && (
                    <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 8, textAlign: "center" }}>
                      {aiProgress}
                    </p>
                  )}
                  {aiError && (
                    <p style={{ fontSize: 13, color: "#fca5a5", marginTop: 8 }}>{aiError}</p>
                  )}
                </>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ fontSize: 16 }}>{aiResult.name}</strong>
                    <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 4 }}>
                      {aiResult.participants?.length || 0} combatant types
                    </p>
                  </div>
                  {(aiResult.participants || []).map((p, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 0",
                        borderBottom: "1px solid #1e293b",
                        fontSize: 13,
                      }}
                    >
                      <span>
                        {p.quantity > 1 ? `${p.quantity}× ` : ""}
                        {p.name}
                      </span>
                      <span style={{ color: "#94a3b8" }}>{p.type}</span>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                    <button
                      style={stylesObj.btnSecondary}
                      onClick={() => setAiResult(null)}
                    >
                      Back
                    </button>
                    <button
                      style={{ ...stylesObj.btnPrimary, flex: 1, justifyContent: "center" }}
                      onClick={handleApplyAiResult}
                      disabled={aiLoading}
                    >
                      Apply
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ---- render: detail view ---- */
  return (
    <div style={stylesObj.container}>
      {/* detail header */}
      <div style={stylesObj.detailHeader}>
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
          <div style={stylesObj.detailNameRow}>
            <span style={stylesObj.detailName}>{selectedEncounter.name}</span>
            {statusMeta && (
              <span
                style={{
                  ...stylesObj.badge,
                  color: statusMeta.fg,
                  background: statusMeta.bg,
                }}
              >
                {selectedEncounter.status}
              </span>
            )}
          </div>
        </div>
        <div style={stylesObj.detailMeta}>
          Round {selectedEncounter.round} &middot;{" "}
          {selectedEncounter.participants?.length || 0} combatants
          {selectedEncounter.map?.name ? ` · Map: ${selectedEncounter.map.name}` : ""}
        </div>
        {isDm && (
          <div style={stylesObj.statusRow}>
            {["DRAFT", "ACTIVE", "COMPLETE"].map((s) => (
              <button
                key={s}
                style={
                  selectedEncounter.status === s
                    ? stylesObj.statusBtnActive(s)
                    : stylesObj.statusBtn
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
      {error && <div style={stylesObj.error}>{error}</div>}

      {/* DM: add participant panel */}
      {isDm && selectedEncounter.status !== "COMPLETE" && showAddParticipant && (
        <div style={stylesObj.addPanel}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {["monster", "npc", "character"].map((t) => (
              <button
                key={t}
                style={
                  addType === t
                    ? { ...stylesObj.statusBtn, borderColor: "#4ade80", color: "#4ade80" }
                    : stylesObj.statusBtn
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
          <div style={stylesObj.addRow}>
            {addType === "monster" && (
              <>
                <div style={{ flex: 1, position: "relative", minWidth: 140 }}>
                  <input
                    style={{ ...stylesObj.input, width: "100%", boxSizing: "border-box" }}
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
                  style={{ ...stylesObj.input, width: 50 }}
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
                style={{ ...stylesObj.select, flex: 1, minWidth: 140 }}
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
                style={{ ...stylesObj.select, flex: 1, minWidth: 140 }}
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
            <button style={stylesObj.btnPrimary} onClick={handleAddParticipant}>
              <UserPlus size={16} />
              Add
            </button>
            <button
              style={stylesObj.btnSecondary}
              onClick={() => setShowAddParticipant(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* initiative tracker table */}
      <div style={stylesObj.tableWrap}>
        {sortedParticipants.length === 0 && (
          <div style={stylesObj.empty}>
            <p>No combatants in this encounter.</p>
            {isDm && selectedEncounter.status !== "COMPLETE" && (
              <p style={{ fontSize: 13, marginTop: 8 }}>
                Add monsters, NPCs, or player characters to build the roster.
              </p>
            )}
          </div>
        )}

        {sortedParticipants.length > 0 && (
          <table style={stylesObj.table}>
            <thead>
              <tr>
                <th style={{ ...stylesObj.th, width: 30 }}></th>
                <th style={stylesObj.th}>Name</th>
                <th style={{ ...stylesObj.th, width: 54, textAlign: "center" }}>Init</th>
                <th style={stylesObj.th}>HP</th>
                <th style={{ ...stylesObj.th, width: 40, textAlign: "center" }}>AC</th>
                {isDm && selectedEncounter.status !== "COMPLETE" && (
                  <th style={{ ...stylesObj.th, width: 30 }}></th>
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
                  <tr key={p.id} style={stylesObj.trRow(isCurrent)}>
                    {/* current turn indicator */}
                    <td style={stylesObj.td}>
                      {isCurrent && (
                        <Zap size={16} color="#4ade80" style={{ display: "block" }} />
                      )}
                    </td>

                    {/* name */}
                    <td style={stylesObj.td}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                      {p.isHidden && (
                        <span style={{ fontSize: 10, color: "#64748b" }}>Hidden</span>
                      )}
                    </td>

                    {/* initiative */}
                    <td style={{ ...stylesObj.td, textAlign: "center" }}>
                      {isDm && selectedEncounter.status !== "COMPLETE" ? (
                        editing ? (
                          <input
                            style={stylesObj.initEdit}
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
                    <td style={stylesObj.td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, minWidth: 56 }}>
                          {p.currentHp}/{p.maxHp}
                        </span>
                        {isDm && selectedEncounter.status !== "COMPLETE" && (
                          <>
                            <button
                              style={stylesObj.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, -5)}
                              title="-5 HP"
                            >
                              -5
                            </button>
                            <button
                              style={stylesObj.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, -1)}
                              title="-1 HP"
                            >
                              -1
                            </button>
                            <button
                              style={stylesObj.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, 1)}
                              title="+1 HP"
                            >
                              +1
                            </button>
                            <button
                              style={stylesObj.hpBtnSm}
                              onClick={() => handleUpdateParticipantHp(p, 5)}
                              title="+5 HP"
                            >
                              +5
                            </button>
                          </>
                        )}
                      </div>
                      <div style={stylesObj.hpBarOuter}>
                        <div style={stylesObj.hpBarInner(hpPct)} />
                      </div>
                    </td>

                    {/* AC */}
                    <td style={{ ...stylesObj.td, textAlign: "center" }}>
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
                      <td style={stylesObj.td}>
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
        <div style={stylesObj.bottomBar}>
          {selectedEncounter.status === "ACTIVE" && sortedParticipants.length > 0 && (
            <>
              <button
                style={stylesObj.btnSecondary}
                onClick={() => handleAdvanceTurn("previous")}
              >
                <ChevronLeft size={18} />
                Prev
              </button>
              <button
                style={{ ...stylesObj.btnPrimary, flex: 1 }}
                onClick={() => handleAdvanceTurn("next")}
              >
                Next Turn
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {selectedEncounter.status === "DRAFT" && sortedParticipants.length > 0 && (
            <button
              style={{ ...stylesObj.btnPrimary, flex: 1 }}
              onClick={handleStartEncounter}
            >
              <Zap size={18} />
              Roll Initiative &amp; Start
            </button>
          )}

          {selectedEncounter.status === "ACTIVE" && (
            <button
              style={stylesObj.btnDanger}
              onClick={() => handleSetStatus("COMPLETE")}
            >
              <Flag size={16} />
              End Combat
            </button>
          )}

          {selectedEncounter.status === "DRAFT" && (
            <>
              <button
                style={stylesObj.btnSecondary}
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
                  style={{ ...stylesObj.input, width: 56 }}
                  value={deployX}
                  onChange={(e) => setDeployX(Number(e.target.value) || 0)}
                  aria-label="Deploy X"
                  placeholder="X"
                />
                <input
                  type="number"
                  style={{ ...stylesObj.input, width: 56 }}
                  value={deployY}
                  onChange={(e) => setDeployY(Number(e.target.value) || 0)}
                  aria-label="Deploy Y"
                  placeholder="Y"
                />
                <button style={stylesObj.btnSecondary} onClick={handleDeploy}>
                  Deploy
                </button>
              </div>
              <button
                style={stylesObj.btnDanger}
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
