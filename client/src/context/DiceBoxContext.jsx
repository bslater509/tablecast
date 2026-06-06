import { createContext, useContext, useEffect, useRef, useState } from "react";
import DiceBox from "@3d-dice/dice-box";

const DiceBoxContext = createContext(null);

export function DiceBoxProvider({ children }) {
  const containerRef = useRef(null);
  const diceBoxRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  // Keep queue in state to trigger re-renders when queue changes
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);

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

          // Remove completed roll from queue
          queueRef.current.shift();
          setQueue([...queueRef.current]);
        }

        // Delay clearing/hiding dice slightly for better visual polish
        setTimeout(() => {
          if (box) {
            box.clear();
          }
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
  }, []);

  // Process the queue
  useEffect(() => {
    if (!isReady || isRolling || queue.length === 0) return;

    const nextRoll = queue[0];
    setIsRolling(true);

    const { dice3d, color } = nextRoll;
    const box = diceBoxRef.current;

    if (box) {
      console.log("[3D Dice] Simulating roll:", dice3d, "with color:", color);
      
      // Roll the dice. Support both single string or array of strings.
      box.roll(dice3d, {
        themeColor: color || "#7c3aed",
      }).catch(err => {
        console.error("[3D Dice] Roll error:", err);
        // Recover queue state on error
        window.dispatchEvent(
          new CustomEvent("dice:roll:complete", {
            detail: { messageId: nextRoll.messageId },
          })
        );
        queueRef.current.shift();
        setQueue([...queueRef.current]);
        setIsRolling(false);
      });
    } else {
      setIsRolling(false);
    }
  }, [isReady, isRolling, queue]);

  // Queue a roll
  const trigger3DRoll = (messageId, dice3d, color) => {
    if (!dice3d || dice3d.length === 0) {
      // Immediate completion if no 3D dice configured
      window.dispatchEvent(
        new CustomEvent("dice:roll:complete", {
          detail: { messageId },
        })
      );
      return;
    }

    console.log("[3D Dice] Queueing roll:", dice3d);
    queueRef.current.push({ messageId, dice3d, color });
    setQueue([...queueRef.current]);
  };

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
