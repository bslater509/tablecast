// =============================================================================
// Tablecast  Calendar & Weather Management Panel
// DM-facing calendar management with time control, weather generation,
// and calendar system configuration. Read-only mode for players.
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CalendarDays,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Clock,
  Settings as SettingsIcon,
  RefreshCw,
  Thermometer,
  Save,
} from "lucide-react";
import { useSocket } from "../context/SocketContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";
import CalendarWidget from "./CalendarWidget";

// ── Constants ──

const TIME_OF_DAY_OPTIONS = [
  { value: "dawn", label: "Dawn" },
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "dusk", label: "Dusk" },
  { value: "night", label: "Night" },
];

const DAY_LENGTH_OPTIONS = [
  { value: "standard", label: "Standard (24h)" },
  { value: "long", label: "Long (36h)" },
  { value: "short", label: "Short (12h)" },
];

const TERRAIN_OPTIONS = [
  { value: "plains", label: "Plains" },
  { value: "desert", label: "Desert" },
  { value: "forest", label: "Forest" },
  { value: "mountains", label: "Mountains" },
  { value: "coastal", label: "Coastal" },
  { value: "swamp", label: "Swamp" },
  { value: "arctic", label: "Arctic" },
  { value: "urban", label: "Urban" },
  { value: "underground", label: "Underground" },
];

const SUB_TABS = [
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "time", label: "Time Control", icon: Clock },
  { id: "weather", label: "Weather", icon: Sun },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

const SEASONS = {
  spring: { label: "Spring", color: "#22c55e" },
  summer: { label: "Summer", color: "#eab308" },
  autumn: { label: "Autumn", color: "#f97316" },
  winter: { label: "Winter", color: "#60a5fa" },
};

// ── Helpers ──

function WeatherIcon({ weatherType, size = 32 }) {
  const props = { size, strokeWidth: 1.5 };
  switch (weatherType) {
    case "clear":
      return <Sun {...props} style={{ color: "#eab308" }} />;
    case "partly_cloudy":
    case "overcast":
      return <Cloud {...props} style={{ color: "#94a3b8" }} />;
    case "fog":
      return <Cloud {...props} style={{ color: "#64748b" }} />;
    case "light_rain":
    case "heavy_rain":
    case "thunderstorm":
      return <CloudRain {...props} style={{ color: "#38bdf8" }} />;
    case "light_snow":
    case "heavy_snow":
    case "blizzard":
      return <CloudSnow {...props} style={{ color: "#e2e8f0" }} />;
    default:
      return <Sun {...props} style={{ color: "#eab308" }} />;
  }
}

function formatWeatherLabel(weatherType) {
  const labels = {
    clear: "Clear Skies",
    partly_cloudy: "Partly Cloudy",
    overcast: "Overcast",
    fog: "Foggy",
    light_rain: "Light Rain",
    heavy_rain: "Heavy Rain",
    thunderstorm: "Thunderstorm",
    light_snow: "Light Snow",
    heavy_snow: "Heavy Snow",
    blizzard: "Blizzard",
  };
  return labels[weatherType] || weatherType;
}

