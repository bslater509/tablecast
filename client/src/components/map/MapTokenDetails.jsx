// =============================================================================
// MapTokenDetails — Selected token detail panel (monster sheet, NPC stats, HP, rolls)
// =============================================================================
import { X } from "lucide-react";

export default function MapTokenDetails({
  selectedTokenId,
  setSelectedTokenId,
  tokens,
  handleNpcRoll,
  handleMonsterRoll,
  jsonAuthHeaders,
  setTokens,
  socket,
  isConnected,
  withUser,
  styles,
}) {
  if (!selectedTokenId) return null;

  const selectedToken = tokens.find(t => t.id === selectedTokenId);
  if (!selectedToken) return null;

  let monsterStats = null;
  if (selectedToken.stats) {
    try {
      monsterStats = JSON.parse(selectedToken.stats);
    } catch (e) {}
  }

  const npcDetail = selectedToken.npc;

  return (
    <div style={styles.floatingTokenDetails} className="glass-panel gold-border-glow">
      <header style={styles.detailsHeader}>
        <h4 style={styles.smallPanelHeader}>Selected Token</h4>
        <button onClick={() => setSelectedTokenId(null)} style={styles.closeBtn} aria-label="Close selected token details">
          <X size={16} />
        </button>
      </header>

      <div style={styles.detailsBody}>
        <div style={styles.detailsRow}>
          <strong>Name:</strong> <span>{selectedToken.label || selectedToken.character?.name || npcDetail?.name || "Token"}</span>
        </div>

        {/* Player details */}
        {selectedToken.characterId && (
          <div style={styles.metaInfo}>
            Lvl {selectedToken.character?.level}  {selectedToken.character?.race} {selectedToken.character?.class}
          </div>
        )}

        {/* NPC details */}
        {npcDetail && (
          <div style={styles.metaInfo}>
            CR {npcDetail.cr} • {npcDetail.race} {npcDetail.class} (Lvl {npcDetail.level})
          </div>
        )}

        {/* NPC combat sheet */}
        {npcDetail && (
          <div style={styles.monsterSheet}>
            <div style={styles.metaInfo}>AC {npcDetail.ac}</div>

            <div style={styles.hpTracker}>
              <div style={styles.hpLabelRow}>
                <span>HP: {npcDetail.hp} / {npcDetail.maxHp}</span>
              </div>
              <div style={styles.hpControlsRow}>
                <button onClick={() => adjustNpcHp(npcDetail, selectedToken, -1, setTokens, jsonAuthHeaders, socket, isConnected, withUser)} style={styles.hpAdjBtn}>-1</button>
                <button onClick={() => adjustNpcHp(npcDetail, selectedToken, -5, setTokens, jsonAuthHeaders, socket, isConnected, withUser)} style={styles.hpAdjBtn}>-5</button>
                <button onClick={() => adjustNpcHp(npcDetail, selectedToken, 5, setTokens, jsonAuthHeaders, socket, isConnected, withUser)} style={styles.hpAdjBtn}>+5</button>
                <button onClick={() => adjustNpcHp(npcDetail, selectedToken, 1, setTokens, jsonAuthHeaders, socket, isConnected, withUser)} style={styles.hpAdjBtn}>+1</button>
              </div>
            </div>

            <div style={styles.miniStatsGrid}>
              <div><strong>STR</strong><span>{npcDetail.strength}</span></div>
              <div><strong>DEX</strong><span>{npcDetail.dexterity}</span></div>
              <div><strong>CON</strong><span>{npcDetail.constitution}</span></div>
              <div><strong>INT</strong><span>{npcDetail.intelligence}</span></div>
              <div><strong>WIS</strong><span>{npcDetail.wisdom}</span></div>
              <div><strong>CHA</strong><span>{npcDetail.charisma}</span></div>
            </div>

            {npcDetail.actions && (() => {
              let parsedActions = [];
              try { parsedActions = JSON.parse(npcDetail.actions); } catch (e) {}
              return parsedActions.length > 0 ? (
                <div style={styles.actionsSection}>
                  <h5 style={styles.actionsHeader}>NPC Actions</h5>
                  {parsedActions.map((act, i) => (
                    <button
                      key={act.name || i}
                      onClick={() => handleNpcRoll(selectedToken.label || npcDetail.name, act.name, act.toHit, act.damage, act.description)}
                      style={styles.monsterActionBtn}
                      className="touch-target btn-hover-scale"
                    >
                      {act.name}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        )}

        {/* Monster sheet (linked monster) */}
        {selectedToken.monster ? (
          <div style={styles.monsterSheet}>
            <div style={styles.metaInfo}>
              CR {selectedToken.monster.cr || "0"} • AC {selectedToken.monster.ac || "10"}
            </div>

            <div style={styles.hpTracker}>
              <div style={styles.hpLabelRow}>
                <span>HP: {monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp} / {selectedToken.monster.maxHp}</span>
              </div>
              <div style={styles.hpControlsRow}>
                <button onClick={() => adjustMonsterHp(selectedToken, monsterStats, -1, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>-1</button>
                <button onClick={() => adjustMonsterHp(selectedToken, monsterStats, -5, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>-5</button>
                <button onClick={() => adjustMonsterHp(selectedToken, monsterStats, 5, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>+5</button>
                <button onClick={() => adjustMonsterHp(selectedToken, monsterStats, 1, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>+1</button>
              </div>
            </div>

            <div style={styles.miniStatsGrid}>
              <div><strong>STR</strong><span>{selectedToken.monster.strength}</span></div>
              <div><strong>DEX</strong><span>{selectedToken.monster.dexterity}</span></div>
              <div><strong>CON</strong><span>{selectedToken.monster.constitution}</span></div>
              <div><strong>INT</strong><span>{selectedToken.monster.intelligence}</span></div>
              <div><strong>WIS</strong><span>{selectedToken.monster.wisdom}</span></div>
              <div><strong>CHA</strong><span>{selectedToken.monster.charisma}</span></div>
            </div>

            {(() => {
              let parsedActions = [];
              try { parsedActions = JSON.parse(selectedToken.monster.actions); } catch (e) {}
              return parsedActions.length > 0 ? (
                <div style={styles.actionsSection}>
                  <h5 style={styles.actionsHeader}>Monster Actions</h5>
                  {parsedActions.map((act, i) => (
                    <button
                      key={act.name || i}
                      onClick={() => handleNpcRoll(selectedToken.label || selectedToken.monster.name, act.name, act.toHit, act.damage, act.description)}
                      style={styles.monsterActionBtn}
                      className="touch-target btn-hover-scale"
                    >
                      {act.name}
                    </button>
                  ))}
                </div>
              ) : null;
            })()}
          </div>
        ) : monsterStats ? (
          <div style={styles.monsterSheet}>
            <div style={styles.metaInfo}>
              CR {monsterStats.cr || "0"}  AC {monsterStats.ac?.[0]?.ac || monsterStats.ac?.[0] || "10"}
            </div>

            <div style={styles.hpTracker}>
              <div style={styles.hpLabelRow}>
                <span>HP: {monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10)} / {monsterStats.hp?.average || 10}</span>
              </div>
              <div style={styles.hpControlsRow}>
                <button onClick={() => adjustStatsHp(selectedToken, monsterStats, -1, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>-1</button>
                <button onClick={() => adjustStatsHp(selectedToken, monsterStats, -5, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>-5</button>
                <button onClick={() => adjustStatsHp(selectedToken, monsterStats, 5, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>+5</button>
                <button onClick={() => adjustStatsHp(selectedToken, monsterStats, 1, setTokens, jsonAuthHeaders)} style={styles.hpAdjBtn}>+1</button>
              </div>
            </div>

            <div style={styles.miniStatsGrid}>
              <div><strong>STR</strong><span>{monsterStats.str || 10}</span></div>
              <div><strong>DEX</strong><span>{monsterStats.dex || 10}</span></div>
              <div><strong>CON</strong><span>{monsterStats.con || 10}</span></div>
              <div><strong>INT</strong><span>{monsterStats.int || 10}</span></div>
              <div><strong>WIS</strong><span>{monsterStats.wis || 10}</span></div>
              <div><strong>CHA</strong><span>{monsterStats.cha || 10}</span></div>
            </div>

            {monsterStats.action && (
              <div style={styles.actionsSection}>
                <h5 style={styles.actionsHeader}>Roll Actions</h5>
                {monsterStats.action.map((act, i) => {
                  const entriesStr = JSON.stringify(act.entries || []);
                  return (
                    <button
                      key={act.name || i}
                      onClick={() => handleMonsterRoll(selectedToken.label, act.name, entriesStr)}
                      style={styles.monsterActionBtn}
                      className="touch-target btn-hover-scale"
                    >
                      {act.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Helper: adjust NPC HP via API
function adjustNpcHp(npcDetail, selectedToken, delta, setTokens, jsonAuthHeaders, socket, isConnected, withUser) {
  const next = Math.max(0, Math.min(npcDetail.maxHp, npcDetail.hp + delta));
  fetch(`/api/npcs/${npcDetail.id}`, {
    method: "PUT",
    headers: jsonAuthHeaders,
    body: JSON.stringify({ hp: next })
  }).then(() => {
    setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, npc: { ...npcDetail, hp: next } } : t));
    if (socket && isConnected) socket.emit("token:create", withUser({ id: selectedToken.id }));
  });
}

// Helper: adjust monster HP (linked)
function adjustMonsterHp(selectedToken, monsterStats, delta, setTokens, jsonAuthHeaders) {
  const cur = monsterStats?.currentHp !== undefined ? monsterStats.currentHp : selectedToken.monster.hp;
  const max = selectedToken.monster.maxHp;
  const next = Math.max(0, Math.min(max, cur + delta));
  const updated = { ...(monsterStats || {}), currentHp: next };
  fetch(`/api/maps/tokens/${selectedToken.id}`, {
    method: "PUT",
    headers: jsonAuthHeaders,
    body: JSON.stringify({ stats: JSON.stringify(updated) })
  }).then(() => {
    setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
  });
}

// Helper: adjust stats-based HP (unlinked monster)
function adjustStatsHp(selectedToken, monsterStats, delta, setTokens, jsonAuthHeaders) {
  const cur = monsterStats.currentHp !== undefined ? monsterStats.currentHp : (monsterStats.hp?.average || 10);
  const max = monsterStats.hp?.average || 10;
  const next = Math.max(0, Math.min(max, cur + delta));
  const updated = { ...monsterStats, currentHp: next };
  fetch(`/api/maps/tokens/${selectedToken.id}`, {
    method: "PUT",
    headers: jsonAuthHeaders,
    body: JSON.stringify({ stats: JSON.stringify(updated) })
  }).then(() => {
    setTokens(prev => prev.map(t => t.id === selectedToken.id ? { ...t, stats: JSON.stringify(updated) } : t));
  });
}
