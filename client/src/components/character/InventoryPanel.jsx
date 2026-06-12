// =============================================================================
// Tablecast — Inventory Panel (Extracted from CharacterSheet)
// Character inventory management with add/delete items and weight tracking
// =============================================================================
import { Trash2 } from "lucide-react";
import { styles } from "./characterStyles";
import Autocomplete from "../Autocomplete";

function getCarryCapacity(strength) {
  return (strength || 10) * 15;
}

export default function InventoryPanel({
  character,
  showAddItem,
  itemName,
  itemQty,
  itemWeight,
  totalWeight,
  onToggleForm,
  onSetItemName,
  onSetItemQty,
  onSetItemWeight,
  onAddItem,
  onDeleteItem,
}) {
  const carryCap = getCarryCapacity(character.strength);
  const weightNum = parseFloat(totalWeight) || 0;
  const weightPct = carryCap > 0 ? Math.min(100, (weightNum / carryCap) * 100) : 0;
  const encumbrance = weightPct > 66 ? "heavy" : weightPct > 33 ? "medium" : "light";
  const encColor = encumbrance === "heavy" ? "var(--color-danger)" : encumbrance === "medium" ? "var(--color-accent)" : "var(--color-success)";

  return (
    <div style={styles.inventoryContainer} className="fade-in">
      <div style={styles.inventoryHeader}>
        <div style={styles.weightCard} className="glass-panel">
          <span style={styles.weightLabel}>Carry Weight</span>
          <span style={{ ...styles.weightValue, color: encColor }}>
            {totalWeight} / {carryCap} lbs
          </span>
          <div style={styles.weightBarContainer}>
            <div
              style={{
                ...styles.weightBar,
                width: `${weightPct}%`,
                background: encColor,
              }}
            />
          </div>
          <span style={{ fontSize: "0.62rem", color: encColor, fontWeight: 600, textTransform: "uppercase", marginTop: "0.1rem" }}>
            {encumbrance}
          </span>
        </div>
        {!showAddItem && (
          <button
            id="add-item-form-btn"
            onClick={() => onToggleForm(true)}
            style={{ ...styles.addBtn, alignSelf: "center" }}
            className="touch-target btn-hover-scale"
          >
            + Add Item
          </button>
        )}
      </div>

      {/* Item Creation Form */}
      {showAddItem && (
        <form onSubmit={onAddItem} style={styles.subForm} className="glass-panel gold-border-glow">
          <h4 style={styles.subFormTitle}>Add Inventory Item</h4>

          <div style={styles.inputGroup}>
            <label style={styles.subLabel}>Item Name</label>
            <Autocomplete
              id="item-name-input"
              category="items"
              placeholder="e.g. Iron Shield, Potion..."
              value={itemName}
              onChange={(val) => onSetItemName(val)}
              onSelect={(item) => {
                onSetItemName(item.name);
                if (item.weight) {
                  onSetItemWeight(item.weight);
                }
              }}
              className="form-input"
              inputStyle={styles.subInput}
            />
          </div>

          <div style={styles.subFormRow}>
            <div style={styles.inputGroup}>
              <label style={styles.subLabel}>Qty</label>
              <input
                id="item-qty-input"
                type="number"
                value={itemQty}
                min={1}
                onChange={(e) => onSetItemQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                style={styles.subInput}
                className="form-input"
              />
            </div>
            <div style={styles.inputGroup}>
              <label style={styles.subLabel}>Weight (lbs/ea)</label>
              <input
                id="item-weight-input"
                type="number"
                step="0.1"
                value={itemWeight}
                min={0}
                onChange={(e) => onSetItemWeight(Math.max(0, parseFloat(e.target.value) || 0))}
                style={styles.subInput}
                className="form-input"
              />
            </div>
          </div>

          <div style={styles.subBtnRow}>
            <button
              type="button"
              onClick={() => onToggleForm(false)}
              style={styles.subCancelBtn}
              className="touch-target btn-hover-scale"
            >
              Cancel
            </button>
            <button
              id="save-item-btn"
              type="submit"
              style={styles.subSubmitBtn}
              className="touch-target btn-hover-scale"
            >
              Add Item
            </button>
          </div>
        </form>
      )}

      {/* Inventory Items List */}
      <div style={styles.itemList}>
        {character.inventory.map((item, idx) => (
          <div key={item.name || idx} style={styles.itemCard} className="glass-panel">
            <div style={styles.itemInfo}>
              <span style={styles.itemName}>{item.name}</span>
              <span style={styles.itemDetails}>
                Qty: {item.quantity} | {item.weight > 0
                  ? `${(item.quantity * item.weight).toFixed(1)} lbs total`
                  : "Weightless"}
              </span>
            </div>
            <button
              id={`delete-item-${item.name.toLowerCase().replace(/\s/g, "")}`}
              onClick={() => onDeleteItem(idx)}
              style={styles.deleteBtn}
              className="touch-target btn-hover-scale"
              title="Remove item"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
