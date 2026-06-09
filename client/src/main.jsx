import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import { DiceBoxProvider } from "./context/DiceBoxContext";
import { ToastProvider } from "./context/ToastContext";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <SocketProvider>
        <DiceBoxProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </DiceBoxProvider>
      </SocketProvider>
    </HashRouter>
  </StrictMode>
);
