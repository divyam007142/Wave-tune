import type { Track } from "../types/music";

export type YouTubeSearchResult = {
  id: string;
  title: string;
  url: string;
  duration: number;
  artwork: string;
};

type YouTubeSearchResponse = { results?: YouTubeSearchResult[] };

function apiUrl(path: string) {
  return path;
}

export class YouTubePlaybackProvider {
  private readonly candidates = new Map<string, YouTubeSearchResult[]>();
  private readonly pendingSearches = new Map<string, Promise<YouTubeSearchResult[]>>();

  async search(query: string): Promise<YouTubeSearchResult[]> {
    const response = await fetch(apiUrl(`/api/youtube/search?q=${encodeURIComponent(query)}`));
    if (!response.ok) throw new Error(`YouTube search failed with ${response.status}`);
    const data = (await response.json()) as YouTubeSearchResponse;
    return data.results ?? [];
  }

  async resolveTrack(track: Track, excludedVideoIds: string[] = []): Promise<{ youtubeVideoId: string }> {
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
    const result = candidates.find((candidate) => !excludedVideoIds.includes(candidate.id));
    if (!result) throw new Error(`No playable YouTube result found for ${track.title}.`);
    return { youtubeVideoId: result.id };
  }
}

export const youtubePlaybackProvider = new YouTubePlaybackProvider();
