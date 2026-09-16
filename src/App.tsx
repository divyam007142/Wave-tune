import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Album,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  Home,
  Library,
  ListMusic,
  ListPlus,
  LogIn,
  LogOut,
  Menu,
  Mic2,
  MoreHorizontal,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Search,
  Settings2,
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
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { catalogTracks, playlists } from "./data/catalog";
import { usePlayer } from "./context/PlayerContext";
import { musicSearch } from "./services/musicSearch";
import { spotifyService, type SpotifyProfile, type SpotifySnapshot } from "./services/spotify";
import type { Playlist, SearchResult, Track } from "./types/music";

type View = "home" | "search" | "library" | "liked" | "recent" | "playlists" | "playlist" | "settings";
type SpotifyState = { profile?: SpotifyProfile; tracks: Track[]; playlists: Playlist[]; loading: boolean; error: string | null };

const navItems: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "For you", icon: Home },
  { id: "search", label: "Search", icon: Search },
  { id: "library", label: "Library", icon: Library },
  { id: "liked", label: "Liked songs", icon: Heart },
  { id: "recent", label: "Recently played", icon: Clock3 },
  { id: "playlists", label: "Playlists", icon: ListMusic },
];

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

function Artwork({ track, className = "", priority = false }: { track?: Track; className?: string; priority?: boolean }) {
  if (!track) return <div className={`artwork artwork-empty ${className}`}><Music2 size={22} /></div>;
  if (track.artwork) return <img className={`artwork ${className}`} src={track.artwork} alt={`${track.title} artwork`} loading={priority ? "eager" : "lazy"} />;
  return <div className={`artwork artwork-generated ${className}`} style={{ background: `linear-gradient(145deg, ${track.accent}, #9a7bc0)` }}><span>{track.title.charAt(0)}</span><Music2 size={24} /></div>;
}

function WaveLogo({ compact = false }: { compact?: boolean }) {
  return <div className={`logo-lockup ${compact ? "logo-compact" : ""}`} aria-label="Wave Tune">
    <span className="logo-mark"><i /><i /><i /><i /></span>
    {!compact && <span className="logo-wordmark">WAVE <b>TUNE</b></span>}
  </div>;
}

