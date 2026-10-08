import express from "express";
import { createServer as createViteServer } from "vite";
import type { RequestHandler } from "express";
import { authRouter } from "./authRoutes";
import { accountRouter } from "./accountRoutes";
import { pushRouter } from "./pushRoutes";
import { DatabaseUnavailableError, isMongoConfigured } from "./database";
import type { Track } from "../src/types/music";
import {
  getRecommendedYouTube,
  getTrendingYouTube,
  getYouTubeStream,
  searchCatalogYouTube,
  searchYouTube,
  type RecommendationSeed,
  type YouTubeResult,
} from "./youtube";

const app = express();
const port = Number(process.env.PORT ?? 5000);
app.set("trust proxy", true);

function logYouTubeFailure(
  operation: string,
  error: unknown,
  elapsedMs?: number,
) {
  const failure = error && typeof error === "object"
    ? error as Error & {
        code?: unknown;
        exitCode?: unknown;
        signalCode?: unknown;
        stderr?: unknown;
      }
    : undefined;
  const rawDetails =
    (typeof failure?.stderr === "string" && failure.stderr) ||
    failure?.message ||
    (typeof error === "string" ? error : "");
  const details = String(rawDetails)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/https?:\/\/[^\s"'<>]+/g, (value) => {
      try {
        const url = new URL(value);
        return `${url.origin}${url.pathname}[query redacted]`;
      } catch {
        return "[url redacted]";
      }
    })
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1_200);

  console.error(`${operation} failed:`, {
    ...(elapsedMs === undefined ? {} : { elapsedMs }),
    errorName: failure?.name ?? typeof error,
    ...(typeof failure?.code === "string" || typeof failure?.code === "number"
      ? { code: failure.code }
      : {}),
    ...(typeof failure?.exitCode === "number" || failure?.exitCode === null
      ? { exitCode: failure.exitCode }
      : {}),
    ...(typeof failure?.signalCode === "string" || failure?.signalCode === null
      ? { signalCode: failure.signalCode }
      : {}),
    ...(details ? { details } : {}),
  });
}

function catalogTrack(result: YouTubeResult): Track {
  return {
    id: result.videoId,
    youtubeVideoId: result.videoId,
    title: result.title,
    artist: result.uploader,
    album: "YouTube",
    duration: result.duration,
    artwork: result.thumbnail,
    accent: "#557c48",
    source: "catalog",
  };
}

function recommendationSeeds(value: unknown): RecommendationSeed[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const seed = candidate as Record<string, unknown>;
    const title = typeof seed.title === "string" ? seed.title.trim().slice(0, 160) : "";
    const artist = typeof seed.artist === "string" ? seed.artist.trim().slice(0, 100) : "";
    const id = typeof seed.id === "string" ? seed.id.trim().slice(0, 200) : undefined;
    if (!title || !artist || seed.source === "local") return [];
    return [{ title, artist, ...(id ? { id } : {}) }];
  });
}
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const verifySameOrigin: RequestHandler = (request, response, next) => {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    next();
    return;
  }
  const origin = request.get("origin")?.replace(/\/+$/, "");
  if (!origin) {
    next();
    return;
  }
  const forwardedHost = request.get("x-forwarded-host")?.split(",")[0].trim();
  const host = request.get("host");
  const proto =
    request.get("x-forwarded-proto")?.split(",")[0].trim() ||
    (request.secure ? "https" : "http");
  const requestHosts = [forwardedHost, host].filter((value): value is string =>
    Boolean(value),
  );
  const sameOrigin =
    allowedOrigins.includes(origin) ||
    requestHosts.some((requestHost) =>
      [
        `${proto}://${requestHost}`,
        `https://${requestHost}`,
        `http://${requestHost}`,
      ].includes(origin),
    );
  if (!sameOrigin) {
    response
      .status(403)
      .json({ error: "This request did not come from Wave Tune." });
    return;
  }
  next();
};

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use("/api/auth", verifySameOrigin);
app.use("/api/account", verifySameOrigin);
app.use("/api/push", verifySameOrigin, pushRouter);

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    services: {
      mongodbConfigured: isMongoConfigured(),
      authenticationConfigured: isMongoConfigured(),
      googleSignInConfigured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
      passwordSignInConfigured: isMongoConfigured(),
    },
  });
});

app.get("/api/catalog/trending", async (_request, response) => {
  try {
    response.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    const results = await getTrendingYouTube();
    response.json({ tracks: results.map(catalogTrack) });
  } catch (error) {
    logYouTubeFailure("YouTube recommendations", error);
    response
      .status(502)
      .json({ error: "YouTube recommendations are temporarily unavailable." });
  }
});

