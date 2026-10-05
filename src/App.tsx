import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3,
  Heart, Home, Library, ListMusic, ListPlus, LogIn, LogOut, Menu, MoreHorizontal, Music2,
  Pause, Play, Plus, Radio, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal,
  Trash2, Upload, UserRound, Volume2, VolumeX, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Redirect, Route, Router, Switch, useLocation } from "wouter";
import { AuthModal } from "./components/AuthModal";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { usePlayer } from "./context/PlayerContext";
import { PlayerProvider } from "./context/PlayerContext";
import { accountService, type AccountSnapshot, type AppProfile } from "./services/account";
import { catalogService } from "./services/catalog";
import type { Playlist, SearchResult, Track } from "./types/music";

type View = "home" | "search" | "library" | "liked" | "recent" | "playlists" | "settings";
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function formatTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

function Artwork({ track, className = "", priority = false }: { track?: Track | null; className?: string; priority?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [track?.id, track?.artwork]);
  if (!track) return <div className={`artwork artwork-empty ${className}`}><Music2 size={22} /></div>;
  if (track.artwork && !failed) return <img className={`artwork ${className}`} src={track.artwork} alt={`${track.title} artwork`} loading={priority ? "eager" : "lazy"} onError={() => setFailed(true)} />;
  return <div className={`artwork artwork-generated ${className}`} style={{ background: `linear-gradient(145deg, ${track.accent}, #9a7bc0)` }}><span>{track.title.charAt(0)}</span><Music2 size={24} /></div>;
}

function PlaylistArtwork({ playlist, className = "" }: { playlist: Playlist; className?: string }) {
  const track = playlist.tracks?.[0];
  return <Artwork track={track ?? { id: playlist.id, title: playlist.name, artist: "Wave Tune playlist", album: playlist.name, duration: 0, artwork: playlist.artwork, accent: playlist.accent, source: "catalog" }} className={className} />;
}

function ProfileAvatar({ profile, large = false }: { profile?: Pick<AppProfile, "name" | "image">; large?: boolean }) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [profile?.image]);
  if (profile?.image && !imageFailed) {
    return <img className={`profile-avatar-image ${large ? "large" : ""}`} src={profile.image} alt={`${profile.name}'s profile`} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />;
  }
  return <span className={`profile-avatar ${large ? "large" : ""}`}>{profile?.name?.trim().slice(0, 2).toUpperCase() || "WT"}</span>;
}

function WaveLogo({ compact = false }: { compact?: boolean }) {
  return <div className={`logo-lockup ${compact ? "logo-compact" : ""}`} aria-label="Wave Tune"><span className="logo-mark"><i /><i /><i /><i /></span>{!compact && <span className="logo-wordmark">WAVE <b>TUNE</b></span>}</div>;
}

function IconButton({ label, onClick, children, active = false, className = "" }: { label: string; onClick?: () => void; children: ReactNode; active?: boolean; className?: string }) {
  return <motion.button type="button" whileTap={{ scale: .92 }} className={`icon-button ${active ? "is-active" : ""} ${className}`} aria-label={label} title={label} onClick={onClick}>{children}</motion.button>;
}

function TrackRow({ track, index, context, onAddToPlaylist }: { track: Track; index?: number; context?: Track[]; onAddToPlaylist?: (track: Track) => void }) {
  const { currentTrack, isPlaying, requestTrack, togglePlay, likedIds, toggleLike, addToQueue, removeFromQueue, queue } = usePlayer();
  const active = currentTrack?.id === track.id;
  const queued = queue.some((item) => item.id === track.id);
  return <motion.div layout className={`track-row ${active ? "is-current" : ""}`} whileHover={{ x: 2 }}>
    {index !== undefined && <span className="track-index">{active && isPlaying ? <span className="playing-bars"><i /><i /><i /></span> : String(index + 1).padStart(2, "0")}</span>}
    <button className="track-main" onClick={() => requestTrack(track, context)}><Artwork track={track} className="track-art" /><span className="track-copy"><strong>{track.title}</strong><span>{track.artist}</span></span></button>
    <span className="track-album">{track.album}</span>
    <span className="track-actions">
      <IconButton label={active && isPlaying ? "Pause song" : "Play song"} onClick={() => active ? togglePlay() : requestTrack(track, context)}>{active && isPlaying ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}</IconButton>
      <IconButton label={likedIds.includes(track.id) ? "Unlike song" : "Like song"} active={likedIds.includes(track.id)} onClick={() => toggleLike(track)}><Heart size={15} fill={likedIds.includes(track.id) ? "currentColor" : "none"} /></IconButton>
      {onAddToPlaylist && <IconButton label="Add to playlist" onClick={() => onAddToPlaylist(track)}><ListPlus size={15} /></IconButton>}
      <IconButton label={queued ? "Remove from queue" : "Add to queue"} onClick={() => queued ? removeFromQueue(track.id) : addToQueue(track)}>{queued ? <Check size={15} /> : <Plus size={15} />}</IconButton>
    </span>
    <span className="track-duration">{track.duration ? formatTime(track.duration) : "—"}</span>
  </motion.div>;
}

