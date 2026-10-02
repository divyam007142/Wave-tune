import { MongoClient, type Db } from "mongodb";

let databasePromise: Promise<Db> | undefined;
let retryDatabaseAfter = 0;

export class DatabaseUnavailableError extends Error {
  constructor(reason = "Saved account storage is temporarily unavailable. Check MongoDB settings; music search and playback can still be used.") {
    super(reason);
    this.name = "DatabaseUnavailableError";
  }
}

export function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new DatabaseUnavailableError("Saved account storage is not configured. Add MONGODB_URI to the server environment; music search and playback can still be used.");
  }

  if (Date.now() < retryDatabaseAfter) throw new DatabaseUnavailableError();

  if (!databasePromise) {
    const client = new MongoClient(uri, {
      appName: "WaveTune",
      serverSelectionTimeoutMS: 10_000,
    });
    databasePromise = client.connect()
      .then(async () => {
        const database = client.db(process.env.MONGODB_DB_NAME?.trim() || "wave_tune");
        const userData = database.collection("users");
        await userData.updateMany(
          { clerkUserId: { $exists: true } },
          [
            { $set: { accountId: { $ifNull: ["$accountId", "$clerkUserId"] } } },
            { $unset: "clerkUserId" },
          ],
        );
        const userIndexes = await userData.indexes();
        if (userIndexes.some((index) => index.name === "clerkUserId_1")) {
          await userData.dropIndex("clerkUserId_1");
        }
        await userData.createIndex({ accountId: 1 }, { unique: true });
        const authUsers = database.collection("auth_users");
        await authUsers.createIndex({ emailNormalized: 1 }, { unique: true });
        await authUsers.createIndex(
          { googleSub: 1 },
          { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } },
        );
        const sessions = database.collection("auth_sessions");
        await sessions.createIndex({ tokenHash: 1 }, { unique: true });
        await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        retryDatabaseAfter = 0;
        return database;
      })
      .catch(async (error: unknown) => {
        databasePromise = undefined;
        retryDatabaseAfter = Date.now() + 60_000;
        await client.close().catch(() => undefined);
        console.warn(
          "MongoDB is unavailable; account-storage retries are paused for 60 seconds.",
          error instanceof Error ? error.message : "Unknown database error.",
        );
        throw new DatabaseUnavailableError();
      });
  }

  return databasePromise;
}
