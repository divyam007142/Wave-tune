import type { Track } from "../src/types/music";

export type DailyListeningRecord = {
  accountId: string;
  day: string;
  trackId: string;
  track: Track;
  seconds: number;
  plays: number;
};

export type TimeCapsuleStats = {
  days: number;
  timeZone: string;
  today: string;
  startDay: string;
  allTimeSeconds: number;
  periodSeconds: number;
  todaySeconds: number;
  totalPlays: number;
  repeats: number;
  activeDays: number;
  currentStreak: number;
  daily: { day: string; seconds: number; plays: number }[];
  mostPlayed: (Track & { plays: number; repeats: number; seconds: number }) | null;
  topTracks: (Track & { plays: number; repeats: number; seconds: number })[];
};

export function normalizeTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "UTC";
  const candidate = value.trim().slice(0, 100);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return "UTC";
  }
}

export function dayKeyAt(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function shiftDayKey(day: string, offset: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + offset)).toISOString().slice(0, 10);
}

export function buildTimeCapsuleStats({
  records,
  days,
  timeZone,
  today,
  allTimeSeconds,
}: {
  records: DailyListeningRecord[];
  days: number;
  timeZone: string;
  today: string;
  allTimeSeconds: number;
}): TimeCapsuleStats {
  const periodDays = days === 7 ? 7 : 30;
  const startDay = shiftDayKey(today, 1 - periodDays);
  const dailyByDay = new Map<string, { day: string; seconds: number; plays: number }>();
  for (let offset = 0; offset < periodDays; offset += 1) {
    const day = shiftDayKey(startDay, offset);
    dailyByDay.set(day, { day, seconds: 0, plays: 0 });
  }

  const trackTotals = new Map<string, {
    track: Track;
    plays: number;
    seconds: number;
  }>();
  for (const record of records) {
    if (!dailyByDay.has(record.day)) continue;
    const seconds = Math.max(0, Math.floor(Number(record.seconds) || 0));
    const plays = Math.max(0, Math.floor(Number(record.plays) || 0));
    const day = dailyByDay.get(record.day)!;
    day.seconds += seconds;
    day.plays += plays;

    const aggregate = trackTotals.get(record.trackId) ?? {
      track: record.track,
      plays: 0,
      seconds: 0,
    };
    aggregate.plays += plays;
    aggregate.seconds += seconds;
    trackTotals.set(record.trackId, aggregate);
  }

  const daily = [...dailyByDay.values()];
  const periodSeconds = daily.reduce((total, entry) => total + entry.seconds, 0);
  const todaySeconds = dailyByDay.get(today)?.seconds ?? 0;
  const totalPlays = daily.reduce((total, entry) => total + entry.plays, 0);
  const rankedTracks = [...trackTotals.values()].sort(
    (left, right) => right.plays - left.plays || right.seconds - left.seconds,
  );
  const topTracks = rankedTracks.slice(0, 5).map(({ track, plays, seconds }) => ({
    ...track,
    plays,
    repeats: Math.max(0, plays - 1),
    seconds,
  }));

  const activeDays = daily.filter((entry) => entry.seconds > 0 || entry.plays > 0).length;
  let currentStreak = 0;
  let streakDay = dailyByDay.get(today)?.seconds || dailyByDay.get(today)?.plays
    ? today
    : shiftDayKey(today, -1);
  while (dailyByDay.has(streakDay)) {
    const entry = dailyByDay.get(streakDay)!;
    if (entry.seconds <= 0 && entry.plays <= 0) break;
    currentStreak += 1;
    streakDay = shiftDayKey(streakDay, -1);
  }

  return {
    days: periodDays,
    timeZone,
    today,
    startDay,
    allTimeSeconds: Math.max(0, Math.floor(allTimeSeconds)),
    periodSeconds,
    todaySeconds,
    totalPlays,
    repeats: rankedTracks.reduce((total, entry) => total + Math.max(0, entry.plays - 1), 0),
    activeDays,
    currentStreak,
    daily,
    mostPlayed: topTracks[0] ?? null,
    topTracks,
  };
}
