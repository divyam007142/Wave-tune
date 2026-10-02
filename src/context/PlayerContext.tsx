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
import type { YouTubeIframePlayer } from "../services/youtubelframe";
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
  registerYouTubePlayer: (player: YouTubeIframePlayer | null) => void;
  reportYouTubeState: (state: number) => void;
  reportYouTubeError: (message?: string) => void;
  playTrack: (track: Track, context?: Track[]) => void;
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  syncLikedIds: (ids: string[]) => void;
  addToQueue: (track: Track) => void;
  playNext: (track: Track) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
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
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("all");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubePlayerRef = useRef<YouTubeIframePlayer | null>(null);
  const playContextRef = useRef<Track[]>([]);
  const repeatRef = useRef<RepeatMode>("all");
  const nextRef = useRef<() => void>(() => undefined);
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

  useEffect(() => {
    setLikedIds(isAuthenticated ? [] : readStored("liked", []));
  }, [isAuthenticated]);

  useEffect(() => {
    loadLocalTracks().then(setLibrary).catch((error) => console.warn("Wave Tune library unavailable", error));
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      const delta = audio.currentTime - lastReportedTimeRef.current;
      if (delta >= 15 && currentTrackRef.current) {
        playbackEventRef.current?.(currentTrackRef.current, delta);
        lastReportedTimeRef.current = audio.currentTime;
      }
    };
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : currentTrack?.duration ?? 0);
      setIsLoading(false);
    };
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError("Couldn't load this song. Try another track.");
    };
    const onEnded = () => {
      if (repeatRef.current === "one") {
        audio.currentTime = 0;
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
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentTrack) {
      youtubePlayerRef.current?.stopVideo();
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

    if (currentTrack.source === "local" && currentTrack.audioUrl) {
      youtubePlayerRef.current?.stopVideo();
      audio.src = currentTrack.audioUrl;
      audio.load();
      if (isPlaying) {
        setIsLoading(true);
        void audio.play().catch(() => {
          setIsPlaying(false);
          setIsLoading(false);
          setPlaybackError("Playback needs a tap to start in this browser.");
        });
      }
      return;
    }

    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if (!currentTrack.youtubeVideoId) {
      setIsLoading(false);
      setIsPlaying(false);
      setPlaybackError("This track has no playable YouTube video.");
      return;
    }

    const player = youtubePlayerRef.current;
    setIsLoading(true);
    if (player) {
      player.setVolume(Math.round(volume * 100));
      player.loadVideoById(currentTrack.youtubeVideoId);
    }
  }, [currentTrack]);

  useEffect(() => {
    const player = youtubePlayerRef.current;
    if (!currentTrack?.youtubeVideoId || !isPlaying || !player) return;

    const timer = window.setInterval(() => {
      const time = player.getCurrentTime();
      const total = player.getDuration();
      if (Number.isFinite(time)) setCurrentTime(time);
      if (Number.isFinite(total) && total > 0) setDuration(total);
      if (Number.isFinite(time) && time - lastReportedTimeRef.current >= 15) {
        playbackEventRef.current?.(currentTrack, time - lastReportedTimeRef.current);
        lastReportedTimeRef.current = time;
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [currentTrack, isPlaying]);

  const registerYouTubePlayer = useCallback((player: YouTubeIframePlayer | null) => {
    youtubePlayerRef.current = player;
    const track = currentTrackRef.current;
    if (!player || !track?.youtubeVideoId) return;
    player.setVolume(Math.round(volume * 100));
    if (isPlaying) player.loadVideoById(track.youtubeVideoId);
    else player.cueVideoById(track.youtubeVideoId);
  }, [isPlaying, volume]);

  const reportYouTubeState = useCallback((state: number) => {
    if (!currentTrackRef.current?.youtubeVideoId) return;
    if (state === 1) {
      const player = youtubePlayerRef.current;
      setIsPlaying(true);
      setIsLoading(false);
      if (player) {
        const total = player.getDuration();
        if (Number.isFinite(total) && total > 0) setDuration(total);
      }
    } else if (state === 2) {
      setIsPlaying(false);
      setIsLoading(false);
    } else if (state === 3) {
      setIsLoading(true);
    } else if (state === -1 || state === 5) {
      setIsLoading(false);
    } else if (state === 0) {
      setIsPlaying(false);
      setIsLoading(false);
      nextRef.current();
    }
  }, []);

  const reportYouTubeError = useCallback((message?: string) => {
    if (!currentTrackRef.current?.youtubeVideoId) return;
    setIsLoading(false);
    setIsPlaying(false);
    setPlaybackError(message || "YouTube couldn't play this video. Try another track.");
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
    audioRef.current?.pause();
    youtubePlayerRef.current?.pauseVideo();
    playContextRef.current = context?.length ? context : [...library, track];
    setQueue((existing) => (context?.length ? context.filter((item) => item.id !== track.id) : existing));

    let playableTrack = track;
    if (track.source !== "local" && !track.audioUrl && !track.youtubeVideoId) {
      try {
        const playback = await youtubePlaybackProvider.resolveTrack(track);
        if (requestId !== playRequestRef.current) return;
        playableTrack = { ...track, ...playback };
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
    onPlaybackEvent?.(playableTrack, 0);
    setRecentlyPlayed((existing) => {
      const next = [playableTrack.id, ...existing.filter((id) => id !== playableTrack.id)].slice(0, 12);
      writeStored("recent", next);
      return next;
    });
  }, [library, onPlaybackEvent]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!currentTrack) {
      setPlaybackError("Choose a track to start listening.");
      return;
    }
    if (currentTrack.youtubeVideoId) {
      const player = youtubePlayerRef.current;
      if (!player) {
        setPlaybackError("The YouTube player is still starting. Try again in a moment.");
        return;
      }
      setPlaybackError(null);
      if (isPlaying) player.pauseVideo();
      else {
        setIsLoading(true);
        player.playVideo();
      }
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
        setPlaybackError("Playback needs a tap to start in this browser.");
      });
    }
  }, [currentTrack, isPlaying]);

  const next = useCallback(() => {
    if (!currentTrack) return;
    const available = queue.length ? queue : playContextRef.current.filter((track) => track.id !== currentTrack.id);
    if (!available.length) return;
    const index = shuffle ? Math.floor(Math.random() * available.length) : 0;
    const nextTrack = available[index];
    setQueue((items) => items.filter((track) => track.id !== nextTrack.id));
    playTrack(nextTrack, playContextRef.current);
  }, [currentTrack, playTrack, queue, shuffle]);
  nextRef.current = next;

  const previous = useCallback(() => {
    if (!currentTrack) return;
    if (currentTime > 4) {
      seek(0);
      return;
    }
    const context = playContextRef.current;
    const index = context.findIndex((track) => track.id === currentTrack.id);
    const previousTrack = context[(index - 1 + context.length) % context.length];
    if (previousTrack) playTrack(previousTrack, context);
  }, [currentTime, currentTrack, playTrack]);

  const seek = useCallback((value: number) => {
    if (currentTrack?.youtubeVideoId) youtubePlayerRef.current?.seekTo(value, true);
    else if (audioRef.current) audioRef.current.currentTime = value;
    setCurrentTime(value);
  }, [currentTrack]);

  const setVolume = useCallback((value: number) => {
    const nextVolume = Math.min(1, Math.max(0, value));
    setVolumeState(nextVolume);
    youtubePlayerRef.current?.setVolume(Math.round(nextVolume * 100));
  }, []);
  const toggleShuffle = () => setShuffle((value) => !value);
  const cycleRepeat = () => setRepeat((value) => (value === "off" ? "all" : value === "all" ? "one" : "off"));
  const addToQueue = (track: Track) => setQueue((items) => (items.some((item) => item.id === track.id) ? items : [...items, track]));
  const playNext = (track: Track) => setQueue((items) => [track, ...items.filter((item) => item.id !== track.id)]);
  const removeFromQueue = (id: string) => setQueue((items) => items.filter((track) => track.id !== id));
  const clearQueue = () => setQueue([]);
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
      registerYouTubePlayer, reportYouTubeState, reportYouTubeError, playTrack, togglePlay, next,
      previous, seek, setVolume, toggleShuffle, cycleRepeat, addToQueue, playNext, removeFromQueue,
      clearQueue, toggleLike, syncLikedIds, importFiles, clearLibrary,
    }),
    [
      currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library,
      likedIds, recentlyPlayed, shuffle, repeat, playbackError, registerYouTubePlayer,
      reportYouTubeState, reportYouTubeError, playTrack, togglePlay, next, previous, seek,
      setVolume, toggleShuffle, cycleRepeat, addToQueue, playNext, removeFromQueue,
      clearQueue, toggleLike, syncLikedIds, importFiles, clearLibrary,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}
