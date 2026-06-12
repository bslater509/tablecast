// =============================================================================
// Tablecast — In-Game Calendar & Weather Widget (Section 3.2)
// Displays the current game date, weather, upcoming events, and moon phase.
// DM can advance time, manage events, and control weather.
// =============================================================================
import { useState, useEffect, useCallback, useMemo } from "react";
import { useSocket } from "../context/SocketContext";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEATHER_ICONS = {
  clear: "☀️",
  partly_cloudy: "⛅",
  overcast: "☁️",
  fog: "🌫️",
  light_rain: "🌦️",
  heavy_rain: "🌧️",
  thunderstorm: "⛈️",
  light_snow: "🌨️",
  heavy_snow: "❄️",
  blizzard: "🌨️",
};

const MOON_PHASES = [
  { name: "New Moon", icon: "🌑" },
  { name: "Waxing Crescent", icon: "🌒" },
  { name: "First Quarter", icon: "🌓" },
  { name: "Waxing Gibbous", icon: "🌔" },
  { name: "Full Moon", icon: "🌕" },
  { name: "Waning Gibbous", icon: "🌖" },
  { name: "Last Quarter", icon: "🌗" },
  { name: "Waning Crescent", icon: "🌘" },
];

const TERRAINS = [
  "plains", "forest", "desert", "mountains",
  "coastal", "swamp", "arctic", "urban", "underground",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSeason(month) {
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
}

function getSeasonEmoji(season) {
  return { spring: "🌸", summer: "☀️", autumn: "🍂", winter: "❄️" }[season] || "";
}

function getDayOfWeek(totalDays, dayNames) {
  if (!dayNames || dayNames.length !== 7) return "";
  return dayNames[(totalDays - 1 + dayNames.length * 1000) % dayNames.length];
}

function getMoonPhase(day) {
  const index = Math.floor(((day - 1) / 30) * 8) % 8;
  return MOON_PHASES[index < 0 ? 0 : index];
}

// ---------------------------------------------------------------------------
// CalendarWidget Component
// ---------------------------------------------------------------------------

function CalendarWidget({ user, isPopout = false }) {
  const { socket } = useSocket();
  const { addToast } = useToast();
  const isDm = user?.role === "DM";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const authHeaders = useMemo(() => getJsonAuthHeaders(user), [user?.id]);

  // ── State ──────────────────────────────────────────────────────────
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Event creation form
  const [showEventForm, setShowEventForm] = useState(false);
  const [newEvent, setNewEvent] = useState({
    name: "", day: "", month: "", year: "",
    description: "", color: "#c8933a",
  });

  // Weather controls
  const [showWeatherSettings, setShowWeatherSettings] = useState(false);
  const [selectedTerrain, setSelectedTerrain] = useState("plains");

  // ── Derived values ─────────────────────────────────────────────────
  const currentDate = calendar?.currentDate || { year: 0, month: 1, day: 1 };
  const monthNames = calendar?.monthNames || [];
  const dayNames = calendar?.dayNames || [];
  const { year, month, day } = currentDate;
  const totalDays = (year - 1) * 360 + (month - 1) * 30 + day;
  const dayOfWeek = getDayOfWeek(totalDays, dayNames);
  const monthName = monthNames[month - 1] || `Month ${month}`;
  const season = getSeason(month);
  const seasonEmoji = getSeasonEmoji(season);
  const moonPhase = getMoonPhase(day);
  const weather = calendar?.currentWeather;
  const weatherIcon = WEATHER_ICONS[weather?.weather] || "🌡️";

  const upcomingEvents = useMemo(() => {
    const events = calendar?.events || [];
    return [...events].sort((a, b) => {
      const da = (a.date?.year || 0) * 360 + (a.date?.month || 1) * 30 + (a.date?.day || 1);
      const db = (b.date?.year || 0) * 360 + (b.date?.month || 1) * 30 + (b.date?.day || 1);
      return da - db;
    });
  }, [calendar?.events]);

  // ── Data fetching ─────────────────────────────────────────────────
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
      setCalendar(data);
      if (data.currentWeather?.terrain) {
        setSelectedTerrain(data.currentWeather.terrain);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // ── Socket listener ────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handleDateChange = (data) => {
      if (data?.calendar) {
        setCalendar(data.calendar);
        if (data.calendar.currentWeather?.terrain) {
          setSelectedTerrain(data.calendar.currentWeather.terrain);
        }
      }
    };

    socket.on("game:dateChange", handleDateChange);
    return () => socket.off("game:dateChange", handleDateChange);
  }, [socket]);

  // ── Action handlers ────────────────────────────────────────────────

  async function advanceTime(days) {
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
      setCalendar(data);
      if (data.currentWeather?.terrain) setSelectedTerrain(data.currentWeather.terrain);
      addToast(`Time advanced by ${days} day${days !== 1 ? "s" : ""}.`, "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function regenerateWeather() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar/weather", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ terrain: selectedTerrain }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to generate weather.");
      }
      const data = await res.json();
      setCalendar(data);
      setShowWeatherSettings(false);
      addToast("Weather regenerated.", "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function updateCalendar(updates) {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/calendar", {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update calendar.");
      }
      const data = await res.json();
      setCalendar(data);
      if (data.currentWeather?.terrain) setSelectedTerrain(data.currentWeather.terrain);
      addToast("Calendar updated.", "success");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleAddEvent(e) {
    e.preventDefault();
    if (!newEvent.name.trim()) return;

    const events = calendar?.events || [];
    const event = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: newEvent.name.trim(),
      date: {
        year: Number(newEvent.year) || year,
        month: Number(newEvent.month) || month,
        day: Number(newEvent.day) || day,
      },
      description: newEvent.description.trim(),
      color: newEvent.color,
    };

    await updateCalendar({ events: [...events, event] });
    setNewEvent({ name: "", day: "", month: "", year: "", description: "", color: "#c8933a" });
    setShowEventForm(false);
  }

  async function handleRemoveEvent(eventId) {
    const events = (calendar?.events || []).filter((ev) => ev.id !== eventId);
    await updateCalendar({ events });
  }

  // ── Loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ ...styles.container, ...(isPopout ? styles.popoutContainer : {}) }}>
        <div style={styles.loadingState}>
          <div style={styles.loadingSpinner} />
          <span style={styles.loadingText}>Consulting the chronologies...</span>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{ ...styles.container, ...(isPopout ? styles.popoutContainer : {}) }} className="fade-in">
      {error && <div style={styles.errorBanner}>{error}</div>}

      {/* ================================================================
           Calendar Header Section
           ================================================================ */}
      <div style={styles.section} className="glass-panel gold-border-glow">
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>📅</span>
          <h3 style={styles.sectionTitle}>Game Calendar</h3>
        </div>

        <div style={styles.dateDisplay}>
          <div style={styles.dateMain}>
            <span style={styles.dateDay}>{monthName} {day}</span>
            <span style={styles.dateYear}>— Year {year}</span>
          </div>
          <div style={styles.dateDetail}>
            <span style={styles.dayOfWeek}>{dayOfWeek}</span>
            <span style={styles.seasonBadge}>{seasonEmoji} {season.charAt(0).toUpperCase() + season.slice(1)}</span>
          </div>
          <div style={styles.dateRealWorld}>
            (Real: {new Date().toLocaleDateString("en-US", {
              weekday: "short", year: "numeric", month: "short", day: "numeric",
            })})
          </div>
          <div style={styles.timeOfDay}>
            🕐 {calendar?.timeOfDay
              ? calendar.timeOfDay.charAt(0).toUpperCase() + calendar.timeOfDay.slice(1)
              : "Morning"
            }
            {calendar?.dayLength === "long" ? " (Long Day)" : calendar?.dayLength === "short" ? " (Short Day)" : ""}
          </div>
        </div>

        {isDm && (
          <div style={styles.advanceControls}>
            <span style={styles.advanceLabel}>Advance Time:</span>
            <div style={styles.advanceButtons}>
              {[1, 7, 30].map((n) => (
                <button
                  key={n}
                  onClick={() => advanceTime(n)}
                  style={styles.advanceBtn}
                  className="touch-target btn-hover-scale"
                  disabled={saving}
                >
                  +{n} {n === 1 ? "Day" : n === 7 ? "Week" : "Month"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
           Weather Section
           ================================================================ */}
      <div style={styles.section} className="glass-panel gold-border-glow">
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>{weatherIcon}</span>
          <h3 style={styles.sectionTitle}>Current Weather</h3>
          {isDm && (
            <button
              onClick={() => setShowWeatherSettings(!showWeatherSettings)}
              style={styles.smallCogBtn}
              className="touch-target btn-hover-scale"
              title="Weather settings"
              aria-label="Weather settings"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0a1 1 0 011 1v.63a1 1 0 01-.56.9 3 3 0 000 4.94 1 1 0 01.56.9v.63a1 1 0 01-1 1H7a1 1 0 01-1-1v-.63a1 1 0 01.56-.9 3 3 0 000-4.94A1 1 0 017 1.63V1a1 1 0 011-1zM4 5a4 4 0 118 0 4 4 0 01-8 0z" />
                <path d="M3 11a1 1 0 011-1h8a1 1 0 011 1v1a1 1 0 01-1 1H4a1 1 0 01-1-1v-1z" />
              </svg>
            </button>
          )}
        </div>

        {weather ? (
          <div style={styles.weatherDisplay}>
            <div style={styles.weatherMain}>
              <span style={styles.weatherIconLarge}>{weatherIcon}</span>
              <div>
                <div style={styles.weatherCondition}>
                  {weather.weatherDescription || "The weather is unremarkable."}
                </div>
                <div style={styles.weatherTemp}>
                  {weather.temperature?.day}°{weather.temperature?.unit || "F"}
                  {weather.temperature?.night !== undefined && (
                    <span style={styles.weatherNightTemp}>
                      {" "}/ {weather.temperature.night}°{weather.temperature?.unit || "F"} (night)
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={styles.weatherDetails}>
              <span style={styles.weatherDetail}>
                💨 Wind: {weather.wind?.speed || "calm"} from {weather.wind?.direction || "—"}
              </span>
              <span style={styles.weatherDetail}>
                🌊 Precipitation: {Math.round((weather.precipitation || 0) * 100)}%
              </span>
              <span style={styles.weatherDetail}>
                🏞️ Terrain: {weather.terrain || "plains"}
              </span>
            </div>
          </div>
        ) : (
          <div style={styles.emptyState}>No weather data available.</div>
        )}

        {showWeatherSettings && isDm && (
          <div style={styles.weatherForm}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Terrain Type</label>
              <select
                value={selectedTerrain}
                onChange={(e) => setSelectedTerrain(e.target.value)}
                style={styles.select}
                className="form-input"
              >
                {TERRAINS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formActions}>
              <button
                type="button"
                onClick={regenerateWeather}
                style={styles.actionBtn}
                className="touch-target btn-hover-scale"
                disabled={saving}
              >
                🎲 Generate Random
              </button>
              <button
                type="button"
                onClick={() => setShowWeatherSettings(false)}
                style={styles.cancelBtn}
                className="touch-target"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================================================
           Events Section
           ================================================================ */}
      <div style={styles.section} className="glass-panel gold-border-glow">
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>📋</span>
          <h3 style={styles.sectionTitle}>Calendar Events</h3>
          {isDm && (
            <button
              onClick={() => setShowEventForm(!showEventForm)}
              style={styles.addBtn}
              className="touch-target btn-hover-scale"
            >
              {showEventForm ? "Cancel" : "+ Add Event"}
            </button>
          )}
        </div>

        {showEventForm && isDm && (
          <form onSubmit={handleAddEvent} style={styles.eventForm}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Event Name *</label>
              <input
                type="text"
                value={newEvent.name}
                onChange={(e) => setNewEvent({ ...newEvent, name: e.target.value })}
                style={styles.input}
                className="form-input"
                placeholder="e.g. Festival of the Moon"
                required
              />
            </div>
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Year</label>
                <input
                  type="number"
                  value={newEvent.year}
                  onChange={(e) => setNewEvent({ ...newEvent, year: e.target.value })}
                  style={styles.input}
                  className="form-input"
                  placeholder={String(year)}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Month</label>
                <input
                  type="number"
                  value={newEvent.month}
                  onChange={(e) => setNewEvent({ ...newEvent, month: e.target.value })}
                  style={styles.input}
                  className="form-input"
                  placeholder={String(month)}
                  min={1}
                  max={12}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Day</label>
                <input
                  type="number"
                  value={newEvent.day}
                  onChange={(e) => setNewEvent({ ...newEvent, day: e.target.value })}
                  style={styles.input}
                  className="form-input"
                  placeholder={String(day)}
                  min={1}
                  max={30}
                />
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <textarea
                value={newEvent.description}
                onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                style={styles.textarea}
                className="form-input"
                placeholder="Event details..."
                rows={2}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Badge Color</label>
              <input
                type="color"
                value={newEvent.color}
                onChange={(e) => setNewEvent({ ...newEvent, color: e.target.value })}
                style={styles.colorInput}
              />
            </div>
            <div style={styles.formActions}>
              <button
                type="submit"
                style={{ ...styles.actionBtn, ...styles.primaryBtn }}
                className="touch-target btn-hover-scale"
                disabled={saving || !newEvent.name.trim()}
              >
                {saving ? "Saving..." : "Save Event"}
              </button>
            </div>
          </form>
        )}

        {upcomingEvents.length === 0 ? (
          <div style={styles.emptyState}>
            No events scheduled.
            {isDm && !showEventForm ? " Click '+ Add Event' to create one." : ""}
          </div>
        ) : (
          <div style={styles.eventsList}>
            {upcomingEvents.map((ev) => {
              const evDate = ev.date || {};
              const evTotal =
                (evDate.year || 0) * 360 +
                (evDate.month || 1) * 30 +
                (evDate.day || 1);
              const isPast = evTotal < totalDays;
              const isToday = evTotal === totalDays;
              return (
                <div
                  key={ev.id}
                  style={{
                    ...styles.eventCard,
                    opacity: isPast ? 0.5 : 1,
                    borderLeft: `4px solid ${ev.color || "#c8933a"}`,
                  }}
                  className="glass-panel"
                >
                  <div style={styles.eventHeader}>
                    <div style={styles.eventInfo}>
                      <span style={styles.eventName}>
                        {isToday && "🔔 "}
                        {isPast && "✅ "}
                        {ev.name}
                      </span>
                      <span style={styles.eventDate}>
                        {monthNames[(evDate.month || 1) - 1] || `Month ${evDate.month}`}{" "}
                        {evDate.day}, Year {evDate.year}
                      </span>
                    </div>
                    {isDm && (
                      <button
                        onClick={() => handleRemoveEvent(ev.id)}
                        style={styles.removeBtn}
                        className="touch-target"
                        title="Delete event"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {ev.description && (
                    <div style={styles.eventDescription}>{ev.description}</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================
           Moon Phase Section
           ================================================================ */}
      <div style={styles.section} className="glass-panel gold-border-glow">
        <div style={styles.sectionHeader}>
          <span style={styles.sectionIcon}>{moonPhase.icon}</span>
          <h3 style={styles.sectionTitle}>Moon Phase</h3>
        </div>
        <div style={styles.moonDisplay}>
          <span style={styles.moonIcon}>{moonPhase.icon}</span>
          <div>
            <div style={styles.moonName}>{moonPhase.name}</div>
            <div style={styles.moonDay}>Day {day} of the month</div>
          </div>
        </div>
      </div>

      {saving && (
        <div style={styles.savingOverlay}>
          <div style={styles.loadingSpinner} />
          <span>Saving...</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    padding: "1rem",
    minHeight: "100%",
    position: "relative",
  },
  popoutContainer: {
    maxWidth: "520px",
    margin: "0 auto",
  },

  // Error
  errorBanner: {
    background: "rgba(220, 38, 38, 0.12)",
    border: "1px solid rgba(220, 38, 38, 0.3)",
    borderRadius: "10px",
    padding: "0.65rem 0.85rem",
    color: "var(--color-danger, #ef4444)",
    fontSize: "0.8rem",
    fontWeight: 500,
  },

  // Loading
  loadingState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.75rem",
    padding: "3rem 1rem",
  },
  loadingSpinner: {
    width: "28px",
    height: "28px",
    border: "3px solid rgba(200, 147, 58, 0.2)",
    borderTop: "3px solid var(--color-accent, #c8933a)",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
  },
  loadingText: {
    color: "var(--color-muted, #a0a0b0)",
    fontSize: "0.85rem",
    fontStyle: "italic",
  },

  // Section card
  section: {
    padding: "0.85rem",
    borderRadius: "14px",
    background: "var(--glass-bg, rgba(255,255,255,0.04))",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.65rem",
  },
  sectionIcon: {
    fontSize: "1.2rem",
    lineHeight: 1,
    flexShrink: 0,
  },
  sectionTitle: {
    margin: 0,
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-accent, #c8933a)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    flex: 1,
  },

  // Date display
  dateDisplay: {
    marginBottom: "0.5rem",
  },
  dateMain: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.4rem",
    flexWrap: "wrap",
    marginBottom: "0.25rem",
  },
  dateDay: {
    fontSize: "1.15rem",
    fontWeight: 700,
    color: "var(--color-text, #e8e6e3)",
  },
  dateYear: {
    fontSize: "0.85rem",
    color: "var(--color-muted, #a0a0b0)",
  },
  dateDetail: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    marginBottom: "0.2rem",
  },
  dayOfWeek: {
    fontSize: "0.78rem",
    color: "var(--color-muted, #a0a0b0)",
    fontStyle: "italic",
  },
  seasonBadge: {
    fontSize: "0.72rem",
    color: "var(--color-accent, #c8933a)",
    background: "rgba(200, 147, 58, 0.1)",
    padding: "0.15rem 0.5rem",
    borderRadius: "9999px",
    fontWeight: 600,
  },
  dateRealWorld: {
    fontSize: "0.68rem",
    color: "var(--color-muted, #a0a0b0)",
    marginTop: "0.15rem",
    opacity: 0.6,
  },
  timeOfDay: {
    fontSize: "0.75rem",
    color: "var(--color-muted, #a0a0b0)",
    marginTop: "0.15rem",
  },

  // Advance controls
  advanceControls: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    marginTop: "0.5rem",
    paddingTop: "0.5rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },
  advanceLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "var(--color-muted, #a0a0b0)",
    whiteSpace: "nowrap",
  },
  advanceButtons: {
    display: "flex",
    gap: "0.35rem",
    flexWrap: "wrap",
  },
  advanceBtn: {
    padding: "0.35rem 0.7rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "var(--color-accent, #c8933a)",
    background: "rgba(200, 147, 58, 0.08)",
    border: "1px solid rgba(200, 147, 58, 0.2)",
    borderRadius: "8px",
    cursor: "pointer",
    whiteSpace: "nowrap",
    minHeight: "36px",
    transition: "all 0.15s",
  },

  // Weather display
  weatherDisplay: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  weatherMain: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  weatherIconLarge: {
    fontSize: "2rem",
    lineHeight: 1,
    flexShrink: 0,
  },
  weatherCondition: {
    fontSize: "0.88rem",
    fontWeight: 600,
    color: "var(--color-text, #e8e6e3)",
    marginBottom: "0.15rem",
  },
  weatherTemp: {
    fontSize: "0.78rem",
    color: "var(--color-muted, #a0a0b0)",
  },
  weatherNightTemp: {
    fontSize: "0.72rem",
    color: "var(--color-muted, #a0a0b0)",
    opacity: 0.7,
  },
  weatherDetails: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  weatherDetail: {
    fontSize: "0.72rem",
    color: "var(--color-muted, #a0a0b0)",
  },

  // Weather form
  weatherForm: {
    marginTop: "0.65rem",
    paddingTop: "0.65rem",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },

  // Event form
  eventForm: {
    marginTop: "0.5rem",
    padding: "0.65rem",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },

  // Form elements
  formGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flex: 1,
  },
  formRow: {
    display: "flex",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  label: {
    fontSize: "0.7rem",
    fontWeight: 600,
    color: "var(--color-muted, #a0a0b0)",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  input: {
    padding: "0.45rem 0.6rem",
    fontSize: "0.8rem",
    color: "var(--color-text, #e8e6e3)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    outline: "none",
    minHeight: "36px",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    padding: "0.45rem 0.6rem",
    fontSize: "0.8rem",
    color: "var(--color-text, #e8e6e3)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    outline: "none",
    minHeight: "36px",
    width: "100%",
    boxSizing: "border-box",
  },
  textarea: {
    padding: "0.45rem 0.6rem",
    fontSize: "0.8rem",
    color: "var(--color-text, #e8e6e3)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    outline: "none",
    resize: "vertical",
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box",
  },
  colorInput: {
    width: "48px",
    height: "36px",
    padding: "2px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    background: "rgba(255,255,255,0.06)",
    cursor: "pointer",
  },
  formActions: {
    display: "flex",
    gap: "0.5rem",
    justifyContent: "flex-end",
    flexWrap: "wrap",
  },
  actionBtn: {
    padding: "0.4rem 0.85rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-text, #e8e6e3)",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "36px",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  primaryBtn: {
    background: "rgba(200, 147, 58, 0.15)",
    border: "1px solid rgba(200, 147, 58, 0.3)",
    color: "var(--color-accent, #c8933a)",
  },
  cancelBtn: {
    padding: "0.4rem 0.85rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-muted, #a0a0b0)",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "36px",
    whiteSpace: "nowrap",
  },
  smallCogBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    padding: 0,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    color: "var(--color-muted, #a0a0b0)",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  addBtn: {
    padding: "0.3rem 0.7rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    color: "var(--color-accent, #c8933a)",
    background: "rgba(200, 147, 58, 0.08)",
    border: "1px solid rgba(200, 147, 58, 0.2)",
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "32px",
    whiteSpace: "nowrap",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  smallBtn: {
    padding: "0.3rem 0.5rem",
    fontSize: "0.75rem",
    color: "var(--color-muted, #a0a0b0)",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "8px",
    cursor: "pointer",
    minHeight: "32px",
    transition: "all 0.15s",
  },

  // Events list
  eventsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  },
  eventCard: {
    padding: "0.55rem 0.65rem",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.03)",
    transition: "opacity 0.2s",
  },
  eventHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.4rem",
  },
  eventInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.1rem",
    flex: 1,
    minWidth: 0,
  },
  eventName: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "var(--color-text, #e8e6e3)",
    wordBreak: "break-word",
  },
  eventDate: {
    fontSize: "0.68rem",
    color: "var(--color-muted, #a0a0b0)",
  },
  eventDescription: {
    fontSize: "0.75rem",
    color: "var(--color-muted, #a0a0b0)",
    marginTop: "0.25rem",
    lineHeight: 1.4,
  },
  removeBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "28px",
    height: "28px",
    padding: 0,
    background: "rgba(220, 38, 38, 0.08)",
    border: "1px solid rgba(220, 38, 38, 0.15)",
    borderRadius: "6px",
    color: "var(--color-danger, #ef4444)",
    fontSize: "0.7rem",
    cursor: "pointer",
    flexShrink: 0,
    transition: "all 0.15s",
  },
  emptyState: {
    fontSize: "0.78rem",
    color: "var(--color-muted, #a0a0b0)",
    fontStyle: "italic",
    padding: "0.3rem 0",
  },

  // Moon phase
  moonDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "0.65rem",
  },
  moonIcon: {
    fontSize: "1.8rem",
    lineHeight: 1,
    flexShrink: 0,
  },
  moonName: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--color-text, #e8e6e3)",
  },
  moonDay: {
    fontSize: "0.72rem",
    color: "var(--color-muted, #a0a0b0)",
    marginTop: "0.1rem",
  },

  // Saving overlay
  savingOverlay: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.5rem",
    background: "rgba(0,0,0,0.4)",
    borderRadius: "14px",
    color: "var(--color-accent, #c8933a)",
    fontSize: "0.8rem",
    fontWeight: 600,
    zIndex: 10,
    pointerEvents: "none",
  },
};

export default CalendarWidget;
