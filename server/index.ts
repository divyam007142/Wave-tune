import express from "express";
import { createServer as createViteServer } from "vite";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { accountRouter } from "./accountRoutes";
import { isMongoConfigured } from "./database";
import { getTrendingTracks, searchSpotify } from "./spotifyCatalog";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./middlewares/clerkProxyMiddleware";
import { searchYouTube, streamYouTube } from "./youtube";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Credentials", "true");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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
app.use(
  clerkMiddleware((request) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(request) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    services: {
      mongodbConfigured: isMongoConfigured(),
      spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      authenticationConfigured: Boolean(process.env.CLERK_SECRET_KEY),
    },
  });
});

app.get("/api/catalog/trending", async (_request, response) => {
  try {
    response.json({ tracks: await getTrendingTracks() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify catalog is unavailable.";
    response.status(502).json({ error: message });
  }
});

app.get("/api/catalog/search", async (request, response) => {
  const query = String(request.query.q ?? "").trim().slice(0, 160);
  if (!query) {
    response.status(400).json({ error: "Enter a song, artist, album, or playlist to search." });
    return;
  }
  try {
    response.json(await searchSpotify(query));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Spotify search is unavailable.";
    response.status(502).json({ error: message });
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
    console.error("YouTube search failed", error);
    response.status(502).json({ error: "YouTube search is unavailable." });
  }
});

app.get("/api/youtube/stream", async (request, response) => {
  const videoId = String(request.query.videoId ?? "").trim();
  if (!/^[\w-]{11}$/.test(videoId)) {
    response.status(400).json({ error: "A valid YouTube video ID is required." });
    return;
  }

  try {
    const playback = await streamYouTube(videoId, request.header("range"));
    response.status(playback.status);
    response.setHeader("Content-Type", playback.type);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Accept-Ranges", playback.acceptRanges);
    if (playback.contentRange) response.setHeader("Content-Range", playback.contentRange);
    if (playback.contentLength) response.setHeader("Content-Length", playback.contentLength);
    playback.stream.pipe(response);
  } catch (error) {
    console.error("YouTube stream failed", error);
    response.status(502).json({ error: "YouTube playback is unavailable." });
  }
});

app.use("/api/account", accountRouter);
app.use("/api", (_request, response) => {
  response.status(404).json({ error: "That Wave Tune API route does not exist." });
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/*splat", (_request, response) => response.sendFile("dist/index.html", { root: process.cwd() }));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { port: 5001 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.message.includes("MongoDB is not configured")) {
    response.status(503).json({ error: error.message });
    return;
  }
  console.error("Wave Tune request failed:", error instanceof Error ? error.name : "unknown error");
  response.status(500).json({ error: "Wave Tune could not complete that request. Check the service configuration." });
});

app.listen(port, "0.0.0.0", () => console.log(`Wave Tune server listening on ${port}`));
