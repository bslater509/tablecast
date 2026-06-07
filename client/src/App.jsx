// =============================================================================
// Tablecast  Root App Component (Phase 4)
// Wires up tab navigation, global states, and user selection overlay.
// =============================================================================
import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import MapPanel from "./components/MapPanel";
import CharacterList from "./components/CharacterList";
import CharacterSheet from "./components/CharacterSheet";
import ChatPanel from "./components/ChatPanel";
import WikiPanel from "./components/WikiPanel";
import SettingsPanel from "./components/SettingsPanel";
import ReferencePanel from "./components/ReferencePanel";
import AiPanel from "./components/AiPanel";
import DiceSettingsModal from "./components/DiceSettingsModal";
import DiceRollerPanel from "./components/DiceRollerPanel";
import ConnectionHelpPanel from "./components/ConnectionHelpPanel";
import { useSocket } from "./context/SocketContext";

const SELECTED_USER_STORAGE_KEY = "tablecast.selectedUserId";

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diceTheme, diceColor }),
      });
      if (res.ok) {
        const updatedUser = await res.json();
        setUser(updatedUser);
      } else {
        console.error("Failed to update user settings");
      }
    } catch (err) {
      console.error("Error updating user settings:", err);
    }
  };

  // Route authorization & redirect logic
  useEffect(() => {
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
  }, [user, location.pathname, navigate]);

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "characters", "chat-journal", "settings"].includes(pathParts[1])
    ? pathParts[1]
    : "chat-journal";

  // Fetch users list and restore persisted session when it is still valid.
  useEffect(() => {
    async function loadUsers() {
      try {
        const res = await fetch("/api/users");
        if (res.ok) {
          const data = await res.json();
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
        console.error("Failed to load users:", err);
      } finally {
        setLoadingUsers(false);
      }
    }
    loadUsers();
  }, [user]);

  // Handle joining as an existing user
  function handleSelectUser(selectedUser) {
    setUser(selectedUser);
    localStorage.setItem(SELECTED_USER_STORAGE_KEY, String(selectedUser.id));
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
    );
  }




  return (
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
        <Route path="/dm/popout/wiki" element={<WikiPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/reference" element={<ReferencePanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/dice" element={<DiceRollerPanel user={user} isPopout={true} />} />
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
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    color: "#0f0e17",
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

function ChatJournalWrapper({ user, basePath }) {
  const { subtab } = useParams();
  const navigate = useNavigate();
  const activeSubtab = ["chat", "journal", "reference", "ai"].includes(subtab) ? subtab : "chat";

  return (
    <div style={styles.chatJournalWrapper}>
      {/* Top Toggle Bar for sub-tabs */}
      <div style={styles.subTabNav}>
        <button
          id="toggle-chat-tab"
          onClick={() => navigate(`${basePath}/chat`)}
          style={{
            ...styles.subTabBtn,
            background: activeSubtab === "chat" ? "var(--color-accent-dim)" : "transparent",
            color: activeSubtab === "chat" ? "var(--color-accent)" : "var(--color-muted)",
            border: activeSubtab === "chat" ? "1px solid var(--color-border)" : "1px solid transparent",
          }}
          className="touch-target"
        >
          Session Chat
        </button>
        <button
          id="toggle-journal-tab"
          onClick={() => navigate(`${basePath}/journal`)}
          style={{
            ...styles.subTabBtn,
            background: activeSubtab === "journal" ? "var(--color-accent-dim)" : "transparent",
            color: activeSubtab === "journal" ? "var(--color-accent)" : "var(--color-muted)",
            border: activeSubtab === "journal" ? "1px solid var(--color-border)" : "1px solid transparent",
          }}
          className="touch-target"
        >
          Player Journal
        </button>
        <button
          id="toggle-reference-tab"
          onClick={() => navigate(`${basePath}/reference`)}
          style={{
            ...styles.subTabBtn,
            background: activeSubtab === "reference" ? "var(--color-accent-dim)" : "transparent",
            color: activeSubtab === "reference" ? "var(--color-accent)" : "var(--color-muted)",
            border: activeSubtab === "reference" ? "1px solid var(--color-border)" : "1px solid transparent",
          }}
          className="touch-target"
        >
          Reference Library
        </button>
        <button
          id="toggle-ai-tab"
          onClick={() => navigate(`${basePath}/ai`)}
          style={{
            ...styles.subTabBtn,
            background: activeSubtab === "ai" ? "var(--color-accent-dim)" : "transparent",
            color: activeSubtab === "ai" ? "var(--color-accent)" : "var(--color-muted)",
            border: activeSubtab === "ai" ? "1px solid var(--color-border)" : "1px solid transparent",
          }}
          className="touch-target"
        >
          AI Companion
        </button>
      </div>
      
      <div style={styles.subTabContent}>
        {activeSubtab === "chat" && <ChatPanel user={user} isPopout={false} />}
        {activeSubtab === "journal" && <WikiPanel user={user} isPopout={false} />}
        {activeSubtab === "reference" && <ReferencePanel user={user} isPopout={false} />}
        {activeSubtab === "ai" && <AiPanel user={user} />}
      </div>
    </div>
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
  const currentTab = ["map", "sheet", "chat-journal", "dice"].includes(pathParts[2])
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
          <Route path="chat-journal" element={<Navigate to="chat" replace />} />
          <Route path="chat-journal/:subtab" element={<ChatJournalWrapper user={user} basePath="/player/chat-journal" />} />
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
          id="nav-tab-chat-journal"
          onClick={() => navigate("/player/chat-journal/chat")}
          style={{
            ...styles.navBtn,
            color: currentTab === "chat-journal" ? "var(--color-accent)" : "var(--color-muted)",
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
      </nav>
    </div>
  );
}

function DmLayout({ user, onLogout, onOpenDiceSettings }) {
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "characters", "chat-journal", "settings", "dice"].includes(pathParts[2])
    ? pathParts[2]
    : "map";

  return (
    <div className="dm-layout-shell">
      {/* Sidebar Nav (Desktop only) */}
      <aside className="dm-sidebar-nav">
        <div className="dm-sidebar-title">Tablecast DM</div>
        <div className="dm-sidebar-links">
          <div className="dm-sidebar-item">
            <button
              onClick={() => navigate("/dm/map")}
              className={`dm-sidebar-btn ${currentTab === "map" ? "active" : ""}`}
            >
              <span className="dm-sidebar-icon">🗺️</span>
              Map VTT
            </button>
            <button
              onClick={() => window.open("/#/dm/popout/map", "_blank", "width=1000,height=700,resizable=yes,scrollbars=yes")}
              className="dm-sidebar-popout-btn touch-target btn-hover-scale"
              title="Pop out Map"
            >
              ⧉
            </button>
          </div>

          <div className="dm-sidebar-item">
            <button
              onClick={() => navigate("/dm/characters")}
              className={`dm-sidebar-btn ${currentTab === "characters" ? "active" : ""}`}
            >
              <span className="dm-sidebar-icon">👥</span>
              Characters
            </button>
            <button
              onClick={() => window.open("/#/dm/popout/characters", "_blank", "width=600,height=800,resizable=yes,scrollbars=yes")}
              className="dm-sidebar-popout-btn touch-target btn-hover-scale"
              title="Pop out Characters List"
            >
              ⧉
            </button>
          </div>

          <div className="dm-sidebar-item">
            <button
              onClick={() => navigate("/dm/dice")}
              className={`dm-sidebar-btn ${currentTab === "dice" ? "active" : ""}`}
            >
              <span className="dm-sidebar-icon">🎲</span>
              Dice Roller
            </button>
            <button
              onClick={() => window.open("/#/dm/popout/dice", "_blank", "width=600,height=800,resizable=yes,scrollbars=yes")}
              className="dm-sidebar-popout-btn touch-target btn-hover-scale"
              title="Pop out Dice Roller"
            >
              ⧉
            </button>
          </div>

          <div className="dm-sidebar-item">
            <button
              onClick={() => navigate("/dm/chat-journal/chat")}
              className={`dm-sidebar-btn ${currentTab === "chat-journal" ? "active" : ""}`}
            >
              <span className="dm-sidebar-icon">💬</span>
              Chat & Wiki
            </button>
            <button
              onClick={() => window.open("/#/dm/popout/chat", "_blank", "width=600,height=800,resizable=yes,scrollbars=yes")}
              className="dm-sidebar-popout-btn touch-target btn-hover-scale"
              title="Pop out Chat & Logs"
            >
              ⧉
            </button>
          </div>

          <div className="dm-sidebar-item">
            <button
              onClick={() => navigate("/dm/settings")}
              className={`dm-sidebar-btn ${currentTab === "settings" ? "active" : ""}`}
            >
              <span className="dm-sidebar-icon">⚙️</span>
              Settings
            </button>
          </div>
        </div>
      </aside>

      <div style={styles.layoutContainer} className="dm-main-area">
        {/* Top Header Banner */}
        <header style={styles.topHeader} className="glass-panel gold-border-glow">
          <span style={styles.headerTitle}>Dungeon Master Screen</span>
          <div style={styles.headerUser}>
            <span style={styles.headerUsername}>{user?.username}</span>
            <button
              onClick={() => window.open("/#/dm/popout/connection", "_blank", "width=500,height=530,resizable=yes,scrollbars=yes")}
              style={{
                background: "none",
                border: "none",
                fontSize: "1.2rem",
                cursor: "pointer",
                padding: "0.25rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "transform 0.1s ease",
              }}
              className="touch-target btn-hover-scale"
              title="Show Join QR Code"
            >
              📶
            </button>
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
            <Route path="chat-journal" element={<Navigate to="chat" replace />} />
            <Route path="chat-journal/:subtab" element={<ChatJournalWrapper user={user} basePath="/dm/chat-journal" />} />
            <Route path="settings" element={<SettingsPanel user={user} />} />
            <Route path="*" element={<Navigate to="map" replace />} />
          </Routes>
        </main>

        {/* Bottom Nav Bar (Mobile only) */}
        <nav style={styles.bottomNav} className="dm-bottom-nav glass-panel gold-border-glow">
          <button
            id="nav-tab-map"
            onClick={() => navigate("/dm/map")}
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
            onClick={() => navigate("/dm/characters")}
            style={{
              ...styles.navBtn,
              color: currentTab === "characters" ? "var(--color-accent)" : "var(--color-muted)",
            }}
            className="touch-target"
          >
            <span style={styles.navIcon}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </span>
            <span style={styles.navLabel}>Characters</span>
          </button>

          <button
            id="nav-tab-dice"
            onClick={() => navigate("/dm/dice")}
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
            id="nav-tab-chat-journal"
            onClick={() => navigate("/dm/chat-journal/chat")}
            style={{
              ...styles.navBtn,
              color: currentTab === "chat-journal" ? "var(--color-accent)" : "var(--color-muted)",
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
            id="nav-tab-settings"
            onClick={() => navigate("/dm/settings")}
            style={{
              ...styles.navBtn,
              color: currentTab === "settings" ? "var(--color-accent)" : "var(--color-muted)",
            }}
            className="touch-target"
          >
            <span style={styles.navIcon}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            <span style={styles.navLabel}>Settings</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

export default App;
