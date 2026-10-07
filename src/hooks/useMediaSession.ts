import { useEffect, useRef } from "react";
import type { Track } from "../types/music";

type MediaSessionOptions = {
  track: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
};

export function useMediaSession({
  track,
  isPlaying,
  currentTime,
  duration,
  play,
  pause,
  next,
  previous,
  seek,
}: MediaSessionOptions) {
  const actionsRef = useRef({ play, pause, next, previous, seek });
  actionsRef.current = { play, pause, next, previous, seek };
  const positionRef = useRef({ currentTime, duration });
  positionRef.current = { currentTime, duration };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    if (!track || typeof MediaMetadata === "undefined") {
      session.metadata = null;
      if (!track) session.playbackState = "none";
      return;
    }

    const artwork = track.artwork
      ? ["96x96", "128x128", "192x192", "256x256", "512x512"].map((sizes) => ({
          src: track.artwork,
          sizes,
        }))
      : [];
    try {
      session.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
        artwork,
      });
    } catch {
      session.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
      });
    }
  }, [track]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    session.playbackState = track ? (isPlaying ? "playing" : "paused") : "none";
    if (!track || !Number.isFinite(duration) || duration <= 0 || !("setPositionState" in session)) return;
    try {
      session.setPositionState({
        duration,
        playbackRate: 1,
        position: Math.min(Math.max(0, currentTime), duration),
      });
    } catch {
      // Some browsers reject position updates until media metadata is ready.
    }
  }, [currentTime, duration, isPlaying, track]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const handlers: [MediaSessionAction, MediaSessionActionHandler | null][] = [
      ["play", () => actionsRef.current.play()],
      ["pause", () => actionsRef.current.pause()],
      ["nexttrack", () => actionsRef.current.next()],
      ["previoustrack", () => actionsRef.current.previous()],
      ["seekto", (event) => {
        if (typeof event.seekTime === "number") actionsRef.current.seek(event.seekTime);
      }],
      ["seekbackward", (event) => {
        const step = event.seekOffset ?? 10;
        actionsRef.current.seek(Math.max(0, positionRef.current.currentTime - step));
      }],
      ["seekforward", (event) => {
        const step = event.seekOffset ?? 10;
        const { currentTime: position, duration: length } = positionRef.current;
        actionsRef.current.seek(Math.min(length || position + step, position + step));
      }],
    ];
    for (const [action, handler] of handlers) {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Action support differs between browser and operating-system versions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Ignore unsupported actions while cleaning up.
        }
      }
    };
  }, []);
}
