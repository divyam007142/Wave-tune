export const notificationPreferenceKey = "wave-tune:notifications";
const streakStorageKey = "wave-tune:wave-streak";
let pushSubscriptionRequest: Promise<PushSubscription> | null = null;

type StoredStreak = { day: string; count: number };

export type WavePushEvent = {
  type: "track" | "streak";
  title: string;
  body: string;
  tag?: string;
  artwork?: string;
};

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function previousLocalDay(date = new Date()) {
  const previous = new Date(date);
  previous.setDate(previous.getDate() - 1);
  return localDayKey(previous);
}

export function recordListeningStreak(date = new Date()) {
  const today = localDayKey(date);
  let previous: StoredStreak | null = null;
  try {
    const raw = localStorage.getItem(streakStorageKey);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredStreak>;
      if (typeof parsed.day === "string" && Number.isInteger(parsed.count) && (parsed.count ?? 0) > 0) {
        previous = { day: parsed.day, count: parsed.count as number };
      }
    }
  } catch {
    // Continue this listening session even when browser storage is unavailable.
  }

  if (previous?.day === today) return { day: today, count: previous.count, startedToday: false };
  const count = previous?.day === previousLocalDay(date) ? previous.count + 1 : 1;
  try {
    localStorage.setItem(streakStorageKey, JSON.stringify({ day: today, count }));
  } catch {
    // Notifications and playback should still work for this session.
  }
  return { day: today, count, startedToday: true };
}

export async function registerNotificationServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/notification-sw.js", { scope: "/" });
}

function applicationServerKey(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function createOrSyncPushSubscription() {
  if (typeof window === "undefined" || !("Notification" in window)
    || !("PushManager" in window) || !("serviceWorker" in navigator)) {
    throw new Error("This browser cannot receive background push notifications.");
  }
  if (!window.isSecureContext) throw new Error("Background alerts need Wave Tune to be opened securely over HTTPS.");
  if (Notification.permission !== "granted") throw new Error("Allow browser notifications before turning on alerts.");

  await registerNotificationServiceWorker();
  const registration = await navigator.serviceWorker.ready;
  const keyResponse = await fetch("/api/push/public-key", { credentials: "same-origin" });
  const keyPayload = await keyResponse.json().catch(() => ({})) as { publicKey?: string; error?: string };
  if (!keyResponse.ok || !keyPayload.publicKey) {
    throw new Error(keyPayload.error || "Background notifications are not configured on this server.");
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(keyPayload.publicKey),
    });
  }

  const response = await fetch("/api/push/subscriptions", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || "Wave Tune could not save this device for background alerts.");
  }
  return subscription;
}

export function enableWavePushNotifications() {
  if (!pushSubscriptionRequest) {
    pushSubscriptionRequest = createOrSyncPushSubscription().finally(() => {
      pushSubscriptionRequest = null;
    });
  }
  return pushSubscriptionRequest;
}

export async function disableWavePushNotifications() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const registration = await navigator.serviceWorker.getRegistration("/");
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      let requestError: Error | null = null;
      try {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        const payload = await response.json().catch(() => ({})) as { error?: string };
        if (!response.ok) requestError = new Error(payload.error || "Wave Tune could not remove this device.");
      } catch {
        requestError = new Error("Wave Tune could not reach the server to remove this device.");
      }
      await subscription.unsubscribe();
      try {
        localStorage.removeItem(notificationPreferenceKey);
      } catch {
        // The device subscription is already removed.
      }
      if (requestError) throw requestError;
      return;
    }
  }
  try {
    localStorage.removeItem(notificationPreferenceKey);
  } catch {
    // Browser permission can still be turned off for this visit.
  }
}

export async function sendWavePushEvent(event: WavePushEvent) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return false;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return false;
  const response = await fetch("/api/push/events", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(payload.error || "Wave Tune could not deliver this alert.");
  return true;
}

export async function showWaveNotification(
  title: string,
  body: string,
  tag: string,
  icon = "/wave-tune-icon-192.png",
) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    if (localStorage.getItem(notificationPreferenceKey) !== "on") return false;
  } catch {
    return false;
  }

  const options: NotificationOptions = { body, icon, badge: "/wave-tune-icon-192.png", tag };
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (registration) {
        await registration.showNotification(title, options);
        return true;
      }
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
