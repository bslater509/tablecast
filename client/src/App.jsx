// =============================================================================
// Tablecast  Root App Component (Phase 4)
// Wires up tab navigation, global states, and user selection overlay.
// =============================================================================
import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  BookOpen,
  Box,
  CalendarDays,
  Database,
  ExternalLink,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  Settings,
  SlidersHorizontal,
  Swords,
  Users,
  Wifi,
} from "lucide-react";
import MapPanel from "./components/MapPanel";
import CharacterList from "./components/CharacterList";
import CharacterSheet from "./components/CharacterSheet";
import ChatPanel from "./components/ChatPanel";
import MessageHub from "./components/MessageHub";
import ErrorBoundary from "./components/ErrorBoundary";
import WikiPanel from "./components/WikiPanel";
import SettingsPanel from "./components/SettingsPanel";
import ReferencePanel from "./components/ReferencePanel";
import AiPanel from "./components/AiPanel";
import DiceSettingsModal from "./components/DiceSettingsModal";
import DiceRollerPanel from "./components/DiceRollerPanel";
import ConnectionHelpPanel from "./components/ConnectionHelpPanel";
import ImporterPanel from "./components/ImporterPanel";
import SessionsPanel from "./components/SessionsPanel";
import EncountersPanel from "./components/EncountersPanel";
import { useSocket } from "./context/SocketContext";

const SELECTED_USER_STORAGE_KEY = "tablecast.selectedUserId";

const DM_NAV_ITEMS = [
  {
    id: "map",
    label: "Map VTT",
    mobileLabel: "Map",
    path: "/dm/map",
    icon: MapIcon,
    popoutUrl: "/#/dm/popout/map",
    popoutTitle: "Pop out Map",
    popoutFeatures: "width=1000,height=700,resizable=yes,scrollbars=yes",
  },
  {
    id: "characters",
    label: "Characters",
    mobileLabel: "Heroes",
    path: "/dm/characters",
    icon: Users,
    popoutUrl: "/#/dm/popout/characters",
    popoutTitle: "Pop out Characters List",
    popoutFeatures: "width=600,height=800,resizable=yes,scrollbars=yes",
  },
  {
    id: "dice",
    label: "Dice Roller",
    mobileLabel: "Dice",
    path: "/dm/dice",
    icon: Box,
    popoutUrl: "/#/dm/popout/dice",
    popoutTitle: "Pop out Dice Roller",
    popoutFeatures: "width=600,height=800,resizable=yes,scrollbars=yes",
  },
  {
    id: "messages",
    label: "Messages",
    mobileLabel: "Messages",
    path: "/dm/messages",
    icon: MessageCircle,
    popoutUrl: "/#/dm/popout/chat",
    popoutTitle: "Pop out Session Chat",
    popoutFeatures: "width=600,height=800,resizable=yes,scrollbars=yes",
  },
  {
    id: "wiki",
    label: "Campaign Wiki",
    mobileLabel: "Wiki",
    path: "/dm/wiki",
    icon: BookOpen,
    popoutUrl: "/#/dm/popout/wiki",
    popoutTitle: "Pop out Wiki",
    popoutFeatures: "width=800,height=900,resizable=yes,scrollbars=yes",
  },
  {
    id: "sessions",
    label: "Sessions",
    mobileLabel: "Sessions",
    path: "/dm/sessions",
    icon: CalendarDays,
    popoutUrl: "/#/dm/popout/sessions",
    popoutTitle: "Pop out Sessions",
    popoutFeatures: "width=800,height=900,resizable=yes,scrollbars=yes",
  },
  {
    id: "encounters",
    label: "Encounters",
    mobileLabel: "Combat",
    path: "/dm/encounters",
    icon: Swords,
    popoutUrl: "/#/dm/popout/encounters",
    popoutTitle: "Pop out Encounters",
    popoutFeatures: "width=800,height=900,resizable=yes,scrollbars=yes",
  },
  {
    id: "importer",
    label: "5etools Importer",
    mobileLabel: "Import",
    path: "/dm/importer",
    icon: Database,
  },
  {
    id: "settings",
    label: "Settings",
    mobileLabel: "Settings",
    path: "/dm/settings",
    icon: Settings,
  },
];

