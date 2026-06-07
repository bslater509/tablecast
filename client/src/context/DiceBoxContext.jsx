import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import DiceBox from "@3d-dice/dice-box";
import { useSocket } from "./SocketContext";
import { getDiceThemeOption, getDiceThemePreviewStyles } from "../lib/diceThemes";

const DiceBoxContext = createContext(null);

export function DiceBoxProvider({ children }) {
  const containerRef = useRef(null);
  const diceBoxRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const isRollingRef = useRef(false);
  // Keep queue in state to trigger re-renders when queue changes
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  const queuedMessageIdsRef = useRef(new Set());
  const [toasts, setToasts] = useState([]);

  // Trigger toast notifications
  const showToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, ...toast }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initialize the DiceBox instance
    const box = new DiceBox({
      container: "#dice-box-canvas",
      id: "dice-canvas",
      assetPath: "/assets/dice-box/", // Must match public folder structure
      theme: "default",
      offscreen: false, // Keep on UI thread for maximum compatibility on mobile
      gravity: 3,
      mass: 1,
      friction: 0.8,
      restitution: 0.1,
    });

    box.init().then(() => {
      diceBoxRef.current = box;
      setIsReady(true);
      console.log("[3D Dice] DiceBox initialized successfully.");
      
      // Force an immediate window resize event to trigger correct layout size calculations
      window.dispatchEvent(new Event("resize"));

      // Setup global complete listener
      box.onRollComplete = (results) => {
        console.log("[3D Dice] Roll complete:", results);
        
        // Find the current active roll in queue
        const activeRoll = queueRef.current[0];
        if (activeRoll) {
          // Dispatch custom event to notify listeners (e.g. ChatPanel)
          window.dispatchEvent(
            new CustomEvent("dice:roll:complete", {
              detail: { messageId: activeRoll.messageId },
            })
          );

          // Trigger global roll result toast notification
          showToast({
            sender: activeRoll.sender || "Someone",
            rollName: activeRoll.rollName || "Dice Roll",
            formula: activeRoll.formula || "1d20",
            total: activeRoll.total !== undefined ? activeRoll.total : "?",
            color: activeRoll.color,
            theme: activeRoll.theme,
          });

          // Remove completed roll from queue
          queueRef.current.shift();
          if (activeRoll.messageId) {
            queuedMessageIdsRef.current.delete(activeRoll.messageId);
          }
          setQueue([...queueRef.current]);
        }

        // Delay clearing/hiding dice slightly for better visual polish
        setTimeout(() => {
          if (box) {
            box.clear();
          }
          isRollingRef.current = false;
          setIsRolling(false);
        }, 1200);
      };
    }).catch(err => {
      console.error("[3D Dice] Failed to initialize DiceBox:", err);
    });

    return () => {
      if (diceBoxRef.current) {
        diceBoxRef.current.clear();
        diceBoxRef.current = null;
      }
    };
  }, [showToast]);

  // Process the queue
  useEffect(() => {
    if (!isReady || isRollingRef.current || queue.length === 0) return;

    const nextRoll = queue[0];
    isRollingRef.current = true;
    setIsRolling(true);

    const { dice3d, color, theme } = nextRoll;
    const box = diceBoxRef.current;

    if (box) {
      console.log("[3D Dice] Simulating roll:", dice3d, "with theme:", theme, "and color:", color);
      
      // Force viewport resize event just in case layout changed before active roll
      window.dispatchEvent(new Event("resize"));
      
      const activeTheme = theme || "default";
      const rollThemeColor = color || "#7c3aed";

      // Update config with the active theme and color dynamically
      try {
        box.updateConfig({
          theme: activeTheme,
          themeColor: rollThemeColor
        });
      } catch (err) {
        console.error("[3D Dice] Failed to update config:", err);
      }

      // Ensure the theme is loaded first, then roll
      const loadPromise = typeof box.loadTheme === "function"
        ? box.loadTheme(activeTheme)
        : Promise.resolve();

      loadPromise
        .then(() => {
          return box.roll(dice3d, {
            theme: activeTheme,
            themeColor: rollThemeColor
          });
        })
        .catch((err) => {
          console.error("[3D Dice] Roll error:", err);
          // Recover queue state on error
          window.dispatchEvent(
            new CustomEvent("dice:roll:complete", {
              detail: { messageId: nextRoll.messageId },
            })
          );
          queueRef.current.shift();
          if (nextRoll.messageId) {
            queuedMessageIdsRef.current.delete(nextRoll.messageId);
          }
          setQueue([...queueRef.current]);
          isRollingRef.current = false;
          setIsRolling(false);
        });
    } else {
      queueRef.current.shift();
      if (nextRoll.messageId) {
        queuedMessageIdsRef.current.delete(nextRoll.messageId);
      }
      setQueue([...queueRef.current]);
      isRollingRef.current = false;
      setIsRolling(false);
    }
  }, [isReady, isRolling, queue]);

  // Queue a roll
  const trigger3DRoll = useCallback((messageId, dice3d, color, theme, sender, rollName, formula, total) => {
    const normalizedDice3d = Array.isArray(dice3d) ? dice3d.filter(Boolean) : [dice3d].filter(Boolean);

    if (normalizedDice3d.length === 0) {
      // Immediate completion if no 3D dice configured
      window.dispatchEvent(
        new CustomEvent("dice:roll:complete", {
          detail: { messageId },
        })
      );
      return;
    }

    if (messageId && queuedMessageIdsRef.current.has(messageId)) {
      return;
    }

    if (messageId) {
      queuedMessageIdsRef.current.add(messageId);
    }

    console.log("[3D Dice] Queueing roll:", normalizedDice3d, "with theme:", theme, "for:", sender);
    queueRef.current.push({ messageId, dice3d: normalizedDice3d, color, theme, sender, rollName, formula, total });
    setQueue([...queueRef.current]);
  }, [setQueue]);

  const socketContext = useSocket();
  const socket = socketContext?.socket;

  useEffect(() => {
    if (!socket) return;

    function handleGlobalRollMessage(msg) {
      if (msg.type === "roll" && msg.rollDetails?.status === "rolling") {
        trigger3DRoll(
          msg.id,
          msg.rollDetails.dice3d,
          msg.rollDetails.diceColor,
          msg.rollDetails.diceTheme,
          msg.sender,
          msg.rollDetails.rollName,
          msg.rollDetails.formula,
          msg.rollDetails.total
        );
      }
    }

    socket.on("chat:message", handleGlobalRollMessage);
    return () => {
      socket.off("chat:message", handleGlobalRollMessage);
    };
  }, [socket, trigger3DRoll]);

  return (
    <DiceBoxContext.Provider value={{ trigger3DRoll, isReady, isRolling }}>
      {children}
      {/* Global full-screen canvas overlay */}
      <div
        id="dice-box-canvas"
        ref={containerRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 9999,
          pointerEvents: isRolling ? "auto" : "none",
          transition: "opacity 0.3s ease",
          opacity: isRolling ? 1 : 0,
        }}
      />
      {/* Global Toasts Container */}
      <div style={styles.toastContainer}>
        {toasts.map((t) => {
          const toastTheme = getDiceThemeOption(t.theme || "default");
          const toastThemeStyle = getDiceThemePreviewStyles(toastTheme.id, t.color || toastTheme.defaultColor);
          return (
            <div
              key={t.id}
              style={{
                ...styles.toast,
                borderLeft: `4px solid ${t.color || "var(--color-accent, #c8973a)"}`,
              }}
              className="glass-panel slide-down"
            >
              <div style={{ ...styles.toastIcon, ...toastThemeStyle.die }}>
                <span style={{ ...styles.toastIconText, ...toastThemeStyle.text }}>20</span>
              </div>
              <div style={styles.toastBody}>
                <div style={styles.toastHeader}>
                  <span style={styles.toastSender}>{t.sender}</span>
                  <span style={styles.toastAction}> rolled </span>
                  <span style={styles.toastFormula}>{t.rollName} ({t.formula})</span>
                </div>
                <div style={styles.toastTotalRow}>
                  <span style={{ ...styles.toastThemeChip, ...toastThemeStyle.chip }}>{toastTheme.shortName}</span>
                  <span style={styles.toastTotalLabel}>Total:</span>
                  <span style={{ ...styles.toastTotalValue, color: t.color || "var(--color-accent, #c8973a)" }}>{t.total}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </DiceBoxContext.Provider>
  );
}

export function useDiceBox() {
  const ctx = useContext(DiceBoxContext);
  if (!ctx) {
    throw new Error("useDiceBox must be used inside a <DiceBoxProvider>.");
  }
  return ctx;
}

const styles = {
  toastContainer: {
    position: "fixed",
    top: "4rem", // Just below top header banner
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10500,
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
    width: "90%",
    maxWidth: "360px",
    pointerEvents: "none",
  },
  toast: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    padding: "0.75rem 1rem",
    borderRadius: "8px",
    background: "rgba(10, 8, 20, 0.92)",
    backdropFilter: "blur(12px)",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
    pointerEvents: "auto",
  },
  toastIcon: {
    width: "42px",
    height: "42px",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transform: "rotate(8deg)",
  },
  toastIconText: {
    fontSize: "0.88rem",
    fontWeight: 900,
    lineHeight: 1,
  },
  toastBody: {
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
    flex: 1,
  },
  toastHeader: {
    fontSize: "0.82rem",
    color: "#e2e8f0",
  },
  toastSender: {
    fontWeight: "bold",
    color: "#ffffff",
  },
  toastAction: {
    color: "#94a3b8",
  },
  toastFormula: {
    color: "#cbd5e1",
    fontStyle: "italic",
  },
  toastTotalRow: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.35rem",
    marginTop: "0.1rem",
    flexWrap: "wrap",
  },
  toastThemeChip: {
    minHeight: "22px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0.1rem 0.45rem",
    borderRadius: "999px",
    fontSize: "0.64rem",
    fontWeight: 800,
    marginRight: "0.1rem",
  },
  toastTotalLabel: {
    fontSize: "0.75rem",
    color: "#94a3b8",
    fontWeight: 600,
    textTransform: "uppercase",
  },
  toastTotalValue: {
    fontSize: "1.25rem",
    fontWeight: "bold",
    textShadow: "0 0 8px rgba(200, 151, 58, 0.15)",
  },
};
