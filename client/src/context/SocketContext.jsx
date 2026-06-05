// =============================================================================
// Tablecast — Socket.io React Context
// Provides a single, shared Socket.io connection to the entire component tree.
// =============================================================================
import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";

const SocketContext = createContext(null);

/**
 * Determines the Socket.io server URL.
 *
 * • In production the React SPA is served by Express on the same origin,
 *   so we connect to "/" (relative — no explicit URL needed).
 * • In development Vite proxies /socket.io to the backend (see vite.config.js),
 *   so we also connect without specifying a URL.
 */
function createSocket() {
  return io({
    autoConnect: false,       // We'll connect manually inside the effect
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
  });
}

/**
 * Wrap the app with <SocketProvider> to give every component access to the
 * shared socket instance via the useSocket() hook.
 */
export function SocketProvider({ children }) {
  const [socket] = useState(() => createSocket());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // Connect when the provider mounts
    socket.connect();

    function onConnect() {
      console.log("[Socket] Connected:", socket.id);
      setIsConnected(true);
    }

    function onDisconnect(reason) {
      console.log("[Socket] Disconnected:", reason);
      setIsConnected(false);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // Cleanup on unmount
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, [socket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

/**
 * Hook to access the socket instance and connection status.
 *
 * @returns {{ socket: import("socket.io-client").Socket, isConnected: boolean }}
 */
export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) {
    throw new Error("useSocket() must be used inside a <SocketProvider>.");
  }
  return ctx;
}
