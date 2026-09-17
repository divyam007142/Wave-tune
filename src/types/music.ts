export type TrackSource = "local" | "spotify";

export type Track = {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  artwork: string;
  accent: string;
  audioUrl?: string;
  youtubeVideoId?: string;
  source: TrackSource;
  addedAt?: number;
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  artwork: string;
  accent: string;
  trackIds: string[];
  tracks?: Track[];
};

export type SearchResult = {
  tracks: Track[];
  albums: { id: string; name: string; artist: string; artwork: string }[];
  artists: { id: string; name: string; artwork: string }[];
  playlists: Playlist[];
};
