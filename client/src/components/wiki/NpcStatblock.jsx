// =============================================================================
// Tablecast — NPC Statblock Component (Extracted from WikiPanel)
// Interactive 5e Statblock Sub-component for NPCs and Monsters
// =============================================================================

// Interactive 5e Statblock Sub-component for NPCs
function NpcStatblock({ npc, socket, isDM, onHpChange }) {
  const getMod = (score) => {
    const mod = Math.floor((Number(score || 10) - 10) / 2);
    return mod >= 0 ? `+${mod}` : `${mod}`;
  };

  const handleAbilityRoll = (statName, score) => {
    const modifier = Math.floor((score - 10) / 2);
    const d20 = Math.floor(Math.random() * 20) + 1;
    const total = d20 + modifier;
    if (socket) {
      socket.emit("chat:send", {
        sender: npc.name,
        text: `rolled a ${statName.charAt(0).toUpperCase() + statName.slice(1)} Check! Total: ${total}`,
        type: "roll",
        rollDetails: {
          rollName: `${statName.charAt(0).toUpperCase() + statName.slice(1)} Check`,
          formula: `1d20 + ${modifier >= 0 ? "+" : ""}${modifier}`,
          rolls: [d20],
          modifier,
          total,
          isAttack: false,
        },
      });
    }
  };

  const handleAttackRoll = (atk) => {
    const toHit = Number(atk.toHit || 0);
    const toHitD20 = Math.floor(Math.random() * 20) + 1;
    const toHitTotal = toHitD20 + toHit;

    // Simple parser for dice formulas like "1d6+2" or "2d10"
    let damageTotal = 0;
    let damageRolls = [];
    const diceExpr = (atk.damage || "1d4").trim().toLowerCase();
    const match = diceExpr.match(/^(\d+)d(\d+)(.*)$/);
    let formulaText = `Hit: 1d20 + ${toHit} | Dmg: ${diceExpr}`;

    if (match) {
      const count = parseInt(match[1], 10);
      const sides = parseInt(match[2], 10);
      const remainder = match[3] || "";
      let flatMod = 0;
      const modMatch = remainder.match(/([+-])\s*(\d+)/);
      if (modMatch) {
        flatMod = parseInt(modMatch[2], 10) * (modMatch[1] === "-" ? -1 : 1);
      }
      for (let i = 0; i < count; i++) {
        const r = Math.floor(Math.random() * sides) + 1;
        damageRolls.push(r);
        damageTotal += r;
      }
      damageTotal += flatMod;
    } else {
      damageTotal = Math.max(1, parseInt(diceExpr, 10) || 4);
    }

    if (socket) {
      socket.emit("chat:send", {
        sender: npc.name,
        text: `swings with their ${atk.name}! Hit: ${toHitTotal} | Damage: ${damageTotal}`,
        type: "roll",
        rollDetails: {
          rollName: atk.name,
          formula: formulaText,
          isAttack: true,
          toHitRoll: toHitD20,
          toHitMod: toHit,
          toHitTotal,
          damageRolls,
          damageDice: atk.damage || "1d4",
          damageMod: 0,
          damageTotal,
        },
      });
    }
  };

  let actionsList = [];
  try {
    actionsList = JSON.parse(npc.actions || "[]");
  } catch (e) {}

  return (
    <div style={statblockStyles.block} className="glass-panel gold-border-glow">
      <div style={statblockStyles.header}>
        <div>
          <h2 style={statblockStyles.name}>{npc.name}</h2>
          <div style={statblockStyles.meta}>
            CR {npc.cr} • {npc.race} {npc.class} (Level {npc.level})
          </div>
        </div>
        {npc.imageUrl && (
          <img src={npc.imageUrl} alt={npc.name} style={statblockStyles.avatar} />
        )}
      </div>

      <div style={statblockStyles.hpAcRow}>
        <div style={statblockStyles.statItem}>
          <strong>AC:</strong> {npc.ac}
        </div>
        <div style={statblockStyles.statItem} className="hp-adjuster-widget">
          <strong>HP:</strong> {npc.hp} / {npc.maxHp}
          {isDM && (
            <div style={statblockStyles.hpControls}>
              <button
                type="button"
                onClick={() => onHpChange(Math.max(0, npc.hp - 1))}
                style={statblockStyles.hpBtn}
                className="touch-target btn-hover-scale"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => onHpChange(Math.min(npc.maxHp, npc.hp + 1))}
                style={statblockStyles.hpBtn}
                className="touch-target btn-hover-scale"
              >
                +
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={statblockStyles.abilityGrid} className="wiki-statblock-ability-grid">
        {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((stat) => {
          const score = npc[stat] || 10;
          return (
            <button
              key={stat}
              type="button"
              onClick={() => handleAbilityRoll(stat, score)}
              style={statblockStyles.abilityBox}
              className="touch-target btn-hover-scale glass-panel"
            >
              <span style={statblockStyles.abilityLabel}>{stat.slice(0, 3).toUpperCase()}</span>
              <span style={statblockStyles.abilityScore}>{score}</span>
              <span style={statblockStyles.abilityMod}>{getMod(score)}</span>
            </button>
          );
        })}
      </div>

      {actionsList.length > 0 && (
        <div style={statblockStyles.actionsSection}>
          <h3 style={statblockStyles.sectionTitle}>Actions</h3>
          <div style={statblockStyles.actionsList}>
            {actionsList.map((action, i) => (
              <div key={action.name || i} style={statblockStyles.actionItem} className="glass-panel">
                <div style={statblockStyles.actionHeader}>
                  <strong style={statblockStyles.actionName}>{action.name}</strong>
                  <button
                    type="button"
                    onClick={() => handleAttackRoll(action)}
                    style={statblockStyles.rollBtn}
                    className="touch-target btn-hover-scale"
                  >
                    Roll
                  </button>
                </div>
                {action.description && (
                  <p style={statblockStyles.actionDesc}>{action.description}</p>
                )}
                {action.damage && (
                  <div style={statblockStyles.actionDmg}>
                    <strong>Damage:</strong> {action.damage} {action.toHit ? `(Hit Bonus: +${action.toHit})` : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const statblockStyles = {
  block: {
    padding: "1rem",
    borderRadius: "8px",
    background: "rgba(15, 12, 30, 0.4)",
    display: "flex",
    flexDirection: "column",
    gap: "0.85rem",
    marginBottom: "1.25rem",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  name: {
    fontSize: "1.3rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
    margin: 0,
  },
  meta: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
  },
  avatar: {
    width: "48px",
    height: "48px",
    borderRadius: "50%",
    objectFit: "cover",
    border: "1px solid rgba(200, 151, 58, 0.3)",
  },
  hpAcRow: {
    display: "flex",
    gap: "1.5rem",
    fontSize: "0.88rem",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.5rem",
  },
  statItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  hpControls: {
    display: "inline-flex",
    gap: "0.25rem",
    marginLeft: "0.5rem",
  },
  hpBtn: {
    padding: "0.1rem 0.4rem",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "rgba(255,255,255,0.05)",
    borderRadius: "4px",
    color: "var(--color-text)",
    cursor: "pointer",
    fontSize: "0.7rem",
    fontWeight: "bold",
  },
  abilityGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(6, 1fr)",
    gap: "0.4rem",
  },
  abilityBox: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "0.5rem 0.25rem",
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: "6px",
    cursor: "pointer",
  },
  abilityLabel: {
    fontSize: "0.6rem",
    color: "var(--color-muted)",
    fontWeight: "bold",
  },
  abilityScore: {
    fontSize: "0.9rem",
    fontWeight: "bold",
    color: "var(--color-text)",
  },
  abilityMod: {
    fontSize: "0.7rem",
    color: "var(--color-accent)",
    fontWeight: "bold",
  },
  actionsSection: {
    marginTop: "0.5rem",
  },
  sectionTitle: {
    fontSize: "0.85rem",
    fontWeight: "bold",
    textTransform: "uppercase",
    color: "var(--color-accent)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    paddingBottom: "0.2rem",
    marginBottom: "0.4rem",
  },
  actionsList: {
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  actionItem: {
    padding: "0.5rem 0.75rem",
    borderRadius: "6px",
    background: "rgba(255,255,255,0.01)",
    display: "flex",
    flexDirection: "column",
    gap: "0.25rem",
  },
  actionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  actionName: {
    fontSize: "0.85rem",
    color: "var(--color-text)",
  },
  rollBtn: {
    padding: "0.2rem 0.6rem",
    background: "rgba(200, 151, 58, 0.12)",
    border: "1px solid rgba(200, 151, 58, 0.3)",
    borderRadius: "4px",
    color: "var(--color-accent)",
    cursor: "pointer",
    fontSize: "0.7rem",
    fontWeight: "bold",
  },
  actionDesc: {
    fontSize: "0.78rem",
    color: "var(--color-muted)",
    margin: 0,
  },
  actionDmg: {
    fontSize: "0.78rem",
    color: "var(--color-text)",
  },
};

export default NpcStatblock;
export { statblockStyles };
