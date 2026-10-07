import assert from "node:assert/strict";
import test from "node:test";
import {
  canGuestPlayTrack,
  currentGuestListeningDay,
  recordGuestTrack,
} from "../src/services/guestListening";

test("guest listening tracks allow five unique songs per local day", () => {
  const day = new Date(2026, 9, 7, 12);
  let record = currentGuestListeningDay(null, day);

  for (let index = 1; index <= 5; index += 1) {
    const id = `track-${index}`;
    assert.equal(canGuestPlayTrack(record, id), true);
    record = recordGuestTrack(record, id, day);
  }

  assert.equal(record.trackIds.length, 5);
  assert.equal(canGuestPlayTrack(record, "track-1"), true);
  assert.equal(canGuestPlayTrack(record, "track-6"), false);
});

test("guest song allowance resets on the next local day", () => {
  const firstDay = new Date(2026, 9, 7, 23, 55);
  let record = currentGuestListeningDay(null, firstDay);
  for (let index = 1; index <= 5; index += 1) {
    record = recordGuestTrack(record, `track-${index}`, firstDay);
  }

  const nextDay = new Date(2026, 9, 8, 0, 5);
  const refreshed = currentGuestListeningDay(record, nextDay);
  assert.equal(refreshed.trackIds.length, 0);
  assert.equal(canGuestPlayTrack(refreshed, "track-6"), true);
});
