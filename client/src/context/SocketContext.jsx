import { createContext, useContext, useEffect, useState, useCallback } from "react";
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
  const [userId, setUserIdState] = useState(null);

  // Connect only when auth userId is set; disconnect on logout
  useEffect(() => {
    if (userId) {
      socket.auth = { userId };
      socket.connect();
    } else {
      socket.disconnect();
      setConnectionStatus("disconnected");
      setIsConnected(false);
    }

    return () => {
      // cleanup handled by the lifecycle effect below
    };
  }, [userId, socket]);

  useEffect(() => {
    function onConnect() {
      debug("[Socket] Connected:", socket.id);
      setIsConnected(true);
      setConnectionStatus("connected");
    }

    function onDisconnect(reason) {
      debug("[Socket] Disconnected:", reason);
      setIsConnected(false);
      setConnectionStatus("disconnected");
    }

    function onReconnectAttempt() {
      setConnectionStatus("reconnecting");
    }

    function onReconnectError() {
      setConnectionStatus("reconnecting");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.io.on("reconnect_error", onReconnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      socket.io.off("reconnect_error", onReconnectError);
      socket.disconnect();
    };
  }, [socket]);

  const setUserId = useCallback((id) => setUserIdState(id), []);
  const clearAuth = useCallback(() => setUserIdState(null), []);

  return (
    <SocketContext.Provider value={{ socket, isConnected, connectionStatus, setUserId, clearAuth, userId }}>
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
