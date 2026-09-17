import type { Playlist, SearchResult, Track } from "../types/music";

const clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID?.trim();
const redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI?.trim() || window.location.origin + "/";
const tokenKey = "wave-tune:spotify-token";
const verifierKey = "wave-tune:spotify-verifier";
const stateKey = "wave-tune:spotify-state";

const scopes = [
  "user-read-private",
  "user-read-email",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-recently-played",
  "user-top-read",
  "user-follow-read",
  "user-read-currently-playing",
  "user-read-playback-state",
].join(" ");

type SpotifyImage = { url: string; width?: number; height?: number };
type SpotifyArtist = { id: string; name: string };
type SpotifyAlbum = { id: string; name: string; images?: SpotifyImage[] };
type SpotifyApiTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  preview_url?: string | null;
};
type SpotifyPlaylistResponse = {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[];
  tracks?: { total?: number };
};
type SpotifyPlaylistTrackResponse = {
  items?: { track?: SpotifyApiTrack | null }[];
};
type SpotifyUser = {
  id: string;
  display_name?: string | null;
  email?: string | null;
  images?: SpotifyImage[];
  product?: string;
};
type SpotifyToken = { access_token: string; expires_in: number; expires_at: number };

export type SpotifyProfile = {
  id: string;
  name: string;
  email?: string;
  image?: string;
  product?: string;
};

export type SpotifySnapshot = {
  profile: SpotifyProfile;
  tracks: Track[];
  recentTracks: Track[];
  playlists: Playlist[];
  likedTracks: Track[];
};

function imageFrom(images?: SpotifyImage[]) {
  return images?.[0]?.url ?? "";
}

function toTrack(track: SpotifyApiTrack): Track {
  return {
    id: `spotify-${track.id}`,
    title: track.name,
    artist: track.artists.map((artist) => artist.name).join(", ") || "Unknown artist",
    album: track.album.name,
    duration: Math.round(track.duration_ms / 1000),
    artwork: imageFrom(track.album.images),
    accent: "#b58be8",
    source: "spotify",
    // Spotify preview URLs are not guaranteed and are intentionally not used
    // as a playback bypass. Premium playback belongs in Spotify Connect.
  };
}

function toPlaylist(playlist: SpotifyPlaylistResponse): Playlist {
  return {
    id: `spotify-playlist-${playlist.id}`,
    name: playlist.name,
    description: playlist.description?.replace(/<[^>]*>/g, "") || `${playlist.tracks?.total ?? 0} tracks`,
    artwork: imageFrom(playlist.images),
    accent: "#c6a8ee",
    trackIds: [],
  };
}

async function playlistTracks(playlistId: string) {
  const data = await api<SpotifyPlaylistTrackResponse>(`/playlists/${playlistId}/tracks?limit=50`);
  return (data.items ?? [])
    .map((item) => item.track)
    .filter((track): track is SpotifyApiTrack => Boolean(track?.id && track.name && track.album))
    .map(toTrack);
}

function randomString(length = 64) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, length);
}

async function challengeFor(verifier: string) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function storedToken() {
  try {
    const token = JSON.parse(sessionStorage.getItem(tokenKey) ?? "null") as SpotifyToken | null;
    return token && token.expires_at > Date.now() ? token : null;
  } catch {
    return null;
  }
}

async function api<T>(path: string): Promise<T> {
  const token = storedToken();
  if (!token) throw new Error("Spotify is not connected.");
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!response.ok) throw new Error(`Spotify request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export const spotifyService = {
  isConfigured: Boolean(clientId),

  get connected() {
    return Boolean(storedToken());
  },

  async startAuth() {
    if (!clientId) throw new Error("Add VITE_SPOTIFY_CLIENT_ID before connecting Spotify.");
    const verifier = randomString();
    const state = randomString(24);
    sessionStorage.setItem(verifierKey, verifier);
    sessionStorage.setItem(stateKey, state);
    const challenge = await challengeFor(verifier);
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: challenge,
      state,
      scope: scopes,
    });
    window.location.assign(`https://accounts.spotify.com/authorize?${params.toString()}`);
  },

  async completeAuth() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const returnedState = params.get("state");
    const error = params.get("error");
    if (error) throw new Error(`Spotify authorization was ${error}.`);
    if (!code) return false;
    const verifier = sessionStorage.getItem(verifierKey);
    const state = sessionStorage.getItem(stateKey);
    if (!verifier || !state || returnedState !== state) throw new Error("Spotify authorization could not be verified.");
    if (!clientId) throw new Error("Spotify client ID is not configured.");
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });
    if (!response.ok) throw new Error("Spotify could not complete the connection.");
    const token = (await response.json()) as { access_token: string; expires_in: number };
    sessionStorage.setItem(tokenKey, JSON.stringify({ ...token, expires_at: Date.now() + token.expires_in * 1000 - 30_000 }));
    sessionStorage.removeItem(verifierKey);
    sessionStorage.removeItem(stateKey);
    window.history.replaceState({}, document.title, window.location.pathname);
    return true;
  },

  disconnect() {
    sessionStorage.removeItem(tokenKey);
  },

  async loadSnapshot(): Promise<SpotifySnapshot> {
    const [user, recent, top, playlistResponse, savedTracks] = await Promise.all([
      api<SpotifyUser>("/me"),
      api<{ items: { track: SpotifyApiTrack }[] }>("/me/player/recently-played?limit=8"),
      api<{ items: SpotifyApiTrack[] }>("/me/top/tracks?limit=8&time_range=medium_term"),
      api<{ items: SpotifyPlaylistResponse[] }>("/me/playlists?limit=8"),
      api<{ items: { track: SpotifyApiTrack }[] }>("/me/tracks?limit=50"),
    ]);
    const recentTracks = recent.items.map((item) => item.track).map(toTrack);
    const tracks = [...recent.items.map((item) => item.track), ...top.items]
      .filter((track, index, list) => list.findIndex((item) => item.id === track.id) === index)
      .map(toTrack);
    const playlists = await Promise.all(
      playlistResponse.items.map(async (playlist) => ({
        ...toPlaylist(playlist),
        tracks: await playlistTracks(playlist.id),
      })),
    );
    return {
      profile: {
        id: user.id,
        name: user.display_name || user.email || "Spotify listener",
        email: user.email ?? undefined,
        image: imageFrom(user.images),
        product: user.product,
      },
      tracks,
      recentTracks,
      playlists,
      likedTracks: savedTracks.items.map((item) => item.track).filter(Boolean).map(toTrack),
    };
  },

  async search(query: string): Promise<SearchResult> {
    const data = await api<{ tracks?: { items: SpotifyApiTrack[] }; albums?: { items: SpotifyAlbum[] }; artists?: { items: (SpotifyArtist & { images?: SpotifyImage[] })[] }; playlists?: { items: SpotifyPlaylistResponse[] } }>(
      `/search?q=${encodeURIComponent(query)}&type=track,album,artist,playlist&limit=20`,
    );
    const tracks = (data.tracks?.items ?? []).map(toTrack);
    return {
      tracks,
      albums: (data.albums?.items ?? []).map((album) => ({
        id: `spotify-album-${album.id}`,
        name: album.name,
        artist: "Spotify album",
        artwork: imageFrom(album.images),
      })),
      artists: (data.artists?.items ?? []).map((artist) => ({
        id: `spotify-artist-${artist.id}`,
        name: artist.name,
        artwork: imageFrom(artist.images),
      })),
      playlists: (data.playlists?.items ?? []).map(toPlaylist),
    };
  },
};
