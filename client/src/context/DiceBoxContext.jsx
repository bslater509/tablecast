import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import DiceBox from "@3d-dice/dice-box";

const debug = typeof import.meta !== "undefined" && import.meta.env?.DEV ? console.log : () => {};

const DiceBoxContext = createContext(null);

// Fallback random generator when 3D dice box is unavailable
function fallbackRoll(notation) {
  const groups = [];
  const allRolls = [];
  let total = 0;

  const parseNotation = (str) => {
    const match = str.match(/^(\d+)[dD](\d+)(?:([+-])(\d+))?$/);
    if (!match) return null;
    return {
      qty: parseInt(match[1], 10),
      sides: parseInt(match[2], 10),
      modifier: match[3] === "-" ? -parseInt(match[4] || 0, 10) : parseInt(match[4] || 0, 10),
    };
  };

  const items = Array.isArray(notation) ? notation : [notation];
  for (const item of items) {
    const parsed = parseNotation(item);
    if (!parsed) continue;
    const rollValues = [];
    for (let i = 0; i < parsed.qty; i++) {
      rollValues.push(Math.floor(Math.random() * parsed.sides) + 1);
    }
    const groupSum = rollValues.reduce((a, b) => a + b, 0) + parsed.modifier;
    const group = {
      qty: parsed.qty,
      sides: parsed.sides,
      modifier: parsed.modifier,
      value: groupSum,
      rolls: rollValues.map((v) => ({ value: v, sides: parsed.sides, qty: 1 })),
    };
    groups.push(group);
    allRolls.push(...rollValues);
    total += groupSum;
  }

  return { groups, allRolls, total };
}

export function DiceBoxProvider({ children }) {
  const containerRef = useRef(null);
  const diceBoxRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isRolling, setIsRolling] = useState(false);
  const isRollingRef = useRef(false);
  const clearTimeoutRef = useRef(null);
  // Keep queue in state to trigger re-renders when queue changes
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  // Pending promise resolve/reject for the active roll
  const pendingResolve = useRef(null);
  const pendingReject = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
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
      if (!mountedRef.current) return;
      diceBoxRef.current = box;
      setIsReady(true);
      debug("[3D Dice] DiceBox initialized successfully.");

      // Force an immediate window resize event to trigger correct layout size calculations
      window.dispatchEvent(new Event("resize"));

      // Setup global complete listener — resolves pending roll promise with physics results
      box.onRollComplete = (results) => {
        debug("[3D Dice] Roll complete:", results);

        // Extract flat roll values from the grouped results
        const allRolls = [];
        let total = 0;
        for (const group of results) {
          if (group.rolls) {
            for (const die of group.rolls) {
              allRolls.push(die.value);
            }
          }
          total += group.value || 0;
        }

        // Resolve the pending promise so the caller gets the actual physics results
        if (pendingResolve.current) {
          pendingResolve.current({ groups: results, allRolls, total });
          pendingResolve.current = null;
          pendingReject.current = null;
        }

        // Remove completed roll from queue
        queueRef.current.shift();
        setQueue([...queueRef.current]);

        // Delay clearing/hiding dice slightly for better visual polish
        clearTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          if (diceBoxRef.current) {
            diceBoxRef.current.clear();
          }
          isRollingRef.current = false;
          setIsRolling(false);
        }, 1200);
      };
    }).catch(err => {
      if (!mountedRef.current) return;
      console.error("[3D Dice] Failed to initialize DiceBox:", err);
    });

    return () => {
      mountedRef.current = false;
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      if (diceBoxRef.current) {
        diceBoxRef.current.clear();
        diceBoxRef.current = null;
      }
    };
  }, []);

  // Process the queue — one roll at a time
  useEffect(() => {
    if (!isReady || isRollingRef.current || queue.length === 0) return;

    const nextRoll = queue[0];
    isRollingRef.current = true;
    setIsRolling(true);

    const { notation, theme, color, resolve, reject } = nextRoll;
    const box = diceBoxRef.current;

    if (box && notation.length > 0) {
      debug("[3D Dice] Rolling:", notation, "with theme:", theme, "and color:", color);

      // Force viewport resize event just in case layout changed before active roll
      window.dispatchEvent(new Event("resize"));

      const activeTheme = theme || "default";
      const rollThemeColor = color || "#7c3aed";

      // Store promise callbacks for onRollComplete to call
      pendingResolve.current = resolve;
      pendingReject.current = reject;

      // Update config with the active theme and color dynamically
      try {
        box.updateConfig({
          theme: activeTheme,
          themeColor: rollThemeColor,
        });
      } catch (err) {
        console.error("[3D Dice] Failed to update config:", err);
      }

      // Ensure the theme is loaded first, then roll
      const loadPromise = typeof box.loadTheme === "function"
        ? box.loadTheme(activeTheme)
        : Promise.resolve();

      loadPromise
        .then(() => box.roll(notation, {
            theme: activeTheme,
            themeColor: rollThemeColor,
          }))
        .catch((err) => {
          console.error("[3D Dice] Roll error:", err);
          if (pendingReject.current) {
            pendingReject.current(err);
            pendingResolve.current = null;
            pendingReject.current = null;
          }
          queueRef.current.shift();
          setQueue([...queueRef.current]);
          isRollingRef.current = false;
          setIsRolling(false);
        });
    } else {
      // Box not available — reject the promise
      if (reject) {
        reject(new Error("Dice box not available"));
      }
      queueRef.current.shift();
      setQueue([...queueRef.current]);
      isRollingRef.current = false;
      setIsRolling(false);
    }
  }, [isReady, isRolling, queue]);

  // Public API: roll dice with simple notation, returns actual physics results
  const rollDice = useCallback(async (notation, options = {}) => {
    const { theme = "default", color = "#7c3aed" } = options;

    // Normalize to array of non-empty strings
    const normalized = Array.isArray(notation)
      ? notation.filter(Boolean)
      : [notation].filter(Boolean);

    if (normalized.length === 0) {
      return { groups: [], allRolls: [], total: 0 };
    }

    // If the 3D box is not available, use fallback random generation
    if (!diceBoxRef.current || !isReady) {
      debug("[3D Dice] Box not ready, using fallback random generation");
      return fallbackRoll(normalized);
    }

    // Queue the roll and return a promise that resolves with physics results
    return new Promise((resolve, reject) => {
      queueRef.current.push({ notation: normalized, theme, color, resolve, reject });
      setQueue([...queueRef.current]);
    });
  }, [isReady]);

  return (
    <DiceBoxContext.Provider value={{ rollDice, isReady, isRolling }}>
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

