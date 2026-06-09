// =============================================================================
// Tablecast  Toast Notification Context
// Provides a lightweight toast stack with auto-dismiss, accessible to all components.
// Usage: const { addToast } = useToast();  addToast("Saved!", "success");
// =============================================================================
import { createContext, useContext, useState, useCallback, useRef } from "react";
import ToastContainer from "../components/ToastContainer";

const ToastContext = createContext(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}

const DEFAULTS = {
  success: { duration: 3000 },
  error: { duration: 5000 },
  warning: { duration: 4000 },
  info: { duration: 3000 },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const addToast = useCallback((message, type = "info", duration) => {
    const id = ++counterRef.current;
    const timeout = duration ?? DEFAULTS[type]?.duration ?? 3000;

    setToasts((prev) => [...prev, { id, message, type }]);

    if (timeout > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, timeout);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}
