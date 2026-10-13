import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import { requireAuth, sessionUserFrom } from "./auth";
import {
  getWavePushPublicKey,
  getWavePushConfigurationStatus,
  normalizeBrowserSubscription,
  removePushSubscription,
  savePushSubscription,
  sendWavePushToAccount,
  type WavePushPayload,
} from "./pushNotifications";

const router = Router();

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

function textValue(value: unknown, maxLength: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength)
    : "";
}

function safeArtwork(value: unknown) {
  const artwork = textValue(value, 1500);
  try {
    return new URL(artwork).protocol === "https:" ? artwork : "";
  } catch {
    return "";
  }
}

function appOrigin(request: Request) {
  const source = request.get("origin");
  if (!source) return null;
  try {
    const url = new URL(source);
    const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLocalhost))
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function respondIfPushConfigurationMissing(response: Response) {
  const status = getWavePushConfigurationStatus();
  if (status.configured) return false;
  response
    .status(503)
    .json({
      configured: false,
      missing: status.missing,
      error: `Background alerts are not configured on this server. Add ${status.missing.join(" and ")} to the API server environment, then restart or redeploy it.`,
    });
  return true;
}

router.get("/status", (_request, response) => {
  response.setHeader("Cache-Control", "no-store");
  const status = getWavePushConfigurationStatus();
  response.json(status);
});

router.get("/public-key", (_request, response) => {
  if (respondIfPushConfigurationMissing(response)) return;
  try {
    response.setHeader("Cache-Control", "public, max-age=3600");
    response.json({ publicKey: getWavePushPublicKey() });
  } catch {
    response.status(503).json({
      configured: false,
      error: "Background alerts could not initialize. Check the server's SESSION_SECRET setting.",
    });
  }
});

router.post("/subscriptions", requireAuth, asyncRoute(async (request, response) => {
  if (respondIfPushConfigurationMissing(response)) return;
  const subscription = normalizeBrowserSubscription(request.body);
  if (!subscription) {
    response.status(400).json({ error: "The browser returned an invalid push subscription." });
    return;
  }
  const origin = appOrigin(request);
  if (!origin) {
    response.status(400).json({ error: "A secure Wave Tune origin is required to register this device." });
    return;
  }
  await savePushSubscription(sessionUserFrom(response).id, subscription, origin);
  response.status(201).json({ ok: true });
}));

router.delete("/subscriptions", requireAuth, asyncRoute(async (request, response) => {
  if (respondIfPushConfigurationMissing(response)) return;
  const endpoint = textValue(request.body?.endpoint, 4096);
  if (!endpoint) {
    response.status(400).json({ error: "A push subscription endpoint is required." });
    return;
  }
  await removePushSubscription(sessionUserFrom(response).id, endpoint);
  response.json({ ok: true });
}));

router.post("/events", requireAuth, asyncRoute(async (request, response) => {
  if (respondIfPushConfigurationMissing(response)) return;
  const type = request.body?.type === "streak" ? "streak" : request.body?.type === "track" ? "track" : null;
  const title = textValue(request.body?.title, 160);
  const body = textValue(request.body?.body, 260);
  if (!type || !title || !body) {
    response.status(400).json({ error: "A valid track or listening-streak notification is required." });
    return;
  }
  const payload: WavePushPayload = {
    type,
    title,
    body,
    tag: textValue(request.body?.tag, 120) || `wave-tune-${type}`,
    ...(safeArtwork(request.body?.artwork) ? { artwork: safeArtwork(request.body?.artwork) } : {}),
    createdAt: new Date().toISOString(),
  };
  const result = await sendWavePushToAccount(sessionUserFrom(response).id, payload);
  response.json({ ok: true, accepted: result.sent });
}));

export const pushRouter = router;
