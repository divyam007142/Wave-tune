import { randomUUID } from "node:crypto";
import {
  Router,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { Playlist, Track } from "../src/types/music";
import { requireAuth, sessionUserFrom, type SessionUser } from "./auth";
import { getDatabase } from "./database";

type Profile = {
  id: string;
  name: string;
  email?: string;
  image?: string;
};

type UserDocument = {
  accountId: string;
  profile: Profile;
  totalListeningSeconds: number;
  likedTracks: Track[];
  recentTracks: Track[];
  playlists: Playlist[];
  lastTrack?: Track;
  lastListenedAt?: Date;
  mergedIntoAccountId?: string;
  createdAt: Date;
  updatedAt: Date;
};

const router = Router();

function asyncRoute(
  handler: (request: Request, response: Response) => Promise<void>,
): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
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
  const source = track.source === "local" ? "local" : "catalog";
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
    youtubeVideoId: /^[\w-]{11}$/.test(stringValue(track.youtubeVideoId, 20))
      ? stringValue(track.youtubeVideoId, 20)
      : undefined,
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

function mergeById<T extends { id: string }>(
  primary: T[],
  legacy: T[],
  limit = Number.MAX_SAFE_INTEGER,
) {
  const merged = new Map(primary.map((item) => [item.id, item]));
  for (const item of legacy) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  return [...merged.values()].slice(0, limit);
}

async function ensureUser(user: SessionUser) {
  const users = await collection();
  const profile: Profile = {
    id: user.id,
    name: stringValue(user.name, 120) || "Wave Tune listener",
    email: stringValue(user.email, 320) || undefined,
    image: safeArtwork(user.image),
  };
  const now = new Date();

  let document = await users.findOne({ accountId: user.id });
  if (!document && user.emailVerified && profile.email) {
    const legacy = await users.findOne(
      {
        "profile.email": profile.email,
        accountId: { $ne: user.id },
        mergedIntoAccountId: { $exists: false },
      },
      { collation: { locale: "en", strength: 2 } },
    );
    if (legacy) {
      await users.updateOne(
        { _id: legacy._id },
        { $set: { accountId: user.id, profile, updatedAt: now } },
      );
      document = await users.findOne({ accountId: user.id });
    }
  }

  if (!document) {
    await users.updateOne(
      { accountId: user.id },
      {
        $setOnInsert: {
          accountId: user.id,
          totalListeningSeconds: 0,
          likedTracks: [],
          recentTracks: [],
          playlists: [],
          createdAt: now,
        },
        $set: { profile, updatedAt: now },
      },
      { upsert: true },
    );
    document = await users.findOne({ accountId: user.id });
  }
  if (!document) throw new Error("Could not create the Wave Tune account.");

  if (user.emailVerified && profile.email) {
    const legacyDocuments = await users
      .find(
        {
          "profile.email": profile.email,
          accountId: { $ne: user.id },
          mergedIntoAccountId: { $exists: false },
        },
        { collation: { locale: "en", strength: 2 } },
      )
      .toArray();
    for (const legacy of legacyDocuments) {
      const playlists = mergeById(
        document.playlists ?? [],
        legacy.playlists ?? [],
      );
      await users.updateOne(
        { accountId: user.id },
        {
          $set: {
            likedTracks: mergeById(
              document.likedTracks ?? [],
              legacy.likedTracks ?? [],
              500,
            ),
            recentTracks: mergeById(
              document.recentTracks ?? [],
              legacy.recentTracks ?? [],
              30,
            ),
            playlists,
            totalListeningSeconds:
              (document.totalListeningSeconds ?? 0) +
              (legacy.totalListeningSeconds ?? 0),
            lastTrack: document.lastTrack ?? legacy.lastTrack,
            lastListenedAt:
              !document.lastListenedAt ||
              (legacy.lastListenedAt &&
                legacy.lastListenedAt > document.lastListenedAt)
                ? legacy.lastListenedAt
                : document.lastListenedAt,
            updatedAt: now,
          },
        },
      );
      await users.updateOne(
        { _id: legacy._id },
        { $set: { mergedIntoAccountId: user.id, updatedAt: now } },
      );
      document = (await users.findOne({ accountId: user.id })) ?? document;
    }
    await users.updateOne(
      { accountId: user.id },
      { $set: { profile, updatedAt: now } },
    );
    document = (await users.findOne({ accountId: user.id })) ?? document;
  }
  return document;
}

router.get(
  "/snapshot",
  requireAuth,
  asyncRoute(async (_request, response) => {
    const document = await ensureUser(sessionUserFrom(response));
    response.json(snapshot(document));
  }),
);

router.post(
  "/playback",
  requireAuth,
  asyncRoute(async (request, response) => {
    const track = normalizeTrack(request.body?.track);
    if (!track) {
      response.status(400).json({ error: "A valid track is required." });
      return;
    }
    const seconds = Math.max(
      0,
      Math.min(120, Math.floor(Number(request.body?.seconds) || 0)),
    );
    const user = sessionUserFrom(response);
    const users = await collection();
    const existing = await ensureUser(user);
    const recentTracks = [
      track,
      ...(existing.recentTracks ?? []).filter((item) => item.id !== track.id),
    ].slice(0, 30);
    const now = new Date();
    await users.updateOne(
      { accountId: user.id },
      {
        $set: {
          lastTrack: track,
          lastListenedAt: now,
          recentTracks,
          updatedAt: now,
        },
        $inc: { totalListeningSeconds: seconds },
      },
    );
    response.json({ ok: true });
  }),
);

router.delete(
  "/recent/:trackId",
  requireAuth,
  asyncRoute(async (request, response) => {
    const trackId = stringValue(request.params.trackId, 200);
    if (!trackId) {
      response.status(400).json({ error: "A track ID is required." });
      return;
    }
    const users = await collection();
    const user = sessionUserFrom(response);
    await ensureUser(user);
    await users.updateOne(
      { accountId: user.id },
      {
        $pull: { recentTracks: { id: trackId } },
        $set: { updatedAt: new Date() },
      },
    );
    response.json({ ok: true });
  }),
);

router.post(
  "/likes",
  requireAuth,
  asyncRoute(async (request, response) => {
    const track = normalizeTrack(request.body?.track);
    if (!track) {
      response.status(400).json({ error: "A valid track is required." });
      return;
    }
    const users = await collection();
    const document = await ensureUser(sessionUserFrom(response));
    const alreadyLiked = (document.likedTracks ?? []).some(
      (item) => item.id === track.id,
    );
    const likedTracks = alreadyLiked
      ? document.likedTracks.filter((item) => item.id !== track.id)
      : [
          track,
          ...(document.likedTracks ?? []).filter(
            (item) => item.id !== track.id,
          ),
        ].slice(0, 500);
    await users.updateOne(
      { accountId: document.accountId },
      { $set: { likedTracks, updatedAt: new Date() } },
    );
    response.json({ liked: !alreadyLiked });
  }),
);

router.post(
  "/playlists",
  requireAuth,
  asyncRoute(async (request, response) => {
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
    const user = sessionUserFrom(response);
    await ensureUser(user);
    await users.updateOne(
      { accountId: user.id },
      { $push: { playlists: playlist }, $set: { updatedAt: new Date() } },
    );
    response.status(201).json({ playlist });
  }),
);

router.post(
  "/playlists/:playlistId/tracks",
  requireAuth,
  asyncRoute(async (request, response) => {
    const track = normalizeTrack(request.body?.track);
    if (!track) {
      response.status(400).json({ error: "A valid track is required." });
      return;
    }
    const user = sessionUserFrom(response);
    const users = await collection();
    const document = await ensureUser(user);
    const playlist = (document.playlists ?? []).find(
      (item) => item.id === request.params.playlistId,
    );
    if (!playlist) {
      response.status(404).json({ error: "That playlist no longer exists." });
      return;
    }
    const tracks = [
      ...(playlist.tracks ?? []).filter((item) => item.id !== track.id),
      track,
    ];
    const updated: Playlist = {
      ...playlist,
      tracks,
      trackIds: tracks.map((item) => item.id),
      artwork: playlist.artwork || track.artwork,
    };
    await users.updateOne(
      { accountId: user.id, "playlists.id": playlist.id },
      { $set: { "playlists.$": updated, updatedAt: new Date() } },
    );
    response.json({ playlist: updated });
  }),
);

router.delete(
  "/playlists/:playlistId",
  requireAuth,
  asyncRoute(async (request, response) => {
    const user = sessionUserFrom(response);
    const users = await collection();
    const playlistId = String(request.params.playlistId ?? "");
    await users.updateOne(
      { accountId: user.id },
      {
        $pull: { playlists: { id: playlistId } },
        $set: { updatedAt: new Date() },
      },
    );
    response.json({ ok: true });
  }),
);

export const accountRouter = router;
