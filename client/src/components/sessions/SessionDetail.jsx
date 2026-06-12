// =============================================================================
// Tablecast — Session Detail Component
// Self-contained detail view for a single campaign session: agenda, prep
// checklist, linked resources, recap, and lifecycle management.
// =============================================================================
import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  Link2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import AiAssistButton, { AI_FIELD_ACTIONS } from "../AiAssistButton";
import { sessionStyles } from "./sessionStyles";
import {
  compileMarkdown,
  parseJson,
  parseIdArray,
  formatDate,
  toDateInputValue,
  checklistProgress,
  statusStyle,
} from "./sessionUtils";

export default function SessionDetail({
  selectedSession,
  saving,
  // eslint-disable-next-line unused-imports/no-unused-vars
  error,
  isDm,
  user,
  authHeaders,
  navigate,
  basePath,
  wikiById,
  mapById,
  encounterById,
  wikiArticles,
  maps,
  encounters,
  onUpdateField,
  onPatchSession,
  onDeleteSession,
  onSetError,
  onSetSaving,
  onSessionSynced,
  // eslint-disable-next-line unused-imports/no-unused-vars
  showConfirm,
}) {
  /* ---- local UI state ---- */
  const [showPreview, setShowPreview] = useState(false);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [publishMessage, setPublishMessage] = useState(null);
  const [aiSessionLoading, setAiSessionLoading] = useState(false);
  const [aiSessionProgress, setAiSessionProgress] = useState("");
  const [aiSessionError, setAiSessionError] = useState(null);

  if (!selectedSession) return null;

  /* ---- helpers ---- */
  function getChecklistItems() {
    return parseJson(selectedSession?.prepChecklist, []);
  }

  async function saveChecklist(items) {
    await onPatchSession({ prepChecklist: JSON.stringify(items) });
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
    await onPatchSession({ [field]: JSON.stringify(next) });
  }

  async function handlePublishRecap() {
    if (!selectedSession) return;
    try {
      onSetSaving(true);
      onSetError(null);
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
      if (data.session) {
        onSessionSynced(data.session);
      }
      setPublishMessage("Recap published to Campaign Wiki.");
    } catch (err) {
      onSetError(err.message);
    } finally {
      onSetSaving(false);
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
        onUpdateField("recap", resultText);
        await onPatchSession({ recap: resultText });
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
        onUpdateField("agenda", resultText);
        await onPatchSession({ agenda: resultText });
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

  /* ---- linked resources ---- */
  function renderLinkedResources() {
    const linkedWikiIds = parseIdArray(selectedSession.linkedWikiIds);
    const linkedMapIds = parseIdArray(selectedSession.linkedMapIds);
    const linkedEncounterIds = parseIdArray(selectedSession.linkedEncounterIds);

    const visibleWikiIds = isDm
      ? linkedWikiIds
      : linkedWikiIds.filter((wikiId) => wikiById.get(wikiId)?.isVisibleToPlayers);

    if (!isDm && !visibleWikiIds.length && !linkedMapIds.length && !linkedEncounterIds.length) {
      return <p style={sessionStyles.mutedText}>No linked resources for this session.</p>;
    }

    return (
      <div style={sessionStyles.linkedGroups}>
        {visibleWikiIds.length > 0 && (
          <div style={sessionStyles.linkedGroup}>
            <div style={sessionStyles.linkedGroupTitle}>Wiki Articles</div>
            {visibleWikiIds.map((wikiId) => {
              const article = wikiById.get(wikiId);
              return (
                <button
                  key={`wiki-${wikiId}`}
                  type="button"
                  style={sessionStyles.linkedItem}
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
          <div style={sessionStyles.linkedGroup}>
            <div style={sessionStyles.linkedGroupTitle}>Maps</div>
            {linkedMapIds.map((mapId) => {
              const mapItem = mapById.get(mapId);
              return (
                <button
                  key={`map-${mapId}`}
                  type="button"
                  style={sessionStyles.linkedItem}
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
          <div style={sessionStyles.linkedGroup}>
            <div style={sessionStyles.linkedGroupTitle}>Encounters</div>
            {linkedEncounterIds.map((encounterId) => {
              const encounter = encounterById.get(encounterId);
              return (
                <button
                  key={`encounter-${encounterId}`}
                  type="button"
                  style={sessionStyles.linkedItem}
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
    if (!isDm) return null;

    const linkedWikiIds = parseIdArray(selectedSession.linkedWikiIds);
    const linkedMapIds = parseIdArray(selectedSession.linkedMapIds);
    const linkedEncounterIds = parseIdArray(selectedSession.linkedEncounterIds);

    return (
      <div style={sessionStyles.pickerSection}>
        <h4 style={sessionStyles.sectionTitle}>Link Prep Resources</h4>

        <div style={sessionStyles.pickerGroup}>
          <div style={sessionStyles.pickerLabel}>Wiki Articles</div>
          <div style={sessionStyles.pickerList}>
            {wikiArticles.length === 0 ? (
              <span style={sessionStyles.mutedText}>No wiki articles yet.</span>
            ) : (
              wikiArticles.map((article) => (
                <label key={article.id} style={sessionStyles.pickerItem} className="touch-target">
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

        <div style={sessionStyles.pickerGroup}>
          <div style={sessionStyles.pickerLabel}>Maps</div>
          <div style={sessionStyles.pickerList}>
            {maps.length === 0 ? (
              <span style={sessionStyles.mutedText}>No maps yet.</span>
            ) : (
              maps.map((mapItem) => (
                <label key={mapItem.id} style={sessionStyles.pickerItem} className="touch-target">
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

        <div style={sessionStyles.pickerGroup}>
          <div style={sessionStyles.pickerLabel}>Encounters</div>
          <div style={sessionStyles.pickerList}>
            {encounters.length === 0 ? (
              <span style={sessionStyles.mutedText}>No encounters yet.</span>
            ) : (
              encounters.map((encounter) => (
                <label key={encounter.id} style={sessionStyles.pickerItem} className="touch-target">
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

  /* ---- main render ---- */
  const checklistItems = getChecklistItems();
  const progress = checklistProgress(selectedSession.prepChecklist);

  return (
    <div style={sessionStyles.detailPanel}>
      <div style={sessionStyles.detailHeader}>
        <button
          type="button"
          onClick={() => navigate(basePath)}
          style={sessionStyles.backBtn}
          className="touch-target"
        >
          <ArrowLeft size={18} />
          <span>All Sessions</span>
        </button>

        {isDm && (
          <button
            type="button"
            onClick={onDeleteSession}
            style={sessionStyles.deleteBtn}
            className="touch-target"
            disabled={saving}
          >
            <Trash2 size={16} />
          </button>
        )}
      </div>

      <div style={sessionStyles.detailMeta}>
        {isDm ? (
          <>
            <input
              type="text"
              value={selectedSession.title}
              onChange={(e) => onUpdateField("title", e.target.value)}
              onBlur={() => onPatchSession({ title: selectedSession.title })}
              style={sessionStyles.titleInput}
              className="form-input"
              disabled={saving}
            />
            <div style={sessionStyles.metaRow}>
              <label style={sessionStyles.metaField}>
                <span>Session #</span>
                <input
                  type="number"
                  min="1"
                  value={selectedSession.sessionNumber ?? ""}
                  onChange={(e) =>
                    onUpdateField(
                      "sessionNumber",
                      e.target.value ? Number(e.target.value) : null
                    )
                  }
                  onBlur={() =>
                    onPatchSession({ sessionNumber: selectedSession.sessionNumber })
                  }
                  style={sessionStyles.numberInput}
                  className="form-input"
                  disabled={saving}
                />
              </label>
              <label style={sessionStyles.metaField}>
                <span>Play Date</span>
                <input
                  type="date"
                  value={toDateInputValue(selectedSession.scheduledFor)}
                  onChange={(e) =>
                    onUpdateField(
                      "scheduledFor",
                      e.target.value ? new Date(e.target.value).toISOString() : null
                    )
                  }
                  onBlur={() =>
                    onPatchSession({ scheduledFor: selectedSession.scheduledFor })
                  }
                  style={sessionStyles.dateInput}
                  className="form-input"
                  disabled={saving}
                />
              </label>
            </div>
          </>
        ) : (
          <>
            <h2 style={sessionStyles.detailTitle}>
              {selectedSession.sessionNumber
                ? `Session ${selectedSession.sessionNumber}: `
                : ""}
              {selectedSession.title}
            </h2>
            {selectedSession.scheduledFor && (
              <p style={sessionStyles.dateLine}>{formatDate(selectedSession.scheduledFor)}</p>
            )}
          </>
        )}

        <div style={sessionStyles.statusBadgeRow}>
          <span style={{ ...sessionStyles.statusBadge, ...statusStyle(selectedSession.status) }}>
            {selectedSession.status}
          </span>
          {isDm && (
            <label style={sessionStyles.visibilityToggle} className="touch-target">
              <input
                type="checkbox"
                checked={selectedSession.isVisibleToPlayers}
                onChange={(e) => onPatchSession({ isVisibleToPlayers: e.target.checked })}
                disabled={saving}
              />
              {selectedSession.isVisibleToPlayers ? <Eye size={16} /> : <EyeOff size={16} />}
              <span>Visible to Players</span>
            </label>
          )}
        </div>
      </div>

      {isDm && (
        <div style={sessionStyles.lifecycleRow}>
          {selectedSession.status === "PLANNED" && (
            <button
              type="button"
              style={sessionStyles.primaryBtn}
              className="touch-target"
              onClick={() => onPatchSession({ status: "ACTIVE" })}
              disabled={saving}
            >
              Start Session
            </button>
          )}
          {selectedSession.status === "ACTIVE" && (
            <button
              type="button"
              style={sessionStyles.primaryBtn}
              className="touch-target"
              onClick={() => onPatchSession({ status: "COMPLETED" })}
              disabled={saving}
            >
              End Session
            </button>
          )}
          {selectedSession.status === "COMPLETED" && (
            <button
              type="button"
              style={sessionStyles.secondaryBtn}
              className="touch-target"
              onClick={() => onPatchSession({ status: "PLANNED" })}
              disabled={saving}
            >
              Reopen as Planned
            </button>
          )}
        </div>
      )}

      {aiSessionProgress && <p style={sessionStyles.mutedText}>{aiSessionProgress}</p>}
      {aiSessionError && <p style={sessionStyles.errorText}>{aiSessionError}</p>}

      {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
        <section style={sessionStyles.section}>
          <div style={sessionStyles.sectionHeaderRow}>
            <h3 style={sessionStyles.sectionTitle}>Agenda</h3>
            {isDm && (
              <button
                type="button"
                style={sessionStyles.togglePreviewBtn}
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
                    onUpdateField("agenda", reply);
                    onPatchSession({ agenda: reply });
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
                onChange={(e) => onUpdateField("agenda", e.target.value)}
                onBlur={() => onPatchSession({ agenda: selectedSession.agenda })}
                style={sessionStyles.textarea}
                className="form-input"
                placeholder="Scene plan, beats, NPC notes..."
                disabled={saving}
              />
            </>
          ) : (
            <div
              className="wiki-content"
              style={sessionStyles.markdownPreview}
              dangerouslySetInnerHTML={{
                __html: compileMarkdown(selectedSession.agenda || "_No agenda yet._"),
              }}
            />
          )}
        </section>
      )}

      {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
        <section style={sessionStyles.section}>
          <h3 style={sessionStyles.sectionTitle}>
            Prep Checklist {progress.total ? `(${progress.done}/${progress.total})` : ""}
          </h3>
          <div style={sessionStyles.checklist}>
            {checklistItems.map((item) => (
              <div key={item.id} style={sessionStyles.checklistItem}>
                <button
                  type="button"
                  style={{
                    ...sessionStyles.checkBtn,
                    ...(item.done ? sessionStyles.checkBtnDone : {}),
                  }}
                  className="touch-target"
                  onClick={() => isDm && handleToggleChecklistItem(item.id)}
                  disabled={!isDm || saving}
                >
                  {item.done && <Check size={14} />}
                </button>
                <span style={{ ...sessionStyles.checklistText, ...(item.done ? sessionStyles.checklistDone : {}) }}>
                  {item.text}
                </span>
                {isDm && (
                  <button
                    type="button"
                    style={sessionStyles.removeCheckBtn}
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
            <form onSubmit={handleAddChecklistItem} style={sessionStyles.addChecklistForm}>
              <input
                type="text"
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                placeholder="Add prep task..."
                style={sessionStyles.checklistInput}
                className="form-input"
                disabled={saving}
              />
              <button type="submit" style={sessionStyles.secondaryBtn} className="touch-target" disabled={saving}>
                <Plus size={16} />
              </button>
            </form>
          )}
        </section>
      )}

      {(selectedSession.status === "PLANNED" || selectedSession.status === "ACTIVE") && (
        <section style={sessionStyles.section}>
          <h3 style={sessionStyles.sectionTitle}>Linked Resources</h3>
          {renderLinkedResources()}
          {renderLinkPickers()}
        </section>
      )}

      {(selectedSession.status === "COMPLETED" || selectedSession.recap) && (
        <section style={sessionStyles.section}>
          <div style={sessionStyles.sectionHeaderRow}>
            <h3 style={sessionStyles.sectionTitle}>Session Recap</h3>
            {isDm && selectedSession.wikiLogId && (
              <button
                type="button"
                style={sessionStyles.linkBtn}
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
                    onUpdateField("recap", reply);
                    onPatchSession({ recap: reply });
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
                onChange={(e) => onUpdateField("recap", e.target.value)}
                onBlur={() => onPatchSession({ recap: selectedSession.recap })}
                style={sessionStyles.textarea}
                className="form-input"
                placeholder="What happened, loot awarded, hooks for next time..."
                disabled={saving}
              />
              <button
                type="button"
                style={sessionStyles.primaryBtn}
                className="touch-target"
                onClick={handlePublishRecap}
                disabled={saving || !selectedSession.recap.trim()}
              >
                Publish to Wiki
              </button>
              {publishMessage && <p style={sessionStyles.successText}>{publishMessage}</p>}
            </>
          ) : (
            <div
              className="wiki-content"
              style={sessionStyles.markdownPreview}
              dangerouslySetInnerHTML={{
                __html: compileMarkdown(selectedSession.recap || "_No recap published yet._"),
              }}
            />
          )}
          {!isDm && selectedSession.wikiLogId && (
            <button
              type="button"
              style={sessionStyles.linkBtn}
              className="touch-target"
              onClick={() => navigate("/player/wiki")}
            >
              Read Full Session Log
            </button>
          )}
        </section>
      )}

      {saving && <p style={sessionStyles.mutedText}>Saving...</p>}
    </div>
  );
}
