import type { SearchResult, Track } from "../types/music";

async function search(query: string, signal?: AbortSignal): Promise<SearchResult> {
  const response = await fetch(`/api/catalog/search?q=${encodeURIComponent(query)}`, { signal });
  const result = await response.json().catch(() => ({})) as SearchResult & { error?: string };
  if (!response.ok) {
    throw new Error(result.error || `Catalog search failed with ${response.status}.`);
  }
  return {
    tracks: Array.isArray(result.tracks) ? result.tracks : [],
    albums: Array.isArray(result.albums) ? result.albums : [],
    artists: Array.isArray(result.artists) ? result.artists : [],
    playlists: Array.isArray(result.playlists) ? result.playlists : [],
  };
}

export const catalogService = {
  async trending() {
    const response = await fetch("/api/catalog/trending");
    const result = await response.json().catch(() => ({})) as { tracks?: Track[]; error?: string };
    if (!response.ok) {
      throw new Error(result.error || `Trending songs failed with ${response.status}.`);
    }
    return { tracks: Array.isArray(result.tracks) ? result.tracks : [] };
  },

  async recommendations(input: {
    currentTrack?: Track | null;
    likedTracks?: Track[];
    recentTracks?: Track[];
    excludeIds?: string[];
  }) {
    const response = await fetch("/api/catalog/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => ({})) as { tracks?: Track[]; error?: string };
    if (!response.ok) {
      throw new Error(result.error || `Recommendations failed with ${response.status}.`);
    }
    return { tracks: Array.isArray(result.tracks) ? result.tracks : [] };
  },

  search,
};