function TrackCard({ track, context, onAddToPlaylist }: { track: Track; context?: Track[]; onAddToPlaylist?: (track: Track) => void }) {
  const { currentTrack, isPlaying, requestTrack, togglePlay, addToQueue } = usePlayer();
  const active = currentTrack?.id === track.id;
  return <motion.article className={`track-card ${active ? "is-current" : ""}`} whileHover={{ y: -5 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
    <div className="card-art-wrap"><Artwork track={track} className="card-art" priority /><motion.button whileTap={{ scale: .88 }} className="card-play" aria-label={`${active && isPlaying ? "Pause" : "Play"} ${track.title}`} onClick={() => active && isPlaying ? togglePlay() : requestTrack(track, context)}>{active && isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</motion.button></div>
    <div className="card-title">{track.title}</div><div className="card-subtitle">{track.artist}</div>
    <div className="card-actions"><button className="card-queue" onClick={() => addToQueue(track)}><Plus size={13} /> Queue</button>{onAddToPlaylist && <button className="card-queue" onClick={() => onAddToPlaylist(track)}><ListPlus size={13} /> Save</button>}</div>
  </motion.article>;
}

function SectionHeader({ eyebrow, title, action, onAction }: { eyebrow?: string; title: string; action?: string; onAction?: () => void }) {
  return <div className="section-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{action && <button className="text-button" onClick={onAction}>{action}<ArrowRight size={14} /></button>}</div>;
}

function Sidebar({ activeView, onNavigate, collapsed, setCollapsed, onImport, profile, playlists, onLogin, onLogout }: { activeView: View; onNavigate: (view: View) => void; collapsed: boolean; setCollapsed: (value: boolean) => void; onImport: () => void; profile?: AppProfile; playlists: Playlist[]; onLogin: () => void; onLogout: () => void }) {
  return <aside className={`sidebar ${collapsed ? "is-collapsed" : ""}`}>
    <div className="sidebar-top"><WaveLogo compact={collapsed} /><span className="reference-brand">Wave Tune</span><IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronRight size={17} /> : <ChevronLeft size={17} />}</IconButton></div>
    <nav className="sidebar-nav" aria-label="Primary navigation"><span className="nav-label">Recommend</span>{[{ id: "home" as View, label: "For you", icon: Home }, { id: "search" as View, label: "Discover", icon: Search }, { id: "library" as View, label: "Library", icon: Library }, { id: "recent" as View, label: "Recently played", icon: Clock3 }].map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeView === id ? "is-active" : ""}`} onClick={() => onNavigate(id)} title={collapsed ? label : undefined}><Icon size={15} /><span>{label}</span></button>)}<span className="nav-label sidebar-sub-label">My music</span>{[{ id: "liked" as View, label: "Liked songs", icon: Heart }, { id: "playlists" as View, label: "Playlists", icon: ListMusic }, { id: "settings" as View, label: "Settings", icon: Settings2 }].map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activeView === id ? "is-active" : ""}`} onClick={() => onNavigate(id)}><Icon size={15} /><span>{label}</span></button>)}</nav>
    <div className="sidebar-playlists"><div className="sidebar-playlist-head"><span className="nav-label">Playlists</span><IconButton label="Open playlists" onClick={() => onNavigate("playlists")}><Plus size={16} /></IconButton></div>{playlists.slice(0, 3).map((playlist) => <button className="sidebar-playlist" key={playlist.id} onClick={() => onNavigate("playlists")}><span className="playlist-dot" style={{ backgroundImage: playlist.artwork ? `url(${playlist.artwork})` : undefined }} /><span>{playlist.name}</span></button>)}</div>
    <div className="sidebar-actions"><button className="import-button" onClick={onImport}><Upload size={16} /><span>Import music</span></button>{profile ? <button className="spotify-connect-button" onClick={onLogout}><LogOut size={15} /><span>Sign out</span></button> : <button className="spotify-connect-button" onClick={onLogin}><LogIn size={15} /><span>Log in</span></button>}</div>
    <div className="sidebar-footer"><ProfileAvatar profile={profile} /><span><strong>{profile?.name ?? "Guest listener"}</strong><small>{profile ? `${Math.round(profile.totalListeningSeconds / 60)} min listened` : "Five songs free"}</small></span><MoreHorizontal size={16} /></div>
  </aside>;
}

function TopBar({ profile, onSearch, onSettings, onLogin, onMenu }: { profile?: AppProfile; onSearch: () => void; onSettings: () => void; onLogin: () => void; onMenu: () => void }) {
  return <><header className="mobile-topbar"><button className="mobile-menu" onClick={onMenu} aria-label="Open menu"><Menu size={20} /></button><WaveLogo /><div className="topbar-actions"><IconButton label="Search" onClick={onSearch}><Search size={18} /></IconButton><IconButton label="Settings" onClick={onSettings}><Settings2 size={18} /></IconButton></div></header>
     <div className="desktop-toolbar"><div className="history-buttons"><IconButton label="Back" onClick={() => window.history.back()}><ArrowLeft size={17} /></IconButton><IconButton label="Forward" onClick={() => window.history.forward()}><ArrowRight size={17} /></IconButton></div><button className="toolbar-search" onClick={onSearch}><Search size={16} /><span>Search the catalog</span><kbd>⌘ K</kbd></button><div className="toolbar-spacer" /><button className="toolbar-icon" aria-label="Activity" onClick={onSettings}><Activity size={17} /></button><button className="toolbar-profile" onClick={profile ? onSettings : onLogin}><ProfileAvatar profile={profile} /><span>{profile?.name ?? "Log in"}</span><ChevronDown size={14} /></button></div></>;
}

