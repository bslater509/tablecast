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
    // If the user has a character already, auto-select their first character if player
    if (selectedUser.role === "PLAYER" && selectedUser.characters && selectedUser.characters.length > 0) {
      const firstChar = selectedUser.characters[0];
      if (location.pathname === "/" || location.pathname === "/characters") {
        navigate(`/characters/${firstChar.id}`);
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



  const handleCharactersTabClick = () => {
    if (user?.role === "PLAYER" && user.characters && user.characters.length > 0) {
      navigate(`/characters/${user.characters[0].id}`);
    } else {
      navigate("/characters");
    }
  };

  return (
    <div style={styles.appContainer}>
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

      {/* Active Tab Screen Space */}
      <main style={styles.mainContent}>
        <Routes>
          <Route path="/map" element={<MapPanel user={user} />} />
          <Route
            path="/characters"
            element={
              <CharacterList
                user={user}
                onSelectCharacter={(char) => navigate(`/characters/${char.id}`)}
              />
            }
          />
          <Route path="/characters/:id" element={<CharacterSheetWrapper user={user} />} />
          <Route path="/chat-journal" element={<Navigate to="/chat-journal/chat" replace />} />
          <Route path="/chat-journal/:subtab" element={<ChatJournalWrapper user={user} />} />
          <Route
            path="/settings"
            element={
              user?.role === "DM" ? (
                <SettingsPanel user={user} />
              ) : (
                <Navigate to="/chat-journal/chat" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/chat-journal/chat" replace />} />
        </Routes>
      </main>

      {/* Touch-optimized Bottom Navigation Bar */}
      <nav style={styles.bottomNav} className="glass-panel gold-border-glow">
        <button
          id="nav-tab-map"
          onClick={() => navigate("/map")}
          style={{
            ...styles.navBtn,
            color: currentTab === "map" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>Map</span>
          <span style={styles.navLabel}>Map</span>
        </button>

        <button
          id="nav-tab-characters"
          onClick={handleCharactersTabClick}
          style={{
            ...styles.navBtn,
            color: currentTab === "characters" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>Sheet</span>
          <span style={styles.navLabel}>Sheet</span>
        </button>

        <button
          id="nav-tab-chat-journal"
          onClick={() => navigate("/chat-journal/chat")}
          style={{
            ...styles.navBtn,
            color: currentTab === "chat-journal" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
        >
          <span style={styles.navIcon}>Chat</span>
          <span style={styles.navLabel}>Chat</span>
        </button>

        {user?.role === "DM" && (
          <button
            id="nav-tab-settings"
            onClick={() => navigate("/settings")}
            style={{
              ...styles.navBtn,
              color: currentTab === "settings" ? "var(--color-accent)" : "var(--color-muted)",
            }}
            className="touch-target"
          >
            <span style={styles.navIcon}>DM</span>
            <span style={styles.navLabel}>Settings</span>
          </button>
        )}
      </nav>
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
};

function CharacterSheetWrapper({ user }) {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <CharacterSheet
      characterId={Number(id)}
      user={user}
      onBack={() => navigate("/characters")}
    />
  );
}

function ChatJournalWrapper({ user }) {
  const { subtab } = useParams();
  const navigate = useNavigate();
  const activeSubtab = ["chat", "journal", "reference", "ai"].includes(subtab) ? subtab : "chat";

  return (
    <div style={styles.chatJournalWrapper}>
      {/* Top Toggle Bar for sub-tabs */}
      <div style={styles.subTabNav}>
        <button
          id="toggle-chat-tab"
          onClick={() => navigate("/chat-journal/chat")}
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
          onClick={() => navigate("/chat-journal/journal")}
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
          onClick={() => navigate("/chat-journal/reference")}
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
          onClick={() => navigate("/chat-journal/ai")}
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
        {activeSubtab === "chat" && <ChatPanel user={user} />}
        {activeSubtab === "journal" && <WikiPanel user={user} />}
        {activeSubtab === "reference" && <ReferencePanel />}
        {activeSubtab === "ai" && <AiPanel user={user} />}
      </div>
    </div>
  );
}

export default App;
