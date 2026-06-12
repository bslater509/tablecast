// =============================================================================
// Tablecast  Shop Panel
// DM-created shops with item browsing, buying, selling, and haggling.
// =============================================================================
import { useState, useEffect } from "react";
import {
  Store,
  ShoppingCart,
  Coins,
  Percent,
  Sword,
  Shield,
  FlaskRound,
  Scroll,
  Wand2,
  Search,
  X,
  Plus,
  Trash2,
  Edit3,
  Check,
  Sparkles,
} from "lucide-react";
import { getJsonAuthHeaders } from "../utils/authHeaders";

// Display gold in CP as GP/SP/CP format
function displayGold(cp) {
  const copper = Number(cp) || 0;
  const gp = Math.floor(copper / 100);
  const sp = Math.floor((copper % 100) / 10);
  const cpRem = copper % 10;
  const parts = [];
  if (gp > 0) parts.push(`${gp} GP`);
  if (sp > 0) parts.push(`${sp} SP`);
  parts.push(`${cpRem} CP`);
  return parts.join(", ");
}

// Category icons mapping
const CATEGORY_ICONS = {
  weapon: <Sword size={14} />,
  armor: <Shield size={14} />,
  potion: <FlaskRound size={14} />,
  scroll: <Scroll size={14} />,
  "magic-item": <Wand2 size={14} />,
  wondrous: <Sparkles size={14} />,
};

const CATEGORY_LABELS = {
  weapon: "Weapons",
  armor: "Armor",
  potion: "Potions",
  scroll: "Scrolls",
  "magic-item": "Magic Items",
  wondrous: "Wondrous",
  ammunition: "Ammunition",
  gear: "Gear",
};

