import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bell, BellOff, Check, LogIn, X } from "lucide-react";
import {
  notificationPreferenceKey,
  disableWavePushNotifications,
  enableWavePushNotifications,
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

function supportsPushNotifications() {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "Notification" in window
    && "PushManager" in window
    && "serviceWorker" in navigator;
}

export function NotificationCenter({ isSignedIn, onEnabled, onLogin }: { isSignedIn: boolean; onEnabled?: (message?: string) => void; onLogin: () => void }) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    supportsPushNotifications() ? Notification.permission : "unsupported",
  );
  const [message, setMessage] = useState("");
  const [requesting, setRequesting] = useState(false);
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isSignedIn || permission !== "granted" || !savedEnabled()) {
      setEnabled(false);
      return;
    }
    let active = true;
    void enableWavePushNotifications()
      .then(() => { if (active) setEnabled(true); })
      .catch((error: unknown) => {
        if (!active) return;
        setEnabled(false);
        setMessage(error instanceof Error ? error.message : "Background alerts could not be connected.");
      });
    return () => { active = false; };
  }, [isSignedIn, permission]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        actionRef.current?.blur();
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    actionRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const enable = async () => {
    setRequesting(true);
    setMessage("");
    if (!supportsPushNotifications()) {
      setPermission("unsupported");
      setMessage("This browser cannot receive background alerts. You can still see updates in the Notifications tab.");
      setRequesting(false);
      return;
    }
    if (!isSignedIn) {
      setRequesting(false);
      setOpen(false);
      onLogin();
      return;
    }
    try {
      let result = Notification.permission;
      if (result === "default") result = await Notification.requestPermission();
      setPermission(result);
      if (result === "granted") {
        await enableWavePushNotifications();
        try {
          localStorage.setItem(notificationPreferenceKey, "on");
        } catch {
          // The live subscription still works if browser storage is unavailable.
        }
        setEnabled(true);
        setMessage("Background alerts are ready. Listening updates will also appear in your inbox.");
        setOpen(false);
        onEnabled?.();
      } else if (result === "denied") {
        setEnabled(false);
        setMessage("Notifications are blocked in your browser. Change this site’s permission in browser settings to enable them.");
      } else {
        setEnabled(false);
        setMessage("Choose Allow in your browser’s permission prompt to turn notifications on.");
      }
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "The browser could not connect this device for background alerts.";
      setMessage(errorMessage);
      if (Notification.permission === "granted") {
        setOpen(false);
        onEnabled?.(errorMessage);
      }
    } finally {
      setRequesting(false);
    }
  };

  const disable = async () => {
    setRequesting(true);
    setEnabled(false);
    try {
      await disableWavePushNotifications();
      setMessage("Background alerts are off for this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "This device was disconnected from background alerts.");
    } finally {
      setRequesting(false);
    }
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
    {createPortal(
      <AnimatePresence>
        {open && <motion.div
          className="notification-overlay"
          role="presentation"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <motion.section
            className="notification-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-title"
            initial={reduceMotion ? false : { opacity: 0, y: 12, scale: .97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 8, scale: .98 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            onClick={(event) => event.stopPropagation()}
          >
          <div className="notification-dialog-head">
            <span className="notification-dialog-icon">{enabled ? <Bell size={20} /> : <BellOff size={20} />}</span>
            <button type="button" className="notification-close" onClick={() => setOpen(false)} aria-label="Close notifications"><X size={17} /></button>
          </div>
          <span className="eyebrow">WAVE TUNE · NOTIFICATIONS</span>
          <h2 id="notification-title">{enabled ? "Listening updates are on." : "Keep up with your listening."}</h2>
          <p>Get Wave Tune alerts for new tracks and listening streaks, even when this app is closed. Your activity also appears in the Notifications tab.</p>
          <div className={`notification-permission-state state-${permission}`} aria-live="polite">
            <span className="permission-led" />
            <span><strong>{!isSignedIn ? "Sign in to connect this device" : enabled ? "Background alerts are ready" : permission === "denied" ? "Notifications are blocked" : permission === "unsupported" ? "Not available in this browser" : "Notifications are off"}</strong><small>{!isSignedIn ? "In-app updates stay here; sign in to receive alerts while Wave Tune is closed." : enabled ? "This device is linked to your account for new-track and streak alerts." : permission === "denied" ? "Allow notifications for this site in browser settings." : permission === "unsupported" ? "This browser cannot receive push notifications." : "Your browser will ask before enabling notifications."}</small></span>
          </div>
          {message && <div className={`notification-message ${permission === "denied" || permission === "unsupported" ? "is-warning" : ""}`} role="status">{message}</div>}
          {enabled
            ? <button ref={actionRef} type="button" className="notification-action secondary-button" disabled={requesting} onClick={() => void disable()}><BellOff size={15} /> {requesting ? "Turning off…" : "Turn off notifications"}</button>
            : !isSignedIn
              ? <button ref={actionRef} type="button" className="notification-action primary-button" onClick={onLogin}><LogIn size={15} /> Sign in to enable alerts</button>
              : <button ref={actionRef} type="button" className="notification-action primary-button" disabled={requesting || permission === "unsupported" || permission === "denied"} onClick={() => void enable()}>
              <Check size={15} /> {requesting ? "Connecting this device…" : permission === "denied" ? "Blocked in browser settings" : "Allow background alerts"}
            </button>}
          <small className="notification-footnote">{isSignedIn ? "Alerts are delivered by Wave Tune through your browser’s push service. You can disconnect this device at any time." : "Activity updates are saved on this device. Sign in to sync music and receive alerts when the app is closed."}</small>
          </motion.section>
        </motion.div>}
      </AnimatePresence>,
      document.body,
    )}
  </>;
}