function App() {
  const { connectionStatus } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [usersList, setUsersList] = useState([]);
  
  // Custom user entry state
  const [customName, setCustomName] = useState("");
  const [customRole, setCustomRole] = useState("PLAYER");
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Handle log out
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
    navigate("/", { replace: true });
  };

  const [diceModalOpen, setDiceModalOpen] = useState(false);

  const handleUpdateDiceSettings = async (diceTheme, diceColor) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-tablecast-user-id": String(user.id),
        },
        body: JSON.stringify({ diceTheme, diceColor }),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
        setUsersList((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
        return true;
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Failed to update user settings:", err.error || res.statusText);
      }
    } catch (err) {
      console.error("Error updating user settings:", err);
    }
    return false;
  };

  // Route authorization & redirect logic
  useEffect(() => {
    if (loadingUsers) return;

    if (!user) {
      if (location.pathname !== "/" && !location.pathname.startsWith("/api")) {
        navigate("/", { replace: true });
      }
      return;
    }

    if (user.role === "DM") {
      if (!location.pathname.startsWith("/dm")) {
        navigate("/dm/map", { replace: true });
      }
    } else {
      if (!location.pathname.startsWith("/player")) {
        const firstChar = user.characters && user.characters[0];
        if (firstChar) {
          navigate(`/player/sheet/${firstChar.id}`, { replace: true });
        } else {
          navigate("/player/map", { replace: true });
        }
      }
    }
  }, [user, location.pathname, navigate, loadingUsers]);

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "characters", "chat-journal", "settings"].includes(pathParts[1])
    ? pathParts[1]
    : "chat-journal";

  // Fetch users list and restore persisted session when it is still valid.
  useEffect(() => {
    let cancelled = false;

    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setUsersList(data);

          if (!user) {
            const storedUserId = Number(localStorage.getItem(SELECTED_USER_STORAGE_KEY));
            const storedUser = data.find((u) => u.id === storedUserId);
            if (storedUser) {
              handleSelectUser(storedUser);
            } else if (storedUserId) {
              localStorage.removeItem(SELECTED_USER_STORAGE_KEY);
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load users:", err);
      } finally {
        if (!cancelled) setLoadingUsers(false);
      }
    }
    loadUsers();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Handle joining as an existing user
  function handleSelectUser(selectedUser) {
    setUser(selectedUser);
    localStorage.setItem(SELECTED_USER_STORAGE_KEY, String(selectedUser.id));
    if (location.pathname === "/") {
      if (selectedUser.role === "DM") {
        navigate("/dm/map");
      } else {
        const firstChar = selectedUser.characters && selectedUser.characters[0];
        if (firstChar) {
          navigate(`/player/sheet/${firstChar.id}`);
        } else {
          navigate("/player/map");
        }
      }
    }
  }

  // Handle creating a new user profile
  async function handleCreateUser(e) {
    e.preventDefault();
    if (!customName.trim()) return;

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: customName.trim(),
          role: customRole,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create user");
      }

      const newUser = await res.json();
      handleSelectUser(newUser);
    } catch (err) {
      alert(err.message);
    }
  }

  // If no user profile selected, show Entry screen
  if (!user) {
    return (
      <ErrorBoundary critical={true}>
      <div style={styles.overlay} className="fade-in">
        <div style={styles.loginCard} className="glass-panel gold-border-glow">
          <h1 style={styles.loginTitle}>Tablecast Tavern</h1>
          <p style={styles.loginSub}>Choose your character or DM profile to enter</p>

          {/* Seeded/Existing Users List */}
          <div style={styles.usersList}>
            <h3 style={styles.sectionHeader}>Join Session as:</h3>
            {loadingUsers ? (
              <p style={styles.loadingText}>Opening tavern doors</p>
            ) : (
              <div style={styles.usersGrid}>
                {usersList.map((u) => (
                  <button
                    key={u.id}
                    id={`join-user-${u.username.toLowerCase()}`}
                    onClick={() => handleSelectUser(u)}
                    style={styles.userButton}
                    className="touch-target btn-hover-scale glass-panel"
                  >
                    <span style={styles.userIcon}>{u.role === "DM" ? "DM" : "PC"}</span>
                    <span style={styles.userName}>{u.username}</span>
                    <span style={styles.userRoleBadge}>{u.role}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Create custom profile */}
          <form onSubmit={handleCreateUser} style={styles.createForm}>
            <h3 style={styles.sectionHeader}>...or Create a New Profile</h3>
            <input
              id="new-username-input"
              type="text"
              placeholder="Enter username"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              style={styles.input}
              className="form-input"
              maxLength={20}
              required
            />
            <div style={styles.roleSelection}>
              <button
                type="button"
                onClick={() => setCustomRole("PLAYER")}
                style={{
                  ...styles.roleBtn,
                  border: customRole === "PLAYER" ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.08)",
                  background: customRole === "PLAYER" ? "var(--color-accent-dim)" : "transparent",
                  color: customRole === "PLAYER" ? "var(--color-accent)" : "var(--color-text)",
                }}
                className="touch-target"
              >
                Player
              </button>
              <button
                type="button"
                onClick={() => setCustomRole("DM")}
                style={{
                  ...styles.roleBtn,
                  border: customRole === "DM" ? "1px solid var(--color-accent)" : "1px solid rgba(255,255,255,0.08)",
                  background: customRole === "DM" ? "var(--color-accent-dim)" : "transparent",
                  color: customRole === "DM" ? "var(--color-accent)" : "var(--color-text)",
                }}
                className="touch-target"
              >
                DM
              </button>
            </div>
            <button
              id="join-tavern-btn"
              type="submit"
              style={styles.submitBtn}
              className="touch-target btn-hover-scale"
              disabled={!customName.trim()}
            >
              Enter Tavern
            </button>
          </form>
        </div>
      </div>
      </ErrorBoundary>
    );
  }



  return (
    <ErrorBoundary critical={true}>
    <div 
      style={styles.appContainer} 
      className={user?.role === "DM" ? "theme-dm" : "theme-player"}
    >
      <div
        style={{
          ...styles.connectionIndicator,
          ...(connectionStatus === "connected"
            ? styles.connectionOnline
            : connectionStatus === "reconnecting"
            ? styles.connectionReconnecting
            : styles.connectionOffline),
        }}
      >
        {connectionStatus === "connected"
          ? "Live"
          : connectionStatus === "reconnecting"
          ? "Reconnecting"
          : "Offline"}
      </div>

      <Routes>
        <Route path="/" element={<p style={{ padding: "2rem", color: "var(--color-muted)" }}>Entering Tavern...</p>} />
        <Route path="/player/*" element={<PlayerLayout user={user} onLogout={handleLogout} onOpenDiceSettings={() => setDiceModalOpen(true)} />} />
        <Route path="/dm/*" element={<DmLayout user={user} onLogout={handleLogout} onOpenDiceSettings={() => setDiceModalOpen(true)} />} />
        
        {/* Standalone Popout Panel Routes */}
        <Route path="/dm/popout/map" element={<MapPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/chat" element={<ChatPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/ai" element={<AiPanel user={user} />} />
        <Route path="/dm/popout/wiki" element={<WikiPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/reference" element={<ReferencePanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/dice" element={<DiceRollerPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/sessions" element={<SessionsPanel user={user} isPopout={true} basePath="/dm/popout/sessions" />} />
        <Route path="/dm/popout/sessions/:id" element={<SessionsPanel user={user} isPopout={true} basePath="/dm/popout/sessions" />} />
        <Route path="/dm/popout/encounters" element={<EncountersPanel user={user} isPopout={true} basePath="/dm/popout/encounters" />} />
        <Route path="/dm/popout/connection" element={<ConnectionHelpPanel user={user} />} />
        <Route path="/dm/popout/characters" element={<CharacterList user={user} onSelectCharacter={(char) => window.open(`/#/dm/popout/characters/${char.id}`, '_blank', 'width=600,height=800,resizable=yes')} isPopout={true} />} />
        <Route path="/dm/popout/characters/:id" element={<CharacterSheetWrapper user={user} basePath="/dm/popout/characters" isPopout={true} />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {diceModalOpen && (
        <DiceSettingsModal
          user={user}
          onClose={() => setDiceModalOpen(false)}
          onSave={handleUpdateDiceSettings}
        />
      )}
    </div>
    </ErrorBoundary>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "linear-gradient(135deg, #09080e 0%, #151329 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
    overflowY: "auto",
  },
  loginCard: {
    maxWidth: "420px",
    width: "100%",
    borderRadius: "12px",
    padding: "2rem",
    display: "flex",
    flexDirection: "column",
    gap: "1.5rem",
    boxShadow: "0 10px 40px rgba(0,0,0,0.6)",
  },
  loginTitle: {
    fontSize: "1.75rem",
    color: "var(--color-accent)",
    textAlign: "center",
    fontWeight: 700,
    textShadow: "0 0 10px rgba(200, 151, 58, 0.2)",
  },
  loginSub: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    textAlign: "center",
    marginTop: "-0.75rem",
  },
  usersList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
  },
  sectionHeader: {
    fontSize: "0.85rem",
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: 700,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    paddingBottom: "0.25rem",
  },
  loadingText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    padding: "1rem",
  },
  usersGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  userButton: {
    padding: "0.75rem",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.35rem",
  },
  userIcon: {
    fontSize: "1.5rem",
  },
  userName: {
    fontSize: "0.9rem",
    color: "var(--color-text)",
    fontWeight: 600,
  },
  userRoleBadge: {
    fontSize: "0.65rem",
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.1)",
    padding: "0.1rem 0.35rem",
    borderRadius: "3px",
  },
  createForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  input: {
    width: "100%",
    padding: "0.75rem 1rem",
    fontSize: "0.95rem",
  },
  roleSelection: {
    display: "flex",
    gap: "0.5rem",
  },
  roleBtn: {
    flex: 1,
    borderRadius: "6px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "transparent",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.8rem",
    fontWeight: 600,
  },
  submitBtn: {
    padding: "0.75rem",
    borderRadius: "6px",
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    border: "none",
    color: "var(--color-bg)",
    fontWeight: "bold",
    fontSize: "0.95rem",
    cursor: "pointer",
    marginTop: "0.25rem",
  },

  // Main UI Shell
  appContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    maxHeight: "100dvh",
    background: "var(--color-bg)",
    overflow: "hidden",
  },
  mainContent: {
    flex: 1,
    overflow: "hidden",
    position: "relative",
  },
  connectionIndicator: {
    position: "fixed",
    top: "0.5rem",
    right: "0.5rem",
    zIndex: 1200,
    minHeight: "28px",
    padding: "0.25rem 0.6rem",
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.12)",
    fontSize: "0.72rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    background: "rgba(10, 8, 20, 0.92)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    pointerEvents: "none",
  },
  connectionOnline: {
    color: "var(--color-success)",
    borderColor: "rgba(111, 207, 151, 0.35)",
  },
  connectionReconnecting: {
    color: "var(--color-accent)",
    borderColor: "rgba(200, 151, 58, 0.4)",
  },
  connectionOffline: {
    color: "var(--color-danger)",
    borderColor: "rgba(235, 87, 87, 0.4)",
  },
  bottomNav: {
    display: "flex",
    height: "58px",
    flexShrink: 0,
    background: "rgba(10, 8, 20, 0.85)",
    borderTop: "1px solid rgba(200,151,58,0.15)",
    boxShadow: "0 -4px 20px rgba(0,0,0,0.4)",
    justifyContent: "space-around",
    alignItems: "center",
  },
  navBtn: {
    flex: 1,
    height: "100%",
    background: "transparent",
    border: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: "0.15rem",
    cursor: "pointer",
    transition: "color 0.2s",
  },
  navIcon: {
    fontSize: "1.1rem",
  },
  navLabel: {
    fontSize: "0.65rem",
    fontWeight: 600,
  },

  // Chat / Journal Sub-routing
  chatJournalWrapper: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  subTabNav: {
    display: "flex",
    padding: "0.5rem 0.75rem",
    gap: "0.5rem",
    background: "rgba(0,0,0,0.15)",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    flexShrink: 0,
  },
  subTabBtn: {
    flex: 1,
    border: "none",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
    padding: "0.45rem",
    transition: "all 0.2s",
  },
  subTabContent: {
    flex: 1,
    overflow: "hidden",
  },

  // Added/New Styles for Layouts
  layoutContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    overflow: "hidden",
  },
  topHeader: {
    display: "flex",
    height: "50px",
    padding: "0 1rem",
    alignItems: "center",
    justifyContent: "space-between",
    background: "rgba(10, 8, 20, 0.85)",
    borderBottom: "1px solid rgba(200, 151, 58, 0.15)",
    flexShrink: 0,
    zIndex: 1100,
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: "bold",
    color: "var(--color-accent)",
    letterSpacing: "0.05em",
    textTransform: "uppercase",
  },
  headerUser: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
  },
  headerUsername: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
    fontWeight: 600,
  },
  logoutBtn: {
    padding: "0.25rem 0.6rem",
    borderRadius: "4px",
    background: "rgba(235, 87, 87, 0.1)",
    border: "1px solid rgba(235, 87, 87, 0.3)",
    color: "var(--color-danger)",
    fontSize: "0.75rem",
    fontWeight: "bold",
    cursor: "pointer",
    transition: "all 0.2s",
  },
  diceSettingsBtn: {
    padding: "0.25rem",
    background: "none",
    border: "none",
    fontSize: "1.1rem",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.1s ease",
  },
  noCharacterContainer: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    borderRadius: "8px",
    margin: "2rem auto",
    maxWidth: "400px",
    border: "1px solid var(--color-border)",
    background: "var(--glass-bg)",
  },
};