const PANEL_STYLES = {
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
    justifyContent: "space-between",
    padding: "0.6rem 0.85rem",
    borderRadius: "8px",
    flexShrink: 0,
    background: "rgba(0,0,0,0.2)",
    gap: "0.5rem",
    flexWrap: "wrap",
  },
  headerTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
  },
  shopSelect: {
    flex: 1,
    minWidth: "160px",
    padding: "0.4rem 0.55rem",
    fontSize: "0.85rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(200,151,58,0.2)",
    borderRadius: "6px",
    color: "var(--color-text)",
    outline: "none",
    cursor: "pointer",
  },
  scrollArea: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  itemCard: {
    padding: "0.65rem 0.75rem",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "0.5rem",
  },
  itemName: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "var(--color-text)",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  itemPrice: {
    fontSize: "0.85rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    whiteSpace: "nowrap",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  itemMeta: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.3rem",
    alignItems: "center",
  },
  badge: {
    fontSize: "0.62rem",
    fontWeight: 600,
    padding: "0.1rem 0.35rem",
    borderRadius: "4px",
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  magicalBadge: {
    background: "rgba(147, 51, 234, 0.15)",
    color: "#a78bfa",
    border: "1px solid rgba(147, 51, 234, 0.25)",
  },
  attunementBadge: {
    background: "rgba(251, 191, 36, 0.12)",
    color: "#fbbf24",
    border: "1px solid rgba(251, 191, 36, 0.2)",
  },
  stockBadge: {
    background: "rgba(74, 187, 94, 0.1)",
    color: "var(--color-success)",
    border: "1px solid rgba(74, 187, 94, 0.15)",
  },
  categoryBadge: {
    background: "rgba(255,255,255,0.05)",
    color: "var(--color-muted)",
    border: "1px solid rgba(255,255,255,0.08)",
  },
  description: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    lineHeight: 1.4,
  },
  actions: {
    display: "flex",
    gap: "0.35rem",
    marginTop: "0.25rem",
    flexWrap: "wrap",
  },
  actionBtn: {
    padding: "0.3rem 0.6rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "6px",
    border: "1px solid transparent",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    transition: "all 0.15s ease",
  },
  buyBtn: {
    background: "rgba(74, 187, 94, 0.12)",
    borderColor: "rgba(74, 187, 94, 0.25)",
    color: "var(--color-success)",
  },
  sellBtn: {
    background: "rgba(251, 191, 36, 0.12)",
    borderColor: "rgba(251, 191, 36, 0.25)",
    color: "#fbbf24",
  },
  haggleBtn: {
    background: "rgba(147, 51, 234, 0.12)",
    borderColor: "rgba(147, 51, 234, 0.25)",
    color: "#a78bfa",
  },
  dmBtn: {
    background: "rgba(200, 151, 58, 0.1)",
    borderColor: "rgba(200, 151, 58, 0.2)",
    color: "var(--color-accent)",
  },
  deleteBtn: {
    background: "rgba(235,87,87,0.08)",
    borderColor: "rgba(235,87,87,0.2)",
    color: "var(--color-danger)",
  },
  formOverlay: {
    position: "fixed",
    top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: "1rem",
  },
  formCard: {
    background: "var(--color-surface)",
    borderRadius: "12px",
    padding: "1.5rem",
    maxWidth: "480px",
    width: "100%",
    maxHeight: "90vh",
    overflow: "auto",
    border: "1px solid rgba(255,255,255,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  formTitle: {
    fontSize: "1rem",
    fontWeight: 700,
    color: "var(--color-accent)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  formLabel: {
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "var(--color-muted)",
  },
  formInput: {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.45rem 0.6rem",
    fontSize: "0.85rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "6px",
    color: "var(--color-text)",
    outline: "none",
  },
  formRow: {
    display: "flex",
    gap: "0.5rem",
  },
  formCol: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    flex: 1,
  },
  formCheckRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: "0.25rem 0",
  },
  submitBtn: {
    padding: "0.5rem 1rem",
    background: "var(--color-accent)",
    border: "none",
    borderRadius: "6px",
    color: "var(--color-bg)",
    fontWeight: 700,
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "0.5rem 1rem",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "6px",
    color: "var(--color-text)",
    fontSize: "0.85rem",
    cursor: "pointer",
  },
  toastContainer: {
    position: "fixed",
    bottom: "1.5rem",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    padding: "0.5rem 1rem",
    borderRadius: "8px",
    fontSize: "0.8rem",
    fontWeight: 600,
    boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "2rem",
    color: "var(--color-muted)",
    gap: "0.5rem",
    textAlign: "center",
  },
  filterRow: {
    display: "flex",
    gap: "0.35rem",
    flexWrap: "wrap",
    padding: "0.25rem 0",
  },
  filterBtn: {
    padding: "0.25rem 0.55rem",
    fontSize: "0.72rem",
    fontWeight: 600,
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
    background: "transparent",
    color: "var(--color-muted)",
    cursor: "pointer",
    transition: "all 0.15s ease",
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
  },
  filterBtnActive: {
    background: "var(--color-accent-dim)",
    border: "1px solid var(--color-border)",
    color: "var(--color-accent)",
  },
  quantityRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.3rem",
    marginLeft: "0.5rem",
  },
  qtyInput: {
    width: "44px",
    padding: "0.2rem",
    fontSize: "0.78rem",
    background: "rgba(0,0,0,0.3)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "4px",
    color: "var(--color-text)",
    textAlign: "center",
    outline: "none",
  },
  haggleResult: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    fontSize: "0.8rem",
    marginTop: "0.25rem",
  },
  haggleSuccess: {
    background: "rgba(74, 187, 94, 0.1)",
    border: "1px solid rgba(74, 187, 94, 0.2)",
    color: "var(--color-success)",
  },
  haggleFail: {
    background: "rgba(235, 87, 87, 0.08)",
    border: "1px solid rgba(235, 87, 87, 0.15)",
    color: "var(--color-danger)",
  },
  haggleNeutral: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "var(--color-muted)",
  },
};

