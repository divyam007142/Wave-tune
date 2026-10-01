import play from "play-dl";

export type YouTubeResult = {
  id: string;
  title: string;
  url: string;
  duration: number;
  artwork: string;
};

export async function searchYouTube(query: string): Promise<YouTubeResult[]> {
  const results = await play.search(query.slice(0, 160), {
    limit: 5,
    source: { youtube: "video" },
  });

  return results.flatMap((result) => {
    if (result.type !== "video" || !result.id || !result.title || !result.url) return [];
    return [{
      id: result.id,
      title: result.title,
      url: result.url,
      duration: result.durationInSec ?? 0,
      artwork: result.thumbnails?.[0]?.url ?? "",
    }];
  });
}
