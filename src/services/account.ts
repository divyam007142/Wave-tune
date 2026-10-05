import type { Playlist, Track } from "../types/music";

export type AppProfile = {
  id: string;
  name: string;
  email?: string;
  image?: string;
  totalListeningSeconds: number;
};

export type AccountSnapshot = {
  profile: AppProfile;
  playlists: Playlist[];
  likedTracks: Track[];
  recentTracks: Track[];
};

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
      body: JSON.stringify({ track, seconds }),
    });
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
