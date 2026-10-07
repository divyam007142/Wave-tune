import type { Playlist, Track } from "../types/music";

export type AppProfile = {
  id: string;
  name: string;
  nickname?: string;
  email?: string;
  image?: string;
  totalListeningSeconds: number;
};

export type ListenerStats = {
  id: string;
  name: string;
  nickname?: string;
  image?: string;
  totalListeningSeconds: number;
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type AccountSnapshot = {
  profile: AppProfile;
  playlists: Playlist[];
  likedTracks: Track[];
  recentTracks: Track[];
};

export type TimeCapsuleStats = {
  days: 7 | 30;
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

function localTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Account request failed (${response.status}).`);
  }
  return payload as T;
}

export const accountService = {
  getSnapshot() {
    return request<AccountSnapshot>("/api/account/snapshot");
  },

  savePlayback(track: Track, seconds: number) {
    return request<{ ok: true }>("/api/account/playback", {
      method: "POST",
      body: JSON.stringify({ track, seconds, timeZone: localTimeZone() }),
    });
  },

  getTimeCapsule(days: 7 | 30) {
    const params = new URLSearchParams({ days: String(days), timeZone: localTimeZone() });
    return request<TimeCapsuleStats>(`/api/account/time-capsule?${params}`);
  },

  updateProfile(nickname: string, image?: string) {
    return request<{ profile: AppProfile }>("/api/account/profile", {
      method: "PUT",
      body: JSON.stringify({ nickname, ...(image !== undefined ? { image } : {}) }),
    });
  },

  updatePresence(isOnline: boolean, keepalive = false) {
    return request<{ ok: true }>("/api/account/presence", {
      method: "POST",
      keepalive,
      body: JSON.stringify({ isOnline }),
    });
  },

  getListenerStats() {
    return request<{ listeners: ListenerStats[] }>("/api/account/listeners");
  },

  removeRecentTrack(trackId: string) {
    return request<{ ok: true }>(`/api/account/recent/${encodeURIComponent(trackId)}`, {
      method: "DELETE",
    });
  },

  toggleLike(track: Track) {
    return request<{ liked: boolean }>("/api/account/likes", {
      method: "POST",
      body: JSON.stringify({ track }),
    });
  },

  createPlaylist(name: string, description: string) {
    return request<{ playlist: Playlist }>("/api/account/playlists", {
      method: "POST",
      body: JSON.stringify({ name, description }),
    });
  },

  addToPlaylist(playlistId: string, track: Track) {
    return request<{ playlist: Playlist }>(`/api/account/playlists/${encodeURIComponent(playlistId)}/tracks`, {
      method: "POST",
      body: JSON.stringify({ track }),
    });
  },

  deletePlaylist(playlistId: string) {
    return request<{ ok: true }>(`/api/account/playlists/${encodeURIComponent(playlistId)}`, {
      method: "DELETE",
    });
  },
};