export default function ShopPanel({ user, addToast }) {
  const [shops, setShops] = useState([]);
  const [selectedShopId, setSelectedShopId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showHaggle, setShowHaggle] = useState(null); // itemId being haggled
  const [haggleResult, setHaggleResult] = useState(null);
  const [characters, setCharacters] = useState([]);
  // eslint-disable-next-line unused-imports/no-unused-vars
  const [charLoading, setCharLoading] = useState(true);

  // DM state: add item form
  const [showAddItem, setShowAddItem] = useState(false);
  const [showEditShop, setShowEditShop] = useState(false);
  const [addItemForm, setAddItemForm] = useState({
    name: "", price: 0, quantity: 1, description: "",
    category: "", isMagical: false, attunement: false, tags: "[]",
  });
  const [editShopForm, setEditShopForm] = useState({
    name: "", description: "", markup: 1.0, isActive: true,
  });

  // Buy quantity state
  const [buyQuantities, setBuyQuantities] = useState({});

  // Fetch shops and characters on mount
  useEffect(() => {
    fetchShops();
    fetchCharacters();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchCharacters() {
    try {
      const res = await fetch("/api/characters", {
        headers: getJsonAuthHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setCharacters(data);
      }
    } catch (err) {
      console.error("[ShopPanel] Failed to fetch characters:", err);
    } finally {
      setCharLoading(false);
    }
  }

  async function fetchShops() {
    setLoading(true);
    try {
      const res = await fetch("/api/shops", {
        headers: getJsonAuthHeaders(user),
      });
      if (res.ok) {
        const data = await res.json();
        setShops(data);
        if (data.length > 0 && !selectedShopId) {
          setSelectedShopId(data[0].id);
        }
      }
    } catch (err) {
      console.error("[ShopPanel] Failed to fetch shops:", err);
    } finally {
      setLoading(false);
    }
  }

  const selectedShop = shops.find((s) => s.id === selectedShopId);

  // Get items with price marked up
  function getItemPrice(item) {
    if (!selectedShop) return item.price;
    return Math.max(0, Math.round(item.price * selectedShop.markup));
  }

  // Category extraction from items
  const categories = ["all", ...new Set((selectedShop?.items || []).map((i) => i.category).filter(Boolean))];

  // Filter items
  const filteredItems = (selectedShop?.items || []).filter((item) => {
    if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
    if (searchQuery && !item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ─── BUY ─────────────────────────────────────────────────────────────────

  async function handleBuy(itemId, characterId) {
    if (!characterId) {
      addToast?.("Select a character first.", { type: "error" });
      return;
    }
    const qty = buyQuantities[itemId] || 1;
    try {
      const res = await fetch(`/api/shops/${selectedShopId}/buy`, {
        method: "POST",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ itemId, characterId, quantity: qty }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast?.(data.error || "Purchase failed.", { type: "error" });
        return;
      }
      addToast?.(data.message, { type: "success" });
      // Update shop and character
      if (data.shop) {
        setShops((prev) => prev.map((s) => (s.id === data.shop.id ? data.shop : s)));
      }
      // Refresh character data
      fetchCharacters();
    } catch (err) {
      addToast?.("Network error during purchase.", { type: "error" });
    }
  }

  // ─── SELL ─────────────────────────────────────────────────────────────────

  const [sellModal, setSellModal] = useState(null); // { characterId, items }

  // eslint-disable-next-line unused-imports/no-unused-vars
  function openSellModal(character) {
    if (!character) return;
    setSellModal({
      characterId: character.id,
      items: character.inventory || [],
    });
  }

  async function handleSell(itemName, characterId) {
    try {
      const res = await fetch(`/api/shops/${selectedShopId}/sell`, {
        method: "POST",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ characterId, itemName, quantity: 1 }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast?.(data.error || "Sale failed.", { type: "error" });
        return;
      }
      addToast?.(data.message, { type: "success" });
      if (data.shop) {
        setShops((prev) => prev.map((s) => (s.id === data.shop.id ? data.shop : s)));
      }
      // Refresh character data
      fetchCharacters();
    } catch (err) {
      addToast?.("Network error during sale.", { type: "error" });
    }
  }

  // ─── HAGGLE ───────────────────────────────────────────────────────────────

  async function handleHaggle(itemId, characterId, persuasionRoll) {
    if (!characterId) return;
    try {
      const res = await fetch(`/api/shops/${selectedShopId}/haggle`, {
        method: "POST",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ itemId, characterId, persuasionRoll }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast?.(data.error || "Haggle failed.", { type: "error" });
        return;
      }
      setHaggleResult(data);
    } catch (err) {
      addToast?.("Network error during haggle.", { type: "error" });
    }
  }

  function handlePersuasionRoll(itemId, characterId) {
    // Roll 1d20 in the UI
    const roll = Math.floor(Math.random() * 20) + 1;
    handleHaggle(itemId, characterId, roll);
  }

  // ─── DM: ADD ITEM ─────────────────────────────────────────────────────────

  async function handleAddItem(e) {
    e.preventDefault();
    if (!addItemForm.name.trim()) return;
    try {
      const res = await fetch(`/api/shops/${selectedShopId}/items`, {
        method: "POST",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify(addItemForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast?.(err.error || "Failed to add item.", { type: "error" });
        return;
      }
      await fetchShops();
      setShowAddItem(false);
      setAddItemForm({ name: "", price: 0, quantity: 1, description: "", category: "", isMagical: false, attunement: false, tags: "[]" });
      addToast?.("Item added!", { type: "success" });
    } catch (err) {
      addToast?.("Network error.", { type: "error" });
    }
  }

  // ─── DM: EDIT SHOP ────────────────────────────────────────────────────────

  async function handleEditShop(e) {
    e.preventDefault();
    if (!editShopForm.name.trim()) return;
    try {
      const res = await fetch(`/api/shops/${selectedShopId}`, {
        method: "PUT",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify(editShopForm),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        addToast?.(err.error || "Failed to update shop.", { type: "error" });
        return;
      }
      await fetchShops();
      setShowEditShop(false);
      addToast?.("Shop updated!", { type: "success" });
    } catch (err) {
      addToast?.("Network error.", { type: "error" });
    }
  }

  async function handleDeleteItem(itemId) {
    try {
      const res = await fetch(`/api/shops/items/${itemId}`, {
        method: "DELETE",
        headers: getJsonAuthHeaders(user),
      });
      if (!res.ok) {
        addToast?.("Failed to delete item.", { type: "error" });
        return;
      }
      await fetchShops();
      addToast?.("Item removed.", { type: "success" });
    } catch (err) {
      addToast?.("Network error.", { type: "error" });
    }
  }

  async function handleToggleShop(shopId, isActive) {
    try {
      await fetch(`/api/shops/${shopId}`, {
        method: "PUT",
        headers: getJsonAuthHeaders(user),
        body: JSON.stringify({ isActive: !isActive }),
      });
      await fetchShops();
    } catch (err) {
      console.error("[ShopPanel] Toggle shop failed:", err);
    }
  }

  function openShopEdit() {
    if (!selectedShop) return;
    setEditShopForm({
      name: selectedShop.name,
      description: selectedShop.description,
      markup: selectedShop.markup,
      isActive: selectedShop.isActive,
    });
    setShowEditShop(true);
  }

  if (loading) {
    return (
      <div style={PANEL_STYLES.container}>
        <div style={PANEL_STYLES.emptyState}>
          <Store size={32} opacity={0.3} />
          <p>Opening shop ledgers...</p>
        </div>
      </div>
    );
  }

  if (shops.length === 0) {
    return (
      <div style={PANEL_STYLES.container}>
        <div style={PANEL_STYLES.emptyState}>
          <Store size={48} opacity={0.15} />
          <p style={{ fontSize: "0.9rem", fontWeight: 600 }}>No Shops Available</p>
          <p style={{ fontSize: "0.8rem" }}>The DM hasn't opened any shops yet.</p>
          {user?.role === "DM" && (
            <p style={{ fontSize: "0.75rem", fontStyle: "italic" }}>Use the API to create one.</p>
          )}
        </div>
      </div>
    );
  }

  const currentChar = characters?.[0];

  return (
    <div style={PANEL_STYLES.container} className="fade-in">
      {/* Header */}
      <header style={PANEL_STYLES.header} className="glass-panel gold-border-glow">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1 }}>
          <Store size={20} color="var(--color-accent)" />
          <select
            value={selectedShopId || ""}
            onChange={(e) => {
              setSelectedShopId(Number(e.target.value));
              setHaggleResult(null);
              setShowHaggle(null);
            }}
            style={PANEL_STYLES.shopSelect}
            className="touch-target"
          >
            {shops.map((shop) => (
              <option key={shop.id} value={shop.id}>
                {shop.name} {!shop.isActive ? "(Closed)" : ""}
              </option>
            ))}
          </select>
        </div>
        {selectedShop && (
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
            <span style={{
              padding: "0.2rem 0.45rem",
              borderRadius: "4px",
              fontSize: "0.65rem",
              fontWeight: 600,
              background: selectedShop.isActive ? "rgba(74,187,94,0.1)" : "rgba(235,87,87,0.1)",
              color: selectedShop.isActive ? "var(--color-success)" : "var(--color-danger)",
              border: `1px solid ${selectedShop.isActive ? "rgba(74,187,94,0.2)" : "rgba(235,87,87,0.2)"}`,
            }}>
              {selectedShop.isActive ? "Open" : "Closed"}
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--color-muted)" }}>
              Markup: {Math.round((selectedShop.markup - 1) * 100)}%
            </span>
          </div>
        )}
      </header>

      {/* Gold / Character Info */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        {currentChar && (
          <div style={{
            display: "flex", alignItems: "center", gap: "0.4rem",
            padding: "0.35rem 0.6rem", borderRadius: "6px",
            background: "rgba(200,151,58,0.06)", border: "1px solid rgba(200,151,58,0.12)",
          }}>
            <Coins size={14} color="var(--color-accent)" />
            <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--color-accent)" }}>
              {displayGold(currentChar.gold)}
            </span>
            <span style={{ fontSize: "0.62rem", color: "var(--color-muted)" }}>
              ({currentChar.name})
            </span>
          </div>
        )}
        {user?.role === "DM" && selectedShop && (
          <div style={{ display: "flex", gap: "0.3rem", marginLeft: "auto" }}>
            <button
              onClick={() => handleToggleShop(selectedShop.id, selectedShop.isActive)}
              style={{
                ...PANEL_STYLES.actionBtn,
                ...PANEL_STYLES.dmBtn,
                padding: "0.25rem 0.5rem",
                fontSize: "0.68rem",
              }}
              className="touch-target btn-hover-scale"
            >
              {selectedShop.isActive ? "Close Shop" : "Open Shop"}
            </button>
            <button
              onClick={openShopEdit}
              style={{
                ...PANEL_STYLES.actionBtn,
                ...PANEL_STYLES.dmBtn,
                padding: "0.25rem 0.5rem",
                fontSize: "0.68rem",
              }}
              className="touch-target btn-hover-scale"
            >
              <Edit3 size={12} /> Edit
            </button>
          </div>
        )}
      </div>

      {/* Shop Description */}
      {selectedShop?.description && (
        <p style={{ fontSize: "0.8rem", color: "var(--color-muted)", margin: 0 }}>{selectedShop.description}</p>
      )}

      {/* Search & Filter */}
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: 1, minWidth: "120px" }}>
          <Search size={14} style={{ position: "absolute", left: "8px", top: "50%", transform: "translateY(-50%)", color: "var(--color-muted)", pointerEvents: "none" }} />
          <input
            type="text"
            placeholder="Search items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "0.35rem 0.5rem 0.35rem 1.6rem",
              fontSize: "0.78rem",
              background: "rgba(0,0,0,0.3)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: "6px",
              color: "var(--color-text)",
              outline: "none",
            }}
            className="form-input"
          />
        </div>
        {user?.role === "DM" && selectedShop && selectedShop.isActive && (
          <button
            onClick={() => setShowAddItem(true)}
            style={{
              ...PANEL_STYLES.actionBtn,
              ...PANEL_STYLES.dmBtn,
            }}
            className="touch-target btn-hover-scale"
          >
            <Plus size={14} /> Add Item
          </button>
        )}
      </div>

      {/* Category Filters */}
      {categories.length > 1 && (
        <div style={PANEL_STYLES.filterRow}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              style={{
                ...PANEL_STYLES.filterBtn,
                ...(categoryFilter === cat ? PANEL_STYLES.filterBtnActive : {}),
              }}
              className="touch-target"
            >
              {cat !== "all" && CATEGORY_ICONS[cat]}
              {cat === "all" ? "All" : (CATEGORY_LABELS[cat] || cat)}
            </button>
          ))}
        </div>
      )}

      {/* Items List */}
      <div style={PANEL_STYLES.scrollArea}>
        {filteredItems.length === 0 ? (
          <div style={PANEL_STYLES.emptyState}>
            <ShoppingCart size={32} opacity={0.15} />
            <p style={{ fontSize: "0.8rem" }}>No items found</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const price = getItemPrice(item);
            const isUnlimited = item.quantity === -1;
            const qty = buyQuantities[item.id] || 1;
            return (
              <div key={item.id} style={PANEL_STYLES.itemCard} className="glass-panel">
                <div style={PANEL_STYLES.itemHeader}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={PANEL_STYLES.itemName}>
                      {item.isMagical && <Sparkles size={14} color="#a78bfa" />}
                      {item.name}
                    </div>
                  </div>
                  <div style={PANEL_STYLES.itemPrice}>
                    <Coins size={14} />
                    {displayGold(price)}
                  </div>
                </div>

                <div style={PANEL_STYLES.itemMeta}>
                  {item.category && (
                    <span style={{ ...PANEL_STYLES.badge, ...PANEL_STYLES.categoryBadge, display: "flex", alignItems: "center", gap: "0.2rem" }}>
                      {CATEGORY_ICONS[item.category]}
                      {CATEGORY_LABELS[item.category] || item.category}
                    </span>
                  )}
                  {item.isMagical && (
                    <span style={{ ...PANEL_STYLES.badge, ...PANEL_STYLES.magicalBadge }}>
                      Magical
                    </span>
                  )}
                  {item.attunement && (
                    <span style={{ ...PANEL_STYLES.badge, ...PANEL_STYLES.attunementBadge }}>
                      Attunement
                    </span>
                  )}
                  <span style={{ ...PANEL_STYLES.badge, ...PANEL_STYLES.stockBadge }}>
                    {isUnlimited ? "∞ Stock" : `${item.quantity} left`}
                  </span>
                </div>

                {item.description && (
                  <p style={PANEL_STYLES.description}>{item.description}</p>
                )}

                {/* Actions */}
                <div style={PANEL_STYLES.actions}>
                  {selectedShop?.isActive && (
                    <>
                      <button
                        onClick={() => handleBuy(item.id, currentChar?.id)}
                        style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.buyBtn }}
                        className="touch-target btn-hover-scale"
                      >
                        <ShoppingCart size={12} /> Buy
                      </button>
                      <div style={PANEL_STYLES.quantityRow}>
                        <span style={{ fontSize: "0.65rem", color: "var(--color-muted)" }}>x</span>
                        <input
                          type="number"
                          min={1}
                          max={isUnlimited ? 99 : item.quantity}
                          value={qty}
                          onChange={(e) => setBuyQuantities((prev) => ({ ...prev, [item.id]: Math.max(1, Math.min(isUnlimited ? 99 : item.quantity, parseInt(e.target.value, 10) || 1)) }))}
                          style={PANEL_STYLES.qtyInput}
                        />
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowHaggle(item.id);
                      setHaggleResult(null);
                    }}
                    style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.haggleBtn }}
                    className="touch-target btn-hover-scale"
                  >
                    <Percent size={12} /> Haggle
                  </button>
                  {currentChar && (
                    <button
                      onClick={() => handleSell(item.name, currentChar.id)}
                      style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.sellBtn }}
                      className="touch-target btn-hover-scale"
                    >
                      <Coins size={12} /> Sell
                    </button>
                  )}
                  {user?.role === "DM" && (
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.deleteBtn }}
                      className="touch-target btn-hover-scale"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>

                {/* Haggle Result */}
                {showHaggle === item.id && (
                  <div style={{ marginTop: "0.35rem" }}>
                    <div style={{ display: "flex", gap: "0.35rem", alignItems: "center" }}>
                      <button
                        onClick={() => handlePersuasionRoll(item.id, currentChar?.id)}
                        style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.haggleBtn }}
                        className="touch-target btn-hover-scale"
                      >
                        <Percent size={12} /> Roll Persuasion (1d20)
                      </button>
                      <button
                        onClick={() => { setShowHaggle(null); setHaggleResult(null); }}
                        style={{ ...PANEL_STYLES.actionBtn, padding: "0.25rem", background: "transparent", border: "none", color: "var(--color-muted)", cursor: "pointer" }}
                        className="touch-target"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {haggleResult && showHaggle === item.id && (
                      <div style={{
                        ...PANEL_STYLES.haggleResult,
                        ...(haggleResult.discountPercent > 0 ? PANEL_STYLES.haggleSuccess : haggleResult.discountPercent < 0 ? PANEL_STYLES.haggleFail : PANEL_STYLES.haggleNeutral),
                      }}>
                        <p style={{ margin: 0 }}>{haggleResult.flavor}</p>
                        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.3rem", fontSize: "0.78rem" }}>
                          <span>Original: <strong>{displayGold(haggleResult.originalPrice)}</strong></span>
                          {haggleResult.discountPercent !== 0 && (
                            <span>Adjusted: <strong style={{ color: haggleResult.discountPercent > 0 ? "var(--color-success)" : "var(--color-danger)" }}>
                              {displayGold(haggleResult.discountedPrice)}
                            </strong></span>
                          )}
                          <span>Roll: <strong>{haggleResult.persuasionRoll}</strong></span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ─── DM: Add Item Modal ───────────────────────────────────────────── */}
      {showAddItem && (
        <div style={PANEL_STYLES.formOverlay} onClick={() => !addItemForm.name && setShowAddItem(false)}>
          <div style={PANEL_STYLES.formCard} onClick={(e) => e.stopPropagation()}>
            <div style={PANEL_STYLES.formTitle}>
              <span>Add Item to {selectedShop?.name}</span>
              <button onClick={() => setShowAddItem(false)} style={{ background: "transparent", border: "none", color: "var(--color-text)", cursor: "pointer", fontSize: "1.25rem" }} className="touch-target">✕</button>
            </div>
            <form onSubmit={handleAddItem} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={PANEL_STYLES.formCol}>
                <label style={PANEL_STYLES.formLabel}>Item Name *</label>
                <input style={PANEL_STYLES.formInput} value={addItemForm.name} onChange={(e) => setAddItemForm((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Potion of Healing" required />
              </div>
              <div style={PANEL_STYLES.formRow}>
                <div style={PANEL_STYLES.formCol}>
                  <label style={PANEL_STYLES.formLabel}>Price (CP)</label>
                  <input type="number" min={0} style={PANEL_STYLES.formInput} value={addItemForm.price} onChange={(e) => setAddItemForm((p) => ({ ...p, price: Math.max(0, parseInt(e.target.value, 10) || 0) }))} />
                </div>
                <div style={PANEL_STYLES.formCol}>
                  <label style={PANEL_STYLES.formLabel}>Stock</label>
                  <input type="number" min={-1} style={PANEL_STYLES.formInput} value={addItemForm.quantity} onChange={(e) => setAddItemForm((p) => ({ ...p, quantity: parseInt(e.target.value, 10) || -1 }))} placeholder="-1 = unlimited" />
                </div>
                <div style={PANEL_STYLES.formCol}>
                  <label style={PANEL_STYLES.formLabel}>Category</label>
                  <select style={PANEL_STYLES.formInput} value={addItemForm.category} onChange={(e) => setAddItemForm((p) => ({ ...p, category: e.target.value }))}>
                    <option value="">None</option>
                    <option value="weapon">Weapon</option>
                    <option value="armor">Armor</option>
                    <option value="potion">Potion</option>
                    <option value="scroll">Scroll</option>
                    <option value="magic-item">Magic Item</option>
                    <option value="wondrous">Wondrous</option>
                    <option value="ammunition">Ammunition</option>
                    <option value="gear">Gear</option>
                  </select>
                </div>
              </div>
              <div style={PANEL_STYLES.formCol}>
                <label style={PANEL_STYLES.formLabel}>Description</label>
                <textarea style={{ ...PANEL_STYLES.formInput, minHeight: "50px" }} value={addItemForm.description} onChange={(e) => setAddItemForm((p) => ({ ...p, description: e.target.value }))} placeholder="Item description..." />
              </div>
              <div style={PANEL_STYLES.formRow}>
                <label style={{ ...PANEL_STYLES.formCheckRow, flex: 1 }}>
                  <input type="checkbox" checked={addItemForm.isMagical} onChange={(e) => setAddItemForm((p) => ({ ...p, isMagical: e.target.checked }))} />
                  <span style={{ fontSize: "0.78rem", color: "var(--color-text)" }}>Magical</span>
                </label>
                <label style={{ ...PANEL_STYLES.formCheckRow, flex: 1 }}>
                  <input type="checkbox" checked={addItemForm.attunement} onChange={(e) => setAddItemForm((p) => ({ ...p, attunement: e.target.checked }))} />
                  <span style={{ fontSize: "0.78rem", color: "var(--color-text)" }}>Requires Attunement</span>
                </label>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                <button type="button" onClick={() => setShowAddItem(false)} style={PANEL_STYLES.cancelBtn} className="touch-target">Cancel</button>
                <button type="submit" style={PANEL_STYLES.submitBtn} className="touch-target btn-hover-scale"><Check size={14} /> Add Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── DM: Edit Shop Modal ──────────────────────────────────────────── */}
      {showEditShop && (
        <div style={PANEL_STYLES.formOverlay} onClick={() => setShowEditShop(false)}>
          <div style={PANEL_STYLES.formCard} onClick={(e) => e.stopPropagation()}>
            <div style={PANEL_STYLES.formTitle}>
              <span>Edit Shop</span>
              <button onClick={() => setShowEditShop(false)} style={{ background: "transparent", border: "none", color: "var(--color-text)", cursor: "pointer", fontSize: "1.25rem" }} className="touch-target">✕</button>
            </div>
            <form onSubmit={handleEditShop} style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
              <div style={PANEL_STYLES.formCol}>
                <label style={PANEL_STYLES.formLabel}>Shop Name</label>
                <input style={PANEL_STYLES.formInput} value={editShopForm.name} onChange={(e) => setEditShopForm((p) => ({ ...p, name: e.target.value }))} required />
              </div>
              <div style={PANEL_STYLES.formCol}>
                <label style={PANEL_STYLES.formLabel}>Description</label>
                <textarea style={{ ...PANEL_STYLES.formInput, minHeight: "50px" }} value={editShopForm.description} onChange={(e) => setEditShopForm((p) => ({ ...p, description: e.target.value }))} />
              </div>
              <div style={PANEL_STYLES.formRow}>
                <div style={PANEL_STYLES.formCol}>
                  <label style={PANEL_STYLES.formLabel}>Markup Multiplier</label>
                  <input type="number" step="0.1" min="0.1" max="10" style={PANEL_STYLES.formInput} value={editShopForm.markup} onChange={(e) => setEditShopForm((p) => ({ ...p, markup: parseFloat(e.target.value) || 1.0 }))} />
                </div>
                <div style={{ ...PANEL_STYLES.formCol, justifyContent: "flex-end" }}>
                  <label style={PANEL_STYLES.formCheckRow}>
                    <input type="checkbox" checked={editShopForm.isActive} onChange={(e) => setEditShopForm((p) => ({ ...p, isActive: e.target.checked }))} />
                    <span style={{ fontSize: "0.78rem", color: "var(--color-text)" }}>Open for Business</span>
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", marginTop: "0.25rem" }}>
                <button type="button" onClick={() => setShowEditShop(false)} style={PANEL_STYLES.cancelBtn} className="touch-target">Cancel</button>
                <button type="submit" style={PANEL_STYLES.submitBtn} className="touch-target btn-hover-scale"><Check size={14} /> Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Sell Modal ──────────────────────────────────────────────────── */}
      {sellModal && (
        <div style={PANEL_STYLES.formOverlay} onClick={() => setSellModal(null)}>
          <div style={PANEL_STYLES.formCard} onClick={(e) => e.stopPropagation()}>
            <div style={PANEL_STYLES.formTitle}>
              <span>Sell Items</span>
              <button onClick={() => setSellModal(null)} style={{ background: "transparent", border: "none", color: "var(--color-text)", cursor: "pointer", fontSize: "1.25rem" }} className="touch-target">✕</button>
            </div>
            {sellModal.items.length === 0 ? (
              <p style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>No items in inventory to sell.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {sellModal.items.map((invItem, idx) => (
                  <div key={idx} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "0.4rem 0.6rem", borderRadius: "6px",
                    background: "rgba(255,255,255,0.02)",
                  }}>
                    <div>
                      <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--color-text)" }}>{invItem.name}</span>
                      <span style={{ fontSize: "0.7rem", color: "var(--color-muted)", marginLeft: "0.5rem" }}>x{invItem.quantity || 1}</span>
                    </div>
                    <button
                      onClick={() => {
                        handleSell(invItem.name, sellModal.characterId);
                        setSellModal(null);
                      }}
                      style={{ ...PANEL_STYLES.actionBtn, ...PANEL_STYLES.sellBtn }}
                      className="touch-target btn-hover-scale"
                    >
                      <Coins size={12} /> Sell 1
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setSellModal(null)} style={PANEL_STYLES.cancelBtn} className="touch-target">Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
