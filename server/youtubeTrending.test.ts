import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogSearchQueries,
  buildRecommendationQueries,
  selectTrendingSongs,
  type YouTubeResult,
} from "./youtube";

function result(videoId: string, title: string, duration = 180): YouTubeResult {
  return {
    videoId,
    title,
    uploader: "Wave Tune",
    artist: "Wave Tune",
    url: `https://www.youtube.com/watch?v=${videoId}`,
    duration,
    thumbnail: "https://i.ytimg.com/vi/example/hqdefault.jpg",
  };
}

test("trending selection removes compilations, long videos, and duplicate results", () => {
  const selected = selectTrendingSongs([
    result("abcdefghijk", "A current song (Official Music Video)"),
    result("bcdefghijkl", "Trending Songs 2026 Best Hindi Love Songs Playlist"),
    result("cdefghijklm", "Full Album Jukebox", 2400),
    result("abcdefghijk", "Duplicate search result"),
    result("defghijklmn", "Another current song", 220),
  ]);

  assert.deepEqual(selected.map((track) => track.videoId), ["abcdefghijk", "defghijklmn"]);
});

test("trending selection can fill a larger feed without exceeding twenty songs", () => {
  const selected = selectTrendingSongs(
    Array.from({ length: 30 }, (_, index) =>
      result(`a${String(index).padStart(10, "0")}`, `Current song ${index}`),
    ),
  );

  assert.equal(selected.length, 20);
  assert.equal(new Set(selected.map((track) => track.videoId)).size, 20);
});

test("search query expansion covers lyric phrases and short song hints", () => {
  const lyricQueries = buildCatalogSearchQueries("when you said you would stay lyrics");
  assert.equal(lyricQueries[0], "when you said you would stay lyrics");
  assert.ok(lyricQueries.some((query) => query.includes("song name")));

  const hintQueries = buildCatalogSearchQueries("lofi piano for rainy evenings");
  assert.ok(hintQueries.some((query) => query.endsWith(" song")));
  assert.ok(hintQueries.every((query) => query.length <= 160));
});

test("recommendation searches favor recent and liked artist taste", () => {
  const queries = buildRecommendationQueries({
    currentTrack: { title: "Blue Hour", artist: "Nova", id: "current" },
    likedTracks: [{ title: "Night Drive", artist: "Nova" }],
    recentTracks: [{ title: "Soft Light", artist: "Harbor" }],
  });

  assert.equal(queries[0], "Blue Hour Nova similar songs");
  assert.ok(queries[1].startsWith("Nova popular songs"));
  assert.ok(queries[2].startsWith("Harbor popular songs"));
});
