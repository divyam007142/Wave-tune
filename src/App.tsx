import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Album,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Disc3,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  Menu,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Settings,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { catalogTracks, playlists } from "./data/catalog";
import { usePlayer } from "./context/PlayerContext";
import { musicSearch } from "./services/musicSearch";
import type { Playlist, SearchResult, Track } from "./types/music";

type View = "home" | "search" | "library" | "liked" | "recent" | "playlists" | "playlist" | "settings";

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "library", label: "Your Library", icon: Library },
  { id: "liked", label: "Liked Songs", icon: Heart },
  { id: "recent", label: "Recently Played", icon: Clock3 },
  { id: "playlists", label: "Playlists", icon: ListMusic },
];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const mins = Math.floor(value / 60);
  const secs = Math.floor(value % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function Artwork({ track, className = "", priority = false }: { track?: Track; className?: string; priority?: boolean }) {
  if (!track) {
    return <div className={`artwork artwork-empty ${className}`}><Music2 size={24} /></div>;
  }
  return track.artwork ? (
    <img className={`artwork ${className}`} src={track.artwork} alt={`${track.title} cover`} loading={priority ? "eager" : "lazy"} />
  ) : (
    <div className={`artwork artwork-generated ${className}`} style={{ background: `linear-gradient(145deg, ${track.accent}, #11151b 76%)` }}>
      <span>{track.title.charAt(0)}</span>
      <Music2 size={26} />
    </div>
  );
}

function WaveLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`logo-lockup ${compact ? "logo-compact" : ""}`} aria-label="Wave Tune">
      <span className="logo-mark">
        <i /><i /><i /><i />
      </span>
      {!compact && <span className="logo-wordmark">WAVE <b>TUNE</b></span>}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
  active = false,
  className = "",
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
  active?: boolean;
  className?: string;
}) {
  return <motion.button whileTap={{ scale: 0.93 }} className={`icon-button ${active ? "is-active" : ""} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</motion.button>;
}

function TrackRow({ track, index, context, compact = false }: { track: Track; index?: number; context?: Track[]; compact?: boolean }) {
  const { currentTrack, isPlaying, playTrack, togglePlay, likedIds, toggleLike, addToQueue, removeFromQueue, queue } = usePlayer();
  const active = currentTrack.id === track.id;
  return (
    <motion.div layout className={`track-row ${active ? "is-current" : ""} ${compact ? "track-row-compact" : ""}`} whileHover={{ x: 3 }}>
      {index !== undefined ? <span className="track-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : index + 1}</span> : null}
      <button className="track-main" onClick={() => playTrack(track, context)}>
        <Artwork track={track} className="track-art" />
        <span className="track-copy">
          <strong>{track.title}</strong>
          <span>{track.artist}</span>
        </span>
      </button>
      {!compact && <span className="track-album">{track.album}</span>}
      <span className="track-actions">
        <IconButton className="track-play-control" label={active && isPlaying ? "Pause song" : "Play song"} onClick={() => active ? togglePlay() : playTrack(track, context)}>
          {active && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}
        </IconButton>
        <IconButton label={likedIds.includes(track.id) ? "Unlike song" : "Like song"} active={likedIds.includes(track.id)} onClick={() => toggleLike(track)}>
          <Heart size={16} fill={likedIds.includes(track.id) ? "currentColor" : "none"} />
        </IconButton>
        <IconButton label={queue.some((item) => item.id === track.id) ? "Remove from queue" : "Add to queue"} onClick={() => queue.some((item) => item.id === track.id) ? removeFromQueue(track.id) : addToQueue(track)}>
          {queue.some((item) => item.id === track.id) ? <Check size={16} /> : <Plus size={16} />}
        </IconButton>
      </span>
      <span className="track-duration">{track.duration ? formatTime(track.duration) : "—"}</span>
    </motion.div>
  );
}

function SectionHeader({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-header">{<div><span className="eyebrow">{eyebrow}</span><h2>{title}</h2></div>}{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={15} /></button>}</div>;
}

function TrackCard({ track, context }: { track: Track; context?: Track[] }) {
  const { currentTrack, isPlaying, playTrack, addToQueue } = usePlayer();
  const active = currentTrack.id === track.id;
  return (
    <motion.article className={`track-card ${active ? "is-current" : ""}`} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
      <div className="card-art-wrap">
        <Artwork track={track} className="card-art" />
        <motion.button whileTap={{ scale: 0.88 }} className="card-play" aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`} onClick={() => playTrack(track, context)}>
          {active && isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </motion.button>
      </div>
      <div className="card-title">{track.title}</div>
      <div className="card-subtitle">{track.artist}</div>
      <button className="card-queue" onClick={() => addToQueue(track)}><Plus size={13} /> Queue</button>
    </motion.article>
  );
}

