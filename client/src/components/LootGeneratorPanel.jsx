// =============================================================================
// Tablecast  Loot Generator Panel (DM Only)
// Generate D&D 5e treasure using DMG tables.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import {
  Coins,
  Gem,
  Sparkles,
  Trash2,
  RefreshCw,
  Package,
  ArrowRight,
  Database,
  ScrollText,
  Loader2,
} from "lucide-react";
import { useToast } from "../context/ToastContext";
import { getAuthHeaders, getJsonAuthHeaders } from "../utils/authHeaders";

const API = "/api/loot";
const PARTY_API = "/api/parties";

const STYLES = {
  panel: {
    padding: "1rem",
    maxWidth: "900px",
    margin: "0 auto",
    width: "100%",
    boxSizing: "border-box",
  },
  header: {
    fontSize: "1.25rem",
    fontWeight: 600,
    marginBottom: "1rem",
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  card: {
    background: "var(--color-surface)",
    borderRadius: "8px",
    border: "1px solid var(--color-border)",
    padding: "1rem",
    marginBottom: "1rem",
  },
  row: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.75rem",
    flexWrap: "wrap",
    alignItems: "flex-end",
  },
  label: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    marginBottom: "0.25rem",
    display: "block",
  },
  input: {
    padding: "0.5rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.9rem",
    width: "100px",
  },
  select: {
    padding: "0.5rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
    fontSize: "0.9rem",
  },
  btn: {
    padding: "0.5rem 1rem",
    borderRadius: "6px",
    border: "none",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    transition: "opacity 0.2s",
  },
  btnPrimary: {
    background: "var(--color-primary, #7c3aed)",
    color: "#fff",
  },
  btnSecondary: {
    background: "var(--color-border)",
    color: "var(--color-text)",
  },
  btnSuccess: {
    background: "#059669",
    color: "#fff",
  },
  btnDanger: {
    background: "#dc2626",
    color: "#fff",
  },
  coinRow: {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "0.75rem",
  },
  coinBadge: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    padding: "0.3rem 0.6rem",
    borderRadius: "6px",
    background: "var(--color-bg)",
    fontSize: "0.9rem",
  },
  itemList: {
    listStyle: "none",
    padding: 0,
    margin: "0.5rem 0",
  },
  itemEntry: {
    padding: "0.3rem 0",
    borderBottom: "1px solid var(--color-border)",
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.85rem",
  },
  sectionTitle: {
    fontSize: "0.9rem",
    fontWeight: 600,
    marginTop: "0.75rem",
    marginBottom: "0.4rem",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
  },
  totalBox: {
    marginTop: "0.75rem",
    padding: "0.5rem",
    background: "var(--color-bg)",
    borderRadius: "6px",
    textAlign: "center",
    fontWeight: 600,
    fontSize: "1rem",
  },
  cacheItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.6rem",
    borderBottom: "1px solid var(--color-border)",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  emptyState: {
    textAlign: "center",
    padding: "2rem",
    color: "var(--color-muted)",
  },
  tabs: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "1rem",
    borderBottom: "1px solid var(--color-border)",
    paddingBottom: "0.5rem",
  },
  tab: {
    padding: "0.4rem 0.8rem",
    borderRadius: "6px 6px 0 0",
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    fontWeight: 500,
  },
  tabActive: {
    background: "var(--color-surface)",
    color: "var(--color-text)",
    borderBottom: "2px solid var(--color-primary, #7c3aed)",
  },
  errorBox: {
    padding: "0.75rem",
    background: "rgba(220,38,38,0.1)",
    border: "1px solid rgba(220,38,38,0.3)",
    borderRadius: "6px",
    color: "#ef4444",
    marginBottom: "0.75rem",
    fontSize: "0.85rem",
  },
};

// Coin icon mapping
function CoinIcon({ type }) {
  const colors = {
    pp: "#e2e8f0",
    gp: "#fbbf24",
    ep: "#94a3b8",
    sp: "#cbd5e1",
    cp: "#b87333",
  };
  return (
    <span style={{
      display: "inline-block",
      width: "12px",
      height: "12px",
      borderRadius: "50%",
      background: colors[type] || "#999",
      border: "1px solid rgba(0,0,0,0.2)",
      marginRight: "2px",
    }} />
  );
}