function IconButton({ label, onClick, children, active = false, className = "" }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; className?: string }) {
  return <motion.button whileTap={{ scale: 0.92 }} className={`icon-button ${active ? "is-active" : ""} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</motion.button>;
}

function SourcePill({ source }: { source: Track["source"] }) {
  return <span className={`source-pill source-${source}`}>{source === "spotify" ? "Spotify" : source === "local" ? "On this device" : "Wave Tune"}</span>;
}

function TrackRow({ track, index, context, compact = false }: { track: Track; index?: number; context?: Track[]; compact?: boolean }) {
  const { currentTrack, isPlaying, playTrack, togglePlay, likedIds, toggleLike, addToQueue, removeFromQueue, queue } = usePlayer();
  const active = currentTrack.id === track.id;
  const queued = queue.some((item) => item.id === track.id);
  return <motion.div layout className={`track-row ${active ? "is-current" : ""} ${compact ? "track-row-compact" : ""}`} whileHover={{ x: 2 }}>
    {index !== undefined && <span className="track-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>}
    <button className="track-main" onClick={() => playTrack(track, context)}>
      <Artwork track={track} className="track-art" />
      <span className="track-copy"><strong>{track.title}</strong><span>{track.artist}</span></span>
    </button>
    {!compact && <span className="track-album">{track.album}</span>}
    <span className="track-actions">
      <IconButton label={active && isPlaying ? "Pause song" : "Play song"} onClick={() => active ? togglePlay() : playTrack(track, context)}>{active && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</IconButton>
      <IconButton label={likedIds.includes(track.id) ? "Unlike song" : "Like song"} active={likedIds.includes(track.id)} onClick={() => toggleLike(track)}><Heart size={15} fill={likedIds.includes(track.id) ? "currentColor" : "none"} /></IconButton>
      <IconButton label={queued ? "Remove from queue" : "Add to queue"} onClick={() => queued ? removeFromQueue(track.id) : addToQueue(track)}>{queued ? <Check size={15} /> : <Plus size={15} />}</IconButton>
    </span>
    <span className="track-duration">{track.duration ? formatTime(track.duration) : "—"}</span>
  </motion.div>;
}

function TrackCard({ track, context }: { track: Track; context?: Track[] }) {
  const { currentTrack, isPlaying, playTrack, addToQueue } = usePlayer();
  const active = currentTrack.id === track.id;
  return <motion.article className={`track-card ${active ? "is-current" : ""}`} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
    <div className="card-art-wrap"><Artwork track={track} className="card-art" priority />
      <motion.button whileTap={{ scale: 0.88 }} className="card-play" aria-label={active && isPlaying ? `Pause ${track.title}` : `Play ${track.title}`} onClick={() => playTrack(track, context)}>{active && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</motion.button>
    </div>
    <div className="card-title">{track.title}</div><div className="card-subtitle">{track.artist}</div>
    <button className="card-queue" onClick={() => addToQueue(track)}><Plus size={13} /> Add to queue</button>
  </motion.article>;
}

function SectionHeader({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

function Sidebar({ activeView, onNavigate, collapsed, setCollapsed, onImport, profile, spotifyPlaylists, onConnect, onDisconnect }: { activeView: View; onNavigate: (view: View) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; onImport: () => void; profile?: SpotifyProfile; spotifyPlaylists: Playlist[]; onConnect: () => void; onDisconnect: () => void }) {
  return <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="sidebar-top"><WaveLogo compact={collapsed} /><span className="reference-brand">Chef Music</span><IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</IconButton></div>
    <nav className="sidebar-nav" aria-label="Primary navigation"><span className="nav-label">Recommend</span>{[{ id: "home" as View, label: "For you", icon: Home }, { id: "library" as View, label: "Library", icon: Library }, { id: "search" as View, label: "Radio Station", icon: Radio }, { id: "search" as View, label: "Music Video", icon: Play }].map(({ id, label, icon: Icon }) => <button key={label} className={`nav-item ${activeView === id && label === "For you" ? "is-active" : ""}`} onClick={() => onNavigate(id)} title={collapsed ? label : undefined}><Icon size={15} /><span>{label}</span></button>)}<span className="nav-label sidebar-sub-label">My music</span>{navItems.filter((item) => ["liked", "recent", "playlists"].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeView === id ? "is-active" : ""}`} onClick={() => onNavigate(id)} title={collapsed ? label : undefined}><Icon size={15} /><span>{label === "Liked songs" ? "Liked Song" : label === "Recently played" ? "Recent" : "Playlists"}</span></button>)}</nav>
    <div className="sidebar-playlists"><div className="sidebar-playlist-head"><span className="nav-label">Playlists</span><IconButton label="Open playlists" onClick={() => onNavigate("playlists")}><Plus size={16} /></IconButton></div>{(profile ? [...spotifyPlaylists, ...playlists] : playlists).slice(0, 2).map((playlist) => <button className="sidebar-playlist" key={playlist.id} onClick={() => onNavigate("playlists")}><span className="playlist-dot" style={{ backgroundImage: playlist.artwork ? `url(${playlist.artwork})` : undefined }} /><span>{playlist.name}</span></button>)}</div>
    <div className="sidebar-actions"><button className="import-button" onClick={onImport}><Upload size={16} /><span>Import music</span></button>{spotifyService.isConfigured && <button className="spotify-connect-button" onClick={profile ? onDisconnect : onConnect}>{profile ? <LogOut size={15} /> : <LogIn size={15} />}<span>{profile ? "Disconnect Spotify" : "Connect Spotify"}</span></button>}</div>
    <div className="sidebar-footer">{profile?.image ? <img className="profile-avatar-image" src={profile.image} alt="" /> : <div className="profile-avatar">{profile ? profile.name.slice(0, 2).toUpperCase() : "WT"}</div>}<span><strong>{profile?.name ?? "Local listener"}</strong><small>{profile ? "Spotify connected" : "Private browser library"}</small></span><MoreHorizontal size={16} /></div>
  </aside>;
}

function MobileNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.filter((item) => ["home", "search", "library", "playlists"].includes(item.id)).map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "is-active" : ""} onClick={() => onNavigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>;
}

