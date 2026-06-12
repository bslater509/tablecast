// =============================================================================
// Tablecast  Root App Component (Phase 4)
// Wires up tab navigation, global states, and user selection overlay.
// =============================================================================
import { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation, useParams } from "react-router-dom";
import {
  Activity,
  Beaker,
  BookOpen,
  Bot,
  Box,
  BrainCircuit,
  CalendarDays,
  Compass,
  Database,
  ExternalLink,
  FileText,
  Headphones,
  Layers,
  LogOut,
  Map as MapIcon,
  MessageCircle,
  PenLine,
  Route as RouteIcon,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Swords,
  Users,
  Wallet,
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
import PartyVaultPanel from "./components/PartyVaultPanel";
import ShopPanel from "./components/ShopPanel";
import SoundboardPanel from "./components/SoundboardPanel";
import CalendarPanel from "./components/CalendarPanel";
import HandoutPanel from "./components/HandoutPanel";
import QuestLogPanel from "./components/QuestLogPanel";
import DialogueTreePanel from "./components/DialogueTreePanel";
import HomebrewManager from "./components/HomebrewManager";
import EncounterTemplatesPanel from "./components/EncounterTemplatesPanel";
import LootGeneratorPanel from "./components/LootGeneratorPanel";
import QuestHookGenerator from "./components/QuestHookGenerator";
import NameGenerator from "./components/NameGenerator";
import DescriptionGenerator from "./components/DescriptionGenerator";
import TravelGenerator from "./components/TravelGenerator";
import CoPilotPanel from "./components/CoPilotPanel";
import CampaignDashboard from "./components/CampaignDashboard";
import { useSocket } from "./context/SocketContext";
import { useToast } from "./context/ToastContext";
import { AiProvider } from "./context/AiContext";
import { SoundProvider } from "./context/SoundContext";
import { getJsonAuthHeaders } from "./utils/authHeaders";

const SELECTED_CHARACTER_STORAGE_KEY = "tablecast.selectedCharacterId";
const DM_IDENTITY_STORAGE_KEY = "tablecast.dmIdentity";

const DM_NAV_ITEMS = [
  {
    id: "dashboard",
    label: "Dashboard",
    mobileLabel: "Home",
    path: "/dm/dashboard",
    icon: Activity,
  },
  {
    id: "copilot",
    label: "Co-Pilot",
    mobileLabel: "AI",
    path: "/dm/copilot",
    icon: BrainCircuit,
  },
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
    id: "calendar",
    label: "Calendar",
    mobileLabel: "Calendar",
    path: "/dm/calendar",
    icon: CalendarDays,
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
    id: "encounter-templates",
    label: "Enc. Templates",
    mobileLabel: "Templates",
    path: "/dm/encounter-templates",
    icon: Layers,
  },
  {
    id: "templates",
    label: "Templates",
    mobileLabel: "Templates",
    path: "/dm/templates",
    icon: Layers,
  },
  {
    id: "handouts",
    label: "Handouts",
    mobileLabel: "Handouts",
    path: "/dm/handouts",
    icon: FileText,
  },
  {
    id: "journal",
    label: "Journal",
    mobileLabel: "Journal",
    path: "/dm/journal",
    icon: BookOpen,
  },
  {
    id: "dialogue",
    label: "Dialogue",
    mobileLabel: "Dialogue",
    path: "/dm/dialogue",
    icon: MessageCircle,
  },
  {
    id: "soundboard",
    label: "Soundboard",
    mobileLabel: "Sound",
    path: "/dm/soundboard",
    icon: Headphones,
  },
  {
    id: "party",
    label: "Party Vault",
    mobileLabel: "Party",
    path: "/dm/party",
    icon: Wallet,
  },
  {
    id: "shop",
    label: "Shops",
    mobileLabel: "Shop",
    path: "/dm/shop",
    icon: ShoppingCart,
  },
  {
    id: "homebrew",
    label: "Homebrew",
    mobileLabel: "Homebrew",
    path: "/dm/homebrew",
    icon: Beaker,
  },
  {
    id: "loot",
    label: "Loot Generator",
    mobileLabel: "Loot",
    path: "/dm/loot",
    icon: Database,
  },
  {
    id: "quest-hooks",
    label: "Quest Hooks",
    mobileLabel: "Hooks",
    path: "/dm/quest-hooks",
    icon: Compass,
  },
  {
    id: "name-generator",
    label: "Name Generator",
    mobileLabel: "Names",
    path: "/dm/name-generator",
    icon: Sparkles,
  },
  {
    id: "desc-gen",
    label: "Description Gen.",
    mobileLabel: "Describe",
    path: "/dm/desc-gen",
    icon: PenLine,
  },
  {
    id: "travel",
    label: "Travel Montage",
    mobileLabel: "Travel",
    path: "/dm/travel",
    icon: RouteIcon,
  },
  {
    id: "importer",
    label: "5etools Importer",
    mobileLabel: "Import",
    path: "/dm/importer",
    icon: Database,
  },
  {
    id: "copilot",
    label: "AI Co-Pilot",
    mobileLabel: "Co-Pilot",
    path: "/dm/copilot",
    icon: Bot,
  },
];