function LootGeneratorPanel({ user }) {
  const { addToast } = useToast();
  const authHeaders = getAuthHeaders(user);
  const jsonAuthHeaders = getJsonAuthHeaders(user);

  // Generate form
  const [cr, setCr] = useState("1");
  const [lootType, setLootType] = useState("hoard");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // Cache
  const [activeTab, setActiveTab] = useState("generate");
  const [caches, setCaches] = useState([]);
  const [loadingCaches, setLoadingCaches] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [parties, setParties] = useState([]);
  const [selectedParty, setSelectedParty] = useState({});

  // Fetch parties
  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch(PARTY_API, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setParties(data);
        // Auto-select first party
        if (data.length > 0 && !selectedParty[0]) {
          setSelectedParty({ 0: data[0].id });
        }
      }
    } catch (err) {
      console.error("Failed to fetch parties:", err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authHeaders]);

  // Fetch caches
  const fetchCaches = useCallback(async () => {
    setLoadingCaches(true);
    try {
      const res = await fetch(`${API}/cache`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setCaches(data);
      }
    } catch (err) {
      console.error("Failed to fetch caches:", err);
    } finally {
      setLoadingCaches(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    if (user) {
      fetchParties();
      fetchCaches();
    }
  }, [user, fetchParties, fetchCaches]);

  // Generate loot
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${API}/generate`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ cr: parseFloat(cr) || 1, type: lootType }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
      } else {
        setError(data.error || "Failed to generate loot.");
      }
    } catch (err) {
      setError(`Network error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // Keep as unclaimed
  const handleKeepUnclaimed = async () => {
    if (!result) return;
    try {
      const res = await fetch(`${API}/cache`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({
          label: result.label || `CR ${cr} ${lootType}`,
          data: result,
          totalValue: result.totalValue || 0,
          tier: result.tier || "",
        }),
      });
      if (res.ok) {
        addToast("Loot saved to unclaimed cache.", "success");
        setResult(null);
        fetchCaches();
      } else {
        const errData = await res.json();
        addToast(errData.error || "Failed to save loot.", "error");
      }
    } catch (err) {
      addToast(`Network error: ${err.message}`, "error");
    }
  };

  // Assign cache to party
  const handleAssignCache = async (cacheId) => {
    const partyId = selectedParty[cacheId];
    if (!partyId) {
      addToast("Please select a party first.", "warning");
      return;
    }
    setAssigningId(cacheId);
    try {
      const res = await fetch(`${API}/cache/${cacheId}/assign`, {
        method: "POST",
        headers: jsonAuthHeaders,
        body: JSON.stringify({ partyId }),
      });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || "Loot assigned to party!", "success");
        fetchCaches();
        fetchParties();
      } else {
        addToast(data.error || "Failed to assign loot.", "error");
      }
    } catch (err) {
      addToast(`Network error: ${err.message}`, "error");
    } finally {
      setAssigningId(null);
    }
  };

  // Discard cache
  const handleDiscardCache = async (cacheId) => {
    try {
      const res = await fetch(`${API}/cache/${cacheId}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (res.ok) {
        addToast("Loot cache discarded.", "info");
        setCaches((prev) => prev.filter((c) => c.id !== cacheId));
      } else {
        const errData = await res.json();
        addToast(errData.error || "Failed to discard.", "error");
      }
    } catch (err) {
      addToast(`Network error: ${err.message}`, "error");
    }
  };

  // Render coins
  function renderCoins(coins) {
    if (!coins) return null;
    const entries = [
      { key: "pp", label: "PP", value: coins.pp },
      { key: "gp", label: "GP", value: coins.gp },
      { key: "ep", label: "EP", value: coins.ep },
      { key: "sp", label: "SP", value: coins.sp },
      { key: "cp", label: "CP", value: coins.cp },
    ].filter(e => e.value > 0);

    if (entries.length === 0) return <div style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>No coins</div>;

    return (
      <div style={STYLES.coinRow}>
        {entries.map(e => (
          <div key={e.key} style={STYLES.coinBadge}>
            <CoinIcon type={e.key} />
            <span>{e.value.toLocaleString()} {e.label}</span>
          </div>
        ))}
      </div>
    );
  }

  // Render item list
  function renderItemList(items, label, icon) {
    if (!items || items.length === 0) return null;
    return (
      <>
        <div style={STYLES.sectionTitle}>
          {icon}
          {label} ({items.length})
        </div>
        <ul style={STYLES.itemList}>
          {items.map((item, i) => (
            <li key={i} style={STYLES.itemEntry}>
              <span>{item.name}</span>
              <span style={{ color: "var(--color-muted)" }}>
                {item.value ? `${item.value} gp` : item.consumable ? "Consumable" : "Magic Item"}
              </span>
            </li>
          ))}
        </ul>
      </>
    );
  }

  // Render loot result
  function renderLootResult(data) {
    if (!data) return null;

    // Handle "both" type
    if (data.type === "both" && data.individual && data.hoard) {
      return (
        <div>
          <div style={{ ...STYLES.sectionTitle, fontSize: "1rem", marginTop: 0 }}>
            <Coins size={18} /> Individual Treasure
          </div>
          {renderCoins(data.individual.coins)}
          <div style={{ borderTop: "1px solid var(--color-border)", margin: "0.75rem 0" }} />
          <div style={{ ...STYLES.sectionTitle, fontSize: "1rem" }}>
            <Database size={18} /> Hoard Treasure
          </div>
          {renderCoins(data.hoard.coins)}
          {renderItemList(data.hoard.gems, "Gems", <Gem size={14} />)}
          {renderItemList(data.hoard.art, "Art Objects", <ScrollText size={14} />)}
          {renderItemList(data.hoard.magicItems, "Magic Items", <Sparkles size={14} />)}
          <div style={STYLES.totalBox}>
            Total Value: ~{data.totalValue?.toLocaleString()} gp
          </div>
        </div>
      );
    }

    const {coins} = data;
    const gems = data.gems || [];
    const art = data.art || [];
    const magicItems = data.magicItems || [];

    return (
      <div>
        {coins && renderCoins(coins)}
        {renderItemList(gems, "Gems & Gemstones", <Gem size={14} />)}
        {renderItemList(art, "Art Objects", <ScrollText size={14} />)}
        {renderItemList(magicItems, "Magic Items", <Sparkles size={14} />)}
        <div style={STYLES.totalBox}>
          Total Value: ~{data.totalValue?.toLocaleString()} gp
        </div>
      </div>
    );
  }

  // Main tabs
  const tabs = [
    { id: "generate", label: "Generate Loot", icon: <Sparkles size={14} /> },
    { id: "cache", label: `Unclaimed (${caches.length})`, icon: <Package size={14} /> },
  ];

  return (
    <div style={STYLES.panel}>
      <div style={STYLES.header}>
        <Coins size={22} />
        Loot Generator
      </div>

      {/* Tabs */}
      <div style={STYLES.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            style={{
              ...STYLES.tab,
              ...(activeTab === tab.id ? STYLES.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab.id)}
            className="touch-target"
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "generate" && (
        <div>
          {/* Generate Form */}
          <div style={STYLES.card}>
            <div style={STYLES.row}>
              <div>
                <label style={STYLES.label}>Challenge Rating</label>
                <input
                  type="number"
                  style={STYLES.input}
                  value={cr}
                  onChange={(e) => setCr(e.target.value)}
                  min="0"
                  max="30"
                  step="0.25"
                />
              </div>
              <div>
                <label style={STYLES.label}>Treasure Type</label>
                <select
                  style={STYLES.select}
                  value={lootType}
                  onChange={(e) => setLootType(e.target.value)}
                >
                  <option value="hoard">Hoard Treasure</option>
                  <option value="individual">Individual Treasure</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <button
                style={{ ...STYLES.btn, ...STYLES.btnPrimary }}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? (
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                ) : (
                  <Sparkles size={16} />
                )}
                {generating ? "Generating..." : "Generate"}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <div style={STYLES.errorBox}>{error}</div>}

          {/* Result */}
          {result && (
            <div style={STYLES.card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <div style={{ fontWeight: 600, fontSize: "1rem" }}>
                  {result.label || `CR ${cr} Treasure`}
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                  {result.tier && `Tier ${result.tier}`}
                </div>
              </div>
              {renderLootResult(result)}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button
                  style={{ ...STYLES.btn, ...STYLES.btnSuccess }}
                  onClick={handleKeepUnclaimed}
                >
                  <Package size={14} /> Keep Unclaimed
                </button>
                <button
                  style={{ ...STYLES.btn, ...STYLES.btnSecondary }}
                  onClick={handleGenerate}
                >
                  <RefreshCw size={14} /> Regenerate
                </button>
              </div>
            </div>
          )}

          {/* Quick info */}
          {!result && !error && (
            <div style={{ ...STYLES.card, ...STYLES.emptyState }}>
              <Coins size={32} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
              <div>Enter a Challenge Rating and select a treasure type,</div>
              <div>then click Generate to roll on the DMG treasure tables.</div>
            </div>
          )}
        </div>
      )}

      {activeTab === "cache" && (
        <div>
          {/* Unclaimed Caches List */}
          <div style={STYLES.card}>
            <div style={{ fontWeight: 600, marginBottom: "0.5rem", fontSize: "0.9rem" }}>
              Unclaimed Loot ({caches.length})
            </div>
            {loadingCaches ? (
              <div style={STYLES.emptyState}>
                <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
              </div>
            ) : caches.length === 0 ? (
              <div style={STYLES.emptyState}>
                <Package size={24} style={{ opacity: 0.3, marginBottom: "0.5rem" }} />
                <div>No unclaimed loot.</div>
                <div style={{ fontSize: "0.8rem" }}>Generate loot and save it here to assign later.</div>
              </div>
            ) : (
              caches.map((cache) => {
                const data = cache.data || {};
                const totalValue = cache.totalValue || data.totalValue || 0;
                const coins = data.coins || {};
                const gemCount = (data.gems || []).length;
                const artCount = (data.art || []).length;
                const magicItemCount = (data.magicItems || []).length;

                return (
                  <div key={cache.id} style={STYLES.cacheItem}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.9rem" }}>
                        {cache.label || "Unnamed Loot"}
                      </div>
                      <div style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
                        {cache.tier && `Tier ${cache.tier} · `}
                        ~{totalValue.toLocaleString()} gp
                        {coins.gp > 0 && ` · ${coins.gp} gp`}
                        {gemCount > 0 && ` · ${gemCount} gem(s)`}
                        {artCount > 0 && ` · ${artCount} art`}
                        {magicItemCount > 0 && ` · ${magicItemCount} magic`}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
                      {parties.length > 0 && (
                        <>
                          <select
                            style={{ ...STYLES.select, width: "auto", fontSize: "0.8rem", padding: "0.3rem" }}
                            value={selectedParty[cache.id] || ""}
                            onChange={(e) => setSelectedParty(prev => ({ ...prev, [cache.id]: parseInt(e.target.value, 10) }))}
                          >
                            <option value="">Party...</option>
                            {parties.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <button
                            style={{ ...STYLES.btn, ...STYLES.btnSuccess, fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                            onClick={() => handleAssignCache(cache.id)}
                            disabled={assigningId === cache.id}
                          >
                            {assigningId === cache.id ? (
                              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
                            ) : (
                              <ArrowRight size={12} />
                            )}
                            Assign
                          </button>
                        </>
                      )}
                      <button
                        style={{ ...STYLES.btn, ...STYLES.btnDanger, fontSize: "0.8rem", padding: "0.3rem 0.6rem" }}
                        onClick={() => handleDiscardCache(cache.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default LootGeneratorPanel;
