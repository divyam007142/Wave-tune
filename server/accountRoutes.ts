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
import {
  buildTimeCapsuleStats,
  dayKeyAt,
  normalizeTimeZone,
  type DailyListeningRecord,
} from "./listeningStats";

type Profile = {
  id: string;
  name: string;
  nickname?: string;
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
  isOnline?: boolean;
  lastSeenAt?: Date;
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

function safeProfileImage(value: unknown) {
  if (typeof value !== "string") return "";
  const image = value.trim();
  if (!image || image.length > 400_000) return "";
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    return image;
  }
  return safeArtwork(image);
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

function retainProfileCustomization(current: Profile | undefined, identity: Profile): Profile {
  return {
    ...identity,
    ...(current?.nickname ? { nickname: current.nickname } : {}),
    ...(current?.image ? { image: current.image } : {}),
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
        {
          $set: {
            accountId: user.id,
            profile: retainProfileCustomization(legacy.profile, profile),
            updatedAt: now,
          },
        },
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
    const mergedProfile = retainProfileCustomization(document.profile, profile);
    await users.updateOne(
      { accountId: user.id },
      { $set: { profile: mergedProfile, updatedAt: now } },
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

router.put(
  "/profile",
  requireAuth,
  asyncRoute(async (request, response) => {
    const user = sessionUserFrom(response);
    const document = await ensureUser(user);
    const nickname = stringValue(request.body?.nickname, 32);
    const profile: Profile = { ...document.profile };
    if (nickname) profile.nickname = nickname;
    else delete profile.nickname;

    if (Object.hasOwn(request.body ?? {}, "image")) {
      const input = request.body.image;
      const image = input === "" ? safeArtwork(user.image) : safeProfileImage(input);
      if (input && !image) {
        response.status(400).json({ error: "Choose a PNG, JPEG, or WebP image under 400 KB." });
        return;
      }
      if (image) profile.image = image;
      else delete profile.image;
    }

    const users = await collection();
    await users.updateOne(
      { accountId: user.id },
      { $set: { profile, updatedAt: new Date() } },
    );
    response.json({
      profile: {
        ...profile,
        totalListeningSeconds: document.totalListeningSeconds ?? 0,
      },
    });
  }),
);

router.post(
  "/presence",
  requireAuth,
  asyncRoute(async (request, response) => {
    const user = sessionUserFrom(response);
    await ensureUser(user);
    const isOnline = request.body?.isOnline === true;
    const fields: Record<string, unknown> = {
      isOnline,
      updatedAt: new Date(),
    };
    if (isOnline) fields.lastSeenAt = new Date();
    const users = await collection();
    await users.updateOne({ accountId: user.id }, { $set: fields });
    response.json({ ok: true });
  }),
);

router.get(
  "/listeners",
  requireAuth,
  asyncRoute(async (_request, response) => {
    const users = await collection();
    const documents = await users
      .find({ mergedIntoAccountId: { $exists: false } })
      .project({
        accountId: 1,
        profile: 1,
        totalListeningSeconds: 1,
        isOnline: 1,
        lastSeenAt: 1,
      })
      .toArray();
    const onlineCutoff = Date.now() - 90_000;
    const listeners = documents
      .map((document) => ({
        id: document.accountId,
        name: stringValue(document.profile?.name, 120) || "Wave Tune listener",
        nickname: stringValue(document.profile?.nickname, 32) || undefined,
        image: safeProfileImage(document.profile?.image) || undefined,
        totalListeningSeconds: Math.max(0, document.totalListeningSeconds ?? 0),
        isOnline: document.isOnline === true
          && document.lastSeenAt instanceof Date
          && document.lastSeenAt.getTime() >= onlineCutoff,
        lastSeenAt: document.lastSeenAt instanceof Date
          ? document.lastSeenAt.toISOString()
          : null,
      }))
      .sort((left, right) => {
        if (left.isOnline !== right.isOnline) return left.isOnline ? -1 : 1;
        return (right.lastSeenAt ? Date.parse(right.lastSeenAt) : 0)
          - (left.lastSeenAt ? Date.parse(left.lastSeenAt) : 0);
      });
    response.json({ listeners });
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
    const timeZone = normalizeTimeZone(request.body?.timeZone);
    const dailyStats = (await getDatabase()).collection<DailyListeningRecord>("listening_stats");
    await dailyStats.updateOne(
      {
        accountId: user.id,
        day: dayKeyAt(now, timeZone),
        trackId: track.id,
      },
      {
        $set: { track, updatedAt: now },
        $setOnInsert: { accountId: user.id, day: dayKeyAt(now, timeZone), trackId: track.id, createdAt: now },
        $inc: { seconds, plays: seconds === 0 ? 1 : 0 },
      },
      { upsert: true },
    );
    response.json({ ok: true });
  }),
);

router.get(
  "/time-capsule",
  requireAuth,
  asyncRoute(async (request, response) => {
    const days = Number(request.query.days) === 7 ? 7 : 30;
    const timeZone = normalizeTimeZone(request.query.timeZone);
    const today = dayKeyAt(new Date(), timeZone);
    const startDay = new Date(
      Date.UTC(
        Number(today.slice(0, 4)),
        Number(today.slice(5, 7)) - 1,
        Number(today.slice(8, 10)) - days + 1,
      ),
    ).toISOString().slice(0, 10);
    const user = sessionUserFrom(response);
    const document = await ensureUser(user);
    const database = await getDatabase();
    const records = await database
      .collection<DailyListeningRecord>("listening_stats")
      .find({ accountId: user.id, day: { $gte: startDay, $lte: today } })
      .toArray();
    response.setHeader("Cache-Control", "private, no-store");
    response.json(buildTimeCapsuleStats({
      records,
      days,
      timeZone,
      today,
      allTimeSeconds: document.totalListeningSeconds ?? 0,
    }));
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
  "/playlists/:playlistId/tracks/:trackId",
  requireAuth,
  asyncRoute(async (request, response) => {
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
    const trackId = String(request.params.trackId ?? "");
    const tracks = (playlist.tracks ?? []).filter((item) => item.id !== trackId);
    const updated: Playlist = {
      ...playlist,
      tracks,
      trackIds: tracks.map((item) => item.id),
      artwork: tracks[0]?.artwork ?? "",
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
