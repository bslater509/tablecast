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
    socket.io.on("reconnect_failed", onReconnectFailed);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_error", onReconnectError);
      socket.io.off("reconnect", onReconnect);
      socket.io.off("reconnect_failed", onReconnectFailed);
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

  return (
    <SocketContext.Provider value={{
      socket,
      isConnected,
      connectionStatus,
      setUserId,
      setCharacterId,
      setAuth,
      clearAuth,
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

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket() must be used inside a <SocketProvider>.");
  }
  return ctx;
}
