import { playlists } from "../data/catalog";
import type { SearchResult } from "../types/music";

export type MusicSearchProvider = {
  search(query: string): Promise<SearchResult>;
};

type ITunesResult = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
};

export class ITunesSearchProvider implements MusicSearchProvider {
  async search(query: string): Promise<SearchResult> {
    const normalized = query.trim();
    if (!normalized) return { tracks: [], albums: [], artists: [], playlists: [] };
    const response = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(normalized)}&media=music&entity=song&limit=24`,
    );
    if (!response.ok) throw new Error(`Music search failed with ${response.status}`);
    const data = (await response.json()) as { results?: ITunesResult[] };
    const results = (data.results ?? []).filter((result) => result.trackId && result.trackName && result.previewUrl);
    const tracks = results.map((result) => ({
      id: `itunes-${result.trackId}`,
      title: result.trackName ?? "Untitled track",
      artist: result.artistName ?? "Unknown artist",
      album: result.collectionName ?? "Single",
      duration: Math.round((result.trackTimeMillis ?? 0) / 1000),
      artwork: (result.artworkUrl100 ?? "").replace("100x100", "600x600"),
      accent: "#c5f269",
      audioUrl: result.previewUrl,
      source: "catalog" as const,
    }));
    const albums = tracks
      .map((track) => ({ id: track.album, name: track.album, artist: track.artist, artwork: track.artwork }))
      .filter((album, index, list) => list.findIndex((item) => item.id === album.id) === index)
      .slice(0, 8);
    const artists = tracks
      .map((track) => ({ id: track.artist, name: track.artist, artwork: track.artwork }))
      .filter((artist, index, list) => list.findIndex((item) => item.id === artist.id) === index)
      .slice(0, 8);
    return { tracks, albums, artists, playlists };
  }
}

export const musicSearch = new ITunesSearchProvider();