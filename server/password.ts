import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const HASH_VERSION = "scrypt-v1";

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export function passwordValidationError(password: unknown) {
  if (typeof password !== "string") return "Enter a password.";
  const length = Array.from(password).length;
  if (length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (length > MAX_PASSWORD_LENGTH || Buffer.byteLength(password, "utf8") > 1024) {
    return `Use no more than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  return undefined;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt);
  return `${HASH_VERSION}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash?: string) {
  const parts = encodedHash?.split("$") ?? [];
  const salt = parts[0] === HASH_VERSION
    ? Buffer.from(parts[1] ?? "", "base64url")
    : Buffer.alloc(SALT_LENGTH);
  const expectedKey = parts[0] === HASH_VERSION
    ? Buffer.from(parts[2] ?? "", "base64url")
    : Buffer.alloc(KEY_LENGTH);
  const wellFormed = parts.length === 3
    && salt.length === SALT_LENGTH
    && expectedKey.length === KEY_LENGTH;

  const safePassword = Buffer.byteLength(password, "utf8") <= 1024 ? password : "";
  const actualKey = await deriveKey(safePassword, wellFormed ? salt : Buffer.alloc(SALT_LENGTH));
  return wellFormed && timingSafeEqual(actualKey, expectedKey);
}
