import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { SocketProvider } from "./context/SocketContext";
import { DiceBoxProvider } from "./context/DiceBoxContext";
import App from "./App.jsx";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <HashRouter>
      <SocketProvider>
        <DiceBoxProvider>
          <App />
        </DiceBoxProvider>
      </SocketProvider>
    </HashRouter>
  </StrictMode>
);
