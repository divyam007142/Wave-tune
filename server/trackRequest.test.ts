import assert from "node:assert/strict";
import test from "node:test";
import type { Track } from "../src/types/music";
import { planTrackRequest } from "../src/context/trackRequest";

function track(id: string): Track {
  return {
    id,
    title: `Song ${id}`,
    artist: "Wave Tune",
    album: "YouTube",
    duration: 180,
    artwork: "",
    accent: "#557c48",
    source: "catalog",
  };
}

test("selecting a search result plays it without copying the search list into the queue", () => {
  const selected = track("selected");
  const context = [selected, track("another-search-result")];
  const queue = [track("explicitly-queued")];
  const plan = planTrackRequest(selected, "currently-playing", context, queue);

  assert.equal(plan.action, "play");
  if (plan.action !== "play") return;
  assert.equal(plan.track, selected);
  assert.equal(plan.context, context);
  assert.equal(plan.queue, queue);
});

test("selecting the current track toggles it and leaves the queue alone", () => {
  const selected = track("current");
  const queue = [track("up-next")];
  const plan = planTrackRequest(selected, selected.id, [selected], queue);

  assert.equal(plan.action, "toggle");
  assert.equal(plan.queue, queue);
});

test("a standalone song gets a one-track playback context, not a seeded queue", () => {
  const selected = track("single");
  const queue: Track[] = [];
  const plan = planTrackRequest(selected, undefined, undefined, queue);

  assert.equal(plan.action, "play");
  if (plan.action !== "play") return;
  assert.deepEqual(plan.context, [selected]);
  assert.equal(plan.queue, queue);
});