function HomeView({ tracks, recentTracks, loading, error, onRefresh, onNavigate, onAddToPlaylist }: { tracks: Track[]; recentTracks: Track[]; loading: boolean; error: string | null; onRefresh: () => void; onNavigate: (view: View) => void; onAddToPlaylist: (track: Track) => void }) {
  const recent = recentTracks.slice(0, 5);
  if (loading) return <div className="page home-page"><div className="home-loading"><div className="loading-orb"><Music2 size={24} /></div><h2>Finding the next wave</h2><p>Wave Tune is loading live music, artwork, and your listening space.</p></div></div>;
  if (error || !tracks.length) return <div className="page home-page"><div className="empty-state home-empty"><div className="empty-state-brand"><WaveLogo /></div><span className="eyebrow">YOUR MUSIC, YOUR SPACE</span><h2>{error ? "The live catalog needs a refresh" : "No live songs yet"}</h2><p>{error ?? "Search the catalog to find something to play."}</p><div className="empty-actions"><button className="secondary-button" onClick={onRefresh}><Activity size={14} /> Try again</button><button className="secondary-button" onClick={() => onNavigate("search")}><Search size={14} /> Explore</button></div></div></div>;
  return <div className="page home-page reference-home"><section className="reference-release-section"><div className="reference-section-heading"><div><span className="eyebrow">WAVE TUNE DISCOVER</span><h1>Trending right now</h1></div><span>Live from YouTube</span></div><div className="reference-trending-grid">{tracks.map((track) => <TrackCard key={track.id} track={track} context={tracks} onAddToPlaylist={onAddToPlaylist} />)}</div></section><section className="reference-recent-section"><div className="reference-section-heading"><div><span className="eyebrow">YOUR LISTENING</span><h2>Recently played</h2></div><button className="reference-see-all" onClick={() => onNavigate("recent")}>See all</button></div>{recent.length ? <div className="card-row">{recent.map((track) => <TrackCard key={track.id} track={track} context={recent} onAddToPlaylist={onAddToPlaylist} />)}</div> : <div className="empty-inline">Your listening history will appear here after you play a song.</div>}</section></div>;
}

function SearchView({ onAddToPlaylist }: { onAddToPlaylist: (track: Track) => void }) {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<SearchResult | null>(null); const [loading, setLoading] = useState(false); const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!query.trim()) { setResults(null); setLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    setResults(null);
    const timer = window.setTimeout(() => {
      setLoading(true);
      catalogService.search(query, controller.signal)
        .then((result) => { if (active) setResults(result); })
        .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Search is unavailable."); })
        .finally(() => { if (active) setLoading(false); });
    }, 300);
    return () => { active = false; controller.abort(); window.clearTimeout(timer); };
  }, [query]);
  const hasResults = Boolean(results && (results.tracks.length || results.albums.length || results.artists.length || results.playlists.length));
  return <div className="page search-page">
    <div className="search-heading"><span className="eyebrow">LIVE CATALOG</span><h1>Find your next song.</h1><p>Search real catalog results, then press play to start a Wave Tune session.</p></div>
    <div className="search-input-wrap"><Search size={19} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setError(null); }} placeholder="Search songs, artists, or moods..." /><kbd>⌘ K</kbd>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={16} /></button>}</div>
    {loading && <div className="skeleton-stack">{[1, 2, 3, 4].map((item) => <div className="skeleton-row" key={item}><span /><i /><b /><em /></div>)}</div>}
    {error && <div className="empty-state"><Music2 size={24} /><h2>Search is unavailable</h2><p>{error}</p></div>}
    {!loading && !error && query && !hasResults && <div className="empty-state"><Search size={24} /><h2>Nothing found</h2><p>Try a different artist, track, or mood.</p></div>}
    {!loading && results?.notice && <p className="catalog-notice">{results.notice}</p>}
    {!loading && results?.tracks.length ? <div className="search-results"><SectionHeader eyebrow="TRACKS" title={`${results.tracks.length} results`} /><div className="track-list">{results.tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={results.tracks} onAddToPlaylist={onAddToPlaylist} />)}</div></div> : null}
    {!loading && results && Boolean(results.albums.length || results.artists.length || results.playlists.length) && <div className="search-collections">
      {Boolean(results.albums.length) && <section className="search-collection"><SectionHeader eyebrow="ALBUMS" title="Catalog albums" /><div className="search-entity-grid">{results.albums.map((album) => <article className="search-entity" key={album.id}>{album.artwork ? <img src={album.artwork} alt="" loading="lazy" /> : <div className="search-entity-art"><Music2 size={18} /></div>}<span><strong>{album.name}</strong><small>{album.artist}</small></span></article>)}</div></section>}
      {Boolean(results.artists.length) && <section className="search-collection"><SectionHeader eyebrow="ARTISTS" title="Artists" /><div className="search-entity-grid">{results.artists.map((artist) => <article className="search-entity" key={artist.id}>{artist.artwork ? <img src={artist.artwork} alt="" loading="lazy" /> : <div className="search-entity-art"><UserRound size={18} /></div>}<span><strong>{artist.name}</strong><small>Artist</small></span></article>)}</div></section>}
      {Boolean(results.playlists.length) && <section className="search-collection"><SectionHeader eyebrow="PLAYLISTS" title="Catalog playlists" /><div className="search-entity-grid">{results.playlists.map((playlist) => <article className="search-entity" key={playlist.id}><PlaylistArtwork playlist={playlist} /><span><strong>{playlist.name}</strong><small>{playlist.description || "Playlist"}</small></span></article>)}</div></section>}
    </div>}
    {!query && <div className="search-start"><div className="search-start-icon"><Search size={25} /></div><h2>Search the catalog</h2><p>Start with a song, artist, or mood.</p><div className="search-suggestions"><button onClick={() => setQuery("The Weeknd")}>The Weeknd</button><button onClick={() => setQuery("lofi beats")}>lofi beats</button><button onClick={() => setQuery("Billie Eilish")}>Billie Eilish</button></div></div>}
  </div>;
}

