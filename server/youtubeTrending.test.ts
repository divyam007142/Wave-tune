import assert from "node:assert/strict";
import test from "node:test";
import { selectTrendingSongs, type YouTubeResult } from "./youtube";

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
