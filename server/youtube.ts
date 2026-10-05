import ytdlp from "youtube-dl-exec";

export type YouTubeResult = {
  videoId: string;
  title: string;
  uploader: string;
  artist: string;
  url: string;
  duration: number;
  thumbnail: string;
};

type SearchEntry = {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  artist?: string;
  creator?: string;
  duration?: number;
  thumbnail?: string;
  thumbnails?: { url?: string; preference?: number }[];
  webpage_url?: string;
  url?: string;
};

type SearchPayload = { entries?: SearchEntry[] };
type CacheEntry<T> = { value: T; expiresAt: number };

const SEARCH_TTL_MS = 5 * 60_000;
const STREAM_TTL_MS = 4 * 60_000;
const searchCache = new Map<string, CacheEntry<YouTubeResult[]>>();
const streamCache = new Map<string, CacheEntry<string>>();
const pendingSearches = new Map<string, Promise<YouTubeResult[]>>();
const pendingStreams = new Map<string, Promise<string>>();
const compilationTitle = /\b(?:playlist|jukebox|medley|compilation|full album|full movie|non[\s-]?stop|greatest hits|top\s+\d+\s+(?:songs|hits|tracks)|\d{2}s?\s+(?:songs|hits))\b/i;

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T, ttl: number) {
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

function validVideoId(value: string) {
  return /^[\w-]{11}$/.test(value);
}

function thumbnailFrom(entry: SearchEntry) {
  const thumbnails = [...(entry.thumbnails ?? [])].sort(
    (left, right) => (right.preference ?? 0) - (left.preference ?? 0),
  );
  const candidate = entry.thumbnail || thumbnails[0]?.url || "";
  try {
    return new URL(candidate).protocol === "https:" ? candidate : "";
  } catch {
    return "";
  }
}

async function searchYouTubeUncached(query: string): Promise<YouTubeResult[]> {
  const payload = await ytdlp(`ytsearch10:${query}`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    noProgress: true,
    quiet: true,
  }, { timeout: 25_000 }) as unknown as SearchPayload;

  return (payload.entries ?? []).flatMap((entry) => {
    const videoId = entry.id?.trim() ?? "";
    const title = entry.title?.trim().slice(0, 200) ?? "";
    if (!validVideoId(videoId) || !title) return [];
    const uploader = (entry.artist || entry.uploader || entry.channel || entry.creator || "Unknown artist")
      .trim()
      .slice(0, 160);
    const suppliedUrl = entry.webpage_url || entry.url || `https://www.youtube.com/watch?v=${videoId}`;
    let url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      const parsed = new URL(suppliedUrl);
      if (parsed.protocol === "https:" && ["youtube.com", "www.youtube.com", "music.youtube.com", "youtu.be"].includes(parsed.hostname)) {
        url = parsed.toString();
      }
    } catch {
      // Use the canonical YouTube video URL when yt-dlp omits or mangles it.
    }
    return [{
      videoId,
      title,
      uploader,
      artist: uploader,
      url,
      duration: Number.isFinite(entry.duration) ? Math.max(0, Math.round(entry.duration!)) : 0,
      thumbnail: thumbnailFrom(entry),
    }];
  });
}

export async function searchYouTube(query: string): Promise<YouTubeResult[]> {
  const normalizedQuery = query.trim().slice(0, 160);
  if (!normalizedQuery) return [];
  const cacheKey = normalizedQuery.toLocaleLowerCase();
  const cached = readCache(searchCache, cacheKey);
  if (cached) return cached;

  let pending = pendingSearches.get(cacheKey);
  if (!pending) {
    pending = searchYouTubeUncached(normalizedQuery);
    pendingSearches.set(cacheKey, pending);
  }
  try {
    const results = await pending;
    writeCache(searchCache, cacheKey, results, SEARCH_TTL_MS);
    return results;
  } finally {
    if (pendingSearches.get(cacheKey) === pending) pendingSearches.delete(cacheKey);
  }
}

export function selectTrendingSongs(results: YouTubeResult[]): YouTubeResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    if (
      !validVideoId(result.videoId)
      || result.duration < 45
      || result.duration > 600
      || compilationTitle.test(result.title)
      || seen.has(result.videoId)
    ) return false;
    seen.add(result.videoId);
    return true;
  }).slice(0, 10);
}

export async function getTrendingYouTube(): Promise<YouTubeResult[]> {
  const year = new Date().getUTCFullYear();
  const [trendingResults, newSongResults] = await Promise.all([
    searchYouTube("trending songs official music video"),
    searchYouTube(`new songs official music video ${year}`),
  ]);
  return selectTrendingSongs([...trendingResults, ...newSongResults]);
}

async function resolveStreamUncached(videoId: string): Promise<string> {
  const output = await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
    format: "bestaudio/best",
    getUrl: true,
    noPlaylist: true,
    noWarnings: true,
    noProgress: true,
    quiet: true,
  }, { timeout: 25_000 }) as unknown as string;

  const streamUrl = output.trim().split(/\r?\n/)[0] ?? "";
  let parsed: URL;
  try {
    parsed = new URL(streamUrl);
  } catch {
    throw new Error("yt-dlp did not return a usable audio stream.");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".googlevideo.com")) {
    throw new Error("yt-dlp returned an unsupported audio stream host.");
  }
  return parsed.toString();
}

export async function getYouTubeStream(videoId: string): Promise<string> {
  if (!validVideoId(videoId)) throw new Error("That YouTube video ID is invalid.");
  const cached = readCache(streamCache, videoId);
  if (cached) return cached;

  let pending = pendingStreams.get(videoId);
  if (!pending) {
    pending = resolveStreamUncached(videoId);
    pendingStreams.set(videoId, pending);
  }
  try {
    const streamUrl = await pending;
    writeCache(streamCache, videoId, streamUrl, STREAM_TTL_MS);
    return streamUrl;
  } finally {
    if (pendingStreams.get(videoId) === pending) pendingStreams.delete(videoId);
  }
}