function QueuePanel() {
  const { currentTrack, queue, removeFromQueue, clearQueue, playQueueTrack } = usePlayer();
  return <section className="queue-panel"><div className="queue-head"><div><span className="eyebrow">LISTENING NEXT</span><h2>Queue</h2></div><button className="text-button" onClick={clearQueue}>Clear all</button></div><div className="now-playing-card"><Artwork track={currentTrack} className="queue-now-art" /><span className="queue-now-copy"><small>NOW PLAYING</small><strong>{currentTrack?.title ?? "Nothing playing"}</strong><span>{currentTrack?.artist ?? "Choose a track"}</span></span><span className="eq-mark"><i /><i /><i /></span></div><div className="queue-list">{queue.length ? queue.map((track, index) => <motion.div layout key={track.id} className="queue-item"><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><button onClick={() => playQueueTrack(track)}><Artwork track={track} className="queue-art" /><span><strong>{track.title}</strong><small>{track.artist}</small></span></button><IconButton label={`Remove ${track.title} from queue`} onClick={() => removeFromQueue(track.id)}><X size={14} /></IconButton></motion.div>) : <div className="queue-empty"><ListMusic size={24} /><p>Your queue is empty</p><span>Add songs from a card to keep listening.</span></div>}</div><div className="queue-footer"><span>{queue.length} {queue.length === 1 ? "song" : "songs"} queued</span><button onClick={clearQueue}><Trash2 size={14} /> Clear</button></div></section>;
}

function ActivityRail({ recentTracks }: { recentTracks: Track[] }) {
  const { addToQueue, playNext, toggleLike, likedIds, requestTrack } = usePlayer();
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!openMenu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!listRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenu(null);
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenu]);

  return <aside className="activity-rail reference-activity-rail">
    <div className="reference-rail-heading"><h2>Your activity</h2></div>
    <div className="your-activity-list" ref={listRef}>
      {recentTracks.length ? recentTracks.slice(0, 5).map((track) => <div className="your-activity-row" key={track.id}>
        <Artwork track={track} className="your-activity-art" />
        <span><strong>{track.title}</strong><small>{track.artist}</small></span>
        <div className="activity-menu-anchor">
          <button className="activity-menu-trigger" aria-label={`More actions for ${track.title}`} aria-expanded={openMenu === track.id} onClick={() => setOpenMenu((current) => current === track.id ? null : track.id)}><MoreHorizontal size={15} /></button>
          {openMenu === track.id && <div className="activity-menu" role="menu">
            <button role="menuitem" onClick={() => { requestTrack(track); setOpenMenu(null); }}><Play size={13} /> Play</button>
            <button role="menuitem" onClick={() => { playNext(track); setOpenMenu(null); }}><SkipForward size={13} /> Play next</button>
            <button role="menuitem" onClick={() => { addToQueue(track); setOpenMenu(null); }}><ListPlus size={13} /> Add to queue</button>
            <button role="menuitem" onClick={() => { toggleLike(track); setOpenMenu(null); }}><Heart size={13} fill={likedIds.includes(track.id) ? "currentColor" : "none"} /> {likedIds.includes(track.id) ? "Unlike" : "Like"}</button>
          </div>}
        </div>
      </div>) : <div className="empty-inline">Play a song to start your history.</div>}
    </div>
    <div className="rail-footer"><Activity size={15} /><span>Listening time is saved to your account.</span></div>
    <QueuePanel />
  </aside>;
}

function DesktopPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentTrack, isPlaying, togglePlay, currentTime, duration, previous, next, seek, likedIds, toggleLike, isLoading, shuffle, toggleShuffle, repeat, cycleRepeat } = usePlayer();
  const progressStyle = { "--range-progress": `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` } as CSSProperties;
  return <div className="desktop-player"><button className="player-track" onClick={onExpand}><Artwork track={currentTrack} className="player-art" /><span><strong>{currentTrack?.title ?? "Nothing playing"}</strong><small>{currentTrack?.artist ?? "Choose a track"}</small></span></button><div className="player-controls"><div><IconButton label={`Shuffle ${shuffle ? "on" : "off"}`} active={shuffle} onClick={toggleShuffle}><Shuffle size={15} /></IconButton><IconButton label="Previous" onClick={previous}><SkipBack size={17} fill="currentColor" /></IconButton><motion.button type="button" whileTap={{ scale: .9 }} className="player-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>{isLoading ? <span className="spinner" /> : isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}</motion.button><IconButton label="Next" onClick={next}><SkipForward size={17} fill="currentColor" /></IconButton><IconButton label={`Repeat ${repeat}`} active={repeat !== "off"} onClick={cycleRepeat}><Radio size={15} /></IconButton></div><div className="player-progress"><span>{formatTime(currentTime)}</span><input style={progressStyle} aria-label="Song progress" type="range" min="0" max={duration || 1} step=".1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} /><span>{formatTime(duration)}</span></div></div><div className="player-actions"><IconButton label={currentTrack && likedIds.includes(currentTrack.id) ? "Unlike song" : "Like song"} onClick={() => currentTrack && toggleLike(currentTrack)}><Heart size={16} fill={currentTrack && likedIds.includes(currentTrack.id) ? "currentColor" : "none"} /></IconButton><IconButton label="Open full player" onClick={onExpand}><ListMusic size={16} /></IconButton></div></div>;
}

