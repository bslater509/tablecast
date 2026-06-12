// =============================================================================
// Tablecast  Character List (Phase 4)
// Allows users to select an existing character sheet or create a new one.
// =============================================================================
import { useState, useEffect } from "react";
import { ChevronRight, UserRound, Wand2, Trash2 } from "lucide-react";
import CharacterBuilderWizard from "./CharacterBuilderWizard";
import { useToast } from "../context/ToastContext";
import { getJsonAuthHeaders } from "../utils/authHeaders";

export default function CharacterList({ user, onSelectCharacter }) {
  const { addToast } = useToast();
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Creation wizard state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const isDM = user?.role === "DM";

  async function handleDeleteCharacter(char, e) {
    e.stopPropagation();
    if (!window.confirm(`Delete hero "${char.name}"? This cannot be undone.`)) return;
    setDeletingId(char.id);
    try {
      const res = await fetch(`/api/characters/${char.id}`, {
        method: "DELETE",
        headers: getJsonAuthHeaders(user),
      });
      if (res.ok) {
        setCharacters((prev) => prev.filter((c) => c.id !== char.id));
        addToast(`Hero "${char.name}" deleted.`, "success");
      } else {
        const err = await res.json().catch(() => ({}));
        addToast(err.error || "Failed to delete hero.", "error");
      }
    } catch (err) {
      console.error("[CharacterList] Delete error:", err);
      addToast("Network error deleting hero.", "error");
    } finally {
      setDeletingId(null);
    }
  }

  // Fetch characters list
  useEffect(() => {
    async function fetchCharacters() {
      setLoading(true);
      setError(null);
      try {
        // DM lists all characters. Players list only their own characters.
        const url = isDM ? "/api/characters" : `/api/characters?userId=${user.id}`;
        const res = await fetch(url, {
          headers: getJsonAuthHeaders(user),
        });
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

  return (
    <div style={styles.container} className="fade-in">
      <header style={styles.header}>
        <h2 style={styles.title}>Heroic Characters</h2>
        {!showCreateForm && (
          <button
            id="new-char-btn"
            onClick={() => setShowCreateForm(true)}
            style={styles.createBtn}
            className="touch-target btn-hover-scale"
          >
            <Wand2 size={16} />
            <span>New Hero</span>
          </button>
        )}
      </header>

      {showCreateForm ? (
        /* Character Builder Wizard */
        <CharacterBuilderWizard
          user={user}
          onComplete={(newChar) => {
            setCharacters((prev) => [...prev, newChar]);
            setShowCreateForm(false);
            onSelectCharacter(newChar);
          }}
          onCancel={() => setShowCreateForm(false)}
        />
      ) : (
        /*  CHARACTER CARDS LIST  */
        <div style={styles.list}>
          {loading && <p style={styles.infoText}>Loading character records</p>}
          {error && <p style={styles.errorText}> Error: {error}</p>}

          {!loading && !error && characters.length === 0 && (
            <div style={styles.emptyCard} className="glass-panel">
              <p style={styles.emptyText}>No characters available.</p>
              <button
                onClick={() => setShowCreateForm(true)}
                style={styles.emptyCreateBtn}
                className="touch-target"
              >
                Create your first Hero!
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
              <div style={styles.cardIcon}>
                <UserRound size={18} />
              </div>
              <div style={styles.cardInfo}>
                <h3 style={styles.cardName}>{char.name}</h3>
                <span style={styles.cardSub}>
                  Lvl {char.level}  {char.race} {char.class}
                </span>
                {isDM && (
                  <span style={styles.ownerBadge}>Owner: {char.user?.username}</span>
                )}
              </div>
              <div style={styles.cardActions}>
                {isDM && (
                  <button
                    id={`delete-character-${char.id}`}
                    title="Delete hero"
                    disabled={deletingId === char.id}
                    onClick={(e) => handleDeleteCharacter(char, e)}
                    style={styles.deleteBtn}
                    className="touch-target"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
                <ChevronRight size={18} style={{ color: "var(--color-accent)", opacity: 0.7 }} />
              </div>
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
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    border: "none",
    borderRadius: "6px",
    color: "var(--color-bg)",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "0.85rem",
    display: "flex",
    alignItems: "center",
    gap: "0.35rem",
  },
  list: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  card: {
    padding: "0.85rem",
    borderRadius: "8px",
    cursor: "pointer",
    display: "grid",
    gridTemplateColumns: "44px minmax(0, 1fr) 32px",
    gap: "0.75rem",
    alignItems: "center",
    borderColor: "var(--color-border-light)",
  },
  cardIcon: {
    width: "44px",
    height: "44px",
    borderRadius: "8px",
    background: "var(--color-accent-dim)",
    border: "1px solid var(--color-border)",
    color: "var(--color-accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  cardInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
    minWidth: 0,
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
  cardActions: {
    display: "flex",
    alignItems: "center",
    gap: "0.25rem",
    flexShrink: 0,
  },
  deleteBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: "32px",
    height: "32px",
    borderRadius: "6px",
    background: "transparent",
    border: "1px solid transparent",
    color: "var(--color-danger, #eb5757)",
    cursor: "pointer",
    opacity: 0.6,
    transition: "opacity 0.15s, background 0.15s, border-color 0.15s",
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
    background: "linear-gradient(135deg, var(--color-accent) 0%, var(--color-accent-dark) 100%)",
    color: "var(--color-bg)",
    fontWeight: "bold",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
};
