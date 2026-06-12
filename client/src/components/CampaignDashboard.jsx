// =============================================================================
// Tablecast — Campaign Dashboard (4.6)
// DM landing page with at-a-glance campaign state: quests, encounters,
// sessions, party health, recent activity, and quick actions.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Swords,
  CalendarDays,
  BookOpen,
  Users,
  MessageCircle,
  Map as MapIcon,
  ScrollText,
  Activity,
  Sparkles,
  Play,
  Plus,
  Clock,
  ChevronRight,
  Database,
  Zap,
  Shield,
  Heart,
  Skull,
} from "lucide-react";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/dashboard";

const S = {
  panel: {
    padding: "1rem",
    maxWidth: "1100px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
    overflowY: "auto",
    height: "100%",
  },
  header: {
    fontSize: "1.3rem",
    fontWeight: 700,
    marginBottom: "0.25rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    color: "var(--color-accent)",
  },
  subheader: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    marginBottom: "1.25rem",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  card: {
    background: "var(--color-surface)",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    color: "var(--color-muted)",
    fontSize: "0.8rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  cardValue: {
    fontSize: "2rem",
    fontWeight: 700,
    color: "var(--color-text)",
    lineHeight: 1,
  },
  cardFooter: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  sectionTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    color: "var(--color-text)",
    marginBottom: "0.5rem",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  quickActions: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
    marginBottom: "1rem",
  },
  actionBtn: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.5rem 0.85rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.35rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    fontSize: "0.85rem",
  },
  hpBarOuter: {
    width: "100%",
    height: "6px",
    borderRadius: "3px",
    background: "rgba(255,255,255,0.06)",
    overflow: "hidden",
    marginTop: "0.2rem",
  },
  hpBarInner: (pct) => ({
    height: "100%",
    borderRadius: "3px",
    width: `${pct}%`,
    background: pct > 60
      ? "var(--color-success, #6fcf97)"
      : pct > 25
      ? "var(--color-accent, #c8973a)"
      : "var(--color-danger, #eb5757)",
    transition: "width 0.5s ease",
  }),
  chatItem: {
    padding: "0.3rem 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    fontSize: "0.8rem",
    lineHeight: 1.4,
  },
  chatSender: {
    fontWeight: 600,
    color: "var(--color-accent)",
    marginRight: "0.3rem",
  },
  chatTime: {
    color: "var(--color-muted)",
    fontSize: "0.7rem",
    float: "right",
  },
  iconColor: { map: "#6fcf97", npc: "#c8973a", monster: "#eb5757", wiki: "#56ccf2" },
  twoColGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
};

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(str, len = 60) {
  if (!str) return "";
  return str.length > len ? str.slice(0, len) + "…" : str;
}

