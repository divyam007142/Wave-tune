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
  thumbnails?: {
    url?: string;
    preference?: number;
  }[];
  webpage_url?: string;
  url?: string;
};

type SearchPayload = {
  entries?: SearchEntry[];
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export type RecommendationSeed = {
  title: string;
  artist: string;
  id?: string;
};


/* -------------------------------------------------------------------------- */
/*                                   CACHE                                    */
/* -------------------------------------------------------------------------- */

const SEARCH_TTL_MS = 5 * 60_000;
const STREAM_TTL_MS = 4 * 60_000;
const TRENDING_TTL_MS = 10 * 60_000;

const searchCache = new Map<
  string,
  CacheEntry<YouTubeResult[]>
>();

const streamCache = new Map<
  string,
  CacheEntry<string>
>();

const trendingCache = new Map<
  string,
  CacheEntry<YouTubeResult[]>
>();

const pendingSearches = new Map<
  string,
  Promise<YouTubeResult[]>
>();

const pendingStreams = new Map<
  string,
  Promise<string>
>();

const pendingTrending =
  new Map<string, Promise<YouTubeResult[]>>();

const compilationTitle =
  /\b(?:playlist|jukebox|medley|compilation|full album|full movie|non[\s-]?stop|greatest hits|top\s+\d+\s+(?:songs|hits|tracks)|\d{2}s?\s+(?:songs|hits))\b/i;


/* -------------------------------------------------------------------------- */
/*                                   CACHE                                    */
/* -------------------------------------------------------------------------- */

function readCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
): T | undefined {
  const entry = cache.get(key);

  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }

  return entry.value;
}

function writeCache<T>(
  cache: Map<string, CacheEntry<T>>,
  key: string,
  value: T,
  ttl: number,
): void {
  if (cache.size >= 500) {
    const firstKey = cache.keys().next().value;

    if (firstKey) {
      cache.delete(firstKey);
    }
  }

  cache.set(key, {
    value,
    expiresAt: Date.now() + ttl,
  });
}


/* -------------------------------------------------------------------------- */
/*                              YOUTUBE HELPERS                               */
/* -------------------------------------------------------------------------- */

function validVideoId(value: string): boolean {
  return /^[\w-]{11}$/.test(value);
}

function thumbnailFrom(
  entry: SearchEntry,
): string {
  const thumbnails = [
    ...(entry.thumbnails ?? []),
  ].sort(
    (left, right) =>
      (right.preference ?? 0) -
      (left.preference ?? 0),
  );

  const candidate =
    entry.thumbnail ||
    thumbnails[0]?.url ||
    "";

  try {
    return new URL(candidate).protocol ===
      "https:"
      ? candidate
      : "";
  } catch {
    return "";
  }
}


/* -------------------------------------------------------------------------- */
/*                            YOUTUBE SEARCH                                  */
/* -------------------------------------------------------------------------- */

async function searchYouTubeUncached(
  query: string,
): Promise<YouTubeResult[]> {
  /*
   * Use fewer results per yt-dlp request.
   * This reduces the amount of work required by Render.
   */
  const payload = await ytdlp(
    `ytsearch10:${query}`,
    {
      dumpSingleJson: true,
      flatPlaylist: true,
      skipDownload: true,
      noWarnings: true,
      noProgress: true,
      quiet: true,
    },
    {
      timeout: 15_000,
    },
  ) as unknown as SearchPayload;

  return (payload.entries ?? []).flatMap(
    (entry) => {
      const videoId =
        entry.id?.trim() ?? "";

      const title =
        entry.title
          ?.trim()
          .slice(0, 200) ?? "";

      if (
        !validVideoId(videoId) ||
        !title
      ) {
        return [];
      }

      const uploader = (
        entry.artist ||
        entry.uploader ||
        entry.channel ||
        entry.creator ||
        "Unknown artist"
      )
        .trim()
        .slice(0, 160);

      const suppliedUrl =
        entry.webpage_url ||
        entry.url ||
        `https://www.youtube.com/watch?v=${videoId}`;

      let url =
        `https://www.youtube.com/watch?v=${videoId}`;

      try {
        const parsed =
          new URL(suppliedUrl);

        if (
          parsed.protocol === "https:" &&
          [
            "youtube.com",
            "www.youtube.com",
            "music.youtube.com",
            "youtu.be",
          ].includes(parsed.hostname)
        ) {
          url = parsed.toString();
        }
      } catch {
        // Fall back to the canonical YouTube URL.
      }

      return [
        {
          videoId,
          title,
          uploader,
          artist: uploader,
          url,
          duration:
            Number.isFinite(
              entry.duration,
            )
              ? Math.max(
                  0,
                  Math.round(
                    entry.duration!,
                  ),
                )
              : 0,
          thumbnail:
            thumbnailFrom(entry),
        },
      ];
    },
  );
}