function SettingsView({ profile, recentCount, playlistCount, onLogin, onLogout, onViewHistory }: {
  profile?: AppProfile;
  recentCount: number;
  playlistCount: number;
  onLogin: () => void;
  onLogout: () => void;
  onViewHistory: () => void;
}) {
  const { volume, setVolume, shuffle, toggleShuffle, repeat, setRepeatMode } = usePlayer();
  return <div className="page settings-page">
    <div className="page-heading"><span className="eyebrow">MAKE IT YOURS</span><h1>Settings</h1><p>Manage your account and playback preferences.</p></div>
    <div className="settings-groups">
      <section className="settings-group">
        <div className="settings-group-head"><UserRound size={17} /><div><h2>Wave Tune account</h2><p>Account details and saved listening activity.</p></div></div>
        <div className="setting-line account-setting-line">
          <ProfileAvatar profile={profile} large />
          <span className="account-setting-copy"><strong>{profile?.name ?? "Guest listener"}</strong><small>{profile?.email ?? (profile ? "Signed in to Wave Tune" : "Sign in to sync your music across sessions.")}</small></span>
          {profile ? <button className="secondary-button" onClick={onLogout}><LogOut size={14} /> Sign out</button> : <button className="primary-button" onClick={onLogin}><LogIn size={14} /> Sign in</button>}
        </div>
        <div className="setting-stats">
          <div><strong>{Math.floor((profile?.totalListeningSeconds ?? 0) / 60)}</strong><small>minutes listened</small></div>
          <div><strong>{recentCount}</strong><small>recent songs</small></div>
          <div><strong>{playlistCount}</strong><small>playlists</small></div>
        </div>
      </section>

      <section className="settings-group">
        <div className="settings-group-head"><SlidersHorizontal size={17} /><div><h2>Playback</h2><p>These controls are also available in the player.</p></div></div>
        <label className="setting-line setting-range-line">
          <span><strong>Output volume</strong><small>Set the default audio level.</small></span>
          <input aria-label="Output volume" type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
          <span className="setting-value">{Math.round(volume * 100)}%</span>
        </label>
        <div className="setting-line">
          <span><strong>Shuffle</strong><small>Play the upcoming songs in a random order.</small></span>
          <button type="button" className={`toggle ${shuffle ? "is-on" : ""}`} aria-label="Shuffle playback" aria-pressed={shuffle} onClick={toggleShuffle}><span /></button>
        </div>
        <label className="setting-line">
          <span><strong>Repeat</strong><small>Choose what happens at the end of a song.</small></span>
          <select className="setting-select" aria-label="Repeat mode" value={repeat} onChange={(event) => setRepeatMode(event.target.value as "off" | "all" | "one")}>
            <option value="off">Off</option><option value="all">All songs</option><option value="one">Current song</option>
          </select>
        </label>
      </section>

      <section className="settings-group">
        <div className="settings-group-head"><Clock3 size={17} /><div><h2>Listening history</h2><p>Listening time and recently played tracks stay with your account.</p></div></div>
        <div className="setting-line">
          <span><strong>{profile ? "Synced to your account" : "Saved on this device"}</strong><small>{profile ? "Your history and listening time are saved in MongoDB." : "Sign in to keep history and listening time with your account."}</small></span>
          <button className="secondary-button" onClick={onViewHistory}>View history <ArrowRight size={14} /></button>
        </div>
      </section>
    </div>
  </div>;
}

function FullPlayer({ onClose }: { onClose: () => void }) {
  const { currentTrack, isPlaying, isLoading, togglePlay, currentTime, duration, seek, previous, next, volume, setVolume, shuffle, toggleShuffle, repeat, cycleRepeat, likedIds, toggleLike, addToQueue, playbackError } = usePlayer();
  const rangeStyle = { "--range-progress": `${duration ? currentTime / duration * 100 : 0}%` } as CSSProperties;
  return <motion.div className="full-player-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.section className="full-player" initial={{ y: 24 }} animate={{ y: 0 }}>
      <div className="full-player-head"><IconButton label="Close player" onClick={onClose}><ChevronDown size={21} /></IconButton><span>NOW PLAYING</span><span /></div>
      <div className="full-player-layout">
        <div className="full-player-body">
          {currentTrack ? <>
            <div className="full-art-wrap"><Artwork track={currentTrack} className="full-art" /><div className="art-glow" /></div>
            <div className="full-meta"><div><span className="source-pill source-catalog">Live catalog</span><h1>{currentTrack.title}</h1><p>{currentTrack.artist} · {currentTrack.album}</p></div><IconButton label={likedIds.includes(currentTrack.id) ? "Unlike song" : "Like song"} active={likedIds.includes(currentTrack.id)} onClick={() => toggleLike(currentTrack)} className="like-button"><Heart size={21} fill={likedIds.includes(currentTrack.id) ? "currentColor" : "none"} /></IconButton></div>
            <div className="seek-wrap"><input style={rangeStyle} aria-label="Seek song" type="range" min="0" max={duration || 1} step=".1" value={Math.min(currentTime, duration || 1)} onChange={(event) => seek(Number(event.target.value))} /><div><span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span></div></div>
            {playbackError && <div className="playback-error"><span>{playbackError}</span></div>}
            <div className="full-controls"><IconButton label={`Shuffle ${shuffle ? "on" : "off"}`} active={shuffle} onClick={toggleShuffle}><Shuffle size={18} /></IconButton><IconButton label="Previous" onClick={previous}><SkipBack size={22} fill="currentColor" /></IconButton><motion.button type="button" whileTap={{ scale: .9 }} className="main-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>{isLoading ? <span className="spinner spinner-dark" /> : isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}</motion.button><IconButton label="Next" onClick={next}><SkipForward size={22} fill="currentColor" /></IconButton><IconButton label={`Repeat ${repeat}`} active={repeat !== "off"} onClick={cycleRepeat}><Radio size={18} /></IconButton></div>
            <div className="full-secondary"><button onClick={() => addToQueue(currentTrack)}><ListPlus size={16} /> Add to queue</button><label><VolumeX size={15} /><input aria-label="Volume" type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /><Volume2 size={15} /></label></div>
          </> : <div className="empty-state"><Music2 size={28} /><h2>Nothing playing</h2><p>Choose a live catalog song to open the player.</p></div>}
        </div>
        <QueuePanel />
      </div>
    </motion.section>
  </motion.div>;
}