export default function CampaignDashboard({ user }) {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = getJsonAuthHeaders(user);
      const res = await fetch(API, { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load dashboard");
      }
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  // Depend on user.id (stable primitive) not the full user object (new identity every render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  if (loading && !data) {
    return (
      <div style={S.panel}>
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--color-muted)" }}>
          Loading campaign data…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={S.panel}>
        <div
          style={{
            textAlign: "center",
            padding: "2rem",
            color: "var(--color-danger)",
          }}
        >
          <p>Failed to load dashboard: {error}</p>
          <button
            onClick={fetchDashboard}
            style={{
              marginTop: "0.5rem",
              padding: "0.4rem 1rem",
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { quests, encounters, sessions, party, stats, chat, rolls } = data;

  return (
    <div style={S.panel}>
      <div style={S.header}>
        <Activity size={22} strokeWidth={2.2} />
        Campaign Dashboard
      </div>
      <div style={S.subheader}>
        At-a-glance overview of your campaign state
      </div>

      {/* Quick Actions */}
      <div style={S.quickActions}>
        <button
          style={S.actionBtn}
          className="touch-target btn-hover-scale"
          onClick={() => navigate("/dm/sessions")}
        >
          <Play size={16} />
          Start Session
        </button>
        <button
          style={S.actionBtn}
          className="touch-target btn-hover-scale"
          onClick={() => navigate("/dm/encounters")}
        >
          <Swords size={16} />
          Run Encounter
        </button>
        <button
          style={S.actionBtn}
          className="touch-target btn-hover-scale"
          onClick={() => navigate("/dm/calendar")}
        >
          <Clock size={16} />
          Advance Time
        </button>
        <button
          style={S.actionBtn}
          className="touch-target btn-hover-scale"
          onClick={() => navigate("/dm/map")}
        >
          <MapIcon size={16} />
          Open Map
        </button>
        <button
          style={S.actionBtn}
          className="touch-target btn-hover-scale"
          onClick={() => navigate("/dm/loot")}
        >
          <Database size={16} />
          Generate Loot
        </button>
      </div>

      {/* Stat Cards */}
      <div style={S.grid}>
        <StatCard
          icon={<Swords size={18} />}
          label="Active Encounters"
          value={encounters.active}
          total={encounters.total}
          color="var(--color-danger)"
        />
        <StatCard
          icon={<ScrollText size={18} />}
          label="Active Quests"
          value={quests.total}
          total={null}
          color="var(--color-accent)"
        />
        <StatCard
          icon={<CalendarDays size={18} />}
          label="Next Session"
          value={sessions.nextSession ? formatDate(sessions.nextSession.scheduledFor) : "None"}
          total={null}
          color="var(--color-success)"
          small
        />
        <StatCard
          icon={<Users size={18} />}
          label="Party Members"
          value={party.total}
          total={null}
          color="var(--color-primary, #56ccf2)"
        />
      </div>

      {/* Two-column layout for medium+ screens */}
      <div style={S.twoColGrid}>
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Party HP Overview */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Heart size={14} /> Party Health
              </span>
              <span style={{ fontSize: "0.75rem" }}>
                {party.totalHp}/{party.totalMaxHp} HP
              </span>
            </div>
            {party.characters.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", padding: "0.5rem 0" }}>
                No characters created yet.
              </div>
            ) : (
              party.characters.map((c) => (
                <div key={c.id} style={{ marginBottom: "0.4rem" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.8rem",
                    }}
                  >
                    <span>
                      <strong>{c.name}</strong>{" "}
                      <span style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}>
                        Lvl {c.level} {c.class}
                      </span>
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color:
                          c.hpPercent > 60
                            ? "var(--color-success)"
                            : c.hpPercent > 25
                            ? "var(--color-accent)"
                            : "var(--color-danger)",
                      }}
                    >
                      {c.hp}/{c.maxHp}
                    </span>
                  </div>
                  <div style={S.hpBarOuter}>
                    <div style={S.hpBarInner(c.hpPercent)} />
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Upcoming Sessions */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <CalendarDays size={14} /> Upcoming Sessions
              </span>
              <span style={{ fontSize: "0.75rem" }}>{sessions.upcoming.length} total</span>
            </div>
            {sessions.upcoming.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", padding: "0.5rem 0" }}>
                No upcoming sessions planned.
              </div>
            ) : (
              sessions.upcoming.slice(0, 3).map((s) => (
                <div
                  key={s.id}
                  style={S.row}
                  onClick={() => navigate(`/dm/sessions/${s.id}`)}
                  className="touch-target"
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{s.title}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                      {s.scheduledFor ? formatDate(s.scheduledFor) : "No date set"}
                    </div>
                  </div>
                  <ChevronRight size={16} style={{ color: "var(--color-muted)", flexShrink: 0 }} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {/* Active Quests */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <ScrollText size={14} /> Active Quests
              </span>
              <span style={{ fontSize: "0.75rem" }}>{quests.total} active</span>
            </div>
            {quests.active.length === 0 ? (
              <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", padding: "0.5rem 0" }}>
                No active quests. Create one in the Journal.
              </div>
            ) : (
              quests.active.slice(0, 5).map((q) => (
                <div
                  key={q.id}
                  style={S.row}
                  onClick={() => navigate("/dm/journal")}
                  className="touch-target"
                >
                  <span style={{ fontWeight: 500 }}>{q.title}</span>
                  <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>
                    {timeAgo(q.updatedAt)}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Encounter Overview */}
          <div style={S.card}>
            <div style={S.cardHeader}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Swords size={14} /> Encounters
              </span>
              <span style={{ fontSize: "0.75rem" }}>{encounters.total} total</span>
            </div>
            <div style={{ display: "flex", gap: "1rem", padding: "0.5rem 0", flexWrap: "wrap" }}>
              <EncounterBadge label="Draft" count={encounters.byStatus.DRAFT} color="var(--color-muted)" />
              <EncounterBadge label="Active" count={encounters.byStatus.ACTIVE} color="var(--color-danger)" />
              <EncounterBadge label="Complete" count={encounters.byStatus.COMPLETE} color="var(--color-success)" />
            </div>
          </div>
        </div>
      </div>

      {/* Stats & Recent Activity */}
      <div style={S.twoColGrid}>
        {/* Recent Chat */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <MessageCircle size={14} /> Recent Chat
            </span>
          </div>
          {chat.recent.length === 0 ? (
            <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", padding: "0.5rem 0" }}>
              No recent chat activity.
            </div>
          ) : (
            chat.recent.slice(0, 5).map((msg) => (
              <div key={msg.id} style={S.chatItem}>
                <span style={S.chatSender}>{msg.sender}</span>
                <span style={S.chatTime}>{timeAgo(msg.createdAt)}</span>
                <div style={{ color: "var(--color-text)", wordBreak: "break-word" }}>
                  {truncate(msg.text, 80)}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Campaign Stats */}
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Database size={14} /> Campaign Stats
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", padding: "0.5rem 0" }}>
            <StatRow label="Maps" value={stats.maps} color={S.iconColor.map} icon={<MapIcon size={14} />} />
            <StatRow label="NPCs" value={stats.npcs} color={S.iconColor.npc} icon={<Users size={14} />} />
            <StatRow label="Monsters" value={stats.monsters} color={S.iconColor.monster} icon={<Skull size={14} />} />
            <StatRow label="Wiki Articles" value={stats.wikiArticles} color={S.iconColor.wiki} icon={<BookOpen size={14} />} />
          </div>
        </div>
      </div>

      {/* Recent Dice Rolls */}
      {rolls.recent.length > 0 && (
        <div style={S.card}>
          <div style={S.cardHeader}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Zap size={14} /> Recent Dice Rolls
            </span>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", padding: "0.25rem 0" }}>
            {rolls.recent.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  borderRadius: "4px",
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.78rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <strong>{r.sender}</strong>
                <span style={{ color: "var(--color-muted)" }}>{r.formula}</span>
                <span style={{ fontWeight: 700, color: "var(--color-accent)" }}>{r.total}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Sub-components

function StatCard({ icon, label, value, total, color, small = false }) {
  return (
    <div style={S.card}>
      <div style={S.cardHeader}>
        <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ color }}>{icon}</span> {label}
        </span>
      </div>
      <div
        style={{
          ...S.cardValue,
          fontSize: small ? "0.95rem" : "2rem",
          color: color || "var(--color-text)",
          wordBreak: "break-word",
        }}
      >
        {value ?? "—"}
      </div>
      {total != null && (
        <div style={S.cardFooter}>out of {total} total</div>
      )}
    </div>
  );
}

function EncounterBadge({ label, count, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <div
        style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: color,
        }}
      />
      <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
        {label}: <strong style={{ color: "var(--color-text)" }}>{count}</strong>
      </span>
    </div>
  );
}

function StatRow({ label, value, color, icon }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
      <span style={{ color }}>{icon}</span>
      <span style={{ color: "var(--color-muted)" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: 700 }}>{value}</span>
    </div>
  );
}
