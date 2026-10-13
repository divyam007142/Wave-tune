import ytdlp from "youtube-dl-exec";
import play from "play-dl";

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
  durationInSec?: number;
  thumbnail?: string;
  thumbnails?: { url?: string; preference?: number }[];
  webpage_url?: string;
  url?: string;
};

type SearchPayload = { entries?: SearchEntry[] };
type CacheEntry<T> = { value: T; expiresAt: number; staleUntil: number };
export type RecommendationSeed = { title: string; artist: string; id?: string };

const SEARCH_TTL_MS = 5 * 60_000;
const SEARCH_STALE_TTL_MS = 60 * 60_000;
const STREAM_TTL_MS = 4 * 60_000;
const YTDLP_SEARCH_TIMEOUT_MS = 15_000;
const YTDLP_STREAM_TIMEOUT_MS = 12_000;
const searchCache = new Map<string, CacheEntry<YouTubeResult[]>>();
const streamCache = new Map<string, CacheEntry<string>>();
const pendingSearches = new Map<string, Promise<YouTubeResult[]>>();
const pendingStreams = new Map<string, Promise<string>>();
const compilationTitle = /\b(?:playlist|jukebox|medley|compilation|full album|full movie|non[\s-]?stop|greatest hits|top\s+\d+\s+(?:songs|hits|tracks)|\d{2}s?\s+(?:songs|hits))\b/i;

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.staleUntil <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.expiresAt > Date.now() ? entry.value : undefined;
}

function readStaleSearchCache(key: string) {
  const entry = searchCache.get(key);
  return entry && entry.expiresAt <= Date.now() && entry.staleUntil > Date.now()
    ? entry.value
    : undefined;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttl: number,
  staleTtl = ttl,
) {
  if (cache.size >= 500) cache.delete(cache.keys().next().value!);
  const now = Date.now();
  cache.set(key, { value, expiresAt: now + ttl, staleUntil: now + Math.max(ttl, staleTtl) });
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

function normalizeSearchEntry(entry: SearchEntry): YouTubeResult[] {
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
    // Use the canonical YouTube URL when a provider omits or mangles the link.
  }
  return [{
    videoId,
    title,
    uploader,
    artist: uploader,
    url,
    duration: Number.isFinite(entry.durationInSec)
      ? Math.max(0, Math.round(entry.durationInSec!))
      : Number.isFinite(entry.duration) ? Math.max(0, Math.round(entry.duration!)) : 0,
    thumbnail: thumbnailFrom(entry),
  }];
}

async function searchYouTubeWithPlayDl(query: string): Promise<YouTubeResult[]> {
  const entries = await play.search(query, {
    limit: 15,
    source: { youtube: "video" },
  });
  return entries.flatMap((entry) => normalizeSearchEntry({
    id: entry.id,
    title: entry.title,
    channel: entry.channel?.name,
    durationInSec: entry.durationInSec,
    thumbnail: entry.thumbnails?.at(-1)?.url,
    thumbnails: entry.thumbnails,
    url: entry.url,
  }));
}

async function searchYouTubeWithYtDlp(query: string): Promise<YouTubeResult[]> {
  const payload = await ytdlp(`ytsearch15:${query}`, {
    dumpSingleJson: true,
    flatPlaylist: true,
    skipDownload: true,
    noWarnings: true,
    noProgress: true,
    quiet: true,
  }, { timeout: YTDLP_SEARCH_TIMEOUT_MS }) as unknown as SearchPayload;

  return (payload.entries ?? []).flatMap(normalizeSearchEntry);
}

async function searchYouTubeUncached(query: string): Promise<YouTubeResult[]> {
  try {
    return await searchYouTubeWithPlayDl(query);
  } catch (primaryError) {
    try {
      const fallbackResults = await searchYouTubeWithYtDlp(query);
      if (fallbackResults.length) return fallbackResults;
    } catch (fallbackError) {
      throw new AggregateError(
        [primaryError, fallbackError],
        "Both in-process and yt-dlp YouTube search providers failed.",
      );
    }
    throw primaryError;
  }
}

export async function searchYouTube(query: string): Promise<YouTubeResult[]> {
  const normalizedQuery = query.trim().slice(0, 160);
  if (!normalizedQuery) return [];
  const cacheKey = normalizedQuery.toLocaleLowerCase();
  const cached = readCache(searchCache, cacheKey);
  if (cached) return cached;
  const stale = readStaleSearchCache(cacheKey);

  let pending = pendingSearches.get(cacheKey);
  if (!pending) {
    pending = searchYouTubeUncached(normalizedQuery);
    pendingSearches.set(cacheKey, pending);
  }
  try {
    const results = await pending;
    writeCache(searchCache, cacheKey, results, SEARCH_TTL_MS, SEARCH_STALE_TTL_MS);
    return results;
  } catch (error) {
    if (stale) return stale;
    throw error;
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
  }).slice(0, 20);
}

