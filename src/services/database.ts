import { MongoClient, type Db } from "mongodb";

let databasePromise: Promise<Db> | undefined;

export function isMongoConfigured() {
  return Boolean(process.env.MONGODB_URI?.trim());
}

export async function getDatabase(): Promise<Db> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("MongoDB is not configured. Add MONGODB_URI to the Render service environment.");
  }

  if (!databasePromise) {
    const client = new MongoClient(uri, {
      appName: "WaveTune",
      serverSelectionTimeoutMS: 10_000,
    });
    databasePromise = client.connect()
      .then(async () => {
        const database = client.db(process.env.MONGODB_DB_NAME?.trim() || "wave_tune");
        await database.collection("users").createIndex({ clerkUserId: 1 }, { unique: true });
        return database;
      })
      .catch(async (error: unknown) => {
        databasePromise = undefined;
        await client.close().catch(() => undefined);
        throw error;
      });
  }

  return databasePromise;
}
