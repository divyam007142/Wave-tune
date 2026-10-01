import type { SearchResult, Track } from "../types/music";

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", signal });
  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `Music catalog request failed (${response.status}).`);
  }
  return payload as T;
}

export const catalogService = {
  trending() {
    return request<{ tracks: Track[] }>("/api/catalog/trending");
  },

  search(query: string, signal?: AbortSignal) {
    return request<SearchResult>(`/api/catalog/search?q=${encodeURIComponent(query)}`, signal);
  },
};
