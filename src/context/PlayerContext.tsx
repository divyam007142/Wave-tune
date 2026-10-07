import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { loadLocalTracks, readStored, removeLocalTrack as removeStoredLocalTrack, writeStored } from "../services/storage";
import { youtubePlaybackProvider } from "../services/youtube";
import { useMediaSession } from "../hooks/useMediaSession";
import {
  canGuestPlayTrack,
  currentGuestListeningDay,
  GUEST_DAILY_SONG_LIMIT,
  recordGuestTrack,
  type GuestListeningDay,
} from "../services/guestListening";
import type { Track } from "../types/music";

type PlayerProviderProps = {
  children: ReactNode;
  isAuthenticated?: boolean;
  onPlaybackEvent?: (track: Track, seconds: number) => void;
  onLikeEvent?: (track: Track) => void;
};
type RepeatMode = "off" | "all" | "one";
type SleepTimerMinutes = 0 | 15 | 30 | 45;
type AutoplayRecommendationProvider = (track: Track, excludeIds: string[]) => Promise<Track[]>;
type PlayerContextValue = {
  currentTrack: Track | null;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  queue: Track[];
  library: Track[];
  likedIds: string[];
  recentlyPlayed: string[];
  recentTrackHistory: Track[];
  shuffle: boolean;
  repeat: RepeatMode;
  sleepTimerMinutes: SleepTimerMinutes;
  sleepTimerRemainingSeconds: number;
  playbackError: string | null;
  playTrack: (track: Track, context?: Track[]) => void;
  requestTrack: (track: Track, context?: Track[]) => void;
  playQueueTrack: (track: Track) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setRepeatMode: (mode: RepeatMode) => void;
  setSleepTimer: (minutes: SleepTimerMinutes) => void;
  setAutoplayRecommendationProvider: (provider: AutoplayRecommendationProvider | null) => void;
  syncLikedIds: (ids: string[]) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  removeRecentlyPlayed: (id: string) => void;
  toggleLike: (track: Track) => void;
  removeLocalTrack: (trackId: string) => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children, isAuthenticated = false, onPlaybackEvent, onLikeEvent }: PlayerProviderProps) {
  const [library, setLibrary] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(() => readStored("volume", 0.72));
  const [likedIds, setLikedIds] = useState<string[]>(() => readStored("liked", []));
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>(() => readStored("recent", []));
  const [recentTrackHistory, setRecentTrackHistory] = useState<Track[]>(() => {
    const stored = readStored<unknown>("recent-track-data", []);
    return Array.isArray(stored)
      ? stored.filter((track): track is Track => Boolean(track && typeof track === "object" && typeof (track as Track).id === "string" && typeof (track as Track).title === "string"))
      : [];
  });
  const guestPlayRecordRef = useRef<GuestListeningDay>(
    currentGuestListeningDay(readStored<unknown>("guest-daily-songs", null)),
  );
  const [shuffle, setShuffle] = useState(() => readStored("shuffle", false));
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const stored = readStored<RepeatMode>("repeat", "all");
    return stored === "off" || stored === "one" || stored === "all" ? stored : "all";
  });
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<SleepTimerMinutes>(0);
  const [sleepTimerRemainingSeconds, setSleepTimerRemainingSeconds] = useState(0);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playContextRef = useRef<Track[]>([]);
  const repeatRef = useRef<RepeatMode>("all");
  const nextRef = useRef<() => void>(() => undefined);
  const isPlayingRef = useRef(isPlaying);
  const queueRef = useRef(queue);
  const flushPlaybackRef = useRef<() => void>(() => undefined);
  const authRef = useRef(isAuthenticated);
  const playbackEventRef = useRef(onPlaybackEvent);
  const likeEventRef = useRef(onLikeEvent);
  const currentTrackRef = useRef(currentTrack);
  const lastReportedTimeRef = useRef(0);
  const playRequestRef = useRef(0);
  const sleepTimerDeadlineRef = useRef<number | null>(null);
  const sleepTimerIntervalRef = useRef<number | null>(null);
  const recentTrackHistoryRef = useRef(recentTrackHistory);
  const autoplayProviderRef = useRef<AutoplayRecommendationProvider | null>(null);
  const autoplayAfterQueueRef = useRef(false);
  const autoplayRequestRef = useRef(false);
  const autoplayGenerationRef = useRef(0);
  authRef.current = isAuthenticated;
  playbackEventRef.current = onPlaybackEvent;
  likeEventRef.current = onLikeEvent;
  currentTrackRef.current = currentTrack;
  repeatRef.current = repeat;
  isPlayingRef.current = isPlaying;
  queueRef.current = queue;
  recentTrackHistoryRef.current = recentTrackHistory;

  useEffect(() => {
    setLikedIds(isAuthenticated ? [] : readStored("liked", []));
  }, [isAuthenticated]);

  useEffect(() => {
    loadLocalTracks().then(setLibrary).catch((error) => console.warn("Wave Tune library unavailable", error));
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;
    return () => {
      audio.pause();
    };
    // Audio is intentionally created once for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    writeStored("volume", volume);
  }, [volume]);

  useEffect(() => {
    writeStored("shuffle", shuffle);
  }, [shuffle]);

  useEffect(() => {
    writeStored("repeat", repeat);
  }, [repeat]);

  useEffect(() => () => {
    if (sleepTimerIntervalRef.current !== null) window.clearInterval(sleepTimerIntervalRef.current);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      setCurrentTime(0);
      setDuration(0);
      setIsLoading(false);
      setIsPlaying(false);
      return;
    }

    setCurrentTime(0);
    lastReportedTimeRef.current = 0;
    setDuration(currentTrack.duration);
    setPlaybackError(null);

    audio.pause();
    if (!currentTrack.audioUrl) {
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError("This track has no playable audio stream.");
      return;
    }
    audio.src = currentTrack.audioUrl;
    audio.load();
    if (isPlaying) {
      setIsLoading(true);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setIsLoading(false);
        setPlaybackError("Your browser blocked playback. Press Play to start this song.");
      });
    }
  }, [currentTrack]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const reportElapsed = (force = false) => {
      const track = currentTrackRef.current;
      const elapsed = audio.currentTime - lastReportedTimeRef.current;
      const seconds = Math.floor(elapsed);
      if (track && seconds > 0 && (force || seconds >= 15)) {
        playbackEventRef.current?.(track, seconds);
        lastReportedTimeRef.current = audio.currentTime;
      } else if (elapsed < 0) {
        lastReportedTimeRef.current = audio.currentTime;
      }
    };
    flushPlaybackRef.current = () => reportElapsed(true);

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      reportElapsed();
    };
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : currentTrackRef.current?.duration ?? 0);
      setIsLoading(false);
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
      const track = currentTrackRef.current;
      if (track && !authRef.current) {
        const nextGuestRecord = recordGuestTrack(
          currentGuestListeningDay(guestPlayRecordRef.current),
          track.id,
        );
        if (nextGuestRecord !== guestPlayRecordRef.current) {
          guestPlayRecordRef.current = nextGuestRecord;
          try {
            writeStored("guest-daily-songs", nextGuestRecord);
          } catch {
            // The five-song cap still applies for this visit if browser storage is unavailable.
          }
        }
      }
      if (track) {
        window.dispatchEvent(new CustomEvent<Track>("wave-tune:track-started", { detail: track }));
      }
    };
    const onPause = () => {
      reportElapsed(true);
      setIsPlaying(false);
    };
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError("Couldn't load this song's audio stream. Try another track.");
    };
    const onEnded = () => {
      reportElapsed(true);
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
        lastReportedTimeRef.current = 0;
        void audio.play();
      } else {
        nextRef.current();
      }
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      flushPlaybackRef.current = () => undefined;
    };
    // Audio is intentionally created once for the lifetime of the provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allowGuestTrack = useCallback((trackId?: string) => {
    if (authRef.current) return true;
    const guestRecord = currentGuestListeningDay(guestPlayRecordRef.current);
    guestPlayRecordRef.current = guestRecord;
    if (trackId ? canGuestPlayTrack(guestRecord, trackId) : guestRecord.trackIds.length < GUEST_DAILY_SONG_LIMIT) return true;
    setPlaybackError(null);
    if (audioRef.current?.ended) {
      setIsLoading(false);
      setIsPlaying(false);
    }
    window.dispatchEvent(new Event("wave-tune:guest-limit"));
    return false;
  }, []);

  const playTrack = useCallback(async (track: Track, context?: Track[]) => {
    if (!allowGuestTrack(track.id)) return;
    const requestId = ++playRequestRef.current;
    setIsPlaying(false);
    setIsLoading(true);
    setPlaybackError(null);
    flushPlaybackRef.current();
    audioRef.current?.pause();
    if (context?.length) {
      playContextRef.current = context;
    } else if (!playContextRef.current.length) {
      playContextRef.current = [...library, track];
    }

    let playableTrack = track;
    if (track.source !== "local") {
      try {
        const playback = await youtubePlaybackProvider.resolveTrack(track);
        if (requestId !== playRequestRef.current) return;
        const audioUrl = await youtubePlaybackProvider.getStreamUrl(playback.youtubeVideoId);
        if (requestId !== playRequestRef.current) return;
        playableTrack = { ...track, ...playback, audioUrl };
      } catch (error) {
        if (requestId === playRequestRef.current) {
          setIsLoading(false);
          setPlaybackError(error instanceof Error ? error.message : "No playable YouTube result was found.");
        }
        return;
      }
    }
    if (requestId !== playRequestRef.current) return;
    if (playableTrack.source === "local" && !playableTrack.audioUrl) {
      setIsLoading(false);
      setPlaybackError("This local track has no playable audio.");
      return;
    }
    if (playableTrack.source !== "local" && !playableTrack.youtubeVideoId) {
      setIsLoading(false);
      setPlaybackError("This track has no playable YouTube video.");
      return;
    }

    setCurrentTrack(playableTrack);
    setIsPlaying(true);
    setIsLoading(true);
    playbackEventRef.current?.(playableTrack, 0);
    setRecentlyPlayed((existing) => {
      const next = [playableTrack.id, ...existing.filter((id) => id !== playableTrack.id)].slice(0, 12);
      writeStored("recent", next);
      return next;
    });
    setRecentTrackHistory((existing) => {
      const { audioUrl: _audioUrl, ...trackForHistory } = track;
      const next = [trackForHistory, ...existing.filter((item) => item.id !== track.id)].slice(0, 30);
      try {
        writeStored("recent-track-data", next);
      } catch {
        // Recommendations still work from the current session if local storage is full.
      }
      return next;
    });
  }, [allowGuestTrack, library]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!currentTrack) {
      setPlaybackError("Choose a track to start listening.");
      return;
    }
    if (!audio) {
      setPlaybackError("The audio player is not ready yet.");
      return;
    }
    if (isPlaying) {
      audio.pause();
    } else {
      setPlaybackError(null);
      setIsLoading(true);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setIsLoading(false);
        setPlaybackError("Your browser blocked playback. Press Play to try again.");
      });
    }
  }, [currentTrack, isPlaying]);

  const next = useCallback(() => {
    const activeTrack = currentTrackRef.current;
    if (!activeTrack) return;

    const queuedTracks = queueRef.current;
    if (queuedTracks.length) {
      const queueIndex = shuffle ? Math.floor(Math.random() * queuedTracks.length) : 0;
      const nextTrack = queuedTracks[queueIndex];
      if (!allowGuestTrack(nextTrack.id)) {
        if (audioRef.current?.ended) {
          setIsLoading(false);
          setIsPlaying(false);
        }
        return;
      }
      const remaining = queuedTracks.filter((track) => track.id !== nextTrack.id);
      setQueue(remaining);
      if (!remaining.length) autoplayAfterQueueRef.current = true;
      void playTrack(nextTrack);
      return;
    }

    const context = playContextRef.current;
    const currentIndex = context.findIndex((track) => track.id === activeTrack.id);
    const shouldRecommend = autoplayAfterQueueRef.current
      || currentIndex < 0
      || context.length < 2
      || (!shuffle && currentIndex === context.length - 1 && repeatRef.current !== "all");
    if (!shouldRecommend && currentIndex >= 0 && context.length >= 2) {
      const nextIndex = shuffle
        ? Math.floor(Math.random() * context.filter((track) => track.id !== activeTrack.id).length)
        : currentIndex + 1;
      const available = shuffle
        ? context.filter((track) => track.id !== activeTrack.id)
        : context;
      const nextTrack = available[shuffle ? nextIndex : nextIndex % context.length];
      if (nextTrack) void playTrack(nextTrack, context);
      return;
    }

    if (!allowGuestTrack()) return;
    const recommend = autoplayProviderRef.current;
    if (!recommend) {
      setIsLoading(false);
      setIsPlaying(false);
      return;
    }
    if (autoplayRequestRef.current) {
      autoplayGenerationRef.current += 1;
      autoplayRequestRef.current = false;
      playRequestRef.current += 1;
      setIsLoading(false);
      setIsPlaying(false);
      return;
    }
    autoplayAfterQueueRef.current = false;
    autoplayRequestRef.current = true;
    const autoplayGeneration = ++autoplayGenerationRef.current;
    const requestId = playRequestRef.current;
    const excluded = [...new Set([
      activeTrack.id,
      ...recentTrackHistoryRef.current.map((track) => track.id),
      ...queueRef.current.map((track) => track.id),
    ])];
    setIsLoading(true);
    void recommend(activeTrack, excluded)
      .then((recommendations) => {
        if (requestId !== playRequestRef.current || currentTrackRef.current?.id !== activeTrack.id) return;
        if (queueRef.current.length) {
          setIsLoading(false);
          nextRef.current();
          return;
        }
        const nextTrack = recommendations.find((track) => !excluded.includes(track.id));
        if (!nextTrack) {
          setIsLoading(false);
          setIsPlaying(false);
          setPlaybackError("No related songs are available right now. Add a track or try again later.");
          return;
        }
        playContextRef.current = recommendations;
        void playTrack(nextTrack, recommendations);
      })
      .catch((error) => {
        if (requestId !== playRequestRef.current || currentTrackRef.current?.id !== activeTrack.id) return;
        setIsLoading(false);
        setIsPlaying(false);
        setPlaybackError(error instanceof Error ? error.message : "Related songs could not be loaded.");
      })
      .finally(() => {
        if (autoplayGeneration === autoplayGenerationRef.current) {
          autoplayRequestRef.current = false;
        }
      });
  }, [allowGuestTrack, playTrack, shuffle]);
  nextRef.current = next;

  const previous = useCallback(() => {
    if (!currentTrack) return;
    if (currentTime > 4) {
      seek(0);
      return;
    }
    const context = playContextRef.current;
    const index = context.findIndex((track) => track.id === currentTrack.id);
    if (index < 0 || context.length < 2) return;
    const previousTrack = context[(index - 1 + context.length) % context.length];
    if (previousTrack) void playTrack(previousTrack, context);
  }, [currentTime, currentTrack, playTrack]);

  const seek = useCallback((value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setCurrentTime(value);
  }, []);

  const setVolume = useCallback((value: number) => {
    const nextVolume = Math.min(1, Math.max(0, value));
    setVolumeState(nextVolume);
  }, []);
  const toggleShuffle = () => setShuffle((value) => !value);
  const cycleRepeat = () => setRepeat((value) => (value === "off" ? "all" : value === "all" ? "one" : "off"));
  const setRepeatMode = (mode: RepeatMode) => setRepeat(mode);
  const setSleepTimer = useCallback((minutes: SleepTimerMinutes) => {
    if (sleepTimerIntervalRef.current !== null) {
      window.clearInterval(sleepTimerIntervalRef.current);
      sleepTimerIntervalRef.current = null;
    }
    sleepTimerDeadlineRef.current = null;
    setSleepTimerMinutes(minutes);
    if (minutes === 0) {
      setSleepTimerRemainingSeconds(0);
      return;
    }

    const deadline = Date.now() + minutes * 60_000;
    sleepTimerDeadlineRef.current = deadline;
    setSleepTimerRemainingSeconds(minutes * 60);
    sleepTimerIntervalRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil(((sleepTimerDeadlineRef.current ?? Date.now()) - Date.now()) / 1000));
      setSleepTimerRemainingSeconds(remaining);
      if (remaining === 0) {
        if (sleepTimerIntervalRef.current !== null) window.clearInterval(sleepTimerIntervalRef.current);
        sleepTimerIntervalRef.current = null;
        sleepTimerDeadlineRef.current = null;
        setSleepTimerMinutes(0);
        audioRef.current?.pause();
      }
    }, 1000);
  }, []);
  const setAutoplayRecommendationProvider = useCallback((provider: AutoplayRecommendationProvider | null) => {
    autoplayProviderRef.current = provider;
  }, []);
  const addToQueue = useCallback((track: Track) => {
    setQueue((items) => items.some((item) => item.id === track.id) ? items : [...items, track]);
  }, []);
  const requestTrack = useCallback((track: Track, context?: Track[]) => {
    const activeTrack = currentTrackRef.current;
    if (activeTrack?.id === track.id) {
      togglePlay();
      return;
    }
    if (!allowGuestTrack(track.id)) return;
    autoplayAfterQueueRef.current = false;
    void playTrack(track, context?.length ? context : [track]);
  }, [allowGuestTrack, playTrack, togglePlay]);
  const playQueueTrack = useCallback((track: Track) => {
    if (!allowGuestTrack(track.id)) return;
    const index = queueRef.current.findIndex((item) => item.id === track.id);
    const remaining = index >= 0
      ? queueRef.current.slice(index + 1)
      : queueRef.current.filter((item) => item.id !== track.id);
    setQueue(remaining);
    autoplayAfterQueueRef.current = remaining.length === 0;
    void playTrack(track);
  }, [allowGuestTrack, playTrack]);
  const playNext = useCallback((track: Track) => {
    setQueue((items) => [
      track,
      ...items.filter((item) => item.id !== track.id && item.id !== currentTrackRef.current?.id),
    ]);
  }, []);
  const removeFromQueue = (id: string) => setQueue((items) => items.filter((track) => track.id !== id));
  const clearQueue = () => {
    if (queueRef.current.length) autoplayAfterQueueRef.current = true;
    setQueue([]);
  };
  const removeRecentlyPlayed = useCallback((id: string) => {
    setRecentlyPlayed((items) => {
      const next = items.filter((trackId) => trackId !== id);
      writeStored("recent", next);
      return next;
    });
    setRecentTrackHistory((items) => {
      const next = items.filter((track) => track.id !== id);
      try {
        writeStored("recent-track-data", next);
      } catch {
        // Keep the current session responsive if local storage is unavailable.
      }
      return next;
    });
  }, []);
  const toggleLike = (track: Track) => {
    setLikedIds((items) => {
      const next = items.includes(track.id) ? items.filter((id) => id !== track.id) : [track.id, ...items];
      if (authRef.current) likeEventRef.current?.(track);
      else writeStored("liked", next);
      return next;
    });
  };
  const syncLikedIds = useCallback((ids: string[]) => setLikedIds([...new Set(ids)]), []);

  useMediaSession({
    track: currentTrack,
    isPlaying,
    currentTime,
    duration,
    play: () => { if (!isPlaying) togglePlay(); },
    pause: () => { if (isPlaying) togglePlay(); },
    next,
    previous,
    seek,
  });

  const removeLocalTrack = useCallback(async (trackId: string) => {
    await removeStoredLocalTrack(trackId);
    const track = library.find((item) => item.id === trackId);
    if (track?.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(track.audioUrl);
    setLibrary((items) => items.filter((item) => item.id !== trackId));
    if (currentTrackRef.current?.id === trackId) {
      audioRef.current?.pause();
      setCurrentTrack(null);
    }
  }, [library]);

  const value = useMemo(
    () => ({
      currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library,
      likedIds, recentlyPlayed, recentTrackHistory, shuffle, repeat, playbackError, sleepTimerMinutes, sleepTimerRemainingSeconds,
      playTrack, requestTrack, playQueueTrack, togglePlay, next,
      previous, seek, setVolume, toggleShuffle, cycleRepeat, setRepeatMode, setSleepTimer, setAutoplayRecommendationProvider, addToQueue, playNext, removeFromQueue,
      clearQueue, removeRecentlyPlayed, toggleLike, syncLikedIds, removeLocalTrack,
    }),
    [
      currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library,
      likedIds, recentlyPlayed, recentTrackHistory, shuffle, repeat, playbackError, sleepTimerMinutes, sleepTimerRemainingSeconds, playTrack, requestTrack,
      playQueueTrack, togglePlay, next, previous, seek, setVolume, toggleShuffle,
      cycleRepeat, setRepeatMode, setSleepTimer, setAutoplayRecommendationProvider, addToQueue, playNext, removeFromQueue,
      clearQueue, removeRecentlyPlayed, toggleLike, syncLikedIds, removeLocalTrack,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
