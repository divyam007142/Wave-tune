import assert from "node:assert/strict";
import test from "node:test";
import { buildTimeCapsuleStats, dayKeyAt, normalizeTimeZone } from "./listeningStats";
import type { Track } from "../src/types/music";

const track: Track = {
  id: "track-1",
  title: "A favorite song",
  artist: "Wave Tune",
  album: "YouTube",
  duration: 180,
  artwork: "",
  accent: "#557c48",
  source: "catalog",
};
const anotherTrack: Track = {
  ...track,
  id: "track-2",
  title: "Another familiar song",
};

test("Time Capsule fills zero-listening days and ranks repeat plays from recorded starts", () => {
  const stats = buildTimeCapsuleStats({
    days: 7,
    timeZone: "Asia/Kolkata",
    today: "2026-10-07",
    allTimeSeconds: 9_000,
    records: [
      { accountId: "user", day: "2026-10-07", trackId: track.id, track, seconds: 240, plays: 3 },
      { accountId: "user", day: "2026-10-05", trackId: track.id, track, seconds: 120, plays: 1 },
      { accountId: "user", day: "2026-10-05", trackId: anotherTrack.id, track: anotherTrack, seconds: 60, plays: 2 },
    ],
  });

  assert.equal(stats.daily.length, 7);
  assert.equal(stats.daily[0].day, "2026-10-01");
  assert.equal(stats.daily[1].seconds, 0);
  assert.equal(stats.todaySeconds, 240);
  assert.equal(stats.periodSeconds, 420);
  assert.equal(stats.totalPlays, 6);
  assert.equal(stats.repeats, 4);
  assert.equal(stats.activeDays, 2);
  assert.equal(stats.currentStreak, 1);
  assert.equal(stats.mostPlayed?.title, track.title);
  assert.equal(stats.mostPlayed?.plays, 4);
  assert.equal(stats.mostPlayed?.repeats, 3);
  assert.equal(stats.topTracks[0].title, track.title);
  assert.equal(stats.topTracks[1].title, anotherTrack.title);
  assert.equal(stats.allTimeSeconds, 9_000);
});

test("Time Capsule supports a 30-day view and validates time zones", () => {
  assert.equal(normalizeTimeZone("not/a-zone"), "UTC");
  assert.equal(dayKeyAt(new Date("2026-10-07T01:00:00.000Z"), "Asia/Kolkata"), "2026-10-07");
  const stats = buildTimeCapsuleStats({
    days: 30,
    timeZone: "UTC",
    today: "2026-10-07",
    allTimeSeconds: 0,
    records: [],
  });
  assert.equal(stats.daily.length, 30);
  assert.equal(stats.startDay, "2026-09-08");
  assert.equal(stats.mostPlayed, null);
  assert.deepEqual(stats.topTracks, []);
});