app.get("/api/catalog/search", async (request, response) => {
  const query = String(request.query.q ?? "")
    .trim()
    .slice(0, 160);
  if (!query) {
    response
      .status(400)
      .json({ error: "Enter a song, artist, album, or playlist to search." });
    return;
  }
  try {
    const tracks = (await searchCatalogYouTube(query)).map(catalogTrack);
    response.json({ tracks, albums: [], artists: [], playlists: [] });
  } catch (error) {
    logYouTubeFailure("YouTube catalog search", error);
    response
      .status(502)
      .json({ error: "YouTube search is temporarily unavailable." });
  }
});

app.post("/api/catalog/recommendations", verifySameOrigin, async (request, response) => {
  try {
    const currentTrack = recommendationSeeds([request.body?.currentTrack])[0] ?? null;
    const likedTracks = recommendationSeeds(request.body?.likedTracks);
    const recentTracks = recommendationSeeds(request.body?.recentTracks);
    const excludeIds = Array.isArray(request.body?.excludeIds)
      ? request.body.excludeIds
          .filter((id: unknown): id is string => typeof id === "string")
          .slice(0, 100)
          .map((id: string) => id.slice(0, 200))
      : [];
    const tracks = await getRecommendedYouTube({
      currentTrack,
      likedTracks,
      recentTracks,
      excludeIds,
    });
    response.setHeader("Cache-Control", "private, max-age=60");
    response.json({ tracks: tracks.map(catalogTrack) });
  } catch (error) {
    logYouTubeFailure("Personalized recommendations", error);
    response.status(502).json({ error: "Personalized recommendations are temporarily unavailable." });
  }
});

app.get("/api/search", async (request, response) => {
  const query = String(request.query.q ?? "")
    .trim()
    .slice(0, 160);
  if (!query) {
    response
      .status(400)
      .json({ error: "Enter a song, artist, or mood to search." });
    return;
  }

  try {
    response.setHeader(
      "Cache-Control",
      "public, max-age=60, stale-while-revalidate=240",
    );
    response.json({ results: await searchYouTube(query) });
  } catch (error) {
    logYouTubeFailure("YouTube search", error);
    response
      .status(502)
      .json({
        error: "YouTube search is temporarily unavailable. Please try again.",
      });
  }
});

app.get("/api/stream/:videoId", async (request, response) => {
  const videoId = String(request.params.videoId ?? "");
  if (!/^[\w-]{11}$/.test(videoId)) {
    response.status(400).json({ error: "That YouTube video ID is invalid." });
    return;
  }

  const startedAt = Date.now();
  try {
    const audioUrl = await getYouTubeStream(videoId);
    response.setHeader("Cache-Control", "private, max-age=60");
    response.json({ videoId, audioUrl, expiresIn: 240 });
  } catch (error) {
    logYouTubeFailure(
      "YouTube audio stream resolution",
      error,
      Date.now() - startedAt,
    );
    response
      .status(502)
      .json({
        error:
          "This song's audio stream could not be prepared. Try another result.",
      });
  }
});

app.get("/api/youtube/search", async (request, response) => {
  const query = String(request.query.q ?? "").trim();
  if (!query) {
    response.status(400).json({ error: "A search query is required." });
    return;
  }

  try {
    response.json({ results: await searchYouTube(query) });
  } catch (error) {
    logYouTubeFailure("YouTube search", error);
    response.status(502).json({ error: "YouTube search is unavailable." });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/account", accountRouter);
app.use("/api", (_request, response) => {
  response
    .status(404)
    .json({ error: "That Wave Tune API route does not exist." });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/*splat", (_request, response) =>
    response.sendFile("dist/index.html", { root: process.cwd() }),
  );
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { port: 5001 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof DatabaseUnavailableError) {
      response.status(503).json({ error: error.message });
      return;
    }
    if (process.env.NODE_ENV !== "production" && error instanceof Error) {
      console.error("Wave Tune request failed:", error.stack ?? error.message);
    } else {
      console.error(
        "Wave Tune request failed:",
        error instanceof Error ? error.name : "unknown error",
      );
    }
    response
      .status(500)
      .json({
        error:
          "Wave Tune could not complete that request. Check the service configuration.",
      });
  },
);

app.listen(port, "0.0.0.0", () =>
  console.log(`Wave Tune server listening on ${port}`),
);