/* -------------------------------------------------------------------------- */
/*                         PUBLIC YOUTUBE SEARCH                              */
/* -------------------------------------------------------------------------- */

export async function searchYouTube(
  query: string,
): Promise<YouTubeResult[]> {
  const normalizedQuery =
    query
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 160);

  if (!normalizedQuery) {
    return [];
  }

  const cacheKey =
    normalizedQuery.toLocaleLowerCase();

  const cached = readCache(
    searchCache,
    cacheKey,
  );

  if (cached) {
    return cached;
  }

  let pending =
    pendingSearches.get(cacheKey);

  if (!pending) {
    pending =
      searchYouTubeUncached(
        normalizedQuery,
      );

    pendingSearches.set(
      cacheKey,
      pending,
    );
  }

  try {
    const results =
      await pending;

    writeCache(
      searchCache,
      cacheKey,
      results,
      SEARCH_TTL_MS,
    );

    return results;
  } finally {
    if (
      pendingSearches.get(
        cacheKey,
      ) === pending
    ) {
      pendingSearches.delete(
        cacheKey,
      );
    }
  }
}


/* -------------------------------------------------------------------------- */
/*                         RESULT FILTERING                                  */
/* -------------------------------------------------------------------------- */

export function selectTrendingSongs(
  results: YouTubeResult[],
): YouTubeResult[] {
  const seen = new Set<string>();

  return results
    .filter((result) => {
      if (
        !validVideoId(
          result.videoId,
        ) ||
        result.duration < 45 ||
        result.duration > 600 ||
        compilationTitle.test(
          result.title,
        ) ||
        seen.has(result.videoId)
      ) {
        return false;
      }

      seen.add(result.videoId);

      return true;
    })
    .slice(0, 20);
}


/* -------------------------------------------------------------------------- */
/*                     CATALOG SEARCH QUERIES                                */
/* -------------------------------------------------------------------------- */

export function buildCatalogSearchQueries(
  query: string,
): string[] {
  const normalized =
    query
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 160);

  if (!normalized) {
    return [];
  }

  const hasQuotedPhrase =
    /["“”]/.test(normalized);

  const lyricLike =
    hasQuotedPhrase ||
    /\b(?:lyrics?|chorus|verse)\b/i.test(
      normalized,
    ) ||
    (
      normalized.split(" ").length >= 7 &&
      /\b(?:i|you|me|my|your|we|the|when|where|and|are|was|with)\b/i.test(
        normalized,
      )
    );

  const variants = lyricLike
    ? [
        `${normalized} lyrics`,
        `${normalized} song name`,
      ]
    : [
        `${normalized} song`,
        `${normalized} official music video`,
      ];

  return [
    ...new Set([
      normalized,
      ...variants.map(
        (value) =>
          value.slice(0, 160),
      ),
    ]),
  ];
}


/* -------------------------------------------------------------------------- */
/*                     CATALOG SEARCH                                        */
/* -------------------------------------------------------------------------- */

export async function searchCatalogYouTube(
  query: string,
): Promise<YouTubeResult[]> {
  const queries =
    buildCatalogSearchQueries(query);

  if (!queries.length) {
    return [];
  }

  let firstError: unknown;

  /*
   * IMPORTANT:
   *
   * Do NOT launch all queries simultaneously.
   *
   * First try the exact query.
   * If it works, return immediately.
   *
   * Only use fallback queries when necessary.
   */
  for (const searchQuery of queries) {
    try {
      const results =
        await searchYouTube(
          searchQuery,
        );

      if (results.length > 0) {
        const seen =
          new Set<string>();

        return results
          .filter((result) => {
            if (
              !validVideoId(
                result.videoId,
              ) ||
              !result.title.trim() ||
              seen.has(
                result.videoId,
              )
            ) {
              return false;
            }

            seen.add(
              result.videoId,
            );

            return true;
          })
          .slice(0, 30);
      }
    } catch (error) {
      if (!firstError) {
        firstError = error;
      }

      console.error(
        `YouTube search failed for "${searchQuery}":`,
        error instanceof Error
          ? error.stack ||
            error.message
          : error,
      );
    }
  }

  if (firstError) {
    throw firstError;
  }

  return [];
}


