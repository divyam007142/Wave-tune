import type { SearchResult, Track } from "../src/types/music";

type SpotifyImage = { url: string };
type SpotifyArtist = { id?: string; name: string; images?: SpotifyImage[] };
type SpotifyAlbum = { id: string; name: string; images?: SpotifyImage[]; artists?: SpotifyArtist[] };
type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  is_playable?: boolean;
};
type SpotifyPlaylist = {
  id: string;
  name: string;
  description?: string | null;
  images?: SpotifyImage[];
  tracks?: { total?: number };
};
type SpotifyPlaylistTracks = { items?: ({ track?: SpotifyTrack | null } | null)[] };

let cachedToken: { value: string; expiresAt: number } | undefined;
let cachedTrending: { tracks: Track[]; expiresAt: number } | undefined;

function imageFrom(images?: SpotifyImage[]) {
  return images?.[0]?.url ?? "";
}

function toTrack(track: SpotifyTrack): Track {
  return {
    id: `spotify-${track.id}`,
    title: track.name,
    artist: track.artists?.map((artist) => artist.name).filter(Boolean).join(", ") || "Unknown artist",
    album: track.album?.name || "Single",
    duration: Math.max(0, Math.round((track.duration_ms || 0) / 1000)),
    artwork: imageFrom(track.album?.images),
    accent: "#caff5c",
    source: "spotify",
  };
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Spotify catalog access is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the server environment.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!response.ok) {
    throw new Error(`Spotify could not issue a catalog token (${response.status}). Check the server credentials and Web API access.`);
  }
  const data = await response.json() as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function spotifyRequest<T>(path: string): Promise<T> {
  const response = await fetch(`https://api.spotify.com/v1${path}`, {
    headers: { Authorization: `Bearer ${await accessToken()}` },
  });
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as
      | { error?: string | { message?: string } }
      | null;
    const detail = typeof errorBody?.error === "string"
      ? errorBody.error
      : errorBody?.error?.message;
    throw new Error(`Spotify catalog request failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return response.json() as Promise<T>;
}

async function playlistTracks(playlistId: string) {
  const response = await spotifyRequest<SpotifyPlaylistTracks>(
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=25&market=US`,
  );
  return (response.items ?? [])
    .map((item) => item?.track)
    .filter((track): track is SpotifyTrack => Boolean(track?.id && track.name && track.album && track.is_playable !== false))
    .map(toTrack);
}

async function discoverTrendingPlaylists() {
  // Spotify's featured-playlists endpoint is deprecated. Find current chart
  // playlists using the supported catalog search endpoint instead.
  const queries = ["Top 50 Global", "Viral 50 Global", "Today's Top Hits"];
  const responses = await Promise.allSettled(
    queries.map((query) =>
      spotifyRequest<{ playlists?: { items?: SpotifyPlaylist[] } }>(
        `/search?type=playlist&limit=10&market=US&q=${encodeURIComponent(query)}`,
      ),
    ),
  );
  const playlists = new Map<string, SpotifyPlaylist>();
  for (const response of responses) {
    if (response.status !== "fulfilled") continue;
    for (const playlist of response.value.playlists?.items ?? []) {
      if (playlist?.id && /top 50|top hits|viral|trending/i.test(playlist.name)) {
        playlists.set(playlist.id, playlist);
      }
    }
  }
  if (!playlists.size) {
    const firstError = responses.find((response) => response.status === "rejected");
    if (firstError?.status === "rejected") throw firstError.reason;
    throw new Error("Spotify did not return any chart playlists.");
  }
  return [...playlists.values()];
}

export async function getTrendingTracks(): Promise<{ tracks: Track[]; notice?: string }> {
  if (cachedTrending && cachedTrending.expiresAt > Date.now()) {
    return { tracks: cachedTrending.tracks };
  }

  const playlists = await discoverTrendingPlaylists();
  const weight = (name: string) => {
    if (/top 50.*global|global.*top 50/i.test(name)) return 4;
    if (/viral 50.*global|global.*viral/i.test(name)) return 3;
    if (/today.s top hits/i.test(name)) return 2;
    return 1;
  };
  const ranked = [...playlists].sort((a, b) => weight(b.name) - weight(a.name));
  const collected = await Promise.allSettled(ranked.slice(0, 4).map((playlist) => playlistTracks(playlist.id)));
  const unique = new Map<string, Track>();
  for (const result of collected) {
    if (result.status === "fulfilled") {
      for (const track of result.value) unique.set(track.id, track);
    }
  }
  const tracks = [...unique.values()];
  if (!tracks.length) {
    const firstError = collected.find((result) => result.status === "rejected");
    if (firstError?.status === "rejected") throw firstError.reason;
    throw new Error("Spotify returned chart playlists with no tracks.");
  }
  cachedTrending = { tracks, expiresAt: Date.now() + 10 * 60_000 };
  return { tracks };
}

export async function searchSpotify(query: string): Promise<SearchResult> {
  const search = await spotifyRequest<{
    tracks?: { items?: (SpotifyTrack | null)[] };
    albums?: { items?: (SpotifyAlbum | null)[] };
    artists?: { items?: (SpotifyArtist | null)[] };
    playlists?: { items?: (SpotifyPlaylist | null)[] };
  }>(`/search?q=${encodeURIComponent(query)}&type=track,album,artist,playlist&limit=10&market=US`);

  return {
    tracks: (search.tracks?.items ?? [])
      .filter((track): track is SpotifyTrack => Boolean(track?.id && track.name && track.album && track.is_playable !== false))
      .map(toTrack),
    albums: (search.albums?.items ?? [])
      .filter((album): album is SpotifyAlbum => Boolean(album?.id && album.name))
      .map((album) => ({
      id: `spotify-album-${album.id}`,
      name: album.name,
      artist: album.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
      artwork: imageFrom(album.images),
      })),
    artists: (search.artists?.items ?? [])
      .filter((artist): artist is SpotifyArtist => Boolean(artist?.name))
      .map((artist) => ({
      id: `spotify-artist-${artist.id ?? artist.name}`,
      name: artist.name,
      artwork: imageFrom(artist.images),
      })),
    playlists: (search.playlists?.items ?? [])
      .filter((playlist): playlist is SpotifyPlaylist => Boolean(playlist?.id && playlist.name))
      .map((playlist) => ({
      id: `spotify-playlist-${playlist.id}`,
      name: playlist.name,
      description: playlist.description?.replace(/<[^>]*>/g, "") || `${playlist.tracks?.total ?? 0} tracks`,
      artwork: imageFrom(playlist.images),
      accent: "#caff5c",
      trackIds: [],
      })),
  };
}
