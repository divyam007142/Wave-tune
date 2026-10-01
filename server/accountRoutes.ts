import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import type { Playlist, Track } from "../src/types/music";
import { getDatabase } from "./database";

type Profile = {
  id: string;
  name: string;
  email?: string;
  image?: string;
};

type UserDocument = {
  clerkUserId: string;
  profile: Profile;
  totalListeningSeconds: number;
  likedTracks: Track[];
  recentTracks: Track[];
  playlists: Playlist[];
  lastTrack?: Track;
  lastListenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

const router = Router();

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

const requireUser: RequestHandler = (request, response, next) => {
  const userId = getAuth(request).userId;
  if (!userId) {
    response.status(401).json({ error: "Sign in to access your Wave Tune account." });
    return;
  }
  response.locals.userId = userId;
  next();
};

function userIdFrom(response: Response) {
  return response.locals.userId as string;
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function safeArtwork(value: unknown) {
  const artwork = stringValue(value, 1500);
  try {
    return new URL(artwork).protocol === "https:" ? artwork : "";
  } catch {
    return "";
  }
}

function normalizeTrack(value: unknown): Track | null {
  if (!value || typeof value !== "object") return null;
  const track = value as Record<string, unknown>;
  const id = stringValue(track.id, 200);
  const title = stringValue(track.title, 200);
  if (!id || !title) return null;
  const source = track.source === "local" ? "local" : track.source === "catalog" ? "catalog" : "spotify";
  const accent = stringValue(track.accent, 20);
  return {
    id,
    title,
    artist: stringValue(track.artist, 200) || "Unknown artist",
    album: stringValue(track.album, 200),
    duration: Math.max(0, Math.min(86_400, Number(track.duration) || 0)),
    artwork: safeArtwork(track.artwork),
    accent: /^#[\da-f]{6}$/i.test(accent) ? accent : "#caff5c",
    source,
  };
}

function snapshot(document: UserDocument) {
  return {
    profile: {
      ...document.profile,
      totalListeningSeconds: document.totalListeningSeconds ?? 0,
    },
    playlists: document.playlists ?? [],
    likedTracks: document.likedTracks ?? [],
    recentTracks: document.recentTracks ?? [],
  };
}

async function collection() {
  return (await getDatabase()).collection<UserDocument>("users");
}

async function clerkProfile(userId: string): Promise<Profile> {
  const secretKey = process.env.CLERK_SECRET_KEY?.trim();
  if (!secretKey) {
    throw new Error("Clerk server authentication is not configured on Render.");
  }

  const response = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  if (!response.ok) {
    throw new Error(`Could not verify the signed-in profile with the auth provider (${response.status}).`);
  }
  const data = await response.json() as {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    username?: string | null;
    image_url?: string;
    primary_email_address_id?: string | null;
    email_addresses?: { id: string; email_address: string }[];
  };
  const name = [data.first_name, data.last_name].filter(Boolean).join(" ").trim()
    || data.username?.trim()
    || "Wave Tune listener";
  const email = data.email_addresses?.find((item) => item.id === data.primary_email_address_id)?.email_address;
  return {
    id: userId,
    name: stringValue(name, 120),
    email: email ? stringValue(email, 320) : undefined,
    image: safeArtwork(data.image_url),
  };
}

async function ensureUser(userId: string) {
  const users = await collection();
  let document = await users.findOne({ clerkUserId: userId });
  if (document) return document;

  const profile = await clerkProfile(userId);
  const now = new Date();
  await users.updateOne(
    { clerkUserId: userId },
    {
      $setOnInsert: {
        clerkUserId: userId,
        profile,
        totalListeningSeconds: 0,
        likedTracks: [],
        recentTracks: [],
        playlists: [],
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true },
  );
  document = await users.findOne({ clerkUserId: userId });
  if (!document) throw new Error("Could not create the Wave Tune account.");
  return document;
}

router.post("/sync", requireUser, asyncRoute(async (_request, response) => {
  const userId = userIdFrom(response);
  const profile = await clerkProfile(userId);
  const users = await collection();
  const now = new Date();
  await users.updateOne(
    { clerkUserId: userId },
    {
      $set: { profile, updatedAt: now },
      $setOnInsert: {
        clerkUserId: userId,
        totalListeningSeconds: 0,
        likedTracks: [],
        recentTracks: [],
        playlists: [],
        createdAt: now,
      },
    },
    { upsert: true },
  );
  response.json({ ok: true });
}));

router.get("/snapshot", requireUser, asyncRoute(async (_request, response) => {
  const document = await ensureUser(userIdFrom(response));
  response.json(snapshot(document));
}));

router.post("/playback", requireUser, asyncRoute(async (request, response) => {
  const track = normalizeTrack(request.body?.track);
  if (!track) {
    response.status(400).json({ error: "A valid track is required." });
    return;
  }
  const seconds = Math.max(0, Math.min(120, Math.floor(Number(request.body?.seconds) || 0)));
  const userId = userIdFrom(response);
  const users = await collection();
  const existing = await ensureUser(userId);
  const recentTracks = [track, ...(existing.recentTracks ?? []).filter((item) => item.id !== track.id)].slice(0, 30);
  const now = new Date();
  await users.updateOne(
    { clerkUserId: userId },
    {
      $set: { lastTrack: track, lastListenedAt: now, recentTracks, updatedAt: now },
      $inc: { totalListeningSeconds: seconds },
    },
  );
  response.json({ ok: true });
}));

router.post("/likes", requireUser, asyncRoute(async (request, response) => {
  const track = normalizeTrack(request.body?.track);
  if (!track) {
    response.status(400).json({ error: "A valid track is required." });
    return;
  }
  const users = await collection();
  const document = await ensureUser(userIdFrom(response));
  const alreadyLiked = (document.likedTracks ?? []).some((item) => item.id === track.id);
  const likedTracks = alreadyLiked
    ? document.likedTracks.filter((item) => item.id !== track.id)
    : [track, ...(document.likedTracks ?? []).filter((item) => item.id !== track.id)].slice(0, 500);
  await users.updateOne(
    { clerkUserId: document.clerkUserId },
    { $set: { likedTracks, updatedAt: new Date() } },
  );
  response.json({ liked: !alreadyLiked });
}));

router.post("/playlists", requireUser, asyncRoute(async (request, response) => {
  const name = stringValue(request.body?.name, 80);
  if (!name) {
    response.status(400).json({ error: "Give your playlist a name." });
    return;
  }
  const description = stringValue(request.body?.description, 180);
  const playlist: Playlist = {
    id: randomUUID(),
    name,
    description: description || "A playlist made in Wave Tune.",
    artwork: "",
    accent: "#caff5c",
    trackIds: [],
    tracks: [],
  };
  const users = await collection();
  await ensureUser(userIdFrom(response));
  await users.updateOne(
    { clerkUserId: userIdFrom(response) },
    { $push: { playlists: playlist }, $set: { updatedAt: new Date() } },
  );
  response.status(201).json({ playlist });
}));

router.post("/playlists/:playlistId/tracks", requireUser, asyncRoute(async (request, response) => {
  const track = normalizeTrack(request.body?.track);
  if (!track) {
    response.status(400).json({ error: "A valid track is required." });
    return;
  }
  const userId = userIdFrom(response);
  const users = await collection();
  const document = await ensureUser(userId);
  const playlist = (document.playlists ?? []).find((item) => item.id === request.params.playlistId);
  if (!playlist) {
    response.status(404).json({ error: "That playlist no longer exists." });
    return;
  }
  const tracks = [...(playlist.tracks ?? []).filter((item) => item.id !== track.id), track];
  const updated: Playlist = {
    ...playlist,
    tracks,
    trackIds: tracks.map((item) => item.id),
    artwork: playlist.artwork || track.artwork,
  };
  await users.updateOne(
    { clerkUserId: userId, "playlists.id": playlist.id },
    { $set: { "playlists.$": updated, updatedAt: new Date() } },
  );
  response.json({ playlist: updated });
}));

router.delete("/playlists/:playlistId", requireUser, asyncRoute(async (request, response) => {
  const userId = userIdFrom(response);
  const users = await collection();
  await users.updateOne(
    { clerkUserId: userId },
    { $pull: { playlists: { id: request.params.playlistId } }, $set: { updatedAt: new Date() } },
  );
  response.json({ ok: true });
}));

export const accountRouter = router;