function getSeasonLabel(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

// ── Styles ──

const s = {
  container: {
    padding: "12px",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "8px",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: "18px",
    fontWeight: 700,
    margin: 0,
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  errorBanner: {
    background: "#7f1d1d",
    color: "#fca5a5",
    padding: "8px 12px",
    borderRadius: "8px",
    fontSize: "13px",
    flexShrink: 0,
  },
  subTabs: {
    display: "flex",
    gap: "4px",
    flexShrink: 0,
    overflowX: "auto",
  },
  subTab: {
    padding: "8px 14px",
    borderRadius: "8px",
    border: "1px solid transparent",
    background: "transparent",
    color: "#9ca3af",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "6px",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  subTabActive: {
    background: "rgba(124, 58, 237, 0.15)",
    borderColor: "rgba(124, 58, 237, 0.35)",
    color: "#c084fc",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  card: {
    background: "#111827",
    border: "1px solid #1f2937",
    borderRadius: "12px",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  cardTitle: {
    fontSize: "14px",
    fontWeight: 600,
    color: "#e5e7eb",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    margin: 0,
  },
  row: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  label: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#9ca3af",
    minWidth: "80px",
  },
  value: {
    fontSize: "14px",
    color: "#e5e7eb",
    fontWeight: 500,
  },
  input: {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    outline: "none",
    minHeight: "36px",
  },
  inputSmall: {
    width: "64px",
  },
  select: {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    outline: "none",
    minHeight: "36px",
    cursor: "pointer",
  },
  btn: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "13px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    transition: "all 0.15s",
    minHeight: "36px",
    fontWeight: 500,
  },
  btnPrimary: {
    background: "#7c3aed",
    borderColor: "#7c3aed",
    color: "#fff",
  },
  btnPrimaryDisabled: {
    background: "#4c1d95",
    borderColor: "#4c1d95",
    color: "#9ca3af",
    cursor: "not-allowed",
  },
  btnSuccess: {
    background: "#059669",
    borderColor: "#059669",
    color: "#fff",
  },
  weatherDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px",
    background: "rgba(15, 23, 42, 0.6)",
    borderRadius: "12px",
    border: "1px solid #1e293b",
  },
  weatherInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  weatherLabel: {
    fontSize: "16px",
    fontWeight: 600,
    color: "#e5e7eb",
  },
  weatherDesc: {
    fontSize: "13px",
    color: "#94a3b8",
    lineHeight: 1.4,
  },
  weatherMeta: {
    display: "flex",
    gap: "16px",
    flexWrap: "wrap",
    marginTop: "4px",
  },
  weatherMetaItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "12px",
    color: "#6b7280",
  },
  seasonBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "2px 10px",
    borderRadius: "999px",
    fontSize: "11px",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  dateDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flexWrap: "wrap",
  },
  dateValue: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#f5f5f4",
  },
  dateSub: {
    fontSize: "13px",
    color: "#6b7280",
  },
  quickBtn: {
    padding: "12px 18px",
    borderRadius: "10px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: 600,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "2px",
    minWidth: "80px",
    transition: "all 0.15s",
  },
  quickBtnSub: {
    fontSize: "10px",
    color: "#6b7280",
    fontWeight: 400,
  },
  nameInput: {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #374151",
    background: "#1f2937",
    color: "#e5e7eb",
    fontSize: "12px",
    outline: "none",
    width: "100px",
  },
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    marginBottom: "4px",
  },
  nameIndex: {
    fontSize: "11px",
    color: "#6b7280",
    minWidth: "20px",
    textAlign: "right",
  },
  emptyState: {
    textAlign: "center",
    padding: "40px 20px",
    color: "#6b7280",
  },
};

// ── Component ──

