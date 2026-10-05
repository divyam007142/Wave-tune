import type { SearchResult, Track } from "../types/music";
import { youtubePlaybackProvider } from "./youtube";

function toTrack(result: Awaited<ReturnType<typeof youtubePlaybackProvider.search>>[number]): Track {
  return {
    id: result.videoId,
    youtubeVideoId: result.videoId,
    title: result.title,
    artist: result.uploader || "Unknown artist",
    album: "YouTube",
    duration: result.duration,
    artwork: result.thumbnail,
    accent: "#557c48",
    source: "catalog",
  };
}

async function search(query: string, signal?: AbortSignal): Promise<SearchResult> {
  const results = await youtubePlaybackProvider.search(query, signal);
  return {
    tracks: results.map(toTrack),
    albums: [],
    artists: [],
    playlists: [],
  };
}

export const catalogService = {
  async trending() {
    const result = await search("trending songs official audio");
    return { tracks: result.tracks };
  },

  search,
};
