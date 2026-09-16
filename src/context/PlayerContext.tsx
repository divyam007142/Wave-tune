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
import { catalogTracks } from "../data/catalog";
import { clearLocalTracks, loadLocalTracks, readStored, saveLocalTrack, writeStored } from "../services/storage";
import type { Track } from "../types/music";

type RepeatMode = "off" | "all" | "one";
type PlayerContextValue = {
  currentTrack: Track;
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
  togglePlay: () => void;
  next: () => void;
  previous: () => void;
  seek: (value: number) => void;
  setVolume: (value: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
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

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track>(catalogTracks[0]);
  const [queue, setQueue] = useState<Track[]>(catalogTracks.slice(1, 5));
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(catalogTracks[0].duration);
  const [volume, setVolumeState] = useState(() => readStored("volume", 0.72));
  const [likedIds, setLikedIds] = useState<string[]>(() => readStored("liked", ["solace"]));
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>(() => readStored("recent", ["night-drive", "solace", "open-water"]));
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("all");
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playContextRef = useRef<Track[]>(catalogTracks);
  const repeatRef = useRef<RepeatMode>("all");
  const nextRef = useRef<() => void>(() => undefined);
  repeatRef.current = repeat;

  useEffect(() => {
    loadLocalTracks().then(setLibrary).catch((error) => console.warn("Wave Tune library unavailable", error));
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoaded = () => {
      setDuration(Number.isFinite(audio.duration) ? audio.duration : currentTrack.duration);
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
      setPlaybackError("Couldn't load this song. Try another track or import a local file.");
      console.warn("Wave Tune playback error", audio.error);
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
    audio.src = currentTrack.audioUrl ?? "";
    audio.load();
    setCurrentTime(0);
    setDuration(currentTrack.duration);
    setPlaybackError(null);
    if (isPlaying) {
      setIsLoading(true);
      void audio.play().catch(() => {
        setIsPlaying(false);
        setPlaybackError("Playback needs a tap to start in this browser.");
      });
    }
  }, [currentTrack]);

  const playTrack = useCallback((track: Track, context?: Track[]) => {
    playContextRef.current = context?.length ? context : [...catalogTracks, ...library];
    setCurrentTrack(track);
    setQueue((existing) => {
      const nextQueue = context?.length ? context.filter((item) => item.id !== track.id) : existing;
      return nextQueue;
    });
    setIsPlaying(true);
    setPlaybackError(null);
    setRecentlyPlayed((existing) => {
      const next = [track.id, ...existing.filter((id) => id !== track.id)].slice(0, 12);
      writeStored("recent", next);
      return next;
    });
  }, [library]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack.audioUrl) {
      setPlaybackError("This track has no playable audio yet. Import a local file to keep listening.");
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
  }, [currentTrack.audioUrl, isPlaying]);

  const next = useCallback(() => {
    const available = queue.length ? queue : playContextRef.current.filter((track) => track.id !== currentTrack.id);
    if (!available.length) return;
    const index = shuffle ? Math.floor(Math.random() * available.length) : 0;
    const nextTrack = available[index];
    setQueue((items) => items.filter((track) => track.id !== nextTrack.id));
    playTrack(nextTrack, playContextRef.current);
  }, [currentTrack.id, playContextRef, playTrack, queue, shuffle]);
  nextRef.current = next;

  const previous = useCallback(() => {
    if (currentTime > 4) {
      seek(0);
      return;
    }
    const context = playContextRef.current;
    const index = context.findIndex((track) => track.id === currentTrack.id);
    const previousTrack = context[(index - 1 + context.length) % context.length];
    if (previousTrack) playTrack(previousTrack, context);
  }, [currentTime, currentTrack.id, playTrack]);

  const seek = useCallback((value: number) => {
    if (audioRef.current) audioRef.current.currentTime = value;
    setCurrentTime(value);
  }, []);

  const setVolume = (value: number) => setVolumeState(Math.min(1, Math.max(0, value)));
  const toggleShuffle = () => setShuffle((value) => !value);
  const cycleRepeat = () => setRepeat((value) => (value === "off" ? "all" : value === "all" ? "one" : "off"));
  const addToQueue = (track: Track) => setQueue((items) => (items.some((item) => item.id === track.id) ? items : [...items, track]));
  const playNext = (track: Track) => setQueue((items) => [track, ...items.filter((item) => item.id !== track.id)]);
  const removeFromQueue = (id: string) => setQueue((items) => items.filter((track) => track.id !== id));
  const clearQueue = () => setQueue([]);
  const toggleLike = (track: Track) => {
    setLikedIds((items) => {
      const next = items.includes(track.id) ? items.filter((id) => id !== track.id) : [track.id, ...items];
      writeStored("liked", next);
      return next;
    });
  };

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
      likedIds, recentlyPlayed, shuffle, repeat, playbackError, playTrack, togglePlay, next,
      previous, seek, setVolume, toggleShuffle, cycleRepeat, addToQueue, playNext, removeFromQueue,
      clearQueue, toggleLike, importFiles, clearLibrary,
    }),
    [currentTrack, isPlaying, isLoading, currentTime, duration, volume, queue, library, likedIds, recentlyPlayed, shuffle, repeat, playbackError, playTrack, togglePlay, next, previous],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) throw new Error("usePlayer must be used within PlayerProvider");
  return context;
}