// =============================================================================
// Helper Wrappers & Layout Components
// =============================================================================

function CharacterSheetWrapper({ user, basePath, isPopout = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <CharacterSheet
      characterId={Number(id)}
      user={user}
      onBack={isPopout ? undefined : () => navigate(basePath)}
    />
  );
}

function PlayerSheetRedirect({ user }) {
  const navigate = useNavigate();
  useEffect(() => {
    if (user?.characters && user.characters.length > 0) {
      navigate(`/player/sheet/${user.characters[0].id}`, { replace: true });
    }
  }, [user, navigate]);

  if (user?.characters && user.characters.length > 0) {
    return null;
  }

  return (
    <div style={styles.noCharacterContainer} className="glass-panel">
      <h3 style={{ color: "var(--color-accent)" }}>No Character Assigned</h3>
      <p style={{ color: "var(--color-muted)", fontSize: "0.9rem", textAlign: "center", marginTop: "0.5rem" }}>
        Ask your DM to create and assign a character to your profile.
      </p>
    </div>
  );
}

function PlayerLayout({ user, onLogout, onOpenDiceSettings }) {
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "sheet", "messages", "wiki", "dice", "sessions", "encounters"].includes(pathParts[2])
    ? pathParts[2]
    : "map";

  const handleSheetTabClick = () => {
    if (user?.characters && user.characters.length > 0) {
      navigate(`/player/sheet/${user.characters[0].id}`);
    } else {
      navigate("/player/sheet");
    }
  };

  return (
    <div style={styles.layoutContainer}>
      {/* Top Header Banner */}
      <header style={styles.topHeader} className="glass-panel gold-border-glow">
        <span style={styles.headerTitle}>Player Screen</span>
        <div style={styles.headerUser}>
          <span style={styles.headerUsername}>{user?.username}</span>
          <button
            onClick={onOpenDiceSettings}
            style={styles.diceSettingsBtn}
            className="touch-target btn-hover-scale"
            title="Dice Customization"
          >
            🎲
          </button>
          <button 
            onClick={onLogout} 
            style={styles.logoutBtn} 
            className="touch-target btn-hover-scale"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Workspace content */}
      <main style={styles.mainContent}>
        <Routes>
          <Route path="map" element={<MapPanel user={user} />} />
          <Route path="sheet" element={<PlayerSheetRedirect user={user} />} />
          <Route path="sheet/:id" element={<CharacterSheetWrapper user={user} basePath="/player/sheet" />} />
          <Route path="dice" element={<DiceRollerPanel user={user} />} />
          <Route path="messages" element={<MessageHub user={user} />} />
          <Route path="chat" element={<Navigate to="/player/messages" replace />} />
          <Route path="chat/:subtab" element={<Navigate to="/player/messages" replace />} />
          <Route path="wiki" element={<WikiPanel user={user} isPopout={false} />} />
          <Route path="sessions" element={<SessionsPanel user={user} readOnly basePath="/player/sessions" />} />
          <Route path="sessions/:id" element={<SessionsPanel user={user} readOnly basePath="/player/sessions" />} />
          <Route path="encounters" element={<EncountersPanel user={user} readOnly basePath="/player/encounters" />} />
          <Route path="chat-journal" element={<Navigate to="/player/messages" replace />} />
          <Route path="chat-journal/chat" element={<Navigate to="/player/messages" replace />} />
          <Route path="chat-journal/journal" element={<Navigate to="/player/wiki" replace />} />
          <Route path="chat-journal/ai" element={<Navigate to="/player/messages" replace />} />
          <Route path="chat-journal/:subtab" element={<Navigate to="/player/messages" replace />} />
          <Route path="*" element={<Navigate to="map" replace />} />
        </Routes>
      </main>

      {/* Bottom Nav Bar */}
      <nav style={styles.bottomNav} className="glass-panel gold-border-glow">
        <button
          id="nav-tab-map"
          onClick={() => navigate("/player/map")}
          style={{
            ...styles.navBtn,
            color: currentTab === "map" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
              <line x1="9" y1="3" x2="9" y2="18" />
              <line x1="15" y1="6" x2="15" y2="21" />
            </svg>
          </span>
          <span style={styles.navLabel}>Map</span>
        </button>

        <button
          id="nav-tab-characters"
          onClick={handleSheetTabClick}
          style={{
            ...styles.navBtn,
            color: currentTab === "sheet" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span style={styles.navLabel}>Sheet</span>
        </button>

        <button
          id="nav-tab-dice"
          onClick={() => navigate("/player/dice")}
          style={{
            ...styles.navBtn,
            color: currentTab === "dice" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
              <line x1="12" y1="22.08" x2="12" y2="12" />
            </svg>
          </span>
          <span style={styles.navLabel}>Dice</span>
        </button>

        <button
          id="nav-tab-messages"
          onClick={() => navigate("/player/messages")}
          style={{
            ...styles.navBtn,
            color: currentTab === "messages" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </span>
          <span style={styles.navLabel}>Chat</span>
        </button>

        <button
          id="nav-tab-wiki"
          onClick={() => navigate("/player/wiki")}
          style={{
            ...styles.navBtn,
            color: currentTab === "wiki" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <span style={styles.navLabel}>Wiki</span>
        </button>

        <button
          id="nav-tab-sessions"
          onClick={() => navigate("/player/sessions")}
          style={{
            ...styles.navBtn,
            color: currentTab === "sessions" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <CalendarDays size={20} strokeWidth={2} />
          </span>
          <span style={styles.navLabel}>Sessions</span>
        </button>

        <button
          id="nav-tab-encounters"
          onClick={() => navigate("/player/encounters")}
          style={{
            ...styles.navBtn,
            color: currentTab === "encounters" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>
            <Swords size={20} strokeWidth={2} />
          </span>
          <span style={styles.navLabel}>Combat</span>
        </button>
      </nav>
    </div>
  );
}

function DmLayout({ user, onLogout, onOpenDiceSettings }) {
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "characters", "messages", "wiki", "sessions", "encounters", "settings", "dice", "importer"].includes(pathParts[2])
    ? pathParts[2]
    : "map";

  return (
    <div className="dm-layout-shell">
      {/* Sidebar Nav (Desktop only) */}
      <aside className="dm-sidebar-nav">
        <div className="dm-sidebar-brand">
          <div className="dm-sidebar-mark">
            <SlidersHorizontal size={18} strokeWidth={2.2} />
          </div>
          <div>
            <div className="dm-sidebar-title">Tablecast DM</div>
            <div className="dm-sidebar-subtitle">Session Console</div>
          </div>
        </div>
        <div className="dm-sidebar-links">
          {DM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <div className="dm-sidebar-item" key={item.id}>
                <button
                  onClick={() => navigate(item.path)}
                  className={`dm-sidebar-btn ${isActive ? "active" : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="dm-sidebar-icon"><Icon size={18} strokeWidth={2.1} /></span>
                  <span>{item.label}</span>
                </button>
                {item.popoutUrl && (
                  <button
                    onClick={() => window.open(item.popoutUrl, "_blank", item.popoutFeatures)}
                    className="dm-sidebar-popout-btn touch-target btn-hover-scale"
                    title={item.popoutTitle}
                    aria-label={item.popoutTitle}
                  >
                    <ExternalLink size={16} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="dm-sidebar-footer">
          <span className="dm-sidebar-user">{user?.username}</span>
          <span className="dm-sidebar-role">DM access</span>
        </div>
      </aside>

      <div style={styles.layoutContainer} className="dm-main-area">
        {/* Top Header Banner */}
        <header className="dm-shell-topbar">
          <div className="dm-shell-title-group">
            <span className="dm-shell-kicker">DM Console</span>
            <span className="dm-shell-title">Dungeon Master Screen</span>
          </div>
          <div className="dm-shell-actions">
            <span className="dm-header-username">{user?.username}</span>
            <button
              onClick={() => window.open("/#/dm/popout/connection", "_blank", "width=500,height=530,resizable=yes,scrollbars=yes")}
              className="dm-header-icon-btn touch-target btn-hover-scale"
              title="Show Join QR Code"
              aria-label="Show Join QR Code"
            >
              <Wifi size={18} />
            </button>
            <button
              onClick={onOpenDiceSettings}
              className="dm-header-icon-btn touch-target btn-hover-scale"
              title="Dice Customization"
              aria-label="Dice Customization"
            >
              <Box size={18} />
            </button>
            <button 
              onClick={onLogout} 
              className="dm-header-logout touch-target btn-hover-scale"
            >
              <LogOut size={16} />
              <span>Exit</span>
            </button>
          </div>
        </header>

        {/* Main Workspace content */}
        <main style={styles.mainContent}>
          <Routes>
            <Route path="map" element={<MapPanel user={user} />} />
            <Route
              path="characters"
              element={
                <CharacterList
                  user={user}
                  onSelectCharacter={(char) => navigate(`/dm/characters/${char.id}`)}
                />
              }
            />
            <Route path="characters/:id" element={<CharacterSheetWrapper user={user} basePath="/dm/characters" />} />
            <Route path="dice" element={<DiceRollerPanel user={user} />} />
            <Route path="messages" element={<MessageHub user={user} />} />
            {/* Legacy redirects */}
            <Route path="chat" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat/ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="wiki" element={<WikiPanel user={user} isPopout={false} />} />
            <Route path="sessions" element={<SessionsPanel user={user} basePath="/dm/sessions" />} />
            <Route path="sessions/:id" element={<SessionsPanel user={user} basePath="/dm/sessions" />} />
            <Route path="encounters" element={<EncountersPanel user={user} basePath="/dm/encounters" />} />
            <Route path="chat-journal" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/chat" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/journal" element={<Navigate to="/dm/wiki" replace />} />
            <Route path="chat-journal/ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/:subtab" element={<Navigate to="/dm/messages" replace />} />
            <Route path="importer" element={<ImporterPanel user={user} />} />
            <Route path="settings" element={<SettingsPanel user={user} />} />
            <Route path="*" element={<Navigate to="map" replace />} />
          </Routes>
        </main>

        {/* Bottom Nav Bar (Mobile only) */}
        <nav className="dm-bottom-nav">
          {DM_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-tab-${item.id}`}
                onClick={() => navigate(item.path)}
                className={`dm-bottom-nav-btn touch-target ${isActive ? "active" : ""}`}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={20} strokeWidth={2.1} />
                <span>{item.mobileLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default App;