function TopBar({ profile, onSearch, onSettings, onMenu }: { profile?: SpotifyProfile; onSearch: () => void; onSettings: () => void; onMenu: () => void }) {
  return <><header className="mobile-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button><WaveLogo /><div className="topbar-actions"><IconButton label="Search" onClick={onSearch}><Search size={18} /></IconButton><IconButton label="Settings" onClick={onSettings}><Settings2 size={18} /></IconButton></div></header>
    <div className="desktop-toolbar"><div className="history-buttons"><IconButton label="Back"><ArrowLeft size={17} /></IconButton><IconButton label="Forward"><ArrowRight size={17} /></IconButton></div><button className="toolbar-search" onClick={onSearch}><Search size={16} /><span>Search your library</span><kbd>⌘ K</kbd></button><div className="toolbar-spacer" /><button className="toolbar-icon" aria-label="Activity"><Activity size={17} /></button><button className="toolbar-profile" onClick={onSettings}>{profile?.image ? <img src={profile.image} alt="" /> : <span className="profile-avatar">WT</span>}<span>{profile?.name ?? "Local listener"}</span><ChevronDown size={14} /></button></div></>;
}

function ReferenceTrackRow({ track, index, context }: { track: Track; index: number; context: Track[] }) {
  const { currentTrack, isPlaying, playTrack, likedIds, toggleLike } = usePlayer();
  const active = currentTrack.id === track.id;
  return <motion.div layout className={`reference-track-row ${active ? "is-current" : ""}`} whileHover={{ x: 2 }}><span className="reference-track-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : index + 1}</span><button className="reference-track-main" onClick={() => playTrack(track, context)}><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><IconButton label={likedIds.includes(track.id) ? "Unlike song" : "Like song"} active={likedIds.includes(track.id)} onClick={() => toggleLike(track)}><Heart size={12} fill={likedIds.includes(track.id) ? "currentColor" : "none"} /></IconButton><span className="reference-track-more"><MoreHorizontal size={13} /></span><span className="reference-track-duration">{formatTime(track.duration)}</span></motion.div>;
}

function HomeView({ tracks, profile, onNavigate }: { tracks: Track[]; profile?: SpotifyProfile; onNavigate: (view: View) => void }) {
  const { currentTrack, playTrack } = usePlayer();
  const featured = tracks[0] ?? currentTrack;
  const recentIds = new Set(["come-over", "igor", "princess-bubblegum", "jackboys", "cybersex"]);
  const recent = tracks.filter((track) => recentIds.has(track.id)).slice(0, 5);
  const queuePreview = tracks.slice(0, 5);
  return <div className="page home-page reference-home"><section className="reference-release-section"><div className="reference-section-heading"><h1>Releases for You</h1><span>{profile ? `Curated for ${profile.name}` : "Your personal collection"}</span></div><div className="reference-release-layout"><div className="reference-featured-cover"><Artwork track={featured} priority /><button className="reference-cover-play" aria-label={`Play ${featured.title}`} onClick={() => playTrack(featured, tracks)}><Play size={16} fill="currentColor" /></button></div><div className="reference-track-list">{queuePreview.map((track, index) => <ReferenceTrackRow key={track.id} track={track} index={index} context={queuePreview} />)}</div></div></section><section className="reference-recent-section"><div className="reference-section-heading"><h2>Recently Played</h2><button className="reference-see-all" onClick={() => onNavigate("recent")}>See all</button></div><div className="card-row">{recent.map((track) => <TrackCard key={track.id} track={track} context={recent} />)}</div></section></div>;
}