export function buildCatalogSearchQueries(query: string): string[] {
  const normalized = query.trim().replace(/\s+/g, " ").slice(0, 160);
  if (!normalized) return [];
  const hasQuotedPhrase = /["“”]/.test(normalized);
  const lyricLike = hasQuotedPhrase
    || /\b(?:lyrics?|chorus|verse)\b/i.test(normalized)
    || (normalized.split(" ").length >= 7 && /\b(?:i|you|me|my|your|we|the|when|where|and|are|was|with)\b/i.test(normalized));
  const variants = lyricLike
    ? [`${normalized} lyrics`, `${normalized} song name`]
    : [`${normalized} song`, `${normalized} official music video`];
  return [...new Set([normalized, ...variants.map((value) => value.slice(0, 160))])];
}

export async function searchCatalogYouTube(query: string): Promise<YouTubeResult[]> {
  const queries = buildCatalogSearchQueries(query);
  if (!queries.length) return [];
  const results: YouTubeResult[] = [];
  const failures: unknown[] = [];
  for (const searchQuery of queries) {
    try {
      results.push(...await searchYouTube(searchQuery));
    } catch (error) {
      failures.push(error);
      if (!results.length && searchQuery === queries[0]) continue;
    }
    if (results.length >= 15) break;
  }
  if (!results.length && failures.length) {
    throw new AggregateError(failures, "All YouTube catalog search attempts failed.");
  }
  const seen = new Set<string>();
  return results.filter((result) => {
    if (!validVideoId(result.videoId) || !result.title.trim() || seen.has(result.videoId)) return false;
    seen.add(result.videoId);
    return true;
  }).slice(0, 30);
}

export function buildRecommendationQueries({
  currentTrack,
  likedTracks,
  recentTracks,
}: {
  currentTrack?: RecommendationSeed | null;
  likedTracks?: RecommendationSeed[];
  recentTracks?: RecommendationSeed[];
}) {
  const artists = new Map<string, { name: string; score: number }>();
  const addArtist = (seed: RecommendationSeed, score: number) => {
    const name = seed.artist.trim().slice(0, 100);
    if (!name || name.toLowerCase() === "unknown artist") return;
    const key = name.toLocaleLowerCase();
    const previous = artists.get(key);
    artists.set(key, { name, score: (previous?.score ?? 0) + score });
  };
  for (const track of likedTracks ?? []) addArtist(track, 3);
  for (const track of recentTracks ?? []) addArtist(track, 1);
  if (currentTrack) addArtist(currentTrack, 4);

  const queries: string[] = [];
  if (currentTrack?.title && currentTrack.artist) {
    queries.push(`${currentTrack.title} ${currentTrack.artist} similar songs`);
  }
  const topArtists = [...artists.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 2);
  for (const artist of topArtists) {
    queries.push(`${artist.name} popular songs official music`);
  }
  if (!queries.length && (recentTracks?.length || likedTracks?.length)) {
    const seed = [...(likedTracks ?? []), ...(recentTracks ?? [])][0];
    if (seed) queries.push(`${seed.title} ${seed.artist} similar songs`);
  }
  return [...new Set(queries.map((query) => query.trim().slice(0, 160)))].slice(0, 3);
}

export async function getRecommendedYouTube({
  currentTrack,
  likedTracks = [],
  recentTracks = [],
  excludeIds = [],
}: {
  currentTrack?: RecommendationSeed | null;
  likedTracks?: RecommendationSeed[];
  recentTracks?: RecommendationSeed[];
  excludeIds?: string[];
}): Promise<YouTubeResult[]> {
  const queries = buildRecommendationQueries({ currentTrack, likedTracks, recentTracks });
  if (!queries.length) return getTrendingYouTube();

  const settled = await Promise.allSettled(queries.map(searchYouTube));
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const excluded = new Set(excludeIds);
  let recommendations = selectTrendingSongs(results).filter((track) => !excluded.has(track.videoId));
  if (recommendations.length < 8) {
    try {
      const trending = await getTrendingYouTube();
      recommendations = selectTrendingSongs([...recommendations, ...trending])
        .filter((track) => !excluded.has(track.videoId));
    } catch {
      // A useful personalized result is still returned when the fallback catalog is unavailable.
    }
  }
  if (!recommendations.length && settled.every((result) => result.status === "rejected")) {
    throw settled.find((result) => result.status === "rejected")?.reason;
  }
  return recommendations.slice(0, 20);
}

export async function getTrendingYouTube(): Promise<YouTubeResult[]> {
  const year = new Date().getUTCFullYear();
  const settled = await Promise.allSettled([
    searchYouTube("trending songs official music video"),
    searchYouTube(`new songs official music video ${year}`),
    searchYouTube("trending Indian songs official music video"),
  ]);
  const results = settled.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  if (!results.length) {
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
  }
  return selectTrendingSongs(results);
}

async function resolveStreamUncached(videoId: string): Promise<string> {
  let output = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      output = await ytdlp(`https://www.youtube.com/watch?v=${videoId}`, {
        format: "bestaudio/best",
        getUrl: true,
        noPlaylist: true,
        noWarnings: true,
        noProgress: true,
        quiet: true,
      }, { timeout: YTDLP_STREAM_TIMEOUT_MS }) as unknown as string;
      break;
    } catch (error) {
      const details = error && typeof error === "object"
        ? error as { name?: string; message?: string; stderr?: string }
        : {};
      const failure = `${details.name ?? ""} ${details.message ?? ""} ${details.stderr ?? ""}`;
      const retryable = details.name === "ChildProcessError"
        || /timed?\s*out|ETIMEDOUT|ECONNRESET|EAI_AGAIN|socket hang up|HTTP Error (?:429|5\d\d)/i.test(failure);
      if (attempt > 0 || !retryable) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

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
