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
import { clearLocalTracks, loadLocalTracks, readStored, saveLocalTrack, writeStored } from "../services/storage";
import { youtubePlaybackProvider } from "../services/youtube";
import type { Track } from "../types/music";

type PlayerProviderProps = {
  children: ReactNode;
  isAuthenticated?: boolean;
  onRequireAuth?: () => void;
  onPlaybackEvent?: (track: Track, seconds: number) => void;
  onLikeEvent?: (track: Track) => void;
};
type RepeatMode = "off" | "all" | "one";
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
  shuffle: boolean;
  repeat: RepeatMode;
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
  syncLikedIds: (ids: string[]) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  removeRecentlyPlayed: (id: string) => void;
  toggleLike: (track: Track) => void;
  importFiles: (files: FileList | File[]) => Promise<void>;
  clearLibrary: () => Promise<void>;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

function formatImportedName(name: string) {
  return name.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim() || "Untitled track";
}

export function PlayerProvider({ children, isAuthenticated = false, onRequireAuth, onPlaybackEvent, onLikeEvent }: PlayerProviderProps) {
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
  const [shuffle, setShuffle] = useState(() => readStored("shuffle", false));
  const [repeat, setRepeat] = useState<RepeatMode>(() => {
    const stored = readStored<RepeatMode>("repeat", "all");
    return stored === "off" || stored === "one" || stored === "all" ? stored : "all";
  });
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playContextRef = useRef<Track[]>([]);
  const repeatRef = useRef<RepeatMode>("all");
  const nextRef = useRef<() => void>(() => undefined);
  const isPlayingRef = useRef(isPlaying);
  const queueRef = useRef(queue);
  const flushPlaybackRef = useRef<() => void>(() => undefined);
  const authRef = useRef(isAuthenticated);
  const requireAuthRef = useRef(onRequireAuth);
  const playbackEventRef = useRef(onPlaybackEvent);
  const likeEventRef = useRef(onLikeEvent);
  const currentTrackRef = useRef(currentTrack);
  const lastReportedTimeRef = useRef(0);
  const playRequestRef = useRef(0);
  authRef.current = isAuthenticated;
  requireAuthRef.current = onRequireAuth;
  playbackEventRef.current = onPlaybackEvent;
  likeEventRef.current = onLikeEvent;
  currentTrackRef.current = currentTrack;
  repeatRef.current = repeat;
  isPlayingRef.current = isPlaying;
  queueRef.current = queue;

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

  const playTrack = useCallback(async (track: Track, context?: Track[]) => {
    if (!authRef.current) {
      const played = readStored<string[]>("wave-tune:guest-played", []);
      if (!played.includes(track.id) && played.length >= 5) {
        setPlaybackError("Your five free songs are used. Sign in with Google to keep listening.");
        requireAuthRef.current?.();
        return;
      }
    }
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

    if (!authRef.current) {
      const played = readStored<string[]>("wave-tune:guest-played", []);
      if (!played.includes(track.id)) writeStored("wave-tune:guest-played", [...played, track.id]);
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
  }, [library]);

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
      setQueue((items) => items.filter((track) => track.id !== nextTrack.id));
      void playTrack(nextTrack);
      return;
    }

    const context = playContextRef.current;
    const currentIndex = context.findIndex((track) => track.id === activeTrack.id);
    if (currentIndex < 0 || context.length < 2) return;
    const nextIndex = shuffle
      ? Math.floor(Math.random() * context.filter((track) => track.id !== activeTrack.id).length)
      : currentIndex + 1;
    const available = shuffle
      ? context.filter((track) => track.id !== activeTrack.id)
      : context;
    if (!shuffle && nextIndex >= context.length && repeatRef.current !== "all") return;
    const nextTrack = available[shuffle ? nextIndex : nextIndex % context.length];
    if (nextTrack) void playTrack(nextTrack, context);
  }, [playTrack, shuffle]);
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
  const addToQueue = useCallback((track: Track) => {
    setQueue((items) => items.some((item) => item.id === track.id) ? items : [...items, track]);
  }, []);
  const requestTrack = useCallback((track: Track, context?: Track[]) => {
    const activeTrack = currentTrackRef.current;
    if (activeTrack?.id === track.id) {
      togglePlay();
      return;
    }
    void playTrack(track, context?.length ? context : [track]);
  }, [playTrack, togglePlay]);
  const playQueueTrack = useCallback((track: Track) => {
    const index = queueRef.current.findIndex((item) => item.id === track.id);
    setQueue((items) => index >= 0 ? items.slice(index + 1) : items.filter((item) => item.id !== track.id));
    void playTrack(track);
  }, [playTrack]);
  const playNext = useCallback((track: Track) => {
    setQueue((items) => [
      track,
      ...items.filter((item) => item.id !== track.id && item.id !== currentTrackRef.current?.id),
    ]);
  }, []);
  const removeFromQueue = (id: string) => setQueue((items) => items.filter((track) => track.id !== id));
  const clearQueue = () => setQueue([]);
  const removeRecentlyPlayed = useCallback((id: string) => {
    setRecentlyPlayed((items) => {
      const next = items.filter((trackId) => trackId !== id);
      writeStored("recent", next);
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

  const importFiles = async (files: FileList | File[]) => {
    const imported = await Promise.all(
      Array.from(files)
        .filter((file) => file.type.startsWith("audio/"))
        .map(async (file, index) => {
          const track: Track = {
            id: `local-${file.name}-${file.lastModified}-${index}`,
            title: formatImportedName(file.name),
            artist: "Local file",
            album: "Your library",
            duration: 0,
            artwork: "",
            accent: "#c5f269",
            audioUrl: URL.createObjectURL(file),
            source: "local",
            addedAt: Date.now(),
          };
          await saveLocalTrack(track, file);
          return track;
        }),
    );
    setLibrary((items) => [...imported, ...items]);
  };

  const clearLibrary = async () => {
    await clearLocalTracks();
    setLibrary([]);
  };

  const value = useMemo(
    () => ({
      currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library,
      likedIds, recentlyPlayed, shuffle, repeat, playbackError,
      playTrack, requestTrack, playQueueTrack, togglePlay, next,
      previous, seek, setVolume, toggleShuffle, cycleRepeat, setRepeatMode, addToQueue, playNext, removeFromQueue,
      clearQueue, removeRecentlyPlayed, toggleLike, syncLikedIds, importFiles, clearLibrary,
    }),
    [
      currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library,
      likedIds, recentlyPlayed, shuffle, repeat, playbackError, playTrack, requestTrack,
      playQueueTrack, togglePlay, next, previous, seek, setVolume, toggleShuffle,
      cycleRepeat, setRepeatMode, addToQueue, playNext, removeFromQueue,
      clearQueue, removeRecentlyPlayed, toggleLike, syncLikedIds, importFiles, clearLibrary,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