function PlaylistCard({ playlist, onOpen }: { playlist: Playlist; onOpen: () => void }) {
  return <motion.button className="playlist-card" whileHover={{ y: -5 }} onClick={onOpen}>
    <img src={playlist.artwork} alt="" />
    <span className="playlist-card-copy"><strong>{playlist.name}</strong><span>{playlist.description}</span></span>
    <span className="playlist-card-arrow"><ArrowRight size={16} /></span>
  </motion.button>;
}

function Sidebar({ activeView, onNavigate, collapsed, setCollapsed, onImport }: { activeView: View; onNavigate: (view: View) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; onImport: () => void }) {
  return <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="sidebar-top"><WaveLogo compact={collapsed} /><IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}</IconButton></div>
    <nav className="sidebar-nav" aria-label="Primary navigation">
      <span className="nav-label">Menu</span>
      {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeView === id ? "is-active" : ""}`} onClick={() => onNavigate(id)} title={collapsed ? label : undefined}><Icon size={18} /><span>{label}</span>{id === "liked" && <span className="nav-count">{1}</span>}</button>)}
    </nav>
    <div className="sidebar-playlists"><div className="sidebar-playlist-head"><span className="nav-label">Your playlists</span><IconButton label="Create playlist" onClick={() => onNavigate("playlists")}><Plus size={17} /></IconButton></div>
      {playlists.map((playlist) => <button className="sidebar-playlist" key={playlist.id} onClick={() => onNavigate("playlist")}><span className="playlist-dot" style={{ backgroundImage: `url(${playlist.artwork})` }} /><span>{playlist.name}</span></button>)}
    </div>
    <button className="import-button" onClick={onImport}><Upload size={17} /><span>Import music</span></button>
    <div className="sidebar-footer"><div className="profile-avatar">DM</div><span><strong>David Miller</strong><small>Personal account</small></span><MoreHorizontal size={17} /></div>
  </aside>;
}

function MobileNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.filter((item) => ["home", "search", "library"].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "is-active" : ""} onClick={() => onNavigate(id)}><Icon size={20} /><span>{label}</span></button>)}</nav>;
}

function TopBar({ onSearch, onSettings, onMenu }: { onSearch: () => void; onSettings: () => void; onMenu: () => void }) {
  return <header className="mobile-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="Open menu"><Menu size={21} /></button><WaveLogo /><div className="topbar-actions"><IconButton label="Search" onClick={onSearch}><Search size={19} /></IconButton><IconButton label="Settings" onClick={onSettings}><UserRound size={19} /></IconButton></div></header>;
}

function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentTrack, isPlaying, togglePlay, currentTime, duration, isLoading } = usePlayer();
  return <motion.div layoutId="player-shell" className="mini-player">
    <button className="mini-track" onClick={onExpand}><Artwork track={currentTrack} className="mini-art" /><span><strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small></span></button>
    <div className="mini-progress"><span style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} /></div>
    <IconButton label={isPlaying ? "Pause" : "Play"} onClick={togglePlay} className="mini-play">{isLoading ? <span className="spinner" /> : isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</IconButton>
    <IconButton label="Open queue" className="mini-queue"><ListMusic size={18} /></IconButton>
  </motion.div>;
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { currentTrack, isPlaying, isLoading, togglePlay, currentTime, duration, seek, previous, next, volume, setVolume, shuffle, toggleShuffle, repeat, cycleRepeat, likedIds, toggleLike, addToQueue, playbackError } = usePlayer();
  return <motion.div className="full-player-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section layoutId="player-shell" className="full-player">
      <div className="full-player-head"><IconButton label="Close player" onClick={onClose}><ChevronDown size={22} /></IconButton><span>NOW PLAYING</span><IconButton label="More options"><MoreHorizontal size={20} /></IconButton></div>
      <div className="full-player-body">
        <motion.div className="full-art-wrap" animate={isPlaying ? { scale: [1, 1.015, 1] } : { scale: 1 }} transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}><Artwork track={currentTrack} className="full-art" /><div className="art-glow" style={{ background: currentTrack.accent }} /></motion.div>
        <div className="full-meta"><div><span className="eyebrow">PLAYING FROM {currentTrack.album.toUpperCase()}</span><h1>{currentTrack.title}</h1><p>{currentTrack.artist}</p></div><IconButton label={likedIds.includes(currentTrack.id) ? "Unlike song" : "Like song"} active={likedIds.includes(currentTrack.id)} onClick={() => toggleLike(currentTrack)} className="like-button"><Heart size={23} fill={likedIds.includes(currentTrack.id) ? "currentColor" : "none"} /></IconButton></div>
        <div className="seek-wrap"><input aria-label="Seek song" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} style={{ "--range-progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties} /><div><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
        {playbackError && <div className="playback-error"><span>{playbackError}</span><button onClick={togglePlay}>Try again</button></div>}
        <div className="full-controls"><IconButton label="Shuffle" active={shuffle} onClick={toggleShuffle}><Shuffle size={19} /></IconButton><IconButton label="Previous" onClick={previous}><SkipBack size={24} fill="currentColor" /></IconButton><motion.button whileTap={{ scale: 0.9 }} className="main-play" onClick={togglePlay}>{isLoading ? <span className="spinner spinner-dark" /> : isPlaying ? <Pause size={27} fill="currentColor" /> : <Play size={27} fill="currentColor" />}</motion.button><IconButton label="Next" onClick={next}><SkipForward size={24} fill="currentColor" /></IconButton><IconButton label={`Repeat ${repeat}`} active={repeat !== "off"} onClick={cycleRepeat}><Repeat size={19} /><small>{repeat === "one" ? "1" : ""}</small></IconButton></div>
        <div className="full-secondary"><button onClick={() => addToQueue(currentTrack)}><ListPlus size={17} /> Add to queue</button><label><VolumeX size={16} /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ "--range-progress": `${volume * 100}%` } as React.CSSProperties} /><Volume2 size={16} /></label></div>
      </div>
    </motion.section>
  </motion.div>;
}

function QueuePanel() {
  const { currentTrack, queue, removeFromQueue, clearQueue, playTrack } = usePlayer();
  return <aside className="queue-panel"><div className="queue-head"><div><span className="eyebrow">LISTENING NEXT</span><h2>Queue</h2></div><button className="text-button" onClick={clearQueue}>Clear all</button></div><div className="now-playing-card"><Artwork track={currentTrack} className="queue-now-art" /><span className="queue-now-copy"><small>NOW PLAYING</small><strong>{currentTrack.title}</strong><span>{currentTrack.artist}</span></span><span className="eq-mark"><i /><i /><i /></span></div><div className="queue-list">{queue.length ? queue.map((track, index) => <motion.div layout key={track.id} className="queue-item"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><button onClick={() => playTrack(track, queue)}><Artwork track={track} className="queue-art" /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><IconButton label={`Remove ${track.title} from queue`} onClick={() => removeFromQueue(track.id)}><X size={15} /></IconButton></motion.div>) : <div className="queue-empty"><ListMusic size={25} /><p>Your queue is empty</p><span>Add songs from any card to keep the session going.</span></div>}</div><div className="queue-footer"><span>{queue.length} {queue.length === 1 ? "song" : "songs"} queued</span><button onClick={clearQueue}><Trash2 size={15} /> Clear</button></div></aside>;
}

function HomeView({ onNavigate, onOpenPlaylist }: { onNavigate: (view: View) => void; onOpenPlaylist: (playlist: Playlist) => void }) {
  const { currentTrack, library, playTrack } = usePlayer();
  const recent = catalogTracks.slice(0, 5);
  const madeForYou = catalogTracks.slice(3, 8);
  return <div className="page home-page"><section className="hero-banner"><div className="hero-copy"><span className="eyebrow">WEDNESDAY, SEPTEMBER 16</span><h1>Good evening<span className="lime-dot">.</span></h1><p>Find a little room to breathe.</p><button className="hero-cta" onClick={() => playTrack(currentTrack, catalogTracks)}><Play size={16} fill="currentColor" /> Resume listening</button></div><div className="hero-feature"><Artwork track={currentTrack} className="hero-feature-art" priority /><div><span className="eyebrow">NOW PLAYING</span><strong>{currentTrack.title}</strong><span>{currentTrack.artist}</span></div></div><div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-wave"><i /><i /><i /><i /><i /></div></section>
    <section><SectionHeader eyebrow="KEEP THE MOMENT GOING" title="Recently played" action="See all" onAction={() => onNavigate("recent")} /><div className="card-row">{recent.map((track) => <TrackCard key={track.id} track={track} context={recent} />)}</div></section>
    <section><SectionHeader eyebrow="MADE FOR YOUR HEADSPACE" title="Curated for you" /><div className="card-row">{madeForYou.map((track) => <TrackCard key={track.id} track={track} context={madeForYou} />)}</div></section>
    <section><SectionHeader eyebrow="YOUR COLLECTION" title="Playlists" action="View library" onAction={() => onNavigate("playlists")} /><div className="playlist-row">{playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => onOpenPlaylist(playlist)} />)}</div></section>
    {library.length > 0 && <section><SectionHeader eyebrow="ON THIS DEVICE" title="Local library" action="Open library" onAction={() => onNavigate("library")} /><div className="card-row">{library.slice(0, 5).map((track) => <TrackCard key={track.id} track={track} context={library} />)}</div></section>}
  </div>;
}

function SearchView() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!query.trim()) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      musicSearch.search(query).then(setResults).catch(() => setError("Search is unavailable right now.")).finally(() => setLoading(false));
    }, 320);
    return () => window.clearTimeout(timer);
  }, [query]);
  const hasResults = Boolean(results && (results.tracks.length || results.albums.length || results.artists.length || results.playlists.length));
  return <div className="page search-page"><div className="search-heading"><span className="eyebrow">DISCOVER SOMETHING NEW</span><h1>Find your next song.</h1><p>Search songs, artists, or albums and play a 30-second preview instantly.</p></div><div className="search-input-wrap"><Search size={21} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setError(null); }} placeholder="Try “The Weeknd” or “jazz”..." /><kbd>⌘ K</kbd>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={17} /></button>}</div>{loading && <div className="search-results"><SkeletonRows count={5} /></div>}{error && <EmptyState icon={<Search size={27} />} title="Search is unavailable" body="Check your connection and try again." action="Try again" onAction={() => setQuery(`${query} `)} />}{!loading && !error && query && !hasResults && <EmptyState icon={<Sparkles size={27} />} title={`Nothing found for “${query}”`} body="Try a different song, artist, or album." />}{!loading && !error && hasResults && results && <div className="search-results"><SectionHeader eyebrow="PREVIEWS" title={`${results.tracks.length} songs found`} /><div className="track-list">{results.tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={results.tracks} />)}</div>{results.albums.length > 0 && <><SectionHeader eyebrow="FROM THESE RELEASES" title="Albums" /><div className="search-chips">{results.albums.map((album) => <div className="result-chip" key={album.id}><img src={album.artwork} alt="" /><span><strong>{album.name}</strong><small>Album · {album.artist}</small></span></div>)}</div></>}</div>}{!query && <div className="search-start"><div className="search-start-icon"><Search size={28} /></div><h2>Search the catalogue</h2><p>Search the iTunes catalogue for a song or artist. Every result has a playable preview.</p><div className="search-suggestions"><button onClick={() => setQuery("The Weeknd")}>The Weeknd</button><button onClick={() => setQuery("lofi")}>lofi</button><button onClick={() => setQuery("Billie Eilish")}>Billie Eilish</button></div></div>}</div>;
}

function SkeletonRows({ count }: { count: number }) {
  return <div className="skeleton-stack">{Array.from({ length: count }).map((_, index) => <div className="skeleton-row" key={index}><span /><i /><b /><em /></div>)}</div>;
}

function EmptyState({ icon, title, body, action, onAction }: { icon: React.ReactNode; title: string; body: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state"><div className="empty-icon">{icon}</div><h2>{title}</h2><p>{body}</p>{action && <button className="primary-button" onClick={onAction}>{action}</button>}</div>;
}

function LibraryView({ onImport }: { onImport: () => void }) {
  const { library, playTrack } = usePlayer();
  return <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">ON THIS DEVICE</span><h1>Your library</h1><p>Private by default. Your audio never leaves this device.</p></div><button className="primary-button" onClick={onImport}><Upload size={17} /> Import music</button></div>{library.length ? <div className="track-list library-list">{library.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={library} />)}</div> : <EmptyState icon={<Download size={28} />} title="Bring your music with you" body="Import audio files from your device to build a private library that stays in your browser." action="Import audio files" onAction={onImport} />}</div>;
}

function LikedView() {
  const { likedIds, library } = usePlayer();
  const allTracks = [...catalogTracks, ...library];
  const tracks = allTracks.filter((track) => likedIds.includes(track.id));
  return <div className="page"><div className="page-heading"><span className="eyebrow">YOUR FAVORITES</span><h1>Liked songs</h1><p>Everything you want to come back to.</p></div>{tracks.length ? <div className="track-list">{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={tracks} />)}</div> : <EmptyState icon={<Heart size={27} />} title="Nothing here yet" body="Tap the heart on any song to make it yours." />}</div>;
}

function RecentView() {
  const { recentlyPlayed, library } = usePlayer();
  const allTracks = [...catalogTracks, ...library];
  const tracks = recentlyPlayed.map((id) => allTracks.find((track) => track.id === id)).filter(Boolean) as Track[];
  return <div className="page"><div className="page-heading"><span className="eyebrow">YOUR LISTENING HISTORY</span><h1>Recently played</h1><p>A short memory of what you’ve been listening to.</p></div>{tracks.length ? <div className="track-list">{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={tracks} />)}</div> : <EmptyState icon={<Clock3 size={27} />} title="Your history is empty" body="Start playing something and it will show up here." />}</div>;
}

function PlaylistsView({ onOpen, onCreate }: { onOpen: (playlist: Playlist) => void; onCreate: () => void }) {
  return <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>Playlists</h1><p>Make space for whatever the day calls for.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} /> New playlist</button></div><div className="playlist-grid">{playlists.map((playlist) => <PlaylistCard key={playlist.id} playlist={playlist} onOpen={() => onOpen(playlist)} />)}</div><div className="playlist-callout"><div className="callout-icon"><ListMusic size={22} /></div><div><strong>Small playlists, big moods.</strong><span>Keep things simple with a soundtrack for every part of your day.</span></div><ArrowRight size={18} /></div></div>;
}

function PlaylistView({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
  const tracks = playlist.trackIds.map((id) => catalogTracks.find((track) => track.id === id)).filter(Boolean) as Track[];
  const { playTrack } = usePlayer();
  return <div className="page playlist-page"><button className="back-button" onClick={onBack}><ArrowLeft size={17} /> All playlists</button><section className="playlist-hero"><img src={playlist.artwork} alt="" /><div><span className="eyebrow">PLAYLIST</span><h1>{playlist.name}</h1><p>{playlist.description}</p><span className="playlist-meta">{tracks.length} songs · Curated by you</span><div className="playlist-actions"><motion.button whileTap={{ scale: 0.94 }} className="main-play small" onClick={() => tracks[0] && playTrack(tracks[0], tracks)}><Play size={17} fill="currentColor" /> Play</motion.button><IconButton label="Shuffle playlist"><Shuffle size={18} /></IconButton><IconButton label="More playlist options"><MoreHorizontal size={20} /></IconButton></div></div></section><div className="track-list playlist-track-list">{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={tracks} />)}</div></div>;
}

function SettingsView() {
  const { clearLibrary } = usePlayer();
  const [theme, setTheme] = useState(() => localStorage.getItem("wave-tune:theme") ?? "dark");
  const [autoplay, setAutoplay] = useState(true);
  const chooseTheme = (value: string) => { setTheme(value); localStorage.setItem("wave-tune:theme", value); document.documentElement.dataset.theme = value; };
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  return <div className="page settings-page"><div className="page-heading"><span className="eyebrow">MAKE IT YOURS</span><h1>Settings</h1><p>Quiet controls for a quieter listening experience.</p></div><div className="settings-groups"><section className="settings-group"><div className="settings-group-head"><SlidersHorizontal size={18} /><div><h2>Appearance</h2><p>Choose the mood of the interface.</p></div></div><div className="setting-line"><span><strong>Theme</strong><small>How Wave Tune looks across your devices</small></span><div className="segmented">{["dark", "light", "system"].map((item) => <button key={item} className={theme === item ? "is-selected" : ""} onClick={() => chooseTheme(item)}>{item}<span>{theme === item && <Check size={13} />}</span></button>)}</div></div></section><section className="settings-group"><div className="settings-group-head"><Volume2 size={18} /><div><h2>Playback</h2><p>Small adjustments to how things sound.</p></div></div><div className="setting-line"><span><strong>Autoplay</strong><small>Keep listening when your queue ends</small></span><button className={`toggle ${autoplay ? "is-on" : ""}`} onClick={() => setAutoplay(!autoplay)} aria-label="Toggle autoplay"><span /></button></div><div className="setting-line muted-setting"><span><strong>Crossfade</strong><small>Coming soon</small></span><span className="setting-value">Off</span></div><div className="setting-line muted-setting"><span><strong>Volume normalization</strong><small>Coming soon</small></span><span className="setting-value">Off</span></div></section><section className="settings-group"><div className="settings-group-head"><Library size={18} /><div><h2>Library</h2><p>Manage data saved in this browser.</p></div></div><div className="setting-line"><span><strong>Clear local library</strong><small>Remove imported audio metadata from this device</small></span><button className="danger-button" onClick={() => void clearLibrary()}><Trash2 size={15} /> Clear</button></div></section><section className="settings-group about-group"><div className="settings-group-head"><WaveLogo /><span className="version-pill">v1.0.0</span></div><p>Wave Tune is a private, browser-first music space. No account required.</p><a href="https://github.com" target="_blank" rel="noreferrer">Wave Tune on GitHub <ArrowUpRight size={14} /></a></section></div></div>;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [toast, setToast] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const { importFiles } = usePlayer();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActiveView("search");
      }
      if (event.key === "Escape") setFullPlayerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navigate = (view: View) => {
    setActiveView(view);
    setSelectedPlaylist(null);
    setMobileMenuOpen(false);
  };
  const openPlaylist = (playlist: Playlist) => { setSelectedPlaylist(playlist); setActiveView("playlist"); setMobileMenuOpen(false); };
  const onImport = () => fileInputRef.current?.click();
  const page = useMemo(() => {
    if (selectedPlaylist && activeView === "playlist") return <PlaylistView playlist={selectedPlaylist} onBack={() => { setSelectedPlaylist(null); setActiveView("playlists"); }} />;
    if (activeView === "home") return <HomeView onNavigate={navigate} onOpenPlaylist={openPlaylist} />;
    if (activeView === "search") return <SearchView />;
    if (activeView === "library") return <LibraryView onImport={onImport} />;
    if (activeView === "liked") return <LikedView />;
    if (activeView === "recent") return <RecentView />;
    if (activeView === "playlists") return <PlaylistsView onOpen={openPlaylist} onCreate={() => setToast("Playlist creation is ready for your next session.")} />;
    return <SettingsView />;
  }, [activeView, selectedPlaylist]);

  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <Sidebar activeView={activeView} onNavigate={navigate} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} onImport={onImport} />
    {mobileMenuOpen && <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}><motion.div className="mobile-drawer" initial={{ x: -280 }} animate={{ x: 0 }} onClick={(event) => event.stopPropagation()}><div className="drawer-head"><WaveLogo /><IconButton label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={19} /></IconButton></div><Sidebar activeView={activeView} onNavigate={navigate} collapsed={false} setCollapsed={() => undefined} onImport={onImport} /></motion.div></div>}
    <main className="main-column"><TopBar onSearch={() => navigate("search")} onSettings={() => navigate("settings")} onMenu={() => setMobileMenuOpen(true)} /><div className="desktop-toolbar"><div className="history-buttons"><IconButton label="Back"><ArrowLeft size={18} /></IconButton><IconButton label="Forward"><ArrowRight size={18} /></IconButton></div><button className="toolbar-search" onClick={() => navigate("search")}><Search size={17} /><span>Search your library</span><kbd>⌘ K</kbd></button><button className="toolbar-profile" onClick={() => navigate("settings")}><span className="profile-avatar">DM</span><span>David Miller</span><ChevronDown size={15} /></button></div><AnimatePresence mode="wait" initial={!reduceMotion}>{<motion.div key={`${activeView}-${selectedPlaylist?.id ?? ""}`} className="view-shell" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.24 }}>{page}</motion.div>}</AnimatePresence></main>
    <QueuePanel />
    <MiniPlayer onExpand={() => setFullPlayerOpen(true)} />
    <MobileNav activeView={activeView} onNavigate={navigate} />
    <input ref={fileInputRef} hidden type="file" accept="audio/*" multiple onChange={(event) => { if (event.target.files?.length) { void importFiles(event.target.files); setToast(`${event.target.files.length} track${event.target.files.length === 1 ? "" : "s"} added to your library.`); event.target.value = ""; } }} />
    <AnimatePresence>{fullPlayerOpen && <FullPlayer onClose={() => setFullPlayerOpen(false)} />}</AnimatePresence>
    <AnimatePresence>{toast && <motion.div className="toast" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}><Check size={16} /> {toast}</motion.div>}</AnimatePresence>
  </div>;
}