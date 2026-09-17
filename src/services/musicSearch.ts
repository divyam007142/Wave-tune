import type { SearchResult } from "../types/music";

export type MusicSearchProvider = {
  search(query: string): Promise<SearchResult>;
};