/* -------------------------------------------------------------------------- */
/*                     RECOMMENDATION QUERIES                                */
/* -------------------------------------------------------------------------- */

export function buildRecommendationQueries({
  currentTrack,
  likedTracks,
  recentTracks,
}: {
  currentTrack?: RecommendationSeed | null;
  likedTracks?: RecommendationSeed[];
  recentTracks?: RecommendationSeed[];
}) {
  const artists = new Map<
    string,
    {
      name: string;
      score: number;
    }
  >();

  const addArtist = (
    seed: RecommendationSeed,
    score: number,
  ) => {
    const name =
      seed.artist
        .trim()
        .slice(0, 100);

    if (
      !name ||
      name.toLowerCase() ===
        "unknown artist"
    ) {
      return;
    }

    const key =
      name.toLocaleLowerCase();

    const previous =
      artists.get(key);

    artists.set(key, {
      name,
      score:
        (previous?.score ?? 0) +
        score,
    });
  };

  for (
    const track of
      likedTracks ?? []
  ) {
    addArtist(track, 3);
  }

  for (
    const track of
      recentTracks ?? []
  ) {
    addArtist(track, 1);
  }

  if (currentTrack) {
    addArtist(
      currentTrack,
      4,
    );
  }

  const queries: string[] = [];

  if (
    currentTrack?.title &&
    currentTrack.artist
  ) {
    queries.push(
      `${currentTrack.title} ${currentTrack.artist} similar songs`,
    );
  }

  const topArtists =
    [...artists.values()]
      .sort(
        (left, right) =>
          right.score -
          left.score,
      )
      .slice(0, 2);

  for (
    const artist of topArtists
  ) {
    queries.push(
      `${artist.name} popular songs official music`,
    );
  }

  if (
    !queries.length &&
    (
      recentTracks?.length ||
      likedTracks?.length
    )
  ) {
    const seed = [
      ...(likedTracks ?? []),
      ...(recentTracks ?? []),
    ][0];

    if (seed) {
      queries.push(
        `${seed.title} ${seed.artist} similar songs`,
      );
    }
  }

  return [
    ...new Set(
      queries.map(
        (query) =>
          query
            .trim()
            .slice(0, 160),
      ),
    ),
  ].slice(0, 3);
}


/* -------------------------------------------------------------------------- */
/*                         RECOMMENDATIONS                                   */
/* -------------------------------------------------------------------------- */

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
  const queries =
    buildRecommendationQueries({
      currentTrack,
      likedTracks,
      recentTracks,
    });

  if (!queries.length) {
    return getTrendingYouTube();
  }

  const results: YouTubeResult[] =
    [];

  /*
   * Search recommendations one at a time.
   * Stop as soon as we have enough data.
   */
  for (const query of queries) {
    try {
      const found =
        await searchYouTube(query);

      results.push(...found);

      const usable =
        selectTrendingSongs(
          results,
        );

      if (usable.length >= 10) {
        break;
      }
    } catch (error) {
      console.error(
        `Recommendation search failed for "${query}":`,
        error instanceof Error
          ? error.stack ||
            error.message
          : error,
      );
    }
  }

  const excluded =
    new Set(excludeIds);

  let recommendations =
    selectTrendingSongs(
      results,
    ).filter(
      (track) =>
        !excluded.has(
          track.videoId,
        ),
    );

  /*
   * Only request trending as a fallback.
   */
  if (
    recommendations.length < 8
  ) {
    try {
      const trending =
        await getTrendingYouTube();

      recommendations =
        selectTrendingSongs([
          ...recommendations,
          ...trending,
        ]).filter(
          (track) =>
            !excluded.has(
              track.videoId,
            ),
        );
    } catch (error) {
      console.error(
        "Recommendation trending fallback failed:",
        error instanceof Error
          ? error.stack ||
            error.message
          : error,
      );
    }
  }

  return recommendations.slice(
    0,
    20,
  );
}