function MobilePlayer({ onExpand }: { onExpand: () => void }) {
  const { currentTrack, isPlaying, isLoading, togglePlay, currentTime, duration } = usePlayer();
  if (!currentTrack) return null;
  return <div className="mini-player">
    <button className="mini-track" onClick={onExpand}><Artwork track={currentTrack} className="mini-art" /><span><strong>{currentTrack.title}</strong><small>{currentTrack.artist}</small></span></button>
    <button type="button" className="mini-play" aria-label={isPlaying ? "Pause" : "Play"} onClick={togglePlay}>{isLoading ? <span className="spinner" /> : isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
    <div className="mini-progress"><span style={{ width: `${duration ? Math.min(100, currentTime / duration * 100) : 0}%` }} /></div>
  </div>;
}

function PlaylistPicker({ track, playlists, onClose, onAdded, onCreate }: { track: Track; playlists: Playlist[]; onClose: () => void; onAdded: (playlist: Playlist) => void; onCreate: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const add = async (playlist: Playlist) => {
    setSaving(playlist.id);
    setError("");
    try {
      const result = await accountService.addToPlaylist(playlist.id, track);
      onAdded(result.playlist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save this song.");
    } finally {
      setSaving(null);
    }
  };
  return <div className="modal-backdrop" onClick={onClose}><motion.div className="modal-card" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">SAVE SONG</span><h2>Add to playlist</h2></div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div><p className="modal-muted">{track.title}</p>{playlists.length ? playlists.map((playlist) => <button className="playlist-picker-row" key={playlist.id} disabled={saving !== null} onClick={() => void add(playlist)}><PlaylistArtwork playlist={playlist} /><span>{playlist.name}</span>{saving === playlist.id ? <span className="spinner" /> : <Plus size={15} />}</button>) : <div className="empty-inline">Create a playlist to save this song.</div>}{error && <p className="form-error">{error}</p>}<button className="secondary-button modal-create" onClick={onCreate}><Plus size={14} /> Create playlist</button></motion.div></div>;
}

function PlaylistDetailView({ playlist, onBack, onPlay, onDelete, onAddToPlaylist }: { playlist: Playlist; onBack: () => void; onPlay: () => void; onDelete: () => void; onAddToPlaylist: (track: Track) => void }) {
  const tracks = playlist.tracks ?? [];
  return <div className="page playlist-page">
    <button className="back-button" onClick={onBack}><ArrowLeft size={15} /> All playlists</button>
    <section className="playlist-hero"><PlaylistArtwork playlist={playlist} /><div><span className="eyebrow">PLAYLIST</span><h1>{playlist.name}</h1><p>{playlist.description}</p><span className="playlist-meta">{tracks.length} songs · Curated by you</span><div className="playlist-actions">{tracks.length > 0 && <button className="main-play small" onClick={onPlay}><Play size={15} fill="currentColor" /> Play</button>}<button className="secondary-button" onClick={onDelete}><Trash2 size={14} /> Delete playlist</button></div></div></section>
    {tracks.length ? <div className="track-list">{tracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={tracks} onAddToPlaylist={onAddToPlaylist} />)}</div> : <div className="empty-state compact-empty"><Radio size={23} /><h2>This playlist is ready for songs</h2><p>Save tracks from Discover or your home feed to fill it.</p></div>}
  </div>;
}

function CreatePlaylist({ onClose, onCreated }: { onClose: () => void; onCreated: (playlist: Playlist) => void }) {
  const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  return <div className="modal-backdrop" onClick={onClose}><motion.form className="modal-card" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); setSaving(true); accountService.createPlaylist(name, description).then((result) => onCreated(result.playlist)).catch((e) => setError(e instanceof Error ? e.message : "Could not create playlist.")).finally(() => setSaving(false)); }}><div className="modal-head"><div><span className="eyebrow">YOUR COLLECTION</span><h2>New playlist</h2></div><IconButton label="Close" onClick={onClose}><X size={18} /></IconButton></div><label className="field-label">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Late night waves" required maxLength={80} /></label><label className="field-label">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What belongs here?" maxLength={180} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={saving}>{saving ? "Saving..." : "Create playlist"}</button></motion.form></div>;
}

