import express from "express";
import { createServer as createViteServer } from "vite";
import type { RequestHandler } from "express";
import { authRouter } from "./authRoutes";
import { accountRouter } from "./accountRoutes";
import { DatabaseUnavailableError, isMongoConfigured } from "./database";
import { getTrendingTracks, searchSpotify } from "./spotifyCatalog";
import { searchYouTube } from "./youtube";

const app = express();
const port = Number(process.env.PORT ?? 5000);
app.set("trust proxy", true);
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
  const proto = request.get("x-forwarded-proto")?.split(",")[0].trim()
    || (request.secure ? "https" : "http");
  const requestHosts = [forwardedHost, host].filter((value): value is string => Boolean(value));
  const sameOrigin = allowedOrigins.includes(origin)
    || requestHosts.some((requestHost) =>
      [`${proto}://${requestHost}`, `https://${requestHost}`, `http://${requestHost}`].includes(origin),
    );
  if (!sameOrigin) {
    response.status(403).json({ error: "This request did not come from Wave Tune." });
    return;
  }
  next();
};

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
app.use("/api/auth", verifySameOrigin);
app.use("/api/account", verifySameOrigin);

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    services: {
      mongodbConfigured: isMongoConfigured(),
      spotifyConfigured: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
      authenticationConfigured: isMongoConfigured(),
      googleSignInConfigured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim()),
      passwordSignInConfigured: isMongoConfigured(),
    },
  });
});

app.get("/api/catalog/trending", async (_request, response) => {
  try {
    response.json(await getTrendingTracks());
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

app.use("/api/auth", authRouter);
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
  if (error instanceof DatabaseUnavailableError) {
    response.status(503).json({ error: error.message });
    return;
  }
  if (process.env.NODE_ENV !== "production" && error instanceof Error) {
    console.error("Wave Tune request failed:", error.stack ?? error.message);
  } else {
    console.error("Wave Tune request failed:", error instanceof Error ? error.name : "unknown error");
  }
  response.status(500).json({ error: "Wave Tune could not complete that request. Check the service configuration." });
});

app.listen(port, "0.0.0.0", () => console.log(`Wave Tune server listening on ${port}`));
