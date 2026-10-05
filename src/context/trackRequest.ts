import type { Track } from "../types/music";

export type TrackRequestPlan =
  | { action: "toggle"; context: Track[]; queue: Track[] }
  | { action: "play"; track: Track; context: Track[]; queue: Track[] };

export function planTrackRequest(
  track: Track,
  currentTrackId: string | undefined,
  context: Track[] | undefined,
  queue: Track[],
): TrackRequestPlan {
  const playbackContext = context?.length ? context : [track];
  if (currentTrackId === track.id) {
    return { action: "toggle", context: playbackContext, queue };
  }
  return { action: "play", track, context: playbackContext, queue };
}
