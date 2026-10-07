export const GUEST_DAILY_SONG_LIMIT = 5;

export type GuestListeningDay = {
  day: string;
  trackIds: string[];
};

export function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function currentGuestListeningDay(value: unknown, date = new Date()): GuestListeningDay {
  const today = localDayKey(date);
  if (!value || typeof value !== "object") return { day: today, trackIds: [] };
  const stored = value as Partial<GuestListeningDay>;
  if (stored.day !== today || !Array.isArray(stored.trackIds)) return { day: today, trackIds: [] };
  return {
    day: today,
    trackIds: [...new Set(stored.trackIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
      .slice(0, GUEST_DAILY_SONG_LIMIT),
  };
}

export function canGuestPlayTrack(day: GuestListeningDay, trackId: string) {
  return day.trackIds.includes(trackId) || day.trackIds.length < GUEST_DAILY_SONG_LIMIT;
}

export function recordGuestTrack(day: GuestListeningDay, trackId: string, date = new Date()) {
  const current = currentGuestListeningDay(day, date);
  if (current.trackIds.includes(trackId) || current.trackIds.length >= GUEST_DAILY_SONG_LIMIT) return current;
  return { ...current, trackIds: [...current.trackIds, trackId] };
}
