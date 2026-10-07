export const notificationPreferenceKey = "wave-tune:notifications";
const streakStorageKey = "wave-tune:wave-streak";

type StoredStreak = { day: string; count: number };

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

export async function showWaveNotification(
  title: string,
  body: string,
  tag: string,
  icon = "/favicon.svg",
) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  try {
    if (localStorage.getItem(notificationPreferenceKey) !== "on") return false;
  } catch {
    return false;
  }

  const options: NotificationOptions = { body, icon, badge: "/favicon.svg", tag };
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