function PlayerServices({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const isSignedIn = isAuthenticated;
  const [, setLocation] = useLocation();
  const playbackRetryAfter = useRef(0);
  const playbackErrorShown = useRef(false);
  const savePlayback = useCallback((track: Track, seconds: number) => {
    if (!isSignedIn || Date.now() < playbackRetryAfter.current) return;
    void accountService.savePlayback(track, seconds)
      .then(() => {
        playbackRetryAfter.current = 0;
        playbackErrorShown.current = false;
        window.dispatchEvent(new Event("wave-tune:account-refresh"));
      })
      .catch((error) => {
        playbackRetryAfter.current = Date.now() + 60_000;
        if (playbackErrorShown.current) return;
        playbackErrorShown.current = true;
        window.dispatchEvent(new CustomEvent("wave-tune:account-error", {
          detail: error instanceof Error ? error.message : "Account activity could not be saved.",
        }));
      });
  }, [isSignedIn]);
  const saveLike = useCallback((track: Track) => {
    if (!isSignedIn) return;
    void accountService.toggleLike(track)
      .then(() => window.dispatchEvent(new Event("wave-tune:account-refresh")))
      .catch((error) => window.dispatchEvent(new CustomEvent("wave-tune:account-error", {
        detail: error instanceof Error ? error.message : "Your like could not be saved.",
      })));
  }, [isSignedIn]);
  return <PlayerProvider
    isAuthenticated={Boolean(!isLoading && isAuthenticated)}
    onRequireAuth={() => setLocation("/sign-in")}
    onPlaybackEvent={savePlayback}
    onLikeEvent={saveLike}
  >{children}</PlayerProvider>;
}

function AuthenticatedApp() {
  const { user, isLoading, isAuthenticated: isSignedIn, logout: signOut } = useAuth();
  const [location, setLocation] = useLocation();
  const reduceMotion = useReducedMotion();
  const player = usePlayer();
  const [account, setAccount] = useState<AccountSnapshot | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>("home");
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [fullPlayerOpen, setFullPlayerOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [addTrack, setAddTrack] = useState<Track | null>(null);
  const [createPlaylist, setCreatePlaylist] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    setCatalogError(null);
    catalogService.trending()
      .then((result) => setTracks(result.tracks))
      .catch((error) => setCatalogError(error instanceof Error ? error.message : "Catalog unavailable."))
      .finally(() => setCatalogLoading(false));
  }, []);
  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const loadAccount = useCallback(() => {
    if (isLoading) return;
    if (!isSignedIn) {
      setAccount(null);
      return;
    }
    accountService.getSnapshot()
      .then(setAccount)
      .catch((error) => setToast(error instanceof Error ? error.message : "Account storage is unavailable."));
  }, [isLoading, isSignedIn]);
  useEffect(() => { void loadAccount(); }, [loadAccount]);
  useEffect(() => {
    const refresh = () => { void loadAccount(); };
    const showError = (event: Event) => {
      const message = (event as CustomEvent<string>).detail;
      if (message) setToast(message);
    };
    window.addEventListener("wave-tune:account-refresh", refresh);
    window.addEventListener("wave-tune:account-error", showError);
    return () => {
      window.removeEventListener("wave-tune:account-refresh", refresh);
      window.removeEventListener("wave-tune:account-error", showError);
    };
  }, [loadAccount]);
  useEffect(() => {
    if (isSignedIn && account) player.syncLikedIds(account.likedTracks.map((track) => track.id));
  }, [account, isSignedIn, player.syncLikedIds]);

  const profile = account?.profile ?? (isSignedIn && user ? {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
    totalListeningSeconds: 0,
  } : undefined);
  const playlists = account?.playlists ?? [];
  const localTracks = player.library;
  const recentLocalTracks = player.recentlyPlayed
    .map((id) => [...tracks, ...localTracks].find((track) => track.id === id))
    .filter((track): track is Track => Boolean(track));
  const recentTracks = isSignedIn ? account?.recentTracks ?? [] : recentLocalTracks;
  const likedTracks = isSignedIn
    ? account?.likedTracks ?? []
    : [...tracks, ...localTracks].filter((track) => player.likedIds.includes(track.id));

  const navigate = useCallback((view: View) => {
    setActiveView(view);
    setSelectedPlaylist(null);
    setMobileMenuOpen(false);
  }, []);
  const login = useCallback(() => setLocation("/sign-in"), [setLocation]);
  const logout = useCallback(async () => {
    try {
      await signOut();
      setAccount(null);
      setLocation("/");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not sign out.");
    }
  }, [setLocation, signOut]);
  const authModalOpen = location.startsWith("/sign-in") || location.startsWith("/sign-up");
  const closeAuthModal = useCallback(() => setLocation("/"), [setLocation]);
  const finishAuth = useCallback(() => {
    setLocation("/");
    setToast("You are signed in to Wave Tune.");
  }, [setLocation]);
  const importFiles = async (files: FileList | File[]) => {
    const count = Array.from(files).filter((file) => file.type.startsWith("audio/")).length;
    try {
      await player.importFiles(files);
      setToast(`${count} track${count === 1 ? "" : "s"} added.`);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not import those audio files.");
    }
  };
  const addToPlaylist = (track: Track) => {
    if (!isSignedIn) {
      login();
      return;
    }
    setAddTrack(track);
  };
  const deletePlaylist = async () => {
    if (!selectedPlaylist || !window.confirm(`Delete “${selectedPlaylist.name}” and its saved track list?`)) return;
    try {
      await accountService.deletePlaylist(selectedPlaylist.id);
      setSelectedPlaylist(null);
      void loadAccount();
      setToast("Playlist deleted.");
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Could not delete this playlist.");
    }
  };
  useEffect(() => {
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("search");
      }
      if (event.key === "Escape") {
        setFullPlayerOpen(false);
        setMobileMenuOpen(false);
        setAddTrack(null);
        setCreatePlaylist(false);
      }
    };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [navigate]);

  let page: ReactNode;
  switch (activeView) {
    case "home":
      page = <HomeView tracks={tracks} recentTracks={recentTracks} loading={catalogLoading} error={catalogError} onRefresh={loadCatalog} onNavigate={navigate} onAddToPlaylist={addToPlaylist} />;
      break;
    case "search":
      page = <SearchView onAddToPlaylist={addToPlaylist} />;
      break;
    case "library":
      page = <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">YOUR MUSIC</span><h1>Library</h1><p>Local files and songs you have discovered in Wave Tune.</p></div><button className="primary-button" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> Import music</button></div>{localTracks.length ? <div className="track-list">{localTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={localTracks} onAddToPlaylist={addToPlaylist} />)}</div> : <div className="empty-state"><Upload size={24} /><h2>Bring your music with you</h2><p>Import local audio files to keep them in this browser.</p><button className="primary-button" onClick={() => fileInputRef.current?.click()}>Import audio files</button></div>}</div>;
      break;
    case "liked":
      page = <div className="page"><div className="page-heading"><span className="eyebrow">YOUR FAVORITES</span><h1>Liked songs</h1><p>Songs you want to hear again.</p></div>{likedTracks.length ? <div className="track-list">{likedTracks.map((track, index) => <TrackRow key={track.id} track={track} index={index} context={likedTracks} onAddToPlaylist={addToPlaylist} />)}</div> : <div className="empty-state"><Heart size={24} /><h2>Your likes will live here</h2><p>Tap the heart on any track to build this collection.</p></div>}</div>;
      break;
    case "recent":
      page = <div className="page"><div className="page-heading"><span className="eyebrow">YOUR LISTENING</span><h1>Recently played</h1><p>A memory of the songs you have played in Wave Tune.</p></div>{recentTracks.length ? <div className="track-list">{recentTracks.map((track, index) => <TrackRow key={`${track.id}-${index}`} track={track} index={index} context={recentTracks} onAddToPlaylist={addToPlaylist} />)}</div> : <div className="empty-state"><Clock3 size={24} /><h2>Your history is empty</h2><p>Start playing something and it will show up here.</p></div>}</div>;
      break;
    case "playlists":
      page = <div className="page"><div className="page-heading split-heading"><div><span className="eyebrow">YOUR COLLECTION</span><h1>Playlists</h1><p>Make space for whatever the day calls for.</p></div><button className="primary-button" onClick={() => isSignedIn ? setCreatePlaylist(true) : login()}><Plus size={15} /> New playlist</button></div>{playlists.length ? <div className="playlist-grid">{playlists.map((playlist) => <motion.button key={playlist.id} className="playlist-card" whileHover={{ y: -4 }} onClick={() => setSelectedPlaylist(playlist)}><PlaylistArtwork playlist={playlist} /><span><strong>{playlist.name}</strong><small>{playlist.description}</small></span><ArrowRight size={15} /></motion.button>)}</div> : <div className="empty-state"><ListMusic size={24} /><h2>Create your first playlist</h2><p>Save live catalog tracks into a private MongoDB-backed collection.</p><button className="primary-button" onClick={() => isSignedIn ? setCreatePlaylist(true) : login()}><Plus size={14} /> New playlist</button></div>}</div>;
      break;
    case "settings":
      page = <SettingsView profile={profile} recentCount={recentTracks.length} playlistCount={playlists.length} onLogin={login} onLogout={logout} onViewHistory={() => navigate("recent")} />;
      break;
  }

  const activePage = selectedPlaylist ? <PlaylistDetailView
    playlist={selectedPlaylist}
    onBack={() => setSelectedPlaylist(null)}
    onPlay={() => { const items = selectedPlaylist.tracks ?? []; if (items.length) player.requestTrack(items[0], items); }}
    onDelete={() => void deletePlaylist()}
    onAddToPlaylist={addToPlaylist}
  /> : page;

  return <div className={`app-shell ${sidebarCollapsed ? "sidebar-is-collapsed" : ""} ${authModalOpen ? "auth-modal-open" : ""}`}>
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <Sidebar activeView={activeView} onNavigate={navigate} collapsed={sidebarCollapsed} setCollapsed={setSidebarCollapsed} onImport={() => fileInputRef.current?.click()} profile={profile} playlists={playlists} onLogin={login} onLogout={logout} />
    <main className="main-column">
      <TopBar profile={profile} onSearch={() => navigate("search")} onSettings={() => navigate("settings")} onLogin={login} onMenu={() => setMobileMenuOpen(true)} />
      <AnimatePresence mode="wait" initial={!reduceMotion}><motion.div key={`${activeView}-${selectedPlaylist?.id ?? ""}`} className="view-shell" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -8 }} transition={{ duration: .24 }}>{activePage}</motion.div></AnimatePresence>
    </main>
    <ActivityRail recentTracks={recentTracks} />
    <DesktopPlayer onExpand={() => setFullPlayerOpen(true)} />
    <MobilePlayer onExpand={() => setFullPlayerOpen(true)} />
    <MobileNav activeView={activeView} onNavigate={navigate} />
    {mobileMenuOpen && <div className="mobile-drawer-backdrop" onClick={() => setMobileMenuOpen(false)}><div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu" onClick={(event) => event.stopPropagation()}><div className="drawer-head"><WaveLogo /><IconButton label="Close menu" onClick={() => setMobileMenuOpen(false)}><X size={18} /></IconButton></div><Sidebar activeView={activeView} onNavigate={navigate} collapsed={false} setCollapsed={() => undefined} onImport={() => { setMobileMenuOpen(false); fileInputRef.current?.click(); }} profile={profile} playlists={playlists} onLogin={login} onLogout={logout} /></div></div>}
    <input ref={fileInputRef} hidden type="file" accept="audio/*" multiple onChange={(event) => { if (event.target.files?.length) void importFiles(event.target.files); event.target.value = ""; }} />
    {toast && <motion.div className="toast" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={() => setToast("")}><Check size={15} /> {toast}</motion.div>}
    <AnimatePresence>
      {fullPlayerOpen && <FullPlayer onClose={() => setFullPlayerOpen(false)} />}
      {addTrack && <PlaylistPicker track={addTrack} playlists={playlists} onClose={() => setAddTrack(null)} onAdded={(playlist) => { setSelectedPlaylist((current) => current?.id === playlist.id ? playlist : current); setAddTrack(null); void loadAccount(); setToast(`Added to ${playlist.name}.`); }} onCreate={() => { setAddTrack(null); setCreatePlaylist(true); }} />}
      {createPlaylist && <CreatePlaylist onClose={() => setCreatePlaylist(false)} onCreated={(playlist) => { setCreatePlaylist(false); void loadAccount(); setToast(`${playlist.name} created.`); }} />}
    </AnimatePresence>
    {authModalOpen && <AuthModal onClose={closeAuthModal} onSuccess={finishAuth} />}
  </div>;
}

function MobileNav({ activeView, onNavigate }: { activeView: View; onNavigate: (view: View) => void }) {
  return <nav className="mobile-nav" aria-label="Mobile navigation">{[{ id: "home" as View, label: "Home", icon: Home }, { id: "search" as View, label: "Search", icon: Search }, { id: "library" as View, label: "Library", icon: Library }, { id: "playlists" as View, label: "Playlists", icon: ListMusic }].map(({ id, label, icon: Icon }) => <button key={id} className={activeView === id ? "is-active" : ""} onClick={() => onNavigate(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>;
}

function AppRoutes() {
  return (
    <PlayerServices>
      <Switch>
        <Route path="/sign-in/*?"><AuthenticatedApp /></Route>
        <Route path="/sign-up/*?"><AuthenticatedApp /></Route>
        <Route path="/"><AuthenticatedApp /></Route>
        <Route><Redirect to="/" /></Route>
      </Switch>
    </PlayerServices>
  );
}

export default function App() {
  return <AuthProvider><Router base={basePath}><AppRoutes /></Router></AuthProvider>;
}
