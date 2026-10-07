import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, BellOff, Check, Music2, Waves, X } from "lucide-react";
import {
  notificationPreferenceKey,
  registerNotificationServiceWorker,
  showWaveNotification,
} from "../services/notifications";

function savedEnabled() {
  try {
    return localStorage.getItem(notificationPreferenceKey) === "on"
      && "Notification" in window
      && Notification.permission === "granted";
  } catch {
    return false;
  }
}

export function NotificationCenter({ isSignedIn }: { isSignedIn: boolean }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(savedEnabled);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported",
  );
  const [message, setMessage] = useState("");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  const enable = async () => {
    setRequesting(true);
    setMessage("");
    if (!("Notification" in window)) {
      setPermission("unsupported");
      setMessage("This browser does not support desktop notifications.");
      setRequesting(false);
      return;
    }
    try {
      let result = Notification.permission;
      if (result === "default") result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        setEnabled(true);
        setMessage("Wave Streak notes are on. System player controls work separately wherever your device supports them.");
        try {
          localStorage.setItem(notificationPreferenceKey, "on");
        } catch {
          setMessage("Notifications are enabled for this visit.");
        }
        await registerNotificationServiceWorker();
        try {
          await showWaveNotification(
            "Wave Tune is ready",
            "Your Wave Streak note will arrive after you start listening today.",
            "wave-tune-notification-test",
          );
        } catch {
          // Permission remains enabled even if this browser blocks the sample alert.
        }
      } else if (result === "denied") {
        setEnabled(false);
        setMessage("Notifications are blocked in your browser. Change this site’s permission in browser settings to enable them.");
      } else {
        setEnabled(false);
        setMessage("Choose Allow in your browser’s permission prompt to turn notifications on.");
      }
    } catch {
      setMessage("The browser could not open its notification permission prompt. Try again from this page.");
    } finally {
      setRequesting(false);
    }
  };

  const disable = () => {
    setEnabled(false);
    try {
      localStorage.removeItem(notificationPreferenceKey);
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
          initial={reduceMotion ? false : { opacity: 0, y: 12, scale: .97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: .98 }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="notification-dialog-head">
            <span className="notification-dialog-icon">{enabled ? <Bell size={20} /> : <BellOff size={20} />}</span>
            <button type="button" className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></button>
          </div>
          <span className="eyebrow">LISTENER NOTES / {enabled ? "ON" : "OFF"}</span>
          <h2 id="notification-title">{enabled ? "Your Wave Streak is ready." : "Keep your listening ritual going."}</h2>
          <p>Allow a daily note after listening is recorded. Your device’s media panel can show the track, artist, artwork, progress, and playback controls automatically.</p>
          <div className="notification-feature-list">
            <div className="notification-feature"><Waves size={16} /><span><strong>WAVE STREAK</strong><small>A small note when today’s listening is in.</small></span></div>
            <div className="notification-feature"><Music2 size={16} /><span><strong>NOW PLAYING</strong><small>Album art, song details, and media controls where your browser supports them.</small></span></div>
          </div>
          <div className={`notification-permission-state state-${permission}`} aria-live="polite">
            <span className="permission-led" />
            <span><strong>{enabled ? "Permission granted" : permission === "denied" ? "Permission blocked" : permission === "unsupported" ? "Not available here" : "Browser permission"}</strong><small>{enabled ? "Wave Streak notes are active." : permission === "denied" ? "Change this site’s permission in browser settings." : permission === "unsupported" ? "This browser does not support notifications." : "Your browser will ask before enabling notes."}</small></span>
          </div>
          {message && <div className={`notification-message ${permission === "denied" || permission === "unsupported" ? "is-warning" : ""}`} role="status">{message}</div>}
          {enabled
            ? <button type="button" className="notification-action secondary-button" onClick={disable}><BellOff size={15} /> Turn off notifications</button>
            : <button type="button" className="notification-action primary-button" disabled={requesting || permission === "unsupported" || permission === "denied"} onClick={() => void enable()}>
              <Check size={15} /> {requesting ? "Waiting for permission…" : permission === "denied" ? "Blocked in browser settings" : "Allow notifications"}
            </button>}
          <small className="notification-footnote">{isSignedIn ? "Your listening streak syncs with your account." : "Sign in to keep your listening streak in sync across devices."} Notes appear while Wave Tune is open or playing in a background tab; alerts after the browser is fully closed need push setup. Media controls vary by browser and device.</small>
        </motion.section>
      </div>}
    </AnimatePresence>
  </>;
}
