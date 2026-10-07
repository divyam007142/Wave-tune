import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "./retro.css";
import { registerNotificationServiceWorker } from "./services/notifications";

if ("serviceWorker" in navigator && window.isSecureContext) {
  const registerAppWorker = () => {
    void registerNotificationServiceWorker().catch((error: unknown) => {
      console.error("Wave Tune could not register its app service worker.", error);
    });
  };
  if (document.readyState === "complete") registerAppWorker();
  else window.addEventListener("load", registerAppWorker, { once: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