function SearchView({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!query.trim()) { setResults(null); setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      const provider = connected ? spotifyService.search(query) : musicSearch.search(query);
      provider.then(setResults).catch(() => setError("Search is unavailable right now.")).finally(() => setLoading(false));
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, connected]);
  const hasResults = Boolean(results && results.tracks.length);
  return <div className="page search-page"><div className="search-heading"><span className="eyebrow">{connected ? "SPOTIFY SEARCH" : "PRIVATE LIBRARY SEARCH"}</span><h1>Find your next song.</h1><p>{connected ? "Search Spotify metadata, then choose a safe playback source." : "Search previews or import local files. Connect Spotify to search your account."}</p></div><div className="search-input-wrap"><Search size={19} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setError(null); }} placeholder={connected ? "Search tracks, artists, albums..." : "Try “The Weeknd” or “jazz”..."} /><kbd>⌘ K</kbd>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button>}</div>{!connected && spotifyService.isConfigured && <div className="spotify-callout"><div><strong>Bring your Spotify library here</strong><span>Profile, playlists, and real track metadata stay behind the official OAuth flow.</span></div><button className="secondary-button" onClick={onConnect}><LogIn size={14} /> Connect</button></div>}{loading && <div className="skeleton-stack">{[1, 2, 3, 4].map((item) => <div className="skeleton-row" key={item}><span /><i /><b /><em /></div>)}</div>}{error && <div className="empty-state"><Sparkles size={24} /><h2>Search is unavailable</h2><p>Check your connection and try again.</p></div>}{!loading && !error && query && !hasResults && <div className="empty-state"><Search size={24} /><h2>Nothing found</h2><p>Try a different artist, track, or album.</p></div>}{!loading && !error && hasResults && results && <div className="search-results"><SectionHeader eyebrow="TRACKS" title={`${results.tracks.length} results`} /><div className="track-list">{results.tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={results.tracks} />)}</div>{results.albums.length > 0 && <><SectionHeader eyebrow="RELEASES" title="Albums" /><div className="search-chips">{results.albums.map((album) => <div className="result-chip" key={album.id}><img src={album.artwork} alt="" /><span><strong>{album.name}</strong><small>{album.artist}</small></span></div>)}</div></>}</div>}{!query && <div className="search-start"><div className="search-start-icon"><Search size={25} /></div><h2>Search the catalogue</h2><p>Start with a song, artist, or album. Search results preserve metadata separately from audio playback.</p><div className="search-suggestions"><button onClick={() => setQuery("The Weeknd")}>The Weeknd</button><button onClick={() => setQuery("lofi")}>lofi</button><button onClick={() => setQuery("Billie Eilish")}>Billie Eilish</button></div></div>}</div>;
}

function QueuePanel({ profile }: { profile?: SpotifyProfile }) {
  const { currentTrack, queue, removeFromQueue, clearQueue, playTrack } = usePlayer();
  return <aside className="queue-panel"><div className="queue-head"><div><span className="eyebrow">LISTENING NEXT</span><h2>Queue</h2></div><button className="text-button" onClick={clearQueue}>Clear all</button></div><div className="now-playing-card"><Artwork track={currentTrack} className="queue-now-art" /><span className="queue-now-copy"><small>NOW PLAYING</small><strong>{currentTrack.title}</strong><span>{currentTrack.artist}</span></span><span className="eq-mark"><i /><i /><i /></span></div>{profile && <div className="activity-note"><span className="activity-dot" /><span>Listening from {profile.name}'s Spotify space</span></div>}<div className="queue-list">{queue.length ? queue.map((track, index) => <motion.div layout key={track.id} className="queue-item"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><button onClick={() => playTrack(track, queue)}><Artwork track={track} className="queue-art" /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><IconButton label={`Remove ${track.title} from queue`} onClick={() => removeFromQueue(track.id)}><X size={14} /></IconButton></motion.div>) : <div className="queue-empty"><ListMusic size={24} /><p>Your queue is empty</p><span>Add songs from a card to keep listening.</span></div>}</div><div className="queue-footer"><span>{queue.length} {queue.length === 1 ? "song" : "songs"} queued</span><button onClick={clearQueue}><Trash2 size={14} /> Clear</button></div></aside>;
}

function ActivityRail({ profile, tracks }: { profile?: SpotifyProfile; tracks: Track[] }) {
  const activity = tracks.slice(0, 5);
  return <aside className="activity-rail reference-activity-rail"><div className="reference-rail-heading"><h2>Friends Activity</h2></div><div className="friends-list">{activity.map((track, index) => <div className="friend-row" key={track.id}><Artwork track={track} className="friend-avatar" /><span><strong>{profile && index === 0 ? profile.name : track.artist}</strong><small>{index === 0 ? track.title : "Listening recently"}</small></span>{index === 0 && <span className="friend-eq"><i /><i /><i /></span>}</div>)}</div><div className="reference-rail-heading activity-heading"><h2>Your Activity</h2></div><div className="your-activity-list">{activity.slice(0, 5).map((track) => <div className="your-activity-row" key={`activity-${track.id}`}><Artwork track={track} className="your-activity-art" /><span><strong>{track.title}</strong><small>{track.artist}</small></span><MoreHorizontal size={13} /></div>)}</div><div className="rail-footer"><Mic2 size={15} /><span>Lyrics are ready for an authorized provider.</span></div></aside>;
}

function DesktopPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentTrack, isPlaying, togglePlay, currentTime, duration, previous, next, seek, likedIds, toggleLike, isLoading } = usePlayer();
  return <div className="desktop-player"><button className="player-track" onClick={onExpand}><Artwork track={currentTrack} className="player-art" /><span><strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small></span></button><div className="player-controls"><div><IconButton label="Shuffle"><Shuffle size={15} /></IconButton><IconButton label="Previous" onClick={previous}><SkipBack size={17} fill="currentColor" /></IconButton><motion.button whileTap={{ scale: .9 }} className="player-play" onClick={togglePlay}>{isLoading ? <span className="spinner" /> : isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</motion.button><IconButton label="Next" onClick={next}><SkipForward size={17} fill="currentColor" /></IconButton><IconButton label="Repeat"><Repeat size={15} /></IconButton></div><div className="player-progress"><span>{formatTime(currentTime)}</span><input aria-label="Song progress" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} /><span>{formatTime(duration)}</span></div></div><div className="player-actions"><IconButton label={likedIds.includes(currentTrack.id) ? "Unlike song" : "Like song"} active={likedIds.includes(currentTrack.id)} onClick={() => toggleLike(currentTrack)}><Heart size={16} fill={likedIds.includes(currentTrack.id) ? "currentColor" : "none"} /></IconButton><IconButton label="Open full player" onClick={onExpand}><ListMusic size={16} /></IconButton></div></div>;
}

function MiniPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentTrack, isPlaying, togglePlay, currentTime, duration, isLoading } = usePlayer();
  return <motion.div layout className="mini-player"><button className="mini-track" onClick={onExpand}><Artwork track={currentTrack} className="mini-art" /><span><strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small></span></button><div className="mini-progress"><span style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }} /></div><IconButton label={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>{isLoading ? <span className="spinner" /> : isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</IconButton></motion.div>;
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { currentTrack, isPlaying, isLoading, togglePlay, currentTime, duration, seek, previous, next, volume, setVolume, shuffle, toggleShuffle, repeat, cycleRepeat, likedIds, toggleLike, addToQueue, playbackError } = usePlayer();
  const [lyrics, setLyrics] = useState(false);
  const rangeStyle = { "--range-progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as CSSProperties;
  return <motion.div className="full-player-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.section className="full-player" initial={{ y: 24, scale: .98 }} animate={{ y: 0, scale: 1 }}>
    <div className="full-player-head"><IconButton label="Close player" onClick={onClose}><ChevronDown size={21} /></IconButton><span>NOW PLAYING</span><IconButton label="More options"><MoreHorizontal size={19} /></IconButton></div>
    <div className="full-player-body"><div className="full-art-wrap" style={{ "--art-accent": currentTrack.accent } as CSSProperties}><Artwork track={currentTrack} className="full-art" /><div className="art-glow" /></div><div className="full-meta"><div><SourcePill source={currentTrack.source} /><h1>{currentTrack.title}</h1><p>{currentTrack.artist} · {currentTrack.album}</p></div><IconButton label={likedIds.includes(currentTrack.id) ? "Unlike song" : "Like song"} active={likedIds.includes(currentTrack.id)} onClick={() => toggleLike(currentTrack)} className="like-button"><Heart size={21} fill={likedIds.includes(currentTrack.id) ? "currentColor" : "none"} /></IconButton></div><div className="seek-wrap"><input style={rangeStyle} aria-label="Seek song" type="range" min="0" max={duration || 1} step="0.1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} /><div><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>{playbackError && <div className="playback-error"><span>{playbackError}</span></div>}<div className="full-controls"><IconButton label="Shuffle" active={shuffle} onClick={toggleShuffle}><Shuffle size={18} /></IconButton><IconButton label="Previous" onClick={previous}><SkipBack size={22} fill="currentColor" /></IconButton><motion.button whileTap={{ scale: .9 }} className="main-play" onClick={togglePlay}>{isLoading ? <span className="spinner spinner-dark" /> : isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</motion.button><IconButton label="Next" onClick={next}><SkipForward size={22} fill="currentColor" /></IconButton><IconButton label={`Repeat ${repeat}`} active={repeat !== "off"} onClick={cycleRepeat}><Repeat size={18} /><small>{repeat === "one" ? "1" : ""}</small></IconButton></div><div className="full-secondary"><button onClick={() => addToQueue(currentTrack)}><ListPlus size={16} /> Add to queue</button><button className={`lyrics-toggle ${lyrics ? "is-active" : ""}`} onClick={() => setLyrics(!lyrics)}><Mic2 size={16} /> Lyrics</button><label><VolumeX size={15} /><input aria-label="Volume" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ "--range-progress": `${volume * 100}%` } as CSSProperties} /><Volume2 size={15} /></label></div>{lyrics && <div className="lyrics-panel"><span className="eyebrow">LYRICS</span><h2>Words when you are ready.</h2><p>Connect an authorized lyrics provider to show timed lyrics here. Wave Tune keeps lyrics separate from Spotify and audio sources.</p><button className="secondary-button"><Sparkles size={14} /> Provider settings</button></div>}</div>
  </motion.section></motion.div>;
}

function LibraryView({ onImport, tracks }: { onImport: () => void; tracks: Track[] }) {
  const { library } = usePlayer();
  const items = library.length ? library : tracks.filter((track) => track.source !== "spotify");
  return <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">PRIVATE BY DEFAULT</span><h1>Your library</h1><p>Audio files stay on this device. Spotify metadata stays separate from playback.</p></div><button className="primary-button" onClick={onImport}><Upload size={15} /> Import music</button></div>{items.length ? <div className="track-list">{items.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={items} />)}</div> : <div className="empty-state"><Upload size={24} /><h2>Bring your music with you</h2><p>Import local audio files to create a browser-first library.</p><button className="primary-button" onClick={onImport}>Import audio files</button></div>}</div>;
}

function PlaylistView({ playlist, onBack }: { playlist: Playlist; onBack: () => void }) {
  const { playTrack } = usePlayer();
  const tracks = playlist.trackIds.map((id) => catalogTracks.find((track) => track.id === id)).filter(Boolean) as Track[];
  return <div className="page playlist-page"><button className="back-button" onClick={onBack}><ArrowLeft size={15} /> All playlists</button><section className="playlist-hero"><img src={playlist.artwork || catalogTracks[0].artwork} alt="" /><div><span className="eyebrow">PLAYLIST</span><h1>{playlist.name}</h1><p>{playlist.description}</p><span className="playlist-meta">{tracks.length ? `${tracks.length} songs · Curated by you` : "Spotify metadata · Audio remains separate"}</span><div className="playlist-actions">{tracks[0] && <button className="main-play small" onClick={() => playTrack(tracks[0], tracks)}><Play size={15} fill="currentColor" /> Play</button>}<IconButton label="Shuffle playlist"><Shuffle size={17} /></IconButton><IconButton label="More playlist options"><MoreHorizontal size={18} /></IconButton></div></div></section>{tracks.length ? <div className="track-list">{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={tracks} />)}</div> : <div className="empty-state compact-empty"><Radio size={23} /><h2>Spotify playlist metadata</h2><p>Playlist track loading is ready for the authorized Spotify service. Playback remains local or Spotify Connect only.</p></div>}</div>;
}

function SettingsView({ profile, onConnect, onDisconnect }: { profile?: SpotifyProfile; onConnect: () => void; onDisconnect: () => void }) {
  const { clearLibrary } = usePlayer();
  const [autoplay, setAutoplay] = useState(true);
  return <div className="page settings-page"><div className="page-heading"><span className="eyebrow">MAKE IT YOURS</span><h1>Settings</h1><p>Keep the interface soft and the playback boundaries clear.</p></div><div className="settings-groups"><section className="settings-group"><div className="settings-group-head"><Radio size={17} /><div><h2>Spotify connection</h2><p>Official metadata access through Authorization Code with PKCE.</p></div></div><div className="setting-line"><span><strong>{profile ? `Connected as ${profile.name}` : "Spotify is not connected"}</strong><small>{profile ? "Profile, playlists, and search are available." : "No client secret is used in the browser."}</small></span>{profile ? <button className="secondary-button" onClick={onDisconnect}><LogOut size={14} /> Disconnect</button> : spotifyService.isConfigured ? <button className="primary-button" onClick={onConnect}><LogIn size={14} /> Connect</button> : <span className="setting-value">Add client ID</span>}</div></section><section className="settings-group"><div className="settings-group-head"><SlidersHorizontal size={17} /><div><h2>Playback</h2><p>Browser audio and safe source boundaries.</p></div></div><div className="setting-line"><span><strong>Autoplay</strong><small>Keep listening when your queue ends</small></span><button className={`toggle ${autoplay ? "is-on" : ""}`} onClick={() => setAutoplay(!autoplay)} aria-label="Toggle autoplay"><span /></button></div><div className="setting-line muted-setting"><span><strong>Crossfade</strong><small>Coming soon</small></span><span className="setting-value">Off</span></div></section><section className="settings-group"><div className="settings-group-head"><Library size={17} /><div><h2>Library</h2><p>Manage data saved in this browser.</p></div></div><div className="setting-line"><span><strong>Clear local library</strong><small>Remove imported audio metadata from this device</small></span><button className="danger-button" onClick={() => void clearLibrary()}><Trash2 size={14} /> Clear</button></div></section></div></div>;
}

export default function App() {
  const [activeView, setActiveView] = useState<View>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [toast, setToast] = useState("");
  const [spotify, setSpotify] = useState<SpotifyState>({ tracks: [], playlists: [], loading: spotifyService.connected, error: null });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const reduceMotion = useReducedMotion();
  const { importFiles, library, likedIds, recentlyPlayed } = usePlayer();

  const refreshSpotify = async () => {
    if (!spotifyService.connected) return;
    setSpotify((state) => ({ ...state, loading: true, error: null }));
    try {
      const snapshot: SpotifySnapshot = await spotifyService.loadSnapshot();
      setSpotify({ ...snapshot, loading: false, error: null });
    } catch (error) {
      setSpotify((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "Spotify could not be loaded." }));
    }
  };

  useEffect(() => {
    spotifyService.completeAuth().then(() => {
      if (spotifyService.connected) void refreshSpotify();
    }).catch((error: unknown) => setSpotify((state) => ({ ...state, loading: false, error: error instanceof Error ? error.message : "Spotify connection failed." })));
  }, []);

  useEffect(() => {
    if (spotifyService.connected) void refreshSpotify();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setActiveView("search"); }
      if (event.key === "Escape") setFullPlayerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const connectSpotify = async () => {
    try { await spotifyService.startAuth(); } catch (error) { setSpotify((state) => ({ ...state, error: error instanceof Error ? error.message : "Spotify is not configured." })); }
  };
  const disconnectSpotify = () => { spotifyService.disconnect(); setSpotify({ tracks: [], playlists: [], loading: false, error: null }); };
  const navigate = (view: View) => { setActiveView(view); setSelectedPlaylist(null); setMobileMenuOpen(false); };
  const openPlaylist = (playlist: Playlist) => { setSelectedPlaylist(playlist); setActiveView("playlist"); setMobileMenuOpen(false); };
  const onImport = () => fileInputRef.current?.click();
  const allTracks = useMemo(() => [...spotify.tracks, ...library, ...catalogTracks].filter((track, index, list) => list.findIndex((item) => item.id === track.id) === index), [spotify.tracks, library]);
  const recentTracks = useMemo(() => recentlyPlayed.map((id) => allTracks.find((track) => track.id === id)).filter(Boolean) as Track[], [allTracks, recentlyPlayed]);
  const likedTracks = useMemo(() => allTracks.filter((track) => likedIds.includes(track.id)), [allTracks, likedIds]);
  const displayPlaylists = useMemo(() => [...spotify.playlists, ...playlists].filter((playlist, index, list) => list.findIndex((item) => item.id === playlist.id) === index), [spotify.playlists]);
  const page = selectedPlaylist && activeView === "playlist" ? <PlaylistView playlist={selectedPlaylist} onBack={() => { setSelectedPlaylist(null); setActiveView("playlists"); }} /> :
    activeView === "home" ? <HomeView tracks={allTracks} profile={spotify.profile} onNavigate={navigate} /> :
    activeView === "search" ? <SearchView connected={Boolean(spotify.profile)} onConnect={connectSpotify} /> :
    activeView === "library" ? <LibraryView onImport={onImport} tracks={allTracks} /> :
    activeView === "liked" ? <div className="page"><div className="page-heading"><span className="eyebrow">YOUR FAVORITES</span><h1>Liked songs</h1><p>Everything you want to come back to.</p></div>{likedTracks.length ? <div className="track-list">{likedTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={likedTracks} />)}</div> : <div className="empty-state"><Heart size={24} /><h2>Nothing here yet</h2><p>Tap the heart on any song to make it yours.</p></div>}</div> :
    activeView === "recent" ? <div className="page"><div className="page-heading"><span className="eyebrow">YOUR LISTENING HISTORY</span><h1>Recently played</h1><p>A short memory of what you have been listening to.</p></div>{recentTracks.length ? <div className="track-list">{recentTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={recentTracks} />)}</div> : <div className="empty-state"><Clock3 size={24} /><h2>Your history is empty</h2><p>Start playing something and it will show up here.</p></div>}</div> :
    activeView === "playlists" ? <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>Playlists</h1><p>Make space for whatever the day calls for.</p></div><button className="primary-button" onClick={() => setToast("Playlist creation is ready for your next session.")}><Plus size={15} /> New playlist</button></div><div className="playlist-grid">{displayPlaylists.map((playlist) => <motion.button key={playlist.id} className="playlist-card" whileHover={{ y: -4 }} onClick={() => openPlaylist(playlist)}><img src={playlist.artwork || catalogTracks[0].artwork} alt="" /><span><strong>{playlist.name}</strong><small>{playlist.description}</small></span><ArrowRight size={15} /></motion.button>)}</div></div> :
    <SettingsView profile={spotify.profile} onConnect={connectSpotify} onDisconnect={disconnectSpotify} />;

  return (<div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}><div className="ambient ambient-one" /><div className="ambient ambient-two" /><Sidebar activeView={activeView} onNavigate={navigate} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} onImport={onImport} profile={spotify.profile} spotifyPlaylists={spotify.playlists} onConnect={connectSpotify} onDisconnect={disconnectSpotify} />{mobileMenuOpen && <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}><motion.div className="mobile-drawer" initial={{ x: -290 }} animate={{ x: 0 }} onClick={(event) => event.stopPropagation()}><div className="drawer-head"><WaveLogo /><IconButton label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={18} /></IconButton></div><Sidebar activeView={activeView} onNavigate={navigate} collapsed={false} setCollapsed={() => undefined} onImport={onImport} profile={spotify.profile} spotifyPlaylists={spotify.playlists} onConnect={connectSpotify} onDisconnect={disconnectSpotify} /></motion.div></div>}<main className="main-column"><TopBar profile={spotify.profile} onSearch={() => navigate("search")} onSettings={() => navigate("settings")} onMenu={() => setMobileMenuOpen(true)} /><AnimatePresence mode="wait" initial={!reduceMotion}><motion.div key={`${activeView}-${selectedPlaylist?.id ?? ""}`} className="view-shell" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .24 }}>{page}</motion.div></AnimatePresence></main><ActivityRail profile={spotify.profile} tracks={spotify.tracks.length ? spotify.tracks : catalogTracks} /><QueuePanel profile={spotify.profile} /><DesktopPlayer onExpand={() => setFullPlayerOpen(true)} /><MiniPlayer onExpand={() => setFullPlayerOpen(true)} /><MobileNav activeView={activeView} onNavigate={navigate} /><input ref={fileInputRef} hidden type="file" accept="audio/*" multiple onChange={(event) => { if (event.target.files?.length) { void importFiles(event.target.files); setToast(`${event.target.files.length} track${event.target.files.length === 1 ? "" : "s"} added to your library.`); event.target.value = ""; } }} />{spotify.error && <motion.div className="toast toast-error" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}>{spotify.error}</motion.div>}{toast && <motion.div className="toast" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }}><Check size={15} /> {toast}</motion.div>}<AnimatePresence>{fullPlayerOpen && <FullPlayer onClose={() => setFullPlayerOpen(false)} />}</AnimatePresence></div>);
}
