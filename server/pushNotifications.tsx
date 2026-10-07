import { createECDH, createHash, createHmac } from "node:crypto";
import * as webPush from "web-push";
import { getDatabase } from "./database";

export type WavePushPayload = {
  type: "track" | "streak";
  title: string;
  body: string;
  tag: string;
  artwork?: string;
  createdAt: string;
};

type StoredPushSubscription = {
  accountId: string;
  endpointHash: string;
  endpoint: string;
  appOrigin: string;
  keys: { p256dh: string; auth: string };
  createdAt: Date;
  updatedAt: Date;
};

type BrowserPushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const subscriptionsCollection = "push_subscriptions";
const maxSubscriptionsPerAccount = 12;
const curveOrder = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");
let vapidKeys: { publicKey: string; privateKey: string } | undefined;

function getVapidKeys() {
  if (vapidKeys) return vapidKeys;
  const rootSecret = process.env.SESSION_SECRET?.trim();
  if (!rootSecret) throw new Error("Push delivery requires SESSION_SECRET.");

  // Domain-separate this stable key from other uses of SESSION_SECRET. Keeping
  // the same secret across deploys keeps existing browser subscriptions valid.
  const digest = createHmac("sha256", rootSecret)
    .update("wave-tune-web-push-vapid-p256-v1")
    .digest();
  const scalar = (BigInt(`0x${digest.toString("hex")}`) % (curveOrder - 1n)) + 1n;
  const privateBytes = Buffer.from(scalar.toString(16).padStart(64, "0"), "hex");
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(privateBytes);
  vapidKeys = {
    publicKey: ecdh.getPublicKey(undefined, "uncompressed").toString("base64url"),
    privateKey: privateBytes.toString("base64url"),
  };
  return vapidKeys;
}

export function getWavePushPublicKey() {
  return getVapidKeys().publicKey;
}

function endpointDigest(endpoint: string) {
  return createHash("sha256").update(endpoint).digest("hex");
}

export function normalizeBrowserSubscription(value: unknown): BrowserPushSubscription | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const keys = input.keys && typeof input.keys === "object"
    ? input.keys as Record<string, unknown>
    : {};
  const endpoint = typeof input.endpoint === "string" ? input.endpoint.trim() : "";
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys.auth === "string" ? keys.auth : "";
  if (!endpoint || endpoint.length > 4096 || !p256dh || !auth) return null;

  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const trustedPushHost = host === "fcm.googleapis.com"
    || host === "web.push.apple.com"
    || host === "updates.push.services.mozilla.com"
    || host.endsWith(".push.services.mozilla.com")
    || host.endsWith(".notify.windows.com");
  if (url.protocol !== "https:" || url.username || url.password || !trustedPushHost) return null;
  if (!/^[A-Za-z0-9_-]{16,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,200}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

export async function savePushSubscription(accountId: string, subscription: BrowserPushSubscription, appOrigin: string) {
  const database = await getDatabase();
  const collection = database.collection<StoredPushSubscription>(subscriptionsCollection);
  const endpointHash = endpointDigest(subscription.endpoint);
  const existing = await collection.findOne({ endpointHash });
  if (!existing) {
    const accountSubscriptions = await collection.find({ accountId })
      .sort({ updatedAt: 1 })
      .limit(maxSubscriptionsPerAccount)
      .toArray();
    if (accountSubscriptions.length >= maxSubscriptionsPerAccount) {
      await collection.deleteOne({ _id: accountSubscriptions[0]._id, accountId });
    }
  }
  const now = new Date();
  await collection.updateOne(
    { endpointHash },
    {
      $set: {
        accountId,
        endpoint: subscription.endpoint,
        endpointHash,
        appOrigin,
        keys: subscription.keys,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true },
  );
}

export async function removePushSubscription(accountId: string, endpoint: string) {
  const database = await getDatabase();
  await database.collection<StoredPushSubscription>(subscriptionsCollection)
    .deleteOne({ accountId, endpointHash: endpointDigest(endpoint) });
}

export async function sendWavePushToAccount(accountId: string, payload: WavePushPayload) {
  const database = await getDatabase();
  const collection = database.collection<StoredPushSubscription>(subscriptionsCollection);
  const subscriptions = await collection.find({ accountId }).limit(maxSubscriptionsPerAccount).toArray();
  if (!subscriptions.length) return { sent: 0 };

  const keys = getVapidKeys();
  let sent = 0;
  for (const stored of subscriptions) {
    try {
      const subject = stored.appOrigin.startsWith("https:")
        ? stored.appOrigin
        : "mailto:notifications@example.com";
      webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
      await webPush.sendNotification(
        { endpoint: stored.endpoint, keys: stored.keys },
        JSON.stringify(payload),
        { TTL: 120, urgency: "normal" },
      );
      sent += 1;
    } catch (error) {
      const statusCode = error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode)
        : 0;
      if (statusCode === 404 || statusCode === 410) {
        await collection.deleteOne({ _id: stored._id, accountId }).catch(() => undefined);
      } else {
        console.warn("Wave Tune push delivery failed.", statusCode || "push service error");
      }
    }
  }
  return { sent };
}
