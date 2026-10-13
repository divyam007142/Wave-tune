import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  Heart,
  ListMusic,
  Music2,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { usePlayer } from "../../context/PlayerContext";
import type { Track } from "../../types/music";
import "./mobile-now-playing.css";

type MobileNowPlayingProps = {
  onClose?: () => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  return `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

function TrackArt({ track, className = "", alt = "" }: { track: Track; className?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [track.id, track.artwork]);

  if (track.artwork && !failed) {
    return <img className={className} src={track.artwork} alt={alt} onError={() => setFailed(true)} />;
  }

  return <span className={`${className} wt-player-artwork-fallback`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
    <span aria-hidden="true">{track.title.slice(0, 1).toUpperCase()}</span>
    <Music2 aria-hidden="true" />
  </span>;
}

export function MobileNowPlaying({ onClose }: MobileNowPlayingProps) {
  const {
    currentTrack,
    isPlaying,
    isLoading,
    currentTime,
    duration,
    volume,
    queue,
    shuffle,
    repeat,
    playbackError,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    likedIds,
    playQueueTrack,
    removeFromQueue,
    clearQueue,
  } = usePlayer();
  const [queueOpen, setQueueOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  );
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const totalDuration = duration || currentTrack?.duration || 0;
  const boundedTime = Math.max(0, Math.min(currentTime, totalDuration || currentTime));
  const remaining = Math.max(0, totalDuration - boundedTime);
  const isLiked = currentTrack ? likedIds.includes(currentTrack.id) : false;
  const progress = totalDuration > 0 ? `${Math.min(100, (boundedTime / totalDuration) * 100)}%` : "0%";

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => setMobileViewport(media.matches);
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!mobileViewport) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mobileViewport]);

  const repeatLabel = repeat === "one" ? "Repeat one" : repeat === "all" ? "Repeat all" : "Repeat off";
  const VolumeIcon = volume <= 0 ? VolumeX : volume < .5 ? Volume1 : Volume2;

  return (
    <section ref={dialogRef} className="wave-mobile-player" role="dialog" aria-modal="true" aria-label="Now playing">
      <header className="wt-player-topbar">
        <button ref={closeButtonRef} className="wt-player-icon" type="button" onClick={onClose} aria-label="Return to browsing">
          <ChevronDown size={23} strokeWidth={1.8} />
        </button>
        <div className="wt-player-topbar-copy">
          <span>Now playing</span>
          <strong>WAVE TUNE</strong>
        </div>
        <button
          className="wt-player-icon"
          type="button"
          onClick={() => setQueueOpen((open) => !open)}
          aria-label={queueOpen ? "Hide queue" : "Show queue"}
          aria-expanded={queueOpen}
          aria-controls="wt-player-queue"
        >
          {queueOpen ? <X size={20} /> : <ListMusic size={21} strokeWidth={1.8} />}
        </button>
      </header>

      {!currentTrack ? (
        <div className="wt-player-empty">
          <span className="wt-player-empty-icon"><Music2 size={25} /></span>
          <h1>Nothing playing yet</h1>
          <p>Choose a song while browsing and it will be waiting here.</p>
          <button className="wt-player-queue-toggle" type="button" onClick={onClose}>
            <ChevronDown size={16} /> Back to browsing
          </button>
        </div>
      ) : (
        <main className="wt-player-main">
          <div className="wt-player-artwork-wrap" style={{ "--wt-art-accent": currentTrack.accent } as CSSProperties}>
            <span className="wt-player-artwork-shadow" aria-hidden="true" />
            <TrackArt track={currentTrack} className="wt-player-artwork" alt={`${currentTrack.title} artwork`} />
          </div>

          <div className="wt-player-meta">
            <div className="wt-player-track-copy" aria-live="polite">
              <h1 title={currentTrack.title}>{currentTrack.title}</h1>
              <p title={currentTrack.artist}>{currentTrack.artist}</p>
            </div>
            <button
              className={`wt-player-icon wt-player-like ${isLiked ? "is-liked" : ""}`}
              type="button"
              onClick={() => toggleLike(currentTrack)}
              aria-label={isLiked ? "Unlike this track" : "Like this track"}
              aria-pressed={isLiked}
            >
              <Heart size={20} fill={isLiked ? "currentColor" : "none"} />
            </button>
          </div>

          <div className="wt-player-seek">
            <input
              className="wt-player-range"
              type="range"
              min={0}
              max={totalDuration || 0}
              step={1}
              value={boundedTime}
              style={{ "--wt-progress": progress } as CSSProperties}
              onChange={(event) => seek(Number(event.currentTarget.value))}
              aria-label="Seek through track"
              aria-valuetext={`${formatTime(boundedTime)} elapsed, ${formatTime(remaining)} remaining`}
              disabled={!totalDuration}
            />
            <div className="wt-player-time" aria-live="off">
              <span>{formatTime(boundedTime)}</span>
              <span>{totalDuration ? `−${formatTime(remaining)} · ${formatTime(totalDuration)}` : "—:—"}</span>
            </div>
          </div>

          <div className="wt-player-controls" aria-label="Playback controls">
            <span className="wt-player-control">
              <button
                className="wt-player-icon"
                type="button"
                onClick={toggleShuffle}
                aria-label={shuffle ? "Turn shuffle off" : "Turn shuffle on"}
                aria-pressed={shuffle}
              >
                <Shuffle size={19} />
              </button>
            </span>
            <span className="wt-player-control">
              <button className="wt-player-icon" type="button" onClick={previous} aria-label="Previous track">
                <SkipBack size={22} fill="currentColor" />
              </button>
            </span>
            <button
              className="wt-player-play"
              type="button"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              aria-busy={isLoading}
            >
              {isPlaying ? <Pause size={25} fill="currentColor" /> : <Play size={25} fill="currentColor" />}
            </button>
            <span className="wt-player-control">
              <button className="wt-player-icon" type="button" onClick={next} aria-label="Next track">
                <SkipForward size={22} fill="currentColor" />
              </button>
            </span>
            <span className="wt-player-control">
              <button
                className="wt-player-icon"
                type="button"
                onClick={cycleRepeat}
                aria-label={`${repeatLabel}; change repeat mode`}
                aria-pressed={repeat !== "off"}
              >
                {repeat === "one" ? <Repeat1 size={19} /> : <Repeat size={19} />}
                {repeat === "one" && <small className="wt-repeat-state" aria-hidden="true">1</small>}
              </button>
            </span>
          </div>

          <div className="wt-player-secondary">
            <label className="wt-volume-control">
              <VolumeIcon size={17} aria-hidden="true" />
              <input
                className="wt-player-range"
                type="range"
                min={0}
                max={1}
                step={.01}
                value={volume}
                style={{ "--wt-progress": `${volume * 100}%` } as CSSProperties}
                onChange={(event) => setVolume(Number(event.currentTarget.value))}
                aria-label="Volume"
                aria-valuetext={`${Math.round(volume * 100)} percent`}
              />
            </label>
            <button
              className="wt-player-queue-toggle"
              type="button"
              onClick={() => setQueueOpen((open) => !open)}
              aria-expanded={queueOpen}
              aria-controls="wt-player-queue"
            >
              <ListMusic size={16} />
              <span>Queue</span>
              <span className="wt-player-queue-count" aria-label={`${queue.length} tracks queued`}>{queue.length}</span>
            </button>
          </div>

          {playbackError && <p className="wt-player-error" role="alert">{playbackError}</p>}
        </main>
      )}

      {queueOpen && (
        <section className="wt-player-queue" id="wt-player-queue" aria-label="Up next">
          <div className="wt-player-queue-head">
            <div className="wt-player-queue-heading">
              <span>Listening next</span>
              <h2>Queue <span>· {queue.length}</span></h2>
            </div>
            <button className="wt-player-queue-clear" type="button" onClick={clearQueue} disabled={!queue.length}>
              Clear queue
            </button>
          </div>
          {queue.length ? (
            <div className="wt-player-queue-list" role="list">
              {queue.map((track, index) => (
                <div className={`wt-player-queue-item ${track.id === currentTrack?.id ? "is-current" : ""}`} role="listitem" key={`${track.id}-${index}`}>
                  <span className="wt-player-queue-index">{String(index + 1).padStart(2, "0")}</span>
                  <button className="wt-player-queue-track" type="button" onClick={() => playQueueTrack(track)} aria-label={`Play ${track.title} by ${track.artist} next`}>
                    <TrackArt track={track} alt="" />
                    <span className="wt-player-queue-track-copy">
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                  </button>
                  <button
                    className="wt-player-icon wt-player-queue-remove"
                    type="button"
                    onClick={() => removeFromQueue(track.id)}
                    aria-label={`Remove ${track.title} from queue`}
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="wt-player-queue-empty">
              <ListMusic size={21} />
              <strong>Your queue is clear</strong>
              <span>Add tracks while browsing and they will appear here.</span>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

export default MobileNowPlaying;