function App() {
  const { addToast } = useToast();
  const { connectionStatus, connectionFailed, setUserId, setCharacterId, clearAuth } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [heroes, setHeroes] = useState([]);
  const [loadingHeroes, setLoadingHeroes] = useState(true);

  // DM password auth state
  const [authStatus, setAuthStatus] = useState(null);       // { dmExists, passwordSet } | null
  const [isDmAuthLoading, setIsDmAuthLoading] = useState(true);
  const [dmPassword, setDmPassword] = useState("");         // login field
  const [dmSetupPassword, setDmSetupPassword] = useState("");   // setup field
  const [dmConfirmPassword, setDmConfirmPassword] = useState(""); // confirm field
  const [isDmSubmitting, setIsDmSubmitting] = useState(false);
  const [dmError, setDmError] = useState(null);

  // Handle log out
  const handleLogout = () => {
    setUser(null);
    clearAuth();
    localStorage.removeItem(DM_IDENTITY_STORAGE_KEY);
    localStorage.removeItem(SELECTED_CHARACTER_STORAGE_KEY);
    // Clear session-specific UI state (don't clear UX prefs like VTT view settings)
    localStorage.removeItem("tablecast.activeMapId");
    localStorage.removeItem("tablecast.selectedEncounterId");
    localStorage.removeItem("tablecast.selectedArticleId");
    localStorage.removeItem("tablecast.selectedNpcId");
    localStorage.removeItem("tablecast.selectedCharId");
    navigate("/", { replace: true });
  };

  const [diceModalOpen, setDiceModalOpen] = useState(false);

  const handleUpdateDiceSettings = async (diceTheme, diceColor) => {
    try {
      // Determine endpoint: character for heroes, user for DM
      const {isCharacter} = user;
      const endpoint = isCharacter ? `/api/characters/${user.characterId}` : `/api/users/${user.id}`;
      const headers = {
        "Content-Type": "application/json",
        ...getJsonAuthHeaders(user),
      };
      const res = await fetch(endpoint, {
        method: "PUT",
        headers,
        body: JSON.stringify({ diceTheme, diceColor }),
      });
      if (res.ok) {
        const updated = await res.json();
        setUser((prev) => ({
          ...prev,
          diceTheme: updated.diceTheme || diceTheme,
          diceColor: updated.diceColor || diceColor,
        }));
        return true;
      }
        const err = await res.json().catch(() => ({}));
        console.error("Failed to update dice settings:", err.error || res.statusText);

    } catch (err) {
      console.error("Error updating dice settings:", err);
    }
    return false;
  };

  // Route authorization & redirect logic
  useEffect(() => {
    if (loadingHeroes) return;

    if (!user) {
      if (location.pathname !== "/" && !location.pathname.startsWith("/api")) {
        navigate("/", { replace: true });
      }
      return;
    }

    if (user.role === "DM") {
      if (!location.pathname.startsWith("/dm")) {
        navigate("/dm/dashboard", { replace: true });
      }
    } else if (!location.pathname.startsWith("/player")) {
        navigate("/player/map", { replace: true });
      }
  }, [user, location.pathname, navigate, loadingHeroes]);

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "characters", "chat-journal", "settings"].includes(pathParts[1])
    ? pathParts[1]
    : "chat-journal";

  // Fetch heroes list and restore persisted session
  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        // Restore stored DM session first (independent of heroes API)
        if (!user) {
          const storedDmJson = localStorage.getItem(DM_IDENTITY_STORAGE_KEY);
          if (storedDmJson) {
            try {
              const storedDm = JSON.parse(storedDmJson);
              if (storedDm && storedDm.role === "DM" && storedDm.id) {
                handleSelectDm({
                  id: storedDm.id,
                  username: storedDm.username,
                  role: "DM",
                  diceTheme: storedDm.diceTheme,
                  diceColor: storedDm.diceColor,
                });
                // Skip heroes fetch for DM — heroes are loaded on the Characters panel
                if (!cancelled) setLoadingHeroes(false);
                return;
              }
                localStorage.removeItem(DM_IDENTITY_STORAGE_KEY);

            } catch {
              localStorage.removeItem(DM_IDENTITY_STORAGE_KEY);
            }
          }
        }

        // Fetch heroes (public, no auth needed)
        const heroRes = await fetch("/api/heroes");
        if (cancelled) return;
        if (heroRes.ok) {
          const heroData = await heroRes.json();
          if (cancelled) return;
          setHeroes(heroData);

          // Check for stored character session from the same heroData
          if (!user) {
            const storedCharId = Number(localStorage.getItem(SELECTED_CHARACTER_STORAGE_KEY));
            if (storedCharId) {
              const storedHero = heroData.find((h) => h.id === storedCharId);
              if (storedHero) {
                handleSelectHero(storedHero);
              } else {
                localStorage.removeItem(SELECTED_CHARACTER_STORAGE_KEY);
              }
            }
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load heroes:", err);
      } finally {
        if (!cancelled) setLoadingHeroes(false);
      }
    }
    loadData();
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Handle selecting a hero (player login)
  function handleSelectHero(hero) {
    // Build user-like identity object from hero
    const heroUser = {
      id: hero.id,              // used as character's identity
      username: hero.name,      // components display this as sender
      role: "PLAYER",
      characters: [hero],       // backward compat
      diceTheme: hero.diceTheme,
      diceColor: hero.diceColor,
      isCharacter: true,
      characterId: hero.id,
      userId: null,
    };
    setUser(heroUser);
    setCharacterId(hero.id);
    localStorage.setItem(SELECTED_CHARACTER_STORAGE_KEY, String(hero.id));
    if (location.pathname === "/") {
      navigate("/player/map");
    }
  }

  // Handle selecting a DM user (called after password verification)
  function handleSelectDm(dmUser) {
    const dmIdentity = {
      id: dmUser.id,
      username: dmUser.username,
      role: "DM",
      characters: [],
      diceTheme: dmUser.diceTheme,
      diceColor: dmUser.diceColor,
      isCharacter: false,
      characterId: null,
      userId: dmUser.id,
    };
    setUser(dmIdentity);
    setUserId(dmUser.id);
    localStorage.setItem(DM_IDENTITY_STORAGE_KEY, JSON.stringify(dmIdentity));
    localStorage.removeItem(SELECTED_CHARACTER_STORAGE_KEY);
    if (location.pathname === "/") {
      navigate("/dm/map");
    }
  }

  // Fetch DM auth status on mount
  useEffect(() => {
    fetch("/api/auth/status")
      .then((r) => r.json())
      .then((data) => setAuthStatus(data))
      .catch(() => setAuthStatus({ dmExists: false, passwordSet: false }))
      .finally(() => setIsDmAuthLoading(false));
  }, []);

  // DM password login
  async function handleDmLogin() {
    setIsDmSubmitting(true);
    setDmError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: dmPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSelectDm(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setDmError(err.error || "Login failed");
        setDmPassword("");
      }
    } catch {
      setDmError("Network error. Is the server running?");
    } finally {
      setIsDmSubmitting(false);
    }
  }

  // One-time DM password setup
  async function handleDmSetup() {
    if (dmSetupPassword !== dmConfirmPassword) {
      setDmError("Passwords do not match");
      return;
    }
    if (dmSetupPassword.length < 4) {
      setDmError("Password must be at least 4 characters");
      return;
    }
    setIsDmSubmitting(true);
    setDmError(null);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: dmSetupPassword }),
      });
      if (res.ok) {
        const data = await res.json();
        handleSelectDm(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setDmError(err.error || "Setup failed");
      }
    } catch {
      setDmError("Network error. Is the server running?");
    } finally {
      setIsDmSubmitting(false);
    }
  }

  // If no user selected, show Entry screen with hero grid
  if (!user) {
    return (
      <ErrorBoundary critical={true}>
      <div style={styles.overlay} className="fade-in">
        <div style={styles.loginCard} className="glass-panel gold-border-glow">
          <h1 style={styles.loginTitle}>
            Tablecast Tavern
          </h1>
          <p style={styles.loginSub}>Choose your hero to enter</p>

          {/* Hero Grid */}
          <div style={styles.heroesSection}>
            <h3 style={styles.sectionHeader}>Select Your Hero</h3>
            {loadingHeroes ? (
              <p style={styles.loadingText}>Opening tavern doors...</p>
            ) : heroes.length === 0 ? (
              <p style={styles.emptyText}>No heroes yet. Ask your DM to create one.</p>
            ) : (
              <div style={styles.heroesGrid}>
                {heroes.map((hero) => (
                  <button
                    key={hero.id}
                    id={`join-hero-${hero.name.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => handleSelectHero(hero)}
                    style={styles.heroButton}
                    className="touch-target btn-hover-scale glass-panel"
                  >
                    <span style={styles.heroIcon}>PC</span>
                    <span style={styles.heroName}>{hero.name}</span>
                    <span style={styles.heroDetails}>
                      {hero.race} {hero.class}
                    </span>
                    <span style={styles.heroLevel}>Level {hero.level}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* DM Login Section — password-based */}
          <div style={styles.dmSection}>
            <h3 style={styles.sectionHeader}>DM Access</h3>

            {isDmAuthLoading ? (
              <p style={styles.loadingText}>Checking server…</p>
            ) : !authStatus?.dmExists ? (
              <p style={styles.emptyText}>No DM account found. Run the database seed.</p>
            ) : !authStatus.passwordSet ? (
              /* First-time setup: create DM password */
              <div>
                <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", marginBottom: "0.5rem" }}>
                  Set your DM password for the first time.
                </p>
                <input
                  type="password"
                  placeholder="New password"
                  value={dmSetupPassword}
                  onChange={(e) => setDmSetupPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDmSetup()}
                  style={styles.dmInput}
                  className="touch-target"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={dmConfirmPassword}
                  onChange={(e) => setDmConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDmSetup()}
                  style={styles.dmInput}
                  className="touch-target"
                  autoComplete="new-password"
                />
                <button
                  onClick={handleDmSetup}
                  disabled={isDmSubmitting}
                  style={styles.dmSubmitButton}
                  className="touch-target btn-hover-scale"
                >
                  {isDmSubmitting ? "Setting up…" : "Set Password & Enter"}
                </button>
              </div>
            ) : (
              /* Password login */
              <div>
                <input
                  type="password"
                  placeholder="DM password"
                  value={dmPassword}
                  onChange={(e) => setDmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDmLogin()}
                  style={styles.dmInput}
                  className="touch-target"
                  autoComplete="current-password"
                />
                <button
                  onClick={handleDmLogin}
                  disabled={isDmSubmitting || !dmPassword}
                  style={styles.dmSubmitButton}
                  className="touch-target btn-hover-scale"
                >
                  {isDmSubmitting ? "Authenticating…" : "Enter as DM"}
                </button>
              </div>
            )}

            {dmError && (
              <p style={styles.dmErrorText}>{dmError}</p>
            )}
          </div>
        </div>
      </div>
      </ErrorBoundary>
    );
  }


  return (
    <SoundProvider>
    <AiProvider user={user}>
    <ErrorBoundary critical={true}>
    <div
      style={styles.appContainer}
      className={user?.role === "DM" ? "theme-dm" : "theme-player"}
    >
      <div
        role="status"
        aria-live="polite"
        aria-label={connectionFailed ? "Connection failed" : connectionStatus === "connected" ? "Connected" : connectionStatus === "reconnecting" ? "Reconnecting" : "Offline"}
        style={{
          ...styles.connectionIndicator,
          ...(connectionFailed
            ? styles.connectionOffline
            : connectionStatus === "connected"
            ? styles.connectionOnline
            : connectionStatus === "reconnecting"
            ? styles.connectionReconnecting
            : user
            ? styles.connectionConnecting
            : styles.connectionOffline),
        }}
      >
        {connectionFailed
          ? "Failed"
          : connectionStatus === "connected"
          ? "Live"
          : connectionStatus === "reconnecting"
          ? "Reconnecting"
          : user
          ? "Connecting…"
          : "Offline"}
      </div>

      <Routes>
        <Route path="/" element={<p style={{ padding: "2rem", color: "var(--color-muted)" }}>Entering Tavern...</p>} />
        <Route path="/player/*" element={<PlayerLayout user={user} onLogout={handleLogout} onOpenDiceSettings={() => setDiceModalOpen(true)} />} />
        <Route path="/dm/*" element={<DmLayout user={user} onLogout={handleLogout} onOpenDiceSettings={() => setDiceModalOpen(true)} />} />

        {/* Standalone Popout Panel Routes */}
        <Route path="/dm/popout/map" element={<ErrorBoundary critical={false}><MapPanel user={user} isPopout={true} /></ErrorBoundary>} />
        <Route path="/dm/popout/map/:id" element={<ErrorBoundary critical={false}><MapPanel user={user} isPopout={true} /></ErrorBoundary>} />
        <Route path="/dm/popout/chat" element={<ErrorBoundary critical={false}><ChatPanel user={user} isPopout={true} /></ErrorBoundary>} />
        <Route path="/dm/popout/ai" element={<AiPanel user={user} />} />
        <Route path="/dm/popout/wiki" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={true} /></ErrorBoundary>} />
        <Route path="/dm/popout/wiki/:id" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={true} /></ErrorBoundary>} />
        <Route path="/dm/popout/reference" element={<ReferencePanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/dice" element={<DiceRollerPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/sessions" element={<SessionsPanel user={user} isPopout={true} basePath="/dm/popout/sessions" />} />
        <Route path="/dm/popout/sessions/:id" element={<SessionsPanel user={user} isPopout={true} basePath="/dm/popout/sessions" />} />
        <Route path="/dm/popout/encounters" element={<ErrorBoundary critical={false}><EncountersPanel user={user} isPopout={true} basePath="/dm/popout/encounters" /></ErrorBoundary>} />
        <Route path="/dm/popout/encounters/:id" element={<ErrorBoundary critical={false}><EncountersPanel user={user} isPopout={true} basePath="/dm/popout/encounters" /></ErrorBoundary>} />
        <Route path="/dm/popout/handouts" element={<HandoutPanel user={user} isPopout={true} />} />
        <Route path="/dm/popout/connection" element={<ConnectionHelpPanel user={user} />} />
        <Route path="/dm/popout/characters" element={<CharacterList user={user} onSelectCharacter={(char) => window.open(`/#/dm/popout/characters/${char.id}`, "_blank", "width=600,height=800,resizable=yes")} isPopout={true} />} />
        <Route path="/dm/popout/characters/:id" element={<ErrorBoundary critical={false}><CharacterSheetWrapper user={user} basePath="/dm/popout/characters" isPopout={true} /></ErrorBoundary>} />

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
    </AiProvider>
    </SoundProvider>
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
  heroesSection: {
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
  emptyText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    padding: "1rem",
    fontStyle: "italic",
  },
  heroesGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "0.5rem",
    marginTop: "0.25rem",
  },
  heroButton: {
    padding: "0.75rem 0.5rem",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.02)",
    border: "1px solid rgba(255, 255, 255, 0.05)",
    cursor: "pointer",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.2rem",
    minHeight: "80px",
    justifyContent: "center",
  },
  heroIcon: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    background: "rgba(200, 151, 58, 0.12)",
    padding: "0.1rem 0.4rem",
    borderRadius: "3px",
    marginBottom: "0.15rem",
  },
  heroName: {
    fontSize: "0.9rem",
    color: "var(--color-text)",
    fontWeight: 600,
  },
  heroDetails: {
    fontSize: "0.75rem",
    color: "var(--color-muted)",
  },
  heroLevel: {
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    fontWeight: 600,
  },
  userName: {
    fontSize: "0.9rem",
    color: "var(--color-text)",
    fontWeight: 600,
  },
  dmSection: {
    display: "flex",
    flexDirection: "column",
    gap: "0.65rem",
    borderTop: "1px solid rgba(200, 151, 58, 0.15)",
    paddingTop: "1rem",
  },
  dmInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.65rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.04)",
    border: "1px solid rgba(200, 151, 58, 0.2)",
    color: "var(--color-text)",
    fontSize: "0.9rem",
    outline: "none",
    marginBottom: "0.4rem",
  },
  dmSubmitButton: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.65rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    color: "var(--color-accent)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    marginTop: "0.25rem",
  },
  dmErrorText: {
    fontSize: "0.8rem",
    color: "var(--color-danger, #eb5757)",
    textAlign: "center",
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
  connectionConnecting: {
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
    // For character-based login, redirect to their sheet
    if (user?.characterId) {
      navigate(`/player/sheet/${user.characterId}`, { replace: true });
    } else if (user?.characters && user.characters.length > 0) {
      navigate(`/player/sheet/${user.characters[0].id}`, { replace: true });
    }
  }, [user, navigate]);

  if (user?.characterId || (user?.characters && user.characters.length > 0)) {
    return null;
  }

  return (
    <div style={styles.noCharacterContainer} className="glass-panel">
      <h3 style={{ color: "var(--color-accent)" }}>No Character Found</h3>
      <p style={{ color: "var(--color-muted)", fontSize: "0.9rem", textAlign: "center", marginTop: "0.5rem" }}>
        Select a hero from the login screen to view your character sheet.
      </p>
    </div>
  );
}

function PlayerLayout({ user, onLogout, onOpenDiceSettings }) {
  const navigate = useNavigate();
  const location = useLocation();

  const pathParts = location.pathname.split("/");
  const currentTab = ["map", "sheet", "messages", "wiki", "dice", "sessions", "encounters", "handouts", "journal", "dialogue"].includes(pathParts[2])
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
          <Route path="map" element={<ErrorBoundary critical={false}><MapPanel user={user} /></ErrorBoundary>} />
          <Route path="sheet" element={<PlayerSheetRedirect user={user} />} />
          <Route path="sheet/:id" element={<ErrorBoundary critical={false}><CharacterSheetWrapper user={user} basePath="/player/sheet" /></ErrorBoundary>} />
          <Route path="dice" element={<DiceRollerPanel user={user} />} />
          <Route path="messages" element={<MessageHub user={user} />} />
          <Route path="messages/session" element={<MessageHub user={user} initialView="session" />} />
          <Route path="messages/rules" element={<MessageHub user={user} initialView="rules" />} />
          <Route path="messages/rules/:convId" element={<MessageHub user={user} initialView="rules" />} />
          <Route path="messages/npc/:npcId" element={<MessageHub user={user} initialView="npc" />} />
          <Route path="messages/npc/:npcId/:convId" element={<MessageHub user={user} initialView="npc" />} />
          <Route path="chat" element={<Navigate to="/player/messages" replace />} />
            <Route path="chat/:subtab" element={<Navigate to="/player/messages" replace />} />
          <Route path="wiki" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={false} /></ErrorBoundary>} />
          <Route path="wiki/:id" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={false} /></ErrorBoundary>} />
          <Route path="sessions" element={<SessionsPanel user={user} readOnly basePath="/player/sessions" />} />
          <Route path="sessions/:id" element={<SessionsPanel user={user} readOnly basePath="/player/sessions" />} />
          <Route path="encounters" element={<ErrorBoundary critical={false}><EncountersPanel user={user} readOnly basePath="/player/encounters" /></ErrorBoundary>} />
          <Route path="encounters/:id" element={<ErrorBoundary critical={false}><EncountersPanel user={user} readOnly basePath="/player/encounters" /></ErrorBoundary>} />
          <Route path="handouts" element={<HandoutPanel user={user} />} />
          <Route path="journal" element={<QuestLogPanel user={user} />} />
          <Route path="dialogue" element={<DialogueTreePanel user={user} readOnly />} />
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
          aria-current={currentTab === "map" ? "page" : undefined}
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
          aria-current={currentTab === "sheet" ? "page" : undefined}
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
          aria-current={currentTab === "dice" ? "page" : undefined}
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
          aria-current={currentTab === "messages" ? "page" : undefined}
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
          aria-current={currentTab === "wiki" ? "page" : undefined}
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
          id="nav-tab-handouts"
          onClick={() => navigate("/player/handouts")}
          style={{
            ...styles.navBtn,
            color: currentTab === "handouts" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
          aria-current={currentTab === "handouts" ? "page" : undefined}
        >
          <span style={styles.navIcon}>
            <FileText size={20} strokeWidth={2} />
          </span>
          <span style={styles.navLabel}>Docs</span>
        </button>

        <button
          id="nav-tab-journal"
          onClick={() => navigate("/player/journal")}
          style={{
            ...styles.navBtn,
            color: currentTab === "journal" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
          aria-current={currentTab === "journal" ? "page" : undefined}
        >
          <span style={styles.navIcon}>
            <BookOpen size={20} strokeWidth={2} />
          </span>
          <span style={styles.navLabel}>Journal</span>
        </button>

        <button
          id="nav-tab-sessions"
          onClick={() => navigate("/player/sessions")}
          style={{
            ...styles.navBtn,
            color: currentTab === "sessions" ? "var(--color-accent)" : "var(--color-muted)",
          }}
          className="touch-target"
          aria-current={currentTab === "sessions" ? "page" : undefined}
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
          aria-current={currentTab === "encounters" ? "page" : undefined}
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
  const { socket } = useSocket();
  const { addToast } = useToast();

  const pathParts = location.pathname.split("/");
  const currentTab = ["dashboard", "map", "characters", "messages", "wiki", "sessions", "calendar", "encounters", "encounter-templates", "handouts", "journal", "settings", "dice", "importer", "party", "shop", "loot", "name-generator", "quest-hooks", "desc-gen", "travel", "copilot"].includes(pathParts[2])
    ? pathParts[2]
    : "dashboard";

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
            <Route path="dashboard" element={<CampaignDashboard user={user} />} />
            <Route path="copilot" element={<CoPilotPanel user={user} socket={socket} />} />
            <Route path="map" element={<ErrorBoundary critical={false}><MapPanel user={user} /></ErrorBoundary>} />
            <Route path="map/:id" element={<ErrorBoundary critical={false}><MapPanel user={user} /></ErrorBoundary>} />
            <Route
              path="characters"
              element={
                <CharacterList
                  user={user}
                  onSelectCharacter={(char) => navigate(`/dm/characters/${char.id}`)}
                />
              }
            />
            <Route path="characters/:id" element={<ErrorBoundary critical={false}><CharacterSheetWrapper user={user} basePath="/dm/characters" /></ErrorBoundary>} />
            <Route path="dice" element={<DiceRollerPanel user={user} />} />
            <Route path="messages" element={<MessageHub user={user} />} />
            <Route path="messages/session" element={<MessageHub user={user} initialView="session" />} />
            <Route path="messages/rules" element={<MessageHub user={user} initialView="rules" />} />
            <Route path="messages/rules/:convId" element={<MessageHub user={user} initialView="rules" />} />
            <Route path="messages/npc/:npcId" element={<MessageHub user={user} initialView="npc" />} />
            <Route path="messages/npc/:npcId/:convId" element={<MessageHub user={user} initialView="npc" />} />
            {/* Legacy redirects */}
            <Route path="chat" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat/ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="wiki" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={false} /></ErrorBoundary>} />
            <Route path="wiki/:id" element={<ErrorBoundary critical={false}><WikiPanel user={user} isPopout={false} /></ErrorBoundary>} />
            <Route path="sessions" element={<SessionsPanel user={user} basePath="/dm/sessions" />} />
            <Route path="sessions/:id" element={<SessionsPanel user={user} basePath="/dm/sessions" />} />
            <Route path="encounters" element={<ErrorBoundary critical={false}><EncountersPanel user={user} basePath="/dm/encounters" /></ErrorBoundary>} />
            <Route path="encounters/:id" element={<ErrorBoundary critical={false}><EncountersPanel user={user} basePath="/dm/encounters" /></ErrorBoundary>} />
            <Route path="encounter-templates" element={<EncounterTemplatesPanel user={user} />} />
            <Route path="chat-journal" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/chat" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/journal" element={<Navigate to="/dm/wiki" replace />} />
            <Route path="chat-journal/ai" element={<Navigate to="/dm/messages" replace />} />
            <Route path="chat-journal/:subtab" element={<Navigate to="/dm/messages" replace />} />
            <Route path="party" element={<PartyVaultPanel user={user} />} />
            <Route path="loot" element={<LootGeneratorPanel user={user} />} />
            <Route path="quest-hooks" element={<QuestHookGenerator user={user} />} />
            <Route path="name-generator" element={<NameGenerator user={user} />} />
            <Route path="desc-gen" element={<DescriptionGenerator user={user} />} />
            <Route path="travel" element={<TravelGenerator user={user} />} />
            <Route path="shop" element={<ShopPanel user={user} addToast={addToast} />} />
            <Route path="importer" element={<ImporterPanel user={user} />} />
            <Route path="soundboard" element={<SoundboardPanel user={user} />} />
            <Route path="homebrew" element={<HomebrewManager user={user} />} />
            <Route path="templates" element={<EncounterTemplatesPanel user={user} />} />
            <Route path="calendar" element={<CalendarPanel user={user} />} />
            <Route path="handouts" element={<HandoutPanel user={user} />} />
            <Route path="journal" element={<QuestLogPanel user={user} />} />
            <Route path="dialogue" element={<DialogueTreePanel user={user} />} />
            <Route path="dialogue/:npcId" element={<DialogueTreePanel user={user} />} />
            <Route path="settings" element={<SettingsPanel user={user} />} />
            <Route path="settings/:tab" element={<SettingsPanel user={user} />} />
            <Route path="*" element={<Navigate to="dashboard" replace />} />
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
