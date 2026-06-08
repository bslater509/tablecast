// =============================================================================
// Tablecast  Session Planning & Management Panel
// DM prep hub with lifecycle management; read-only mode for players.
// =============================================================================
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import AiAssistButton, { AI_FIELD_ACTIONS } from "./AiAssistButton";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Eye,
  EyeOff,
  Link2,
  Plus,
  Trash2,
  X,
} from "lucide-react";

marked.setOptions({ breaks: true, gfm: true });

function compileMarkdown(text) {
  if (!text) return "";
  return DOMPurify.sanitize(marked.parse(text));
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || "");
  } catch {
    return fallback;
  }
}

function parseIdArray(value) {
  return parseJson(value, []).filter((id) => Number.isInteger(Number(id)));
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function checklistProgress(checklistJson) {
  const items = parseJson(checklistJson, []);
  if (!items.length) return { done: 0, total: 0 };
  const done = items.filter((item) => item.done).length;
  return { done, total: items.length };
}

function SessionsPanel({ user, readOnly = false, isPopout = false, basePath = "/dm/sessions" }) {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isDm = user?.role === "DM" && !readOnly;

  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("PLANNED");
  const [showPreview, setShowPreview] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [publishMessage, setPublishMessage] = useState(null);
  const [aiSessionLoading, setAiSessionLoading] = useState(false);
  const [aiSessionProgress, setAiSessionProgress] = useState("");
  const [aiSessionError, setAiSessionError] = useState(null);

  const [wikiArticles, setWikiArticles] = useState([]);
  const [maps, setMaps] = useState([]);
  const [encounters, setEncounters] = useState([]);

  const authHeaders = useMemo(
    () => ({
      "Content-Type": "application/json",
      "x-tablecast-user-id": String(user?.id || ""),
    }),
    [user?.id]
  );

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
    if (!window.confirm(`Delete "${selectedSession.title}"?`)) return;
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

  async function handlePublishRecap() {
    if (!selectedSession) return;
    try {
      setSaving(true);
      setPublishMessage(null);
      const res = await fetch(`/api/sessions/${selectedSession.id}/publish-recap`, {
        method: "POST",
        headers: authHeaders,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to publish recap.");
      }
      const data = await res.json();
      setSelectedSession(data.session);
      setSessions((prev) => prev.map((s) => (s.id === data.session.id ? data.session : s)));
      setPublishMessage("Recap published to Campaign Wiki.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateRecap() {
    if (!selectedSession) return;
    setAiSessionLoading(true);
    setAiSessionError(null);
    setAiSessionProgress("Gathering session data...");

    try {
      const res = await fetch("/api/ai/session-recap", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sessionId: selectedSession.id }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to generate recap.");
        }
      }

      if (!res.ok || !res.body) {
        throw new Error("Failed to start recap stream.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultText = null;

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
            if (event.type === "status") setAiSessionProgress(event.message);
            if (event.type === "result") resultText = event.data;
            if (event.type === "error") throw new Error(event.message);
          } catch (e) {
            if (e.message) throw e;
          }
        }
      }

      if (resultText) {
        updateLocalField("recap", resultText);
        await patchSession({ recap: resultText });
      } else {
        throw new Error("No recap text received.");
      }
    } catch (err) {
      setAiSessionError(err.message);
    } finally {
      setAiSessionLoading(false);
      setAiSessionProgress("");
    }
  }

  async function handleGenerateAgenda() {
    if (!selectedSession) return;
    setAiSessionLoading(true);
    setAiSessionError(null);
    setAiSessionProgress("Analyzing campaign state...");

    try {
      const res = await fetch("/api/ai/session-agenda", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sessionId: selectedSession.id }),
      });

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/event-stream")) {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to generate agenda.");
        }
      }

      if (!res.ok || !res.body) {
        throw new Error("Failed to start agenda stream.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let resultText = null;

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
            if (event.type === "status") setAiSessionProgress(event.message);
            if (event.type === "result") resultText = event.data;
            if (event.type === "error") throw new Error(event.message);
          } catch (e) {
            if (e.message) throw e;
          }
        }
      }

      if (resultText) {
        updateLocalField("agenda", resultText);
        await patchSession({ agenda: resultText });
      } else {
        throw new Error("No agenda text received.");
      }
    } catch (err) {
      setAiSessionError(err.message);
    } finally {
      setAiSessionLoading(false);
      setAiSessionProgress("");
    }
  }

  function updateLocalField(field, value) {
    setSelectedSession((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function getChecklistItems() {
    return parseJson(selectedSession?.prepChecklist, []);
  }

  async function saveChecklist(items) {
    await patchSession({ prepChecklist: JSON.stringify(items) });
  }

  async function handleAddChecklistItem(e) {
    e.preventDefault();
    const text = newChecklistItem.trim();
    if (!text) return;
    const items = [
      ...getChecklistItems(),
      { id: `item-${Date.now()}`, text, done: false },
    ];
    setNewChecklistItem("");
    await saveChecklist(items);
  }

  async function handleToggleChecklistItem(itemId) {
    const items = getChecklistItems().map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    await saveChecklist(items);
  }

  async function handleRemoveChecklistItem(itemId) {
    const items = getChecklistItems().filter((item) => item.id !== itemId);
    await saveChecklist(items);
  }

  async function toggleLinkedId(field, id) {
    const current = parseIdArray(selectedSession[field]);
    const next = current.includes(id)
      ? current.filter((value) => value !== id)
      : [...current, id];
    await patchSession({ [field]: JSON.stringify(next) });
  }

  function renderLinkedResources() {
    if (!selectedSession) return null;

    const linkedWikiIds = parseIdArray(selectedSession.linkedWikiIds);
    const linkedMapIds = parseIdArray(selectedSession.linkedMapIds);
    const linkedEncounterIds = parseIdArray(selectedSession.linkedEncounterIds);

    const visibleWikiIds = isDm
      ? linkedWikiIds
      : linkedWikiIds.filter((wikiId) => wikiById.get(wikiId)?.isVisibleToPlayers);

    if (!isDm && !visibleWikiIds.length && !linkedMapIds.length && !linkedEncounterIds.length) {
      return <p style={styles.mutedText}>No linked resources for this session.</p>;
    }

    return (
      <div style={styles.linkedGroups}>
        {visibleWikiIds.length > 0 && (
          <div style={styles.linkedGroup}>
            <div style={styles.linkedGroupTitle}>Wiki Articles</div>
            {visibleWikiIds.map((wikiId) => {
              const article = wikiById.get(wikiId);
              return (
                <button
                  key={`wiki-${wikiId}`}
                  type="button"
                  style={styles.linkedItem}
                  className="touch-target"
                  onClick={() => navigate(isDm ? "/dm/wiki" : "/player/wiki")}
                >
                  <Link2 size={14} />
                  <span>{article?.title || `Wiki #${wikiId}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {isDm && linkedMapIds.length > 0 && (
          <div style={styles.linkedGroup}>
            <div style={styles.linkedGroupTitle}>Maps</div>
            {linkedMapIds.map((mapId) => {
              const mapItem = mapById.get(mapId);
              return (
                <button
                  key={`map-${mapId}`}
                  type="button"
                  style={styles.linkedItem}
                  className="touch-target"
                  onClick={() => navigate("/dm/map")}
                >
                  <Link2 size={14} />
                  <span>{mapItem?.name || `Map #${mapId}`}</span>
                </button>
              );
            })}
          </div>
        )}

        {isDm && linkedEncounterIds.length > 0 && (
          <div style={styles.linkedGroup}>
            <div style={styles.linkedGroupTitle}>Encounters</div>
            {linkedEncounterIds.map((encounterId) => {
              const encounter = encounterById.get(encounterId);
              return (
                <button
                  key={`encounter-${encounterId}`}
                  type="button"
                  style={styles.linkedItem}
                  className="touch-target"
                  onClick={() => navigate("/dm/map")}
                >
                  <Link2 size={14} />
                  <span>
                    {encounter?.name || `Encounter #${encounterId}`}
                    {encounter?.status ? ` (${encounter.status})` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderLinkPickers() {
    if (!isDm || !selectedSession) return null;

    const linkedWikiIds = parseIdArray(selectedSession.linkedWikiIds);
    const linkedMapIds = parseIdArray(selectedSession.linkedMapIds);
    const linkedEncounterIds = parseIdArray(selectedSession.linkedEncounterIds);

    return (
      <div style={styles.pickerSection}>
        <h4 style={styles.sectionTitle}>Link Prep Resources</h4>

        <div style={styles.pickerGroup}>
          <div style={styles.pickerLabel}>Wiki Articles</div>
          <div style={styles.pickerList}>
            {wikiArticles.length === 0 ? (
              <span style={styles.mutedText}>No wiki articles yet.</span>
            ) : (
              wikiArticles.map((article) => (
                <label key={article.id} style={styles.pickerItem} className="touch-target">
                  <input
                    type="checkbox"
                    checked={linkedWikiIds.includes(article.id)}
                    onChange={() => toggleLinkedId("linkedWikiIds", article.id)}
                    disabled={saving}
                  />
                  <span>{article.title}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div style={styles.pickerGroup}>
          <div style={styles.pickerLabel}>Maps</div>
          <div style={styles.pickerList}>
            {maps.length === 0 ? (
              <span style={styles.mutedText}>No maps yet.</span>
            ) : (
              maps.map((mapItem) => (
                <label key={mapItem.id} style={styles.pickerItem} className="touch-target">
                  <input
                    type="checkbox"
                    checked={linkedMapIds.includes(mapItem.id)}
                    onChange={() => toggleLinkedId("linkedMapIds", mapItem.id)}
                    disabled={saving}
                  />
                  <span>{mapItem.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div style={styles.pickerGroup}>
          <div style={styles.pickerLabel}>Encounters</div>
          <div style={styles.pickerList}>
            {encounters.length === 0 ? (
              <span style={styles.mutedText}>No encounters yet.</span>
            ) : (
              encounters.map((encounter) => (
                <label key={encounter.id} style={styles.pickerItem} className="touch-target">
                  <input
                    type="checkbox"
                    checked={linkedEncounterIds.includes(encounter.id)}
                    onChange={() => toggleLinkedId("linkedEncounterIds", encounter.id)}
                    disabled={saving}
                  />
                  <span>
                    {encounter.name} ({encounter.status})
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderSessionDetail() {
    if (!selectedSession) return null;
    const checklistItems = getChecklistItems();
    const progress = checklistProgress(selectedSession.prepChecklist);

    return (
      <div style={styles.detailPanel}>
        <div style={styles.detailHeader}>
          <button
            type="button"
            onClick={() => navigate(basePath)}
            style={styles.backBtn}
            className="touch-target"
          >
            <ArrowLeft size={18} />
            <span>All Sessions</span>
          </button>

          {isDm && (
            <button
              type="button"
              onClick={handleDeleteSession}
              style={styles.deleteBtn}
              className="touch-target"
              disabled={saving}
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>

        <div style={styles.detailMeta}>
          {isDm ? (
            <>
              <input
                type="text"
                value={selectedSession.title}
                onChange={(e) => updateLocalField("title", e.target.value)}
                onBlur={() => patchSession({ title: selectedSession.title })}
                style={styles.titleInput}
                className="form-input"
                disabled={saving}
              />
              <div style={styles.metaRow}>
                <label style={styles.metaField}>
                  <span>Session #</span>
                  <input
                    type="number"
                    min="1"
                    value={selectedSession.sessionNumber ?? ""}
                    onChange={(e) =>
                      updateLocalField(
                        "sessionNumber",
                        e.target.value ? Number(e.target.value) : null
                      )
                    }
                    onBlur={() =>
                      patchSession({ sessionNumber: selectedSession.sessionNumber })
                    }
                    style={styles.numberInput}
                    className="form-input"
                    disabled={saving}
                  />
                </label>
                <label style={styles.metaField}>
                  <span>Play Date</span>
                  <input
                    type="date"
                    value={toDateInputValue(selectedSession.scheduledFor)}
                    onChange={(e) =>
                      updateLocalField(
                        "scheduledFor",
                        e.target.value ? new Date(e.target.value).toISOString() : null
                      )
                    }
                    onBlur={() =>
                      patchSession({ scheduledFor: selectedSession.scheduledFor })
                    }
                    style={styles.dateInput}
                    className="form-input"
                    disabled={saving}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <h2 style={styles.detailTitle}>
                {selectedSession.sessionNumber
                  ? `Session ${selectedSession.sessionNumber}: `
                  : ""}
                {selectedSession.title}
              </h2>
              {selectedSession.scheduledFor && (
                <p style={styles.dateLine}>{formatDate(selectedSession.scheduledFor)}</p>
              )}
            </>
          )}

          <div style={styles.statusBadgeRow}>
            <span style={{ ...styles.statusBadge, ...statusStyle(selectedSession.status) }}>
              {selectedSession.status}
            </span>
            {isDm && (
              <label style={styles.visibilityToggle} className="touch-target">
                <input
                  type="checkbox"
                  checked={selectedSession.isVisibleToPlayers}
                  onChange={(e) => patchSession({ isVisibleToPlayers: e.target.checked })}
                  disabled={saving}
                />
                {selectedSession.isVisibleToPlayers ? <Eye size={16} /> : <EyeOff size={16} />}
                <span>Visible to Players</span>
              </label>
            )}
          </div>
        </div>

        {isDm && (
          <div style={styles.lifecycleRow}>
            {selectedSession.status === "PLANNED" && (
              <button
                type="button"
                style={styles.primaryBtn}
                className="touch-target"
                onClick={() => patchSession({ status: "ACTIVE" })}
                disabled={saving}
              >
                Start Session
              </button>
            )}
            {selectedSession.status === "ACTIVE" && (
              <button
                type="button"
                style={styles.primaryBtn}
                className="touch-target"
                onClick={() => patchSession({ status: "COMPLETED" })}
                disabled={saving}
              >
                End Session
              </button>
            )}
            {selectedSession.status === "COMPLETED" && (
              <button
                type="button"
                style={styles.secondaryBtn}
                className="touch-target"
                onClick={() => patchSession({ status: "PLANNED" })}
                disabled={saving}
              >
                Reopen as Planned
              </button>
            )}
          </div>
        )}

        {aiSessionProgress && <p style={styles.mutedText}>{aiSessionProgress}</p>}
        {aiSessionError && <p style={styles.errorText}>{aiSessionError}</p>}

        {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
          <section style={styles.section}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitle}>Agenda</h3>
              {isDm && (
                <button
                  type="button"
                  style={styles.togglePreviewBtn}
                  className="touch-target"
                  onClick={() => setShowPreview((prev) => !prev)}
                >
                  {showPreview ? "Edit" : "Preview"}
                </button>
              )}
            </div>
            {isDm && !showPreview ? (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <AiAssistButton
                    fieldName="agenda"
                    actions={AI_FIELD_ACTIONS.agenda}
                    currentText={selectedSession?.agenda || ""}
                    context={{ entityType: "session", session: { title: selectedSession?.title, status: selectedSession?.status, agenda: selectedSession?.agenda } }}
                    onApply={(reply) => {
                      updateLocalField("agenda", reply);
                      patchSession({ agenda: reply });
                    }}
                    onError={(msg) => setAiSessionError(msg)}
                    user={user}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateAgenda}
                    disabled={aiSessionLoading}
                    style={{
                      padding: "0.35rem 0.65rem", fontSize: "0.75rem", borderRadius: "4px",
                      border: "1px solid rgba(200, 151, 58, 0.3)",
                      background: "rgba(200, 151, 58, 0.1)", color: "var(--color-accent)",
                      cursor: "pointer", whiteSpace: "nowrap",
                      opacity: aiSessionLoading ? 0.6 : 1,
                    }}
                    className="touch-target"
                  >
                    {aiSessionLoading ? "..." : "✨ AI Suggest Agenda"}
                  </button>
                </div>
                <textarea
                  value={selectedSession.agenda}
                  onChange={(e) => updateLocalField("agenda", e.target.value)}
                  onBlur={() => patchSession({ agenda: selectedSession.agenda })}
                  style={styles.textarea}
                  className="form-input"
                  placeholder="Scene plan, beats, NPC notes..."
                  disabled={saving}
                />
              </>
            ) : (
              <div
                className="wiki-content"
                style={styles.markdownPreview}
                dangerouslySetInnerHTML={{
                  __html: compileMarkdown(selectedSession.agenda || "_No agenda yet._"),
                }}
              />
            )}
          </section>
        )}

        {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>
              Prep Checklist {progress.total ? `(${progress.done}/${progress.total})` : ""}
            </h3>
            <div style={styles.checklist}>
              {checklistItems.map((item) => (
                <div key={item.id} style={styles.checklistItem}>
                  <button
                    type="button"
                    style={{
                      ...styles.checkBtn,
                      ...(item.done ? styles.checkBtnDone : {}),
                    }}
                    className="touch-target"
                    onClick={() => isDm && handleToggleChecklistItem(item.id)}
                    disabled={!isDm || saving}
                  >
                    {item.done && <Check size={14} />}
                  </button>
                  <span style={{ ...styles.checklistText, ...(item.done ? styles.checklistDone : {}) }}>
                    {item.text}
                  </span>
                  {isDm && (
                    <button
                      type="button"
                      style={styles.removeCheckBtn}
                      className="touch-target"
                      onClick={() => handleRemoveChecklistItem(item.id)}
                      disabled={saving}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {isDm && (
              <form onSubmit={handleAddChecklistItem} style={styles.addChecklistForm}>
                <input
                  type="text"
                  value={newChecklistItem}
                  onChange={(e) => setNewChecklistItem(e.target.value)}
                  placeholder="Add prep task..."
                  style={styles.checklistInput}
                  className="form-input"
                  disabled={saving}
                />
                <button type="submit" style={styles.secondaryBtn} className="touch-target" disabled={saving}>
                  <Plus size={16} />
                </button>
              </form>
            )}
          </section>
        )}

        {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
          <section style={styles.section}>
            <h3 style={styles.sectionTitle}>Linked Resources</h3>
            {renderLinkedResources()}
            {renderLinkPickers()}
          </section>
        )}

        {(selectedSession.status === "COMPLETED" || selectedSession.recap) && (
          <section style={styles.section}>
            <div style={styles.sectionHeaderRow}>
              <h3 style={styles.sectionTitle}>Session Recap</h3>
              {isDm && selectedSession.wikiLogId && (
                <button
                  type="button"
                  style={styles.linkBtn}
                  className="touch-target"
                  onClick={() => navigate("/dm/wiki")}
                >
                  View Wiki Log
                </button>
              )}
            </div>
            {isDm ? (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
                  <AiAssistButton
                    fieldName="recap"
                    actions={AI_FIELD_ACTIONS.recap}
                    currentText={selectedSession?.recap || ""}
                    context={{ entityType: "session", session: { title: selectedSession?.title, status: selectedSession?.status, agenda: selectedSession?.agenda } }}
                    onApply={(reply) => {
                      updateLocalField("recap", reply);
                      patchSession({ recap: reply });
                    }}
                    onError={(msg) => setAiSessionError(msg)}
                    user={user}
                  />
                  <button
                    type="button"
                    onClick={handleGenerateRecap}
                    disabled={aiSessionLoading}
                    style={{
                      padding: "0.35rem 0.65rem", fontSize: "0.75rem", borderRadius: "4px",
                      border: "1px solid rgba(200, 151, 58, 0.3)",
                      background: "rgba(200, 151, 58, 0.1)", color: "var(--color-accent)",
                      cursor: "pointer", whiteSpace: "nowrap",
                      opacity: aiSessionLoading ? 0.6 : 1,
                    }}
                    className="touch-target"
                  >
                    {aiSessionLoading ? "..." : "✨ AI Write Recap"}
                  </button>
                </div>
                <textarea
                  value={selectedSession.recap}
                  onChange={(e) => updateLocalField("recap", e.target.value)}
                  onBlur={() => patchSession({ recap: selectedSession.recap })}
                  style={styles.textarea}
                  className="form-input"
                  placeholder="What happened, loot awarded, hooks for next time..."
                  disabled={saving}
                />
                <button
                  type="button"
                  style={styles.primaryBtn}
                  className="touch-target"
                  onClick={handlePublishRecap}
                  disabled={saving || !selectedSession.recap.trim()}
                >
                  Publish to Wiki
                </button>
                {publishMessage && <p style={styles.successText}>{publishMessage}</p>}
              </>
            ) : (
              <div
                className="wiki-content"
                style={styles.markdownPreview}
                dangerouslySetInnerHTML={{
                  __html: compileMarkdown(selectedSession.recap || "_No recap published yet._"),
                }}
              />
            )}
            {!isDm && selectedSession.wikiLogId && (
              <button
                type="button"
                style={styles.linkBtn}
                className="touch-target"
                onClick={() => navigate("/player/wiki")}
              >
                Read Full Session Log
              </button>
            )}
          </section>
        )}

        {saving && <p style={styles.mutedText}>Saving...</p>}
      </div>
    );
  }

  function renderSessionList() {
    return (
      <div style={styles.listPanel}>
        <div style={styles.listHeader}>
          <div>
            <h2 style={styles.panelTitle}>
              <CalendarDays size={20} style={{ marginRight: "0.5rem" }} />
              {readOnly ? "Campaign Sessions" : "Session Planner"}
            </h2>
            <p style={styles.panelSubtitle}>
              {readOnly
                ? "Upcoming plans and past recaps shared by your DM."
                : "Plan, run, and recap your campaign sessions."}
            </p>
          </div>
          {isDm && (
            <button
              type="button"
              style={styles.primaryBtn}
              className="touch-target"
              onClick={handleCreateSession}
              disabled={saving}
            >
              <Plus size={16} />
              <span>New Session</span>
            </button>
          )}
        </div>

        <div style={styles.filterRow}>
          {["PLANNED", "ACTIVE", "COMPLETED"].map((status) => (
            <button
              key={status}
              type="button"
              style={{
                ...styles.filterChip,
                ...(statusFilter === status ? styles.filterChipActive : {}),
              }}
              className="touch-target"
              onClick={() => setStatusFilter(status)}
            >
              {status === "PLANNED" ? "Upcoming" : status === "ACTIVE" ? "Active" : "Past"}
            </button>
          ))}
        </div>

        {loading && !selectedSession ? (
          <p style={styles.mutedText}>Loading sessions...</p>
        ) : filteredSessions.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.mutedText}>
              {statusFilter === "PLANNED"
                ? "No upcoming sessions yet."
                : statusFilter === "ACTIVE"
                  ? "No active session right now."
                  : "No completed sessions yet."}
            </p>
          </div>
        ) : (
          <div style={styles.cardList}>
            {filteredSessions.map((session) => {
              const progress = checklistProgress(session.prepChecklist);
              return (
                <button
                  key={session.id}
                  type="button"
                  style={styles.sessionCard}
                  className="touch-target glass-panel"
                  onClick={() => navigate(`${basePath}/${session.id}`)}
                >
                  <div style={styles.cardTopRow}>
                    <span style={styles.cardTitle}>
                      {session.sessionNumber ? `#${session.sessionNumber} ` : ""}
                      {session.title}
                    </span>
                    <span style={{ ...styles.statusBadge, ...statusStyle(session.status) }}>
                      {session.status}
                    </span>
                  </div>
                  {session.scheduledFor && (
                    <div style={styles.cardMeta}>{formatDate(session.scheduledFor)}</div>
                  )}
                  {progress.total > 0 && (
                    <div style={styles.cardMeta}>
                      Prep: {progress.done}/{progress.total} done
                    </div>
                  )}
                  {session.isVisibleToPlayers && (
                    <div style={styles.cardMeta}>Visible to players</div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ ...styles.container, ...(isPopout ? styles.popoutContainer : {}) }}>
      {error && <div style={styles.errorBanner}>{error}</div>}
      {routeId ? renderSessionDetail() : renderSessionList()}
    </div>
  );
}

function statusStyle(status) {
  if (status === "ACTIVE") {
    return { background: "rgba(34, 197, 94, 0.15)", color: "#86efac" };
  }
  if (status === "COMPLETED") {
    return { background: "rgba(148, 163, 184, 0.15)", color: "#cbd5e1" };
  }
  return { background: "rgba(200, 151, 58, 0.15)", color: "var(--color-accent)" };
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    padding: "1rem",
    gap: "1rem",
  },
  popoutContainer: {
    minHeight: "100vh",
    background: "var(--color-bg)",
  },
  panelTitle: {
    display: "flex",
    alignItems: "center",
    margin: 0,
    fontSize: "1.25rem",
    color: "var(--color-accent)",
  },
  panelSubtitle: {
    margin: "0.35rem 0 0",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
  },
  listPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    maxWidth: "900px",
    margin: "0 auto",
    width: "100%",
  },
  listHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "1rem",
    flexWrap: "wrap",
  },
  filterRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  filterChip: {
    minHeight: "44px",
    padding: "0.5rem 1rem",
    borderRadius: "999px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--color-muted)",
    cursor: "pointer",
  },
  filterChipActive: {
    background: "var(--color-accent-dim)",
    color: "var(--color-accent)",
    borderColor: "rgba(200, 151, 58, 0.35)",
  },
  cardList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  sessionCard: {
    textAlign: "left",
    padding: "1rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.2)",
    color: "var(--color-text)",
    cursor: "pointer",
    minHeight: "44px",
  },
  cardTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: "0.75rem",
    alignItems: "center",
  },
  cardTitle: {
    fontWeight: "bold",
    fontSize: "1rem",
  },
  cardMeta: {
    marginTop: "0.35rem",
    fontSize: "0.8rem",
    color: "var(--color-muted)",
  },
  detailPanel: {
    display: "flex",
    flexDirection: "column",
    gap: "1rem",
    maxWidth: "900px",
    margin: "0 auto",
    width: "100%",
  },
  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    minHeight: "44px",
  },
  deleteBtn: {
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    color: "var(--color-danger)",
    borderRadius: "8px",
    padding: "0.5rem",
    cursor: "pointer",
    minHeight: "44px",
    minWidth: "44px",
  },
  detailMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  titleInput: {
    width: "100%",
    fontSize: "1.2rem",
    fontWeight: "bold",
    padding: "0.75rem",
    minHeight: "44px",
  },
  detailTitle: {
    margin: 0,
    color: "var(--color-accent)",
  },
  dateLine: {
    margin: 0,
    color: "var(--color-muted)",
  },
  metaRow: {
    display: "flex",
    gap: "0.75rem",
    flexWrap: "wrap",
  },
  metaField: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flex: "1 1 140px",
    fontSize: "0.8rem",
    color: "var(--color-muted)",
  },
  numberInput: {
    minHeight: "44px",
    padding: "0.5rem",
  },
  dateInput: {
    minHeight: "44px",
    padding: "0.5rem",
  },
  statusBadgeRow: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "center",
    flexWrap: "wrap",
  },
  statusBadge: {
    display: "inline-flex",
    padding: "0.25rem 0.6rem",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: "bold",
    letterSpacing: "0.04em",
  },
  visibilityToggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    cursor: "pointer",
    minHeight: "44px",
  },
  lifecycleRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  section: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    padding: "1rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.15)",
  },
  sectionHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "0.5rem",
  },
  sectionTitle: {
    margin: 0,
    fontSize: "1rem",
    color: "var(--color-accent)",
  },
  textarea: {
    width: "100%",
    minHeight: "140px",
    padding: "0.75rem",
    resize: "vertical",
    fontFamily: "inherit",
  },
  markdownPreview: {
    padding: "0.75rem",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.2)",
    minHeight: "60px",
  },
  togglePreviewBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "var(--color-muted)",
    borderRadius: "8px",
    padding: "0.35rem 0.75rem",
    cursor: "pointer",
    minHeight: "44px",
  },
  checklist: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  checklistItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  checkBtn: {
    width: "28px",
    height: "28px",
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "var(--color-accent)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    flexShrink: 0,
  },
  checkBtnDone: {
    background: "rgba(34, 197, 94, 0.2)",
    borderColor: "rgba(34, 197, 94, 0.35)",
  },
  checklistText: {
    flex: 1,
    fontSize: "0.95rem",
  },
  checklistDone: {
    textDecoration: "line-through",
    color: "var(--color-muted)",
  },
  removeCheckBtn: {
    background: "transparent",
    border: "none",
    color: "var(--color-muted)",
    cursor: "pointer",
    minWidth: "44px",
    minHeight: "44px",
  },
  addChecklistForm: {
    display: "flex",
    gap: "0.5rem",
  },
  checklistInput: {
    flex: 1,
    minHeight: "44px",
    padding: "0.5rem 0.75rem",
  },
  linkedGroups: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  linkedGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  linkedGroupTitle: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  linkedItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.35rem",
    background: "rgba(200, 151, 58, 0.08)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    color: "var(--color-text)",
    borderRadius: "8px",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    minHeight: "44px",
    width: "fit-content",
  },
  pickerSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  pickerGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  pickerLabel: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
  },
  pickerList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    maxHeight: "160px",
    overflowY: "auto",
    padding: "0.5rem",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.2)",
  },
  pickerItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minHeight: "44px",
    fontSize: "0.9rem",
    cursor: "pointer",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    minHeight: "44px",
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "1px solid rgba(200, 151, 58, 0.35)",
    background: "rgba(200, 151, 58, 0.15)",
    color: "var(--color-accent)",
    fontWeight: "bold",
    cursor: "pointer",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.35rem",
    minHeight: "44px",
    padding: "0.6rem 1rem",
    borderRadius: "8px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "var(--color-text)",
    cursor: "pointer",
  },
  linkBtn: {
    alignSelf: "flex-start",
    minHeight: "44px",
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    border: "1px solid rgba(200, 151, 58, 0.25)",
    background: "transparent",
    color: "var(--color-accent)",
    cursor: "pointer",
  },
  mutedText: {
    color: "var(--color-muted)",
    fontSize: "0.9rem",
    margin: 0,
  },
  errorText: {
    color: "var(--color-danger)",
    fontSize: "0.85rem",
    margin: 0,
  },
  successText: {
    color: "var(--color-success)",
    fontSize: "0.85rem",
    margin: 0,
  },
  errorBanner: {
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    background: "rgba(239, 68, 68, 0.12)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    color: "var(--color-danger)",
  },
  emptyState: {
    padding: "2rem 1rem",
    textAlign: "center",
  },
};

export default SessionsPanel;
