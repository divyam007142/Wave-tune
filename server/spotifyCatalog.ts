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
type SpotifyPlaylistTracks = { items?: { track?: SpotifyTrack | null }[] };

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
    throw new Error("Spotify catalog access is not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to Render.");
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
    throw new Error(`Spotify could not issue a catalog token (${response.status}). Check the app credentials in Render.`);
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
    throw new Error(`Spotify catalog request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

async function playlistTracks(playlistId: string) {
  const response = await spotifyRequest<SpotifyPlaylistTracks>(
    `/playlists/${encodeURIComponent(playlistId)}/items?limit=25&market=US`,
  );
  return (response.items ?? [])
    .map((item) => item.track)
    .filter((track): track is SpotifyTrack => Boolean(track?.id && track.name && track.album && track.is_playable !== false))
    .map(toTrack);
}

async function discoverTrendingPlaylists() {
  try {
    const response = await spotifyRequest<{ playlists?: { items?: SpotifyPlaylist[] } }>(
      "/browse/featured-playlists?limit=20&country=US",
    );
    if (response.playlists?.items?.length) return response.playlists.items;
  } catch {
    // Spotify has changed availability of the featured-playlists endpoint for
    // some app modes. Search for its live editorial charts before failing.
  }

  const search = await spotifyRequest<{ playlists?: { items?: SpotifyPlaylist[] } }>(
    "/search?type=playlist&limit=10&market=US&q=top%20hits%20viral%20global",
  );
  return search.playlists?.items ?? [];
}

export async function getTrendingTracks(): Promise<Track[]> {
  if (cachedTrending && cachedTrending.expiresAt > Date.now()) return cachedTrending.tracks;

  const playlists = await discoverTrendingPlaylists();
  const ranked = [...playlists].sort((a, b) => {
    const weight = (name: string) => (/viral|top 50|top hits|today.s top|global/i.test(name) ? 2 : 0);
    return weight(b.name) - weight(a.name);
  });
  const collected = await Promise.allSettled(ranked.slice(0, 4).map((playlist) => playlistTracks(playlist.id)));
  const unique = new Map<string, Track>();
  for (const result of collected) {
    if (result.status === "fulfilled") {
      for (const track of result.value) unique.set(track.id, track);
    }
  }
  const tracks = [...unique.values()];
  if (!tracks.length) {
    throw new Error("Spotify returned no current chart tracks. Check the Spotify app's Web API access.");
  }

  cachedTrending = { tracks, expiresAt: Date.now() + 10 * 60_000 };
  return tracks;
}

export async function searchSpotify(query: string): Promise<SearchResult> {
  const search = await spotifyRequest<{
    tracks?: { items?: SpotifyTrack[] };
    albums?: { items?: SpotifyAlbum[] };
    artists?: { items?: SpotifyArtist[] };
    playlists?: { items?: SpotifyPlaylist[] };
  }>(`/search?q=${encodeURIComponent(query)}&type=track,album,artist,playlist&limit=25&market=US`);

  return {
    tracks: (search.tracks?.items ?? [])
      .filter((track) => track?.id && track.name && track.album && track.is_playable !== false)
      .map(toTrack),
    albums: (search.albums?.items ?? []).map((album) => ({
      id: `spotify-album-${album.id}`,
      name: album.name,
      artist: album.artists?.map((artist) => artist.name).join(", ") || "Unknown artist",
      artwork: imageFrom(album.images),
    })),
    artists: (search.artists?.items ?? []).map((artist) => ({
      id: `spotify-artist-${artist.id ?? artist.name}`,
      name: artist.name,
      artwork: imageFrom(artist.images),
    })),
    playlists: (search.playlists?.items ?? []).map((playlist) => ({
      id: `spotify-playlist-${playlist.id}`,
      name: playlist.name,
      description: playlist.description?.replace(/<[^>]*>/g, "") || `${playlist.tracks?.total ?? 0} tracks`,
      artwork: imageFrom(playlist.images),
      accent: "#caff5c",
      trackIds: [],
    })),
  };
}
