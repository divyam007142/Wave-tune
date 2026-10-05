import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, BellOff, Check, X } from "lucide-react";

function savedEnabled() {
  try {
    return localStorage.getItem("wave-tune:notifications") === "on";
  } catch {
    return false;
  }
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(savedEnabled);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [message, setMessage] = useState("");

  const enable = async () => {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setMessage("This browser does not support desktop notifications.");
      return;
    }
    let result = Notification.permission;
    if (result === "default") result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      setEnabled(true);
      setMessage("Notifications are on. Wave Tune can alert you when playback continues in the background.");
      try {
        localStorage.setItem("wave-tune:notifications", "on");
      } catch {
        setMessage("Notifications are enabled for this visit.");
      }
      new Notification("Wave Tune notifications are on", {
        body: "You’ll see a note when music starts while the app is in the background.",
        icon: "/favicon.svg",
      });
    } else if (result === "denied") {
      setEnabled(false);
      setMessage("Notifications are blocked in your browser. Change this site’s permission in browser settings to enable them.");
    } else {
      setEnabled(false);
      setMessage("Choose Allow in your browser’s permission prompt to turn notifications on.");
    }
  };

  const disable = () => {
    setEnabled(false);
    try {
      localStorage.removeItem("wave-tune:notifications");
    } catch {
      // The in-memory switch still takes effect when browser storage is unavailable.
    }
    setMessage("Wave Tune notifications are off.");
  };

  return <>
    <button
      type="button"
      className={`notification-trigger ${enabled ? "is-enabled" : "is-off"}`}
      aria-label="Notification settings"
      aria-expanded={open}
      onClick={() => { setMessage(""); setOpen(true); }}
      title="Notification settings"
    >
      <Bell size={17} />
      {!enabled && <span className="notification-indicator" />}
    </button>
    <AnimatePresence>
      {open && <div className="notification-overlay" onClick={() => setOpen(false)}>
        <motion.section
          className="notification-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notification-title"
          initial={{ opacity: 0, y: 12, scale: .97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: .98 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="notification-dialog-head">
            <span className="notification-dialog-icon">{enabled ? <Bell size={20} /> : <BellOff size={20} />}</span>
            <button type="button" className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></button>
          </div>
          <span className="eyebrow">STAY IN THE MIX</span>
          <h2 id="notification-title">{enabled ? "You’re all set." : "Keep the music with you."}</h2>
          <p>Get a small desktop alert when a new track starts while Wave Tune is running in the background.</p>
          {message && <div className={`notification-message ${permission === "denied" ? "is-warning" : ""}`} role="status">{message}</div>}
          {enabled
            ? <button type="button" className="notification-action secondary-button" onClick={disable}>Turn off notifications</button>
            : <button type="button" className="notification-action primary-button" onClick={() => void enable()}>
              <Check size={15} /> {permission === "denied" ? "Check browser settings" : "Allow notifications"}
            </button>}
          {permission === "unsupported" && <small className="notification-footnote">Browser notifications are unavailable in this browser.</small>}
        </motion.section>
      </div>}
    </AnimatePresence>
  </>;
}
