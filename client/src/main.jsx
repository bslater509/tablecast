import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import { DiceBoxProvider } from "./context/DiceBoxContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmProvider } from "./context/ConfirmContext";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <SocketProvider>
        <DiceBoxProvider>
          <ToastProvider>
            <ConfirmProvider>
              <App />
            </ConfirmProvider>
          </ToastProvider>
        </DiceBoxProvider>
      </SocketProvider>
    </HashRouter>
  </StrictMode>
);
