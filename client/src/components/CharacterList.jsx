// =============================================================================
// Tablecast — Character List (Phase 4)
// Allows users to select an existing character sheet or create a new one.
// =============================================================================
import { useState, useEffect } from "react";

export default function CharacterList({ user, onSelectCharacter }) {
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Creation form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [name, setName] = useState("");
  const [race, setRace] = useState("");
  const [charClass, setCharClass] = useState("");
  const [creating, setCreating] = useState(false);

  const isDM = user?.role === "DM";

  // Fetch characters list
  useEffect(() => {
    async function fetchCharacters() {
      setLoading(true);
      setError(null);
      try {
        // DM lists all characters. Players list only their own characters.
        const url = isDM ? "/api/characters" : `/api/characters?userId=${user.id}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error("Failed to load characters.");
        }
        const data = await res.json();
        setCharacters(data);
      } catch (err) {
        console.error("[CharacterList] Fetch error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (user?.id) {
      fetchCharacters();
    }
  }, [user, isDM]);

  // Handle character creation
  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    try {
      const payload = {
        userId: user.id,
        name: name.trim(),
        race: race.trim() || "Unknown",
        class: charClass.trim() || "Commoner",
        level: 1,
        hp: 10,
        maxHp: 10,
        strength: 10,
        dexterity: 10,
        constitution: 10,
        intelligence: 10,
        wisdom: 10,
        charisma: 10,
        inventory: "[]",
        modifiers: JSON.stringify({
          proficiencies: [],
          saveProficiencies: [],
          attacks: [],
        }),
      };

      const res = await fetch("/api/characters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to create character.");
      }

      const newChar = await res.json();
      setCharacters((prev) => [...prev, newChar]);
      setShowCreateForm(false);
      setName("");
      setRace("");
      setCharClass("");
      
      // Auto select the newly created character
      onSelectCharacter(newChar);
    } catch (err) {
      console.error("[CharacterList] Create error:", err);
      alert(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={styles.container} className="fade-in">
      <header style={styles.header}>
        <h2 style={styles.title}>🛡️ Heroic Characters</h2>
        {!showCreateForm && (
          <button
            id="new-char-btn"
            onClick={() => setShowCreateForm(true)}
            style={styles.createBtn}
            className="touch-target btn-hover-scale"
          >
            + New Hero
          </button>
        )}
      </header>

      {showCreateForm ? (
        /* ── CREATION FORM ── */
        <form onSubmit={handleCreate} style={styles.form} className="glass-panel gold-border-glow">
          <h3 style={styles.formTitle}>Forge a New Hero</h3>
          
          <div style={styles.inputGroup}>
            <label style={styles.label}>Hero Name</label>
            <input
              id="char-name-input"
              type="text"
              placeholder="e.g. Thorin Ironforge"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              className="form-input"
              maxLength={32}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Race</label>
            <input
              id="char-race-input"
              type="text"
              placeholder="e.g. Mountain Dwarf, Elf, Human"
              value={race}
              onChange={(e) => setRace(e.target.value)}
              style={styles.input}
              className="form-input"
              maxLength={24}
            />
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>Class</label>
            <input
              id="char-class-input"
              type="text"
              placeholder="e.g. Fighter, Wizard, Rogue"
              value={charClass}
              onChange={(e) => setCharClass(e.target.value)}
              style={styles.input}
              className="form-input"
              maxLength={24}
            />
          </div>

          <div style={styles.btnRow}>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              style={styles.cancelBtn}
              className="touch-target btn-hover-scale"
              disabled={creating}
            >
              Cancel
            </button>
            <button
              id="submit-char-btn"
              type="submit"
              style={styles.submitBtn}
              className="touch-target btn-hover-scale"
              disabled={creating || !name.trim()}
            >
              {creating ? "Forging…" : "Create Character"}
            </button>
          </div>
        </form>
      ) : (
        /* ── CHARACTER CARDS LIST ── */
        <div style={styles.list}>
          {loading && <p style={styles.infoText}>Loading character records…</p>}
          {error && <p style={styles.errorText}>⚠️ Error: {error}</p>}
          
          {!loading && !error && characters.length === 0 && (
            <div style={styles.emptyCard} className="glass-panel">
              <p style={styles.emptyText}>No characters available.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                style={styles.emptyCreateBtn}
                className="touch-target"
              >
                Create your first Hero! ⚔️
              </button>
            </div>
          )}

          {!loading && !error && characters.map((char) => (
            <div
              key={char.id}
              id={`select-character-${char.id}`}
              onClick={() => onSelectCharacter(char)}
              style={styles.card}
              className="glass-panel btn-hover-scale"
            >
              <div style={styles.cardInfo}>
                <h3 style={styles.cardName}>{char.name}</h3>
                <span style={styles.cardSub}>
                  Lvl {char.level} • {char.race} {char.class}
                </span>
                {isDM && (
                  <span style={styles.ownerBadge}>Owner: {char.user?.username}</span>
                )}
              </div>
              <div style={styles.cardArrow}>⚔️</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    padding: "0.75rem",
    gap: "0.75rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexShrink: 0,
  },
  title: {
    fontSize: "1.25rem",
    fontWeight: 700,
    color: "var(--color-accent)",
  },
  createBtn: {
    padding: "0.45rem 0.85rem",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#0f0e17",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  card: {
    padding: "1rem",
    borderRadius: "8px",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  cardName: {
    fontSize: "1.1rem",
    fontWeight: 600,
    color: "var(--color-accent)",
  },
  cardSub: {
    fontSize: "0.8rem",
    color: "var(--color-text)",
    opacity: 0.8,
  },
  ownerBadge: {
    fontSize: "0.65rem",
    color: "var(--color-muted)",
    background: "rgba(255, 255, 255, 0.03)",
    padding: "0.1rem 0.3rem",
    borderRadius: "3px",
    width: "fit-content",
    marginTop: "0.2rem",
  },
  cardArrow: {
    fontSize: "1.25rem",
    color: "var(--color-accent)",
    opacity: 0.7,
  },
  infoText: {
    textAlign: "center",
    color: "var(--color-muted)",
    fontSize: "0.85rem",
    marginTop: "2rem",
  },
  errorText: {
    textAlign: "center",
    color: "var(--color-danger)",
    fontSize: "0.85rem",
    marginTop: "2.5rem",
  },
  emptyCard: {
    padding: "2rem",
    textAlign: "center",
    borderRadius: "8px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
  },
  emptyText: {
    color: "var(--color-muted)",
    fontSize: "0.9rem",
  },
  emptyCreateBtn: {
    padding: "0.6rem 1rem",
    background: "transparent",
    border: "1px solid var(--color-accent)",
    color: "var(--color-accent)",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.85rem",
    fontWeight: 600,
    transition: "background 0.2s",
    "&:hover": {
      background: "var(--color-accent-dim)",
    },
  },

  /* Form Styling */
  form: {
    padding: "1.5rem",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "1.1rem",
  },
  formTitle: {
    fontSize: "1.2rem",
    color: "var(--color-accent)",
    fontWeight: 600,
    marginBottom: "0.25rem",
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "0.35rem",
  },
  label: {
    fontSize: "0.8rem",
    color: "var(--color-muted)",
    fontWeight: 600,
  },
  input: {
    width: "100%",
  },
  btnRow: {
    display: "flex",
    gap: "0.75rem",
    marginTop: "0.5rem",
  },
  cancelBtn: {
    flex: 1,
    padding: "0.65rem",
    borderRadius: "6px",
    background: "rgba(255, 255, 255, 0.05)",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  submitBtn: {
    flex: 2,
    padding: "0.65rem",
    borderRadius: "6px",
    border: "none",
    background: "linear-gradient(135deg, #c8973a 0%, #a87427 100%)",
    color: "#0f0e17",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
};
