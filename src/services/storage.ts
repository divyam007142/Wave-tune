import type { Track } from "../types/music";

const PREFIX = "wave-tune:";

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored<T>(key: string, value: T) {
  localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
}

const databaseName = "wave-tune-library";
const storeName = "tracks";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveLocalTrack(track: Track, file: Blob) {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db
      .transaction(storeName, "readwrite")
      .objectStore(storeName)
      .put({ ...track, file });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function loadLocalTracks(): Promise<Track[]> {
  if (!("indexedDB" in window)) return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(
        request.result.map((entry: Track & { file: Blob }) => ({
          ...entry,
          audioUrl: URL.createObjectURL(entry.file),
        })),
      );
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

export async function clearLocalTracks() {
  if (!("indexedDB" in window)) return;
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}