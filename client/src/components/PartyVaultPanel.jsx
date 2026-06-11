// =============================================================================
// Tablecast  Party Vault Panel
// Manages shared party inventory, gold pool, and item/gold transfers.
// =============================================================================
import { useState, useEffect, useCallback } from "react";
import { Users, Wallet, ArrowLeftRight, Plus, Trash2, UserPlus, LogOut, ArrowUpDown, Shield, Coins, Box, ChevronLeft } from "lucide-react";
import { getJsonAuthHeaders } from "../utils/authHeaders";

const panelStyles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    gap: "0.5rem",
    padding: "0.5rem",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.2)",
    border: "1px solid rgba(200,151,58,0.15)",
    flexShrink: 0,
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    flex: 1,
  },
  headerActions: {
    display: "flex",
    gap: "0.35rem",
  },
  btnPrimary: {
    padding: "0.4rem 0.75rem",
    fontSize: "0.78rem",
    fontWeight: 600,
    borderRadius: "6px",
    border: "1px solid rgba(200,151,58,0.3)",
    background: "rgba(200,151,58,0.12)",
    color: "var(--color-accent)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    whiteSpace: "nowrap",
  },
  btnDanger: {
    padding: "0.35rem 0.6rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "4px",
    border: "1px solid rgba(235,87,87,0.3)",
    background: "rgba(235,87,87,0.1)",
    color: "var(--color-danger)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  btnSmall: {
    padding: "0.25rem 0.5rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    borderRadius: "4px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--color-text)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.2rem",
  },
  card: {
    padding: "0.65rem",
    borderRadius: "8px",
    background: "rgba(0,0,0,0.15)",
    border: "1px solid rgba(255,255,255,0.04)",
  },
  goldDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "8px",
    background: "rgba(200,151,58,0.06)",
    border: "1px solid rgba(200,151,58,0.12)",
  },
  goldAmount: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  goldSubtext: {
    fontSize: "0.72rem",
    color: "var(--color-muted)",
  },
  memberRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.4rem 0.5rem",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    gap: "0.35rem",
  },
  memberName: {
    fontSize: "0.82rem",
    fontWeight: 600,
    color: "var(--color-text)",
    flex: 1,
  },
  memberGold: {
    fontSize: "0.75rem",
    color: "var(--color-accent)",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },
  memberRole: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    padding: "0.1rem 0.35rem",
    borderRadius: "3px",
    background: "rgba(200,151,58,0.1)",
    border: "1px solid rgba(200,151,58,0.15)",
  },
  sectionLabel: {
    fontSize: "0.72rem",
    fontWeight: 700,
    color: "var(--color-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: "0.35rem",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.5rem 0.65rem",
    fontSize: "0.82rem",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--color-text)",
    outline: "none",
  },
  select: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.5rem 0.65rem",
    fontSize: "0.82rem",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--color-text)",
    outline: "none",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    gap: "0.5rem",
  },
  transferForm: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    padding: "0.65rem",
    borderRadius: "8px",
    background: "rgba(74,187,94,0.04)",
    border: "1px solid rgba(74,187,94,0.1)",
  },
  row: {
    display: "flex",
    gap: "0.35rem",
    alignItems: "center",
  },
  tabBar: {
    display: "flex",
    gap: "0.25rem",
    padding: "0.25rem",
    borderRadius: "6px",
    background: "rgba(0,0,0,0.15)",
    flexShrink: 0,
  },
  tabBtn: {
    flex: 1,
    padding: "0.35rem 0.5rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "4px",
    border: "none",
    background: "transparent",
    color: "var(--color-muted)",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  tabBtnActive: {
    background: "rgba(200,151,58,0.12)",
    color: "var(--color-accent)",
  },
};

function formatGold(cp) {
  if (!cp || cp < 0) cp = 0;
  const gold = Math.floor(cp / 100);
  const silver = Math.floor((cp % 100) / 10);
  const copper = cp % 10;
  const parts = [];
  if (gold > 0) parts.push(`${gold} GP`);
  if (silver > 0) parts.push(`${silver} SP`);
  if (copper > 0 || parts.length === 0) parts.push(`${copper} CP`);
  return parts.join(", ");
}

function PartyVaultPanel({ user, onBack }) {
  const [parties, setParties] = useState([]);
  const [selectedParty, setSelectedParty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview"); // overview | transfer | members
  const [authHeaders, setAuthHeaders] = useState({});
  const [jsonAuthHeaders, setJsonAuthHeaders] = useState({});

  // Create party form
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newPartyName, setNewPartyName] = useState("");

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [addCharId, setAddCharId] = useState("");
  const [chars, setChars] = useState([]);

  // Transfer form
  const [transferType, setTransferType] = useState("gold"); // gold | item
  const [transferFrom, setTransferFrom] = useState("character"); // character | party
  const [transferAmount, setTransferAmount] = useState("");
  const [transferCharId, setTransferCharId] = useState("");
  const [transferItemName, setTransferItemName] = useState("");
  const [transferItemQty, setTransferItemQty] = useState(1);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferResult, setTransferResult] = useState(null);

  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (user) {
      setAuthHeaders(getJsonAuthHeaders(user));
      const json = getJsonAuthHeaders(user);
      setJsonAuthHeaders(json);
    }
  }, [user]);

  // Fetch parties
  const fetchParties = useCallback(async () => {
    if (!jsonAuthHeaders || Object.keys(jsonAuthHeaders).length === 0) return;
    try {
      setLoading(true);
      const res = await fetch("/api/parties", { headers: jsonAuthHeaders });
      if (res.ok) {
        const data = await res.json();
        setParties(data);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to load parties");
      }
    } catch (err) {
      setError("Network error loading parties");
    } finally {
      setLoading(false);
    }
  }, [jsonAuthHeaders]);

  useEffect(() => {
    fetchParties();
  }, [fetchParties]);

  // Fetch characters (for party management)
  const fetchChars = useCallback(async () => {
    if (!jsonAuthHeaders || Object.keys(jsonAuthHeaders).length === 0) return;
    try {
      const res = await fetch("/api/characters", { headers: jsonAuthHeaders });
      if (res.ok) {
        setChars(await res.json());
      }
    } catch { /* ignore */ }
  }, [jsonAuthHeaders]);

  useEffect(() => {
    fetchChars();
  }, [fetchChars]);

  function showToast(msg, type = "success") {
    setToast({ message: msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  // Create party
  async function handleCreateParty() {
    if (!newPartyName.trim()) return;
    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: { ...jsonAuthHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ name: newPartyName.trim() }),
      });
      if (res.ok) {
        const party = await res.json();
        setParties((prev) => [...prev, party]);
        setNewPartyName("");
        setShowCreateForm(false);
        showToast(`Party "${party.name}" created!`);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to create party", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  // Select party and fetch detail
  async function handleSelectParty(partyId) {
    try {
      const res = await fetch(`/api/parties/${partyId}`, { headers: jsonAuthHeaders });
      if (res.ok) {
        const data = await res.json();
        setSelectedParty(data);
        setActiveTab("overview");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to load party", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  // Add member to party
  async function handleAddMember() {
    if (!addCharId || !selectedParty) return;
    try {
      const res = await fetch(`/api/parties/${selectedParty.id}/members`, {
        method: "POST",
        headers: { ...jsonAuthHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: Number(addCharId) }),
      });
      if (res.ok) {
        showToast("Character added to party!");
        setAddCharId("");
        setShowAddMember(false);
        handleSelectParty(selectedParty.id);
        fetchParties();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to add member", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  // Remove member from party
  async function handleRemoveMember(charId) {
    if (!selectedParty) return;
    try {
      const res = await fetch(`/api/parties/${selectedParty.id}/members/${charId}`, {
        method: "DELETE",
        headers: jsonAuthHeaders,
      });
      if (res.ok) {
        showToast("Member removed from party");
        handleSelectParty(selectedParty.id);
        fetchParties();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to remove member", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  // Delete party
  async function handleDeleteParty() {
    if (!selectedParty) return;
    try {
      const res = await fetch(`/api/parties/${selectedParty.id}`, {
        method: "DELETE",
        headers: jsonAuthHeaders,
      });
      if (res.ok) {
        showToast("Party deleted");
        setSelectedParty(null);
        fetchParties();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to delete party", "error");
      }
    } catch {
      showToast("Network error", "error");
    }
  }

  // Transfer gold/items
  async function handleTransfer() {
    if (!selectedParty) return;
    if (!transferCharId) {
      showToast("Select a character", "error");
      return;
    }
    if (transferType === "gold" && (!transferAmount || Number(transferAmount) <= 0)) {
      showToast("Enter a valid amount (in CP)", "error");
      return;
    }
    if (transferType === "item" && !transferItemName.trim()) {
      showToast("Enter an item name", "error");
      return;
    }

    setTransferLoading(true);
    setTransferResult(null);
    try {
      const body = {
        type: transferType,
        from: transferFrom,
        characterId: Number(transferCharId),
      };
      if (transferType === "gold") {
        body.amount = Number(transferAmount);
      } else {
        body.itemName = transferItemName.trim();
        body.itemQuantity = Math.max(1, transferItemQty || 1);
      }

      const res = await fetch(`/api/parties/${selectedParty.id}/transfer`, {
        method: "POST",
        headers: { ...jsonAuthHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setSelectedParty(data.party);
        setTransferResult(data.character);
        showToast("Transfer completed!");
        setTransferAmount("");
        setTransferItemName("");
        setTransferItemQty(1);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Transfer failed", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setTransferLoading(false);
    }
  }

  // Get non-party members for add member dropdown
  const nonMemberChars = chars.filter(
    (c) => !selectedParty?.members?.some((m) => m.characterId === c.id)
  );

  // --- RENDER ---

  if (!user) {
    return (
      <div style={panelStyles.container}>
        <div style={panelStyles.emptyState}>
          <Wallet size={32} />
          <p>Sign in to manage party vaults.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyles.container} className="fade-in">
      {/* Header */}
      <div style={panelStyles.header} className="glass-panel gold-border-glow">
        {selectedParty && (
          <button
            onClick={() => { setSelectedParty(null); setActiveTab("overview"); }}
            style={panelStyles.btnSmall}
            className="touch-target"
          >
            <ChevronLeft size={16} />
          </button>
        )}
        <Wallet size={18} color="var(--color-accent)" />
        <span style={panelStyles.headerTitle}>
          {selectedParty ? selectedParty.name : "Party Vault"}
        </span>
        <div style={panelStyles.headerActions}>
          {!selectedParty && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              style={panelStyles.btnPrimary}
              className="touch-target btn-hover-scale"
            >
              <Plus size={14} /> New Party
            </button>
          )}
          {selectedParty && user?.role === "DM" && (
            <button
              onClick={handleDeleteParty}
              style={panelStyles.btnDanger}
              className="touch-target"
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          padding: "0.4rem 0.75rem",
          borderRadius: "6px",
          fontSize: "0.78rem",
          fontWeight: 600,
          background: toast.type === "error" ? "rgba(235,87,87,0.12)" : "rgba(74,187,94,0.12)",
          border: toast.type === "error" ? "1px solid rgba(235,87,87,0.2)" : "1px solid rgba(74,187,94,0.2)",
          color: toast.type === "error" ? "var(--color-danger)" : "var(--color-success)",
          textAlign: "center",
          flexShrink: 0,
        }}>
          {toast.message}
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div style={panelStyles.card}>
          <div style={panelStyles.sectionLabel}>Create New Party</div>
          <div style={panelStyles.row}>
            <input
              type="text"
              placeholder="Party name..."
              value={newPartyName}
              onChange={(e) => setNewPartyName(e.target.value)}
              style={{ ...panelStyles.input, flex: 1 }}
              className="form-input"
              onKeyDown={(e) => e.key === "Enter" && handleCreateParty()}
            />
            <button
              onClick={handleCreateParty}
              disabled={!newPartyName.trim()}
              style={{
                ...panelStyles.btnPrimary,
                opacity: !newPartyName.trim() ? 0.5 : 1,
              }}
              className="touch-target btn-hover-scale"
            >
              <Plus size={14} /> Create
            </button>
          </div>
        </div>
      )}

      <div style={panelStyles.scrollArea}>
        {loading && !selectedParty ? (
          <div style={panelStyles.emptyState}>
            <p>Loading parties...</p>
          </div>
        ) : error ? (
          <div style={panelStyles.emptyState}>
            <p style={{ color: "var(--color-danger)" }}>{error}</p>
          </div>
        ) : !selectedParty ? (
          // Party list view
          parties.length === 0 ? (
            <div style={panelStyles.emptyState}>
              <Users size={32} />
              <p>No parties yet. Create one to get started!</p>
            </div>
          ) : (
            parties.map((party) => (
              <div
                key={party.id}
                style={{
                  ...panelStyles.card,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
                onClick={() => handleSelectParty(party.id)}
                className="touch-target btn-hover-scale"
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--color-text)" }}>
                      {party.name}
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-muted)", marginTop: "0.15rem" }}>
                      {party.members?.length || 0} member{(party.members?.length || 0) !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ fontSize: "0.82rem", color: "var(--color-accent)", fontWeight: 700 }}>
                    {party.members?.reduce((sum, m) => sum + (m.character?.gold || 0), 0) || 0} CP
                  </div>
                </div>
              </div>
            ))
          )
        ) : (
          // Party detail view
          <>
            {/* Tab bar */}
            <div style={panelStyles.tabBar}>
              {["overview", "transfer", "members"].map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    ...panelStyles.tabBtn,
                    ...(activeTab === tab ? panelStyles.tabBtnActive : {}),
                  }}
                  className="touch-target"
                >
                  {tab === "overview" && "Overview"}
                  {tab === "transfer" && "Transfer"}
                  {tab === "members" && "Members"}
                </button>
              ))}
            </div>

            {/* Overview Tab */}
            {activeTab === "overview" && (
              <>
                {/* Gold Display */}
                <div style={panelStyles.goldDisplay}>
                  <Coins size={24} color="var(--color-accent)" />
                  <div style={{ flex: 1 }}>
                    <div style={panelStyles.goldAmount}>
                      {selectedParty.parsedCurrency
                        ? `${selectedParty.parsedCurrency.gp || 0} GP`
                        : "0 GP"}
                    </div>
                    <div style={panelStyles.goldSubtext}>
                      {selectedParty.members?.reduce((sum, m) => sum + (m.character?.gold || 0), 0) || 0} CP total across members
                    </div>
                  </div>
                </div>

                {/* Member Gold Summary */}
                <div style={panelStyles.card}>
                  <div style={panelStyles.sectionLabel}>Party Members</div>
                  {selectedParty.members?.length === 0 ? (
                    <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", padding: "0.25rem 0" }}>
                      No members yet.
                    </div>
                  ) : (
                    selectedParty.members?.map((m) => (
                      <div key={m.id} style={panelStyles.memberRow}>
                        <span style={panelStyles.memberName}>{m.character?.name || `Character #${m.characterId}`}</span>
                        <span style={panelStyles.memberRole}>{m.role}</span>
                        <span style={panelStyles.memberGold}>{formatGold(m.character?.gold || 0)}</span>
                      </div>
                    ))
                  )}
                </div>

                {/* Aggregated Inventory */}
                {selectedParty.aggregatedInventory?.length > 0 && (
                  <div style={panelStyles.card}>
                    <div style={panelStyles.sectionLabel}>Party Inventory (shared view)</div>
                    {selectedParty.aggregatedInventory.map((item, i) => (
                      <div key={i} style={panelStyles.memberRow}>
                        <Box size={14} color="var(--color-muted)" />
                        <span style={{ flex: 1, fontSize: "0.82rem", color: "var(--color-text)" }}>
                          {item.name}
                        </span>
                        <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
                          x{item.quantity}
                        </span>
                        {item.owner && (
                          <span style={{ fontSize: "0.65rem", color: "var(--color-muted)" }}>
                            ({item.owner})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Transfer Tab */}
            {activeTab === "transfer" && (
              <div style={panelStyles.transferForm}>
                <div style={panelStyles.sectionLabel}>Transfer Items / Gold</div>

                {/* Transfer type */}
                <div style={panelStyles.row}>
                  <button
                    onClick={() => setTransferType("gold")}
                    style={{
                      ...panelStyles.btnSmall,
                      flex: 1,
                      background: transferType === "gold" ? "rgba(200,151,58,0.12)" : "rgba(255,255,255,0.04)",
                      borderColor: transferType === "gold" ? "rgba(200,151,58,0.3)" : "rgba(255,255,255,0.1)",
                      color: transferType === "gold" ? "var(--color-accent)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    <Coins size={14} /> Gold
                  </button>
                  <button
                    onClick={() => setTransferType("item")}
                    style={{
                      ...panelStyles.btnSmall,
                      flex: 1,
                      background: transferType === "item" ? "rgba(200,151,58,0.12)" : "rgba(255,255,255,0.04)",
                      borderColor: transferType === "item" ? "rgba(200,151,58,0.3)" : "rgba(255,255,255,0.1)",
                      color: transferType === "item" ? "var(--color-accent)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    <Box size={14} /> Item
                  </button>
                </div>

                {/* Direction */}
                <div style={panelStyles.row}>
                  <button
                    onClick={() => setTransferFrom("character")}
                    style={{
                      ...panelStyles.btnSmall,
                      flex: 1,
                      background: transferFrom === "character" ? "rgba(74,187,94,0.12)" : "rgba(255,255,255,0.04)",
                      borderColor: transferFrom === "character" ? "rgba(74,187,94,0.3)" : "rgba(255,255,255,0.1)",
                      color: transferFrom === "character" ? "var(--color-success)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    <ArrowUpDown size={14} /> Character → Party
                  </button>
                  <button
                    onClick={() => setTransferFrom("party")}
                    style={{
                      ...panelStyles.btnSmall,
                      flex: 1,
                      background: transferFrom === "party" ? "rgba(74,187,94,0.12)" : "rgba(255,255,255,0.04)",
                      borderColor: transferFrom === "party" ? "rgba(74,187,94,0.3)" : "rgba(255,255,255,0.1)",
                      color: transferFrom === "party" ? "var(--color-success)" : "var(--color-muted)",
                    }}
                    className="touch-target"
                  >
                    <ArrowUpDown size={14} /> Party → Character
                  </button>
                </div>

                {/* Character selector */}
                <select
                  value={transferCharId}
                  onChange={(e) => setTransferCharId(e.target.value)}
                  style={panelStyles.select}
                >
                  <option value="">Select character...</option>
                  {selectedParty.members?.map((m) => (
                    <option key={m.id} value={m.characterId}>
                      {m.character?.name || `Character #${m.characterId}`}
                    </option>
                  ))}
                </select>

                {/* Gold amount */}
                {transferType === "gold" && (
                  <div>
                    <div style={{ fontSize: "0.72rem", color: "var(--color-muted)", marginBottom: "0.25rem" }}>
                      Amount (in copper pieces — 100 CP = 1 GP)
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      placeholder="e.g. 100 = 1 GP"
                      style={panelStyles.input}
                    />
                  </div>
                )}

                {/* Item name/quantity */}
                {transferType === "item" && (
                  <>
                    <input
                      type="text"
                      value={transferItemName}
                      onChange={(e) => setTransferItemName(e.target.value)}
                      placeholder="Item name..."
                      style={panelStyles.input}
                    />
                    <div style={panelStyles.row}>
                      <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>Qty:</span>
                      <input
                        type="number"
                        min={1}
                        value={transferItemQty}
                        onChange={(e) => setTransferItemQty(Math.max(1, parseInt(e.target.value) || 1))}
                        style={{ ...panelStyles.input, width: "70px" }}
                      />
                    </div>
                  </>
                )}

                <button
                  onClick={handleTransfer}
                  disabled={transferLoading}
                  style={{
                    ...panelStyles.btnPrimary,
                    justifyContent: "center",
                    opacity: transferLoading ? 0.5 : 1,
                    width: "100%",
                  }}
                  className="touch-target btn-hover-scale"
                >
                  {transferLoading ? "Transferring..." : <><ArrowLeftRight size={14} /> Execute Transfer</>}
                </button>

                {/* Transfer result */}
                {transferResult && (
                  <div style={{
                    padding: "0.5rem",
                    borderRadius: "6px",
                    background: "rgba(74,187,94,0.06)",
                    border: "1px solid rgba(74,187,94,0.12)",
                    fontSize: "0.78rem",
                    color: "var(--color-success)",
                  }}>
                    Transfer complete! {transferResult.name} now has {formatGold(transferResult.gold || 0)}.
                  </div>
                )}
              </div>
            )}

            {/* Members Tab */}
            {activeTab === "members" && (
              <>
                <div style={panelStyles.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.35rem" }}>
                    <div style={panelStyles.sectionLabel}>Members</div>
                    <button
                      onClick={() => setShowAddMember(!showAddMember)}
                      style={panelStyles.btnSmall}
                      className="touch-target"
                    >
                      <UserPlus size={14} /> Add
                    </button>
                  </div>

                  {selectedParty.members?.length === 0 ? (
                    <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", padding: "0.5rem 0", textAlign: "center" }}>
                      No members yet.
                    </div>
                  ) : (
                    selectedParty.members?.map((m) => (
                      <div key={m.id} style={panelStyles.memberRow}>
                        <div>
                          <span style={panelStyles.memberName}>{m.character?.name || `Character #${m.characterId}`}</span>
                          <span style={{ ...panelStyles.memberRole, marginLeft: "0.35rem" }}>{m.role}</span>
                        </div>
                        <div style={{ display: "flex", gap: "0.25rem", alignItems: "center" }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--color-muted)" }}>
                            Lvl {m.character?.level || "?"}
                          </span>
                          <button
                            onClick={() => handleRemoveMember(m.characterId)}
                            style={{
                              ...panelStyles.btnDanger,
                              padding: "0.2rem 0.4rem",
                              fontSize: "0.65rem",
                            }}
                            className="touch-target"
                          >
                            <LogOut size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add member form */}
                {showAddMember && (
                  <div style={panelStyles.card}>
                    <div style={panelStyles.sectionLabel}>Add Character to Party</div>
                    <select
                      value={addCharId}
                      onChange={(e) => setAddCharId(e.target.value)}
                      style={panelStyles.select}
                    >
                      <option value="">Select character...</option>
                      {nonMemberChars.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} (Lvl {c.level} {c.race} {c.class})
                        </option>
                      ))}
                    </select>
                    <div style={{ marginTop: "0.35rem" }}>
                      <button
                        onClick={handleAddMember}
                        disabled={!addCharId}
                        style={{
                          ...panelStyles.btnPrimary,
                          opacity: !addCharId ? 0.5 : 1,
                        }}
                        className="touch-target btn-hover-scale"
                      >
                        <UserPlus size={14} /> Add to Party
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default PartyVaultPanel;