/* -------------------------------------------------------------------------- */
/*                              TRENDING                                     */
/* -------------------------------------------------------------------------- */

async function getTrendingUncached(): Promise<
  YouTubeResult[]
> {
  /*
   * IMPORTANT:
   *
   * Only ONE YouTube request is made for trending.
   *
   * The previous implementation made three requests:
   *   - trending songs
   *   - new songs
   *   - trending Indian songs
   *
   * That made the home page unnecessarily slow.
   */
  try {
    const results =
      await searchYouTube(
        "trending songs official music video",
      );

    return selectTrendingSongs(
      results,
    );
  } catch (error) {
    console.error(
      "Trending YouTube search failed:",
      error instanceof Error
        ? error.stack ||
          error.message
        : error,
    );

    throw error;
  }
}

export async function getTrendingYouTube(): Promise<
  YouTubeResult[]
> {
  const cacheKey = "trending";

  const cached =
    readCache(
      trendingCache,
      cacheKey,
    );

  if (cached) {
    return cached;
  }

  let pending =
    pendingTrending.get(
      cacheKey,
    );

  if (!pending) {
    pending =
      getTrendingUncached();

    pendingTrending.set(
      cacheKey,
      pending,
    );
  }

  try {
    const results =
      await pending;

    writeCache(
      trendingCache,
      cacheKey,
      results,
      TRENDING_TTL_MS,
    );

    return results;
  } finally {
    if (
      pendingTrending.get(
        cacheKey,
      ) === pending
    ) {
      pendingTrending.delete(
        cacheKey,
      );
    }
  }
}


/* -------------------------------------------------------------------------- */
/*                         AUDIO STREAM                                      */
/* -------------------------------------------------------------------------- */

async function resolveStreamUncached(
  videoId: string,
): Promise<string> {
  try {
    const output =
      await ytdlp(
        `https://www.youtube.com/watch?v=${videoId}`,
        {
          format:
            "bestaudio/best",
          getUrl: true,
          noPlaylist: true,
          noWarnings: true,
          noProgress: true,
          quiet: true,
        },
        {
          timeout: 25_000,
        },
      ) as unknown as string;

    const streamUrl =
      output
        .trim()
        .split(/\r?\n/)[0] ??
      "";

    let parsed: URL;

    try {
      parsed =
        new URL(streamUrl);
    } catch {
      throw new Error(
        "yt-dlp did not return a usable audio stream.",
      );
    }

    if (
      parsed.protocol !==
        "https:" ||
      !parsed.hostname.endsWith(
        ".googlevideo.com",
      )
    ) {
      throw new Error(
        "yt-dlp returned an unsupported audio stream host.",
      );
    }

    return parsed.toString();
  } catch (error) {
    console.error(
      `YouTube audio stream resolution failed for ${videoId}:`,
      error instanceof Error
        ? error.stack ||
          error.message
        : error,
    );

    throw error;
  }
}


/* -------------------------------------------------------------------------- */
/*                       PUBLIC STREAM FUNCTION                              */
/* -------------------------------------------------------------------------- */

export async function getYouTubeStream(
  videoId: string,
): Promise<string> {
  if (
    !validVideoId(videoId)
  ) {
    throw new Error(
      "That YouTube video ID is invalid.",
    );
  }

  const cached =
    readCache(
      streamCache,
      videoId,
    );

  if (cached) {
    return cached;
  }

  let pending =
    pendingStreams.get(
      videoId,
    );

  if (!pending) {
    pending =
      resolveStreamUncached(
        videoId,
      );

    pendingStreams.set(
      videoId,
      pending,
    );
  }

  try {
    const streamUrl =
      await pending;

    writeCache(
      streamCache,
      videoId,
      streamUrl,
      STREAM_TTL_MS,
    );

    return streamUrl;
  } finally {
    if (
      pendingStreams.get(
        videoId,
      ) === pending
    ) {
      pendingStreams.delete(
        videoId,
      );
    }
  }
}
