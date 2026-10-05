import type { Track } from "../types/music";

export type YouTubeSearchResult = {
  videoId: string;
  title: string;
  uploader: string;
  url: string;
  duration: number;
  thumbnail: string;
};

type YouTubeSearchResponse = { results?: YouTubeSearchResult[] };

function apiUrl(path: string) {
  return path;
}

export class YouTubePlaybackProvider {
  private readonly candidates = new Map<string, YouTubeSearchResult[]>();
  private readonly pendingSearches = new Map<string, Promise<YouTubeSearchResult[]>>();

  async search(query: string, signal?: AbortSignal): Promise<YouTubeSearchResult[]> {
    const response = await fetch(apiUrl(`/api/youtube/search?q=${encodeURIComponent(query)}`), { signal });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || `YouTube search failed with ${response.status}`);
    }
    const data = (await response.json()) as YouTubeSearchResponse;
    return data.results ?? [];
  }

  async resolveTrack(track: Track, excludedVideoIds: string[] = []): Promise<{ youtubeVideoId: string }> {
    if (track.youtubeVideoId && /^[\w-]{11}$/.test(track.youtubeVideoId) && !excludedVideoIds.includes(track.youtubeVideoId)) {
      return { youtubeVideoId: track.youtubeVideoId };
    }

    let candidates = this.candidates.get(track.id);
    if (!candidates) {
      let pending = this.pendingSearches.get(track.id);
      if (!pending) {
        pending = this.search(`${track.title} ${track.artist} official audio`);
        this.pendingSearches.set(track.id, pending);
      }
      try {
        candidates = await pending;
      } finally {
        if (this.pendingSearches.get(track.id) === pending) this.pendingSearches.delete(track.id);
      }
      this.candidates.set(track.id, candidates);
    }
    const result = candidates.find((candidate) => !excludedVideoIds.includes(candidate.videoId));
    if (!result) throw new Error(`No playable YouTube result found for ${track.title}.`);
    return { youtubeVideoId: result.videoId };
  }

  async getStreamUrl(videoId: string): Promise<string> {
    const response = await fetch(apiUrl(`/api/stream/${encodeURIComponent(videoId)}`));
    const data = (await response.json().catch(() => null)) as { audioUrl?: unknown; error?: string } | null;
    if (!response.ok) {
      throw new Error(data?.error || `Audio stream request failed with ${response.status}`);
    }
    if (typeof data?.audioUrl !== "string" || !data.audioUrl) {
      throw new Error("The audio service returned no playable stream.");
    }
    return data.audioUrl;
  }
}

export const youtubePlaybackProvider = new YouTubePlaybackProvider();
