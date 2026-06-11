// =============================================================================
// Tablecast — Session List Component
// Renders the list view of campaign sessions with filtering, create, and
// navigation to session detail.
// =============================================================================
import { CalendarDays, Plus } from "lucide-react";
import { sessionStyles } from "./sessionStyles";
import { formatDate, checklistProgress, statusStyle } from "./sessionUtils";

export default function SessionList({
  filteredSessions,
  statusFilter,
  onStatusFilterChange,
  loading,
  selectedSession,
  saving,
  isDm,
  readOnly,
  onCreateSession,
  basePath,
  navigate,
}) {
  return (
    <div style={sessionStyles.listPanel}>
      <div style={sessionStyles.listHeader}>
        <div>
          <h2 style={sessionStyles.panelTitle}>
            <CalendarDays size={20} style={{ marginRight: "0.5rem" }} />
            {readOnly ? "Campaign Sessions" : "Session Planner"}
          </h2>
          <p style={sessionStyles.panelSubtitle}>
            {readOnly
              ? "Upcoming plans and past recaps shared by your DM."
              : "Plan, run, and recap your campaign sessions."}
          </p>
        </div>
        {isDm && (
          <button
            type="button"
            style={sessionStyles.primaryBtn}
            className="touch-target"
            onClick={onCreateSession}
            disabled={saving}
          >
            <Plus size={16} />
            <span>New Session</span>
          </button>
        )}
      </div>

      <div style={sessionStyles.filterRow}>
        {["PLANNED", "ACTIVE", "COMPLETED"].map((status) => (
          <button
            key={status}
            type="button"
            style={{
              ...sessionStyles.filterChip,
              ...(statusFilter === status ? sessionStyles.filterChipActive : {}),
            }}
            className="touch-target"
            onClick={() => onStatusFilterChange(status)}
          >
            {status === "PLANNED" ? "Upcoming" : status === "ACTIVE" ? "Active" : "Past"}
          </button>
        ))}
      </div>

      {loading && !selectedSession ? (
        <p style={sessionStyles.mutedText}>Loading sessions...</p>
      ) : filteredSessions.length === 0 ? (
        <div style={sessionStyles.emptyState}>
          <p style={sessionStyles.mutedText}>
            {statusFilter === "PLANNED"
              ? "No upcoming sessions yet."
              : statusFilter === "ACTIVE"
                ? "No active session right now."
                : "No completed sessions yet."}
          </p>
        </div>
      ) : (
        <div style={sessionStyles.cardList}>
          {filteredSessions.map((session) => {
            const progress = checklistProgress(session.prepChecklist);
            return (
              <button
                key={session.id}
                type="button"
                style={sessionStyles.sessionCard}
                className="touch-target glass-panel"
                onClick={() => navigate(`${basePath}/${session.id}`)}
              >
                <div style={sessionStyles.cardTopRow}>
                  <span style={sessionStyles.cardTitle}>
                    {session.sessionNumber ? `#${session.sessionNumber} ` : ""}
                    {session.title}
                  </span>
                  <span style={{ ...sessionStyles.statusBadge, ...statusStyle(session.status) }}>
                    {session.status}
                  </span>
                </div>
                {session.scheduledFor && (
                  <div style={sessionStyles.cardMeta}>{formatDate(session.scheduledFor)}</div>
                )}
                {progress.total > 0 && (
                  <div style={sessionStyles.cardMeta}>
                    Prep: {progress.done}/{progress.total} done
                  </div>
                )}
                {session.isVisibleToPlayers && (
                  <div style={sessionStyles.cardMeta}>Visible to players</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