export default function CalendarPanel({ user }) {
  const { socket } = useSocket();
  const isDm = user?.role === "DM";
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  const [calendarConfig, setCalendarConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("calendar");
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [editDate, setEditDate] = useState({ year: 1495, month: 1, day: 1 });
  const [editTimeOfDay, setEditTimeOfDay] = useState("morning");
  const [editMonthNames, setEditMonthNames] = useState([]);
  const [editDayNames, setEditDayNames] = useState([]);
  const [editDayLength, setEditDayLength] = useState("standard");
  const [advanceDays, setAdvanceDays] = useState(1);
  const [weatherTerrain, setWeatherTerrain] = useState("plains");

  // ── Fetch calendar ──
  const fetchCalendar = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/calendar", { headers: authHeaders });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load calendar.");
      }
      const data = await res.json();
      applyConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  function applyConfig(data) {
    setCalendarConfig(data);
    setEditDate(data.currentDate || { year: 1495, month: 1, day: 1 });
    setEditTimeOfDay(data.timeOfDay || "morning");
    setEditMonthNames(data.monthNames || []);
    setEditDayNames(data.dayNames || []);
    setEditDayLength(data.dayLength || "standard");
  }

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // ── Socket listener for real-time date changes ──
  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (data?.calendar) {
        setCalendarConfig(data.calendar);
        setEditDate(data.calendar.currentDate);
        setEditTimeOfDay(data.calendar.timeOfDay || "morning");
      }
    };
    socket.on("game:dateChange", handler);
    return () => socket.off("game:dateChange", handler);
  }, [socket]);

  // ── Save calendar date ──
  async function handleSaveDate() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          currentDate: editDate,
          timeOfDay: editTimeOfDay,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update calendar.");
      }
      const data = await res.json();
      applyConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Advance time ──
  async function handleAdvance(days) {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar/advance", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ days }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to advance time.");
      }
      const data = await res.json();
      applyConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Generate weather ──
  async function handleGenerateWeather() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar/weather", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ terrain: weatherTerrain }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate weather.");
      }
      const data = await res.json();
      setCalendarConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Save settings (month names, day names, day length) ──
  async function handleSaveSettings() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          monthNames: editMonthNames,
          dayNames: editDayNames,
          dayLength: editDayLength,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save settings.");
      }
      const data = await res.json();
      setCalendarConfig(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Derived values ──
  const currentWeather = calendarConfig?.currentWeather;
  const season = currentWeather?.season || getSeasonLabel(editDate.month);
  const seasonInfo = SEASONS[season] || SEASONS.spring;
  const currentMonthName = editMonthNames[editDate.month - 1] || `Month ${editDate.month}`;
  const currentDayIndex = editDate.day % 7;
  const currentDayName = editDayNames[currentDayIndex] || "";

  // ── Loading ──
  if (loading) {
    return (
      <div style={s.container}>
        <div style={s.emptyState}>Loading calendar...</div>
      </div>
    );
  }

  // ── Player Read-Only View (uses CalendarWidget for rich display) ──
  if (!isDm) {
    return (
      <div style={s.container}>
        <CalendarWidget user={user} />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  //  DM Full Management View
  // ═══════════════════════════════════════════════════════
  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <h2 style={s.headerTitle}>
          <CalendarDays size={20} />
          Calendar & Weather
        </h2>
        {currentWeather && (
          <span style={{ ...s.seasonBadge, background: `${seasonInfo.color}20`, color: seasonInfo.color }}>
            {seasonInfo.label}
          </span>
        )}
      </div>

      {/* Sub-Tabs */}
      <div style={s.subTabs}>
        {SUB_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              style={{ ...s.subTab, ...(isActive ? s.subTabActive : {}) }}
              className="touch-target"
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Error */}
      {error && <div style={s.errorBanner}>{error}</div>}

      {/* Tab Content */}
      <div style={s.content}>
        {activeTab === "calendar" && renderCalendarTab()}
        {activeTab === "time" && renderTimeControlTab()}
        {activeTab === "weather" && renderWeatherTab()}
        {activeTab === "settings" && renderSettingsTab()}
      </div>
    </div>
  );

  // ── Calendar Tab ──
  function renderCalendarTab() {
    return (
      <>
        {/* Current Date Display */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <CalendarDays size={16} style={{ color: "var(--color-accent)" }} />
            Current Date
          </h3>

          {/* Date Edit */}
          <div style={s.row}>
            <div style={s.label}>Year</div>
            <input
              type="number"
              value={editDate.year}
              onChange={(e) => setEditDate({ ...editDate, year: parseInt(e.target.value, 10) || 0 })}
              style={{ ...s.input, ...s.inputSmall }}
              className="form-input"
              min={0}
            />
          </div>

          <div style={s.row}>
            <div style={s.label}>Month</div>
            <input
              type="number"
              value={editDate.month}
              onChange={(e) => setEditDate({ ...editDate, month: Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
              style={{ ...s.input, ...s.inputSmall }}
              className="form-input"
              min={1}
              max={12}
            />
            <span style={s.dateSub}>
              ({currentMonthName})
            </span>
          </div>

          <div style={s.row}>
            <div style={s.label}>Day</div>
            <input
              type="number"
              value={editDate.day}
              onChange={(e) => setEditDate({ ...editDate, day: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 1)) })}
              style={{ ...s.input, ...s.inputSmall }}
              className="form-input"
              min={1}
              max={30}
            />
            <span style={s.dateSub}>
              {currentDayName ? `(${currentDayName})` : ""}
            </span>
          </div>

          <div style={s.row}>
            <div style={s.label}>Time of Day</div>
            <select
              value={editTimeOfDay}
              onChange={(e) => setEditTimeOfDay(e.target.value)}
              style={s.select}
              className="form-input"
            >
              {TIME_OF_DAY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={s.row}>
            <button
              style={{ ...s.btn, ...(saving ? s.btnPrimaryDisabled : s.btnPrimary) }}
              className="touch-target"
              onClick={handleSaveDate}
              disabled={saving}
            >
              <Save size={14} />
              {saving ? "Saving..." : "Save Date"}
            </button>
          </div>
        </div>

        {/* Weather Summary in Calendar Tab */}
        {currentWeather && (
          <div style={s.weatherDisplay}>
            <WeatherIcon weatherType={currentWeather.weather} size={36} />
            <div style={s.weatherInfo}>
              <div style={s.weatherLabel}>
                {formatWeatherLabel(currentWeather.weather)}
              </div>
              <div style={s.weatherDesc}>
                {currentWeather.weatherDescription || ""}
              </div>
              <div style={s.weatherMeta}>
                <span style={s.weatherMetaItem}>
                  <Thermometer size={12} />
                  {currentWeather.temperature?.day}° / {currentWeather.temperature?.night}°{" "}
                  {currentWeather.temperature?.unit || "F"}
                </span>
                <span style={s.weatherMetaItem}>
                  <Wind size={12} />
                  {currentWeather.wind?.speed} {currentWeather.wind?.direction}
                </span>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Time Control Tab ──
  function renderTimeControlTab() {
    return (
      <>
        {/* Quick Advance Buttons */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Clock size={16} style={{ color: "var(--color-accent)" }} />
            Quick Advance
          </h3>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              style={s.quickBtn}
              className="touch-target"
              onClick={() => handleAdvance(1)}
              disabled={saving}
            >
              +1 Day
              <span style={s.quickBtnSub}>Next day</span>
            </button>
            <button
              style={s.quickBtn}
              className="touch-target"
              onClick={() => handleAdvance(7)}
              disabled={saving}
            >
              +1 Week
              <span style={s.quickBtnSub}>7 days</span>
            </button>
            <button
              style={s.quickBtn}
              className="touch-target"
              onClick={() => handleAdvance(30)}
              disabled={saving}
            >
              +1 Month
              <span style={s.quickBtnSub}>30 days</span>
            </button>
            <button
              style={s.quickBtn}
              className="touch-target"
              onClick={() => handleAdvance(90)}
              disabled={saving}
            >
              +1 Season
              <span style={s.quickBtnSub}>90 days</span>
            </button>
          </div>
        </div>

        {/* Custom Advance */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Clock size={16} style={{ color: "var(--color-accent)" }} />
            Custom Advance
          </h3>

          <div style={s.row}>
            <div style={s.label}>Days</div>
            <input
              type="number"
              value={advanceDays}
              onChange={(e) => setAdvanceDays(Math.max(0, Math.min(365, parseInt(e.target.value, 10) || 0)))}
              style={{ ...s.input, ...s.inputSmall }}
              className="form-input"
              min={0}
              max={365}
            />
            <button
              style={{ ...s.btn, ...(saving ? s.btnPrimaryDisabled : s.btnPrimary) }}
              className="touch-target"
              onClick={() => handleAdvance(advanceDays)}
              disabled={saving || advanceDays <= 0}
            >
              {saving ? "Advancing..." : "Advance"}
            </button>
          </div>

          <div style={s.dateSub}>
            Max 365 days per advance.
          </div>
        </div>

        {/* Current Time Info */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <CalendarDays size={16} style={{ color: "var(--color-accent)" }} />
            Current Time
          </h3>
          <div style={s.dateDisplay}>
            <div>
              <div style={s.dateValue}>
                {currentMonthName} {editDate.day}, {editDate.year}
              </div>
              <div style={s.dateSub}>
                {currentDayName ? `${currentDayName} — ` : ""}
                {TIME_OF_DAY_OPTIONS.find((t) => t.value === editTimeOfDay)?.label || editTimeOfDay}
                {" · "}
                Day Length: {DAY_LENGTH_OPTIONS.find((d) => d.value === editDayLength)?.label || editDayLength}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // ── Weather Tab ──
  function renderWeatherTab() {
    return (
      <>
        {/* Current Weather */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <Sun size={16} style={{ color: "var(--color-accent)" }} />
            Current Weather
          </h3>

          {currentWeather ? (
            <div style={s.weatherDisplay}>
              <WeatherIcon weatherType={currentWeather.weather} size={44} />
              <div style={s.weatherInfo}>
                <div style={s.weatherLabel}>
                  {formatWeatherLabel(currentWeather.weather)}
                </div>
                <div style={s.weatherDesc}>
                  {currentWeather.weatherDescription || ""}
                </div>
                <div style={s.weatherMeta}>
                  <span style={s.weatherMetaItem}>
                    <Thermometer size={12} />
                    {currentWeather.temperature?.day}° / {currentWeather.temperature?.night}°{" "}
                    {currentWeather.temperature?.unit || "F"} (Day/Night)
                  </span>
                  <span style={s.weatherMetaItem}>
                    <Wind size={12} />
                    {currentWeather.wind?.speed} {currentWeather.wind?.direction}
                  </span>
                  <span style={s.weatherMetaItem}>
                    Terrain: {TERRAIN_OPTIONS.find((t) => t.value === currentWeather.terrain)?.label || currentWeather.terrain}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div style={s.emptyState}>
              <Sun size={32} />
              <div>No weather data yet.</div>
            </div>
          )}
        </div>

        {/* Generate Weather */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <RefreshCw size={16} style={{ color: "var(--color-accent)" }} />
            Generate Weather
          </h3>

          <div style={s.row}>
            <div style={s.label}>Terrain</div>
            <select
              value={weatherTerrain}
              onChange={(e) => setWeatherTerrain(e.target.value)}
              style={s.select}
              className="form-input"
            >
              {TERRAIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div style={s.row}>
            <button
              style={{ ...s.btn, ...(saving ? s.btnPrimaryDisabled : s.btnSuccess) }}
              className="touch-target"
              onClick={handleGenerateWeather}
              disabled={saving}
            >
              <RefreshCw size={14} />
              {saving ? "Generating..." : "Generate Weather"}
            </button>
          </div>

          <div style={s.dateSub}>
            New weather is randomly generated based on the current season and terrain.
          </div>
        </div>
      </>
    );
  }

  // ── Settings Tab ──
  function renderSettingsTab() {
    return (
      <>
        {/* Month Names */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <SettingsIcon size={16} style={{ color: "var(--color-accent)" }} />
            Month Names
          </h3>

          {editMonthNames.map((name, i) => (
            <div key={i} style={s.nameRow}>
              <span style={s.nameIndex}>{i + 1}.</span>
              <input
                value={name}
                onChange={(e) => {
                  const next = [...editMonthNames];
                  next[i] = e.target.value;
                  setEditMonthNames(next);
                }}
                style={s.nameInput}
                className="form-input"
                placeholder={`Month ${i + 1}`}
              />
            </div>
          ))}
          {editMonthNames.length === 0 && (
            <div style={s.dateSub}>No month names configured. Save to initialize.</div>
          )}
        </div>

        {/* Day Names */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <SettingsIcon size={16} style={{ color: "var(--color-accent)" }} />
            Day Names
          </h3>

          {editDayNames.map((name, i) => (
            <div key={i} style={s.nameRow}>
              <span style={s.nameIndex}>{i + 1}.</span>
              <input
                value={name}
                onChange={(e) => {
                  const next = [...editDayNames];
                  next[i] = e.target.value;
                  setEditDayNames(next);
                }}
                style={s.nameInput}
                className="form-input"
                placeholder={`Day ${i + 1}`}
              />
            </div>
          ))}
          {editDayNames.length === 0 && (
            <div style={s.dateSub}>No day names configured. Save to initialize.</div>
          )}
        </div>

        {/* Day Length */}
        <div style={s.card}>
          <h3 style={s.cardTitle}>
            <SettingsIcon size={16} style={{ color: "var(--color-accent)" }} />
            Day Length
          </h3>

          <div style={s.row}>
            <div style={s.label}>Length</div>
            <select
              value={editDayLength}
              onChange={(e) => setEditDayLength(e.target.value)}
              style={s.select}
              className="form-input"
            >
              {DAY_LENGTH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Save Settings */}
        <div style={s.row}>
          <button
            style={{ ...s.btn, ...(saving ? s.btnPrimaryDisabled : s.btnPrimary), alignSelf: "flex-start" }}
            className="touch-target"
            onClick={handleSaveSettings}
            disabled={saving}
          >
            <Save size={14} />
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </>
    );
  }
}
