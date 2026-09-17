import play from "play-dl";
import youtubeDl from "youtube-dl-exec";
import { Readable } from "node:stream";

export type YouTubeResult = {
  id: string;
  title: string;
  url: string;
  duration: number;
  artwork: string;
};

export async function searchYouTube(query: string): Promise<YouTubeResult[]> {
  const results = await play.search(query, {
    limit: 5,
    source: { youtube: "video" },
  });

  return results
    .filter((result) => result.type === "video" && Boolean(result.id && result.title && result.url))
    .map((result) => ({
      id: result.id,
      title: result.title,
      url: result.url,
      duration: result.durationInSec ?? 0,
      artwork: result.thumbnails?.[0]?.url ?? "",
    }));
}

export async function streamYouTube(videoId: string) {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const output = await youtubeDl(url, {
    getUrl: true,
    format: "bestaudio[ext=m4a]/bestaudio",
    noPlaylist: true,
    quiet: true,
  });
  const mediaUrl = String(output).trim().split(/\s+/).pop();
  if (!mediaUrl || !mediaUrl.startsWith("https://")) throw new Error("YouTube did not return a playable URL.");

  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok || !mediaResponse.body) {
    throw new Error(`YouTube media request failed with ${mediaResponse.status}.`);
  }
  return {
    stream: Readable.fromWeb(mediaResponse.body),
    type: mediaResponse.headers.get("content-type") ?? "audio/mp4",
    contentLength: mediaResponse.headers.get("content-length"),
  };
}
