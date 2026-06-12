import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { io } from "socket.io-client";

const debug = import.meta.env.DEV ? console.log : () => {};

const SocketContext = createContext(null);

function createSocket() {
  return io({
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
}

export function SocketProvider({ children }) {
  const [socket] = useState(() => createSocket());
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("disconnected");
  const [authInfo, setAuthInfo] = useState(null); // { id, isCharacter }
  const [reconnectCount, setReconnectCount] = useState(0);
  const [connectionFailed, setConnectionFailed] = useState(false);

  // Pending event queue for offline resilience
  const pendingQueueRef = useRef([]); // [{ event, data, timestamp, retries }]

  // Last known state for reconnection sync
  const lastKnownStateRef = useRef({
    tokenPositions: {},
    fogState: null,
    activeEncounterId: null,
  });

  const reconnectStateHandlerRef = useRef(null);

  // Connect only when auth is set; disconnect on logout
  useEffect(() => {
    if (authInfo) {
      if (authInfo.isCharacter) {
        socket.auth = { characterId: authInfo.id };
      } else {
        socket.auth = { userId: authInfo.id };
      }
      socket.connect();
    } else {
      socket.disconnect();
      setConnectionStatus("disconnected");
      setIsConnected(false);
    }

    return () => {
      // cleanup handled by the lifecycle effect below
    };
  }, [authInfo, socket]);

  useEffect(() => {
    function onConnect() {
      debug("[Socket] Connected:", socket.id);
      setIsConnected(true);
      setConnectionStatus("connected");
      setConnectionFailed(false);

      // Replay queued events
      const queue = pendingQueueRef.current;
      if (queue.length > 0) {
        console.log(`[Socket] Replaying ${queue.length} queued events`);
        const fresh = queue.filter(item => Date.now() - item.timestamp < 300000); // 5 min max age
        pendingQueueRef.current = [];
        fresh.forEach((item, index) => {
          setTimeout(() => {
            socket.emit(item.event, item.data);
          }, index * 100); // 100ms between each
        });
      }

      // Request state sync from cache (survives page refresh)
      const cachedTokenPositions = cacheGet("tokenPositions");
      const cachedFogState = cacheGet("fogState");
      const cachedEncounterId = cacheGet("activeEncounterId");
      if (cachedTokenPositions || cachedFogState || cachedEncounterId) {
        socket.emit("reconnect:sync", {
          lastKnownState: {
            tokenPositions: cachedTokenPositions || {},
            fogState: cachedFogState || null,
            activeEncounterId: cachedEncounterId || null,
          }
        });
      }
    }

    function onDisconnect(reason) {
      debug("[Socket] Disconnected:", reason);
      setIsConnected(false);
      // Don't set to "disconnected" if we were intentionally reconnecting —
      // let the reconnect events handle the display. But for transport-level
      // disconnects (server restart, network flap), show reconnecting.
      if (reason === "io client disconnect" || reason === "io server disconnect") {
        setConnectionStatus("disconnected");
      } else {
        setConnectionStatus("reconnecting");
      }
    }

    function onConnectError(err) {
      debug("[Socket] Connection error:", err.message);
      // Log connection errors so we can diagnose connection issues
      console.warn("[Socket] Connection error:", err.message, err.description || "");
      setConnectionStatus("reconnecting");
      setConnectionFailed(false);
    }

    function onReconnectAttempt(attempt) {
      debug("[Socket] Reconnect attempt:", attempt);
      setConnectionStatus("reconnecting");
    }

    function onReconnectError(err) {
      debug("[Socket] Reconnect error:", err.message);
      setConnectionStatus("reconnecting");
    }

    function onReconnect() {
      debug("[Socket] Reconnected");
      setIsConnected(true);
      setConnectionStatus("connected");
      setConnectionFailed(false);
      setReconnectCount(prev => prev + 1);

      // Emit reconnect:sync with last known state
      const state = lastKnownStateRef.current;
      if (Object.keys(state.tokenPositions).length > 0 || state.fogState) {
        socket.emit("reconnect:sync", { lastKnownState: state });
      }
    }

    function onReconnectFailed() {
      debug("[Socket] Reconnection failed");
      setConnectionFailed(true);
      setConnectionStatus("disconnected");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_error", onReconnectError);
    socket.io.on("reconnect", onReconnect);
    function onReconnectState(diffs) {
      if (diffs.tokenPositions && Object.keys(diffs.tokenPositions).length > 0) {
        console.log("[Socket] Reconnect sync received", Object.keys(diffs.tokenPositions).length, "token diffs");
        cacheSet("reconnectDiffs", diffs);
      }
      if (diffs.fogState) {
        console.log("[Socket] Reconnect sync: fog state updated");
      }
      if (diffs.encounter) {
        console.log("[Socket] Reconnect sync: encounter state updated");
      }
      if (reconnectStateHandlerRef.current) {
        reconnectStateHandlerRef.current(diffs);
      }
    }
    socket.on("reconnect:state", onReconnectState);

    // Periodically persist last known state to localStorage for reconnect sync
    const cacheInterval = setInterval(() => {
      const state = lastKnownStateRef.current;
      if (Object.keys(state.tokenPositions).length > 0) {
        cacheSet("tokenPositions", state.tokenPositions);
      }
      if (state.fogState) {
        cacheSet("fogState", state.fogState);
      }
      if (state.activeEncounterId) {
        cacheSet("activeEncounterId", state.activeEncounterId);
      }
    }, 30000);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_error", onReconnectError);
      socket.io.off("reconnect", onReconnect);
      socket.io.off("reconnect_failed", onReconnectFailed);
      socket.off("reconnect:state", onReconnectState);
      clearInterval(cacheInterval);
      // Do NOT call socket.disconnect() in cleanup — this causes issues with
      // StrictMode double-mounting (the cleanup fires between mounts and
      // disconnects the socket, breaking the connection lifecycle).
      // The socket lifecycle is managed by the authInfo effect below.
    };
  }, [socket]);

  // Backward-compatible setUserId (DM users)
  const setUserId = useCallback((id) => setAuthInfo({ id, isCharacter: false }), []);

  // New: set character auth for players
  const setCharacterId = useCallback((id) => setAuthInfo({ id, isCharacter: true }), []);

  // Unified setAuth
  const setAuth = useCallback((info) => setAuthInfo(info), []);

  const clearAuth = useCallback(() => setAuthInfo(null), []);

  // safeEmit — wraps socket.emit with offline queue fallback
  const safeEmit = useCallback((event, data, ackCallback) => {
    if (socket && socket.connected) {
      if (ackCallback) {
        socket.emit(event, data, ackCallback);
      } else {
        socket.emit(event, data);
      }
    } else {
      // Queue for later replay
      pendingQueueRef.current.push({
        event,
        data,
        timestamp: Date.now(),
        retries: 0,
      });
      console.log(`[Socket] Queued event '${event}' — socket disconnected`);
    }
  }, [socket]);

  const updateLastKnownState = useCallback((partial) => {
    lastKnownStateRef.current = { ...lastKnownStateRef.current, ...partial };
  }, []);

  const onReconnectState = useCallback((handler) => {
    reconnectStateHandlerRef.current = handler;
  }, []);

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      connectionStatus,
      setUserId,
      setCharacterId,
      setAuth,
      clearAuth,
      safeEmit,
      updateLastKnownState,
      onReconnectState,
      userId: authInfo?.id ?? null,
      characterId: authInfo?.isCharacter ? authInfo.id : null,
      authInfo,
      reconnectCount,
      connectionFailed,
    }}>
      {children}
    </SocketContext.Provider>
  );
}

// =============================================================================
// localStorage Cache Helpers (Offline Resilience)
// =============================================================================
const CACHE_PREFIX = "tablecast:cache:";
const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

export function cacheSet(key, data) {
  try {
    const entry = {
      data,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.warn("[Cache] Failed to set cache:", e.message);
  }
}

export function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    return entry.data;
  } catch (e) {
    console.warn("[Cache] Failed to get cache:", e.message);
    return null;
  }
}

export function cacheGetWithAge(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;
    return { data: entry.data, age, isStale: age > CACHE_MAX_AGE };
  } catch (e) {
    return null;
  }
}

export function cacheRemove(key) {
  try {
    localStorage.removeItem(CACHE_PREFIX + key);
  } catch (e) {
    // ignore
  }
}

export function getCacheAge(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    return Date.now() - JSON.parse(raw).timestamp;
  } catch {
    return null;
  }
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket() must be used inside a <SocketProvider>.");
  }
  return ctx;
}
