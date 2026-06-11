// =============================================================================
// Tablecast  Session Planning & Management Panel
// DM prep hub with lifecycle management; read-only mode for players.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useConfirm } from "../context/ConfirmContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import { sessionStyles } from "./sessions/sessionStyles";
import SessionList from "./sessions/SessionList";
import SessionDetail from "./sessions/SessionDetail";

function SessionsPanel({ user, readOnly = false, isPopout = false, basePath = "/dm/sessions" }) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isDm = user?.role === "DM" && !readOnly;
  const { showConfirm } = useConfirm();

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("PLANNED");

  const [wikiArticles, setWikiArticles] = useState([]);
  const [maps, setMaps] = useState([]);
  const [encounters, setEncounters] = useState([]);

  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const query = isDm ? "" : "?visible=true";
      const res = await fetch(`/api/sessions${query}`, { headers: authHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load sessions.");
      }
      const data = await res.json();
      setSessions(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, isDm]);

  const fetchResources = useCallback(async () => {
    if (!isDm) return;
    try {
      const [wikiRes, mapsRes, encountersRes] = await Promise.all([
        fetch("/api/wiki", { headers: authHeaders }),
        fetch("/api/maps", { headers: authHeaders }),
        fetch("/api/encounters", { headers: authHeaders }),
      ]);
      if (wikiRes.ok) setWikiArticles(await wikiRes.json());
      if (mapsRes.ok) setMaps(await mapsRes.json());
      if (encountersRes.ok) setEncounters(await encountersRes.json());
    } catch (err) {
      console.error("Failed to load session link resources:", err);
    }
  }, [authHeaders, isDm]);

  const fetchSession = useCallback(
    async (sessionId) => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/sessions/${sessionId}`, { headers: authHeaders });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to load session.");
        }
        const data = await res.json();
        setSelectedSession(data);
      } catch (err) {
        setError(err.message);
        setSelectedSession(null);
      } finally {
        setLoading(false);
      }
    },
    [authHeaders]
  );

  useEffect(() => {
    fetchSessions();
    fetchResources();
  }, [fetchSessions, fetchResources]);

  useEffect(() => {
    if (routeId) {
      fetchSession(routeId);
    } else {
      setSelectedSession(null);
    }
  }, [routeId, fetchSession]);

  const filteredSessions = useMemo(() => {
    return sessions.filter((session) => session.status === statusFilter);
  }, [sessions, statusFilter]);

  const wikiById = useMemo(() => {
    const map = new Map();
    wikiArticles.forEach((article) => map.set(article.id, article));
    return map;
  }, [wikiArticles]);

  const mapById = useMemo(() => {
    const lookup = new Map();
    maps.forEach((mapItem) => lookup.set(mapItem.id, mapItem));
    return lookup;
  }, [maps]);

  const encounterById = useMemo(() => {
    const lookup = new Map();
    encounters.forEach((encounter) => lookup.set(encounter.id, encounter));
    return lookup;
  }, [encounters]);

  async function handleCreateSession() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          title: `Session ${sessions.length + 1}`,
          sessionNumber: sessions.length + 1,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create session.");
      }
      const created = await res.json();
      await fetchSessions();
      navigate(`${basePath}/${created.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function patchSession(updates) {
    if (!selectedSession) return null;
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/sessions/${selectedSession.id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save session.");
      }
      const updated = await res.json();
      setSelectedSession(updated);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
      return updated;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSession() {
    if (!selectedSession) return;
    if (!(await showConfirm(`Delete "${selectedSession.title}"?`, `Are you sure you want to delete the session "${selectedSession.title}"?`))) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/sessions/${selectedSession.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete session.");
      }
      await fetchSessions();
      navigate(basePath);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function updateLocalField(field, value) {
    setSelectedSession((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function handleSessionSynced(updatedSession) {
    setSelectedSession(updatedSession);
    setSessions((prev) => prev.map((s) => (s.id === updatedSession.id ? updatedSession : s)));
  }

  return (
    <div style={{ ...sessionStyles.container, ...(isPopout ? sessionStyles.popoutContainer : {}) }}>
      {error && <div style={sessionStyles.errorBanner}>{error}</div>}
      {routeId ? (
        <SessionDetail
          selectedSession={selectedSession}
          saving={saving}
          error={error}
          isDm={isDm}
          user={user}
          authHeaders={authHeaders}
          navigate={navigate}
          basePath={basePath}
          wikiById={wikiById}
          mapById={mapById}
          encounterById={encounterById}
          wikiArticles={wikiArticles}
          maps={maps}
          encounters={encounters}
          onUpdateField={updateLocalField}
          onPatchSession={patchSession}
          onDeleteSession={handleDeleteSession}
          onSetError={setError}
          onSetSaving={setSaving}
          onSessionSynced={handleSessionSynced}
          showConfirm={showConfirm}
        />
      ) : (
        <SessionList
          filteredSessions={filteredSessions}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          loading={loading}
          selectedSession={selectedSession}
          saving={saving}
          isDm={isDm}
          readOnly={readOnly}
          onCreateSession={handleCreateSession}
          basePath={basePath}
          navigate={navigate}
        />
      )}
    </div>
  );
}

export default SessionsPanel;
