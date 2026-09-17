import express from "express";
import { createServer as createViteServer } from "vite";
import { searchYouTube, streamYouTube } from "./youtube";

const app = express();
const port = Number(process.env.PORT ?? 5000);
const allowedOrigins = (process.env.FRONTEND_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);

app.use((request, response, next) => {
  const origin = request.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }
  next();
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
  if (!videoId) {
    response.status(400).json({ error: "A YouTube video ID is required." });
    return;
  }

  try {
    const playback = await streamYouTube(videoId);
    response.setHeader("Content-Type", playback.type);
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Accept-Ranges", "bytes");
    if (playback.contentLength) response.setHeader("Content-Length", playback.contentLength);
    playback.stream.pipe(response);
  } catch (error) {
    console.error("YouTube stream failed", error);
    response.status(502).json({ error: "YouTube playback is unavailable." });
  }
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static("dist"));
  app.get("/*splat", (_request, response) => response.sendFile("dist/index.html", { root: process.cwd() }));
  app.listen(port, "0.0.0.0", () => console.log(`Wave Tune server listening on ${port}`));
} else {
  const vite = await createViteServer({
    server: { middlewareMode: true, hmr: { port: 5001 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
  app.listen(port, "0.0.0.0", () => console.log(`Wave Tune development server listening on ${port}`));
}
