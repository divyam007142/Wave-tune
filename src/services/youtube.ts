import type { Track } from "../types/music";

export type YouTubeSearchResult = {
  id: string;
  title: string;
  url: string;
  duration: number;
  artwork: string;
};

type YouTubeSearchResponse = { results?: YouTubeSearchResult[] };

export class YouTubePlaybackProvider {
  private readonly cache = new Map<string, YouTubeSearchResult>();

  async search(query: string): Promise<YouTubeSearchResult[]> {
    const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) throw new Error(`YouTube search failed with ${response.status}`);
    const data = (await response.json()) as YouTubeSearchResponse;
    return data.results ?? [];
  }

  async resolveTrack(track: Track): Promise<{ audioUrl: string; youtubeVideoId: string }> {
    const cached = this.cache.get(track.id);
    const result = cached ?? (await this.search(`${track.title} ${track.artist} official audio`))[0];
    if (!result) throw new Error(`No playable YouTube result found for ${track.title}.`);
    this.cache.set(track.id, result);
    return {
      audioUrl: `/api/youtube/stream?videoId=${encodeURIComponent(result.id)}`,
      youtubeVideoId: result.id,
    };
  }
}

export const youtubePlaybackProvider = new YouTubePlaybackProvider();
