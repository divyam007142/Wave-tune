import { createHash, randomBytes } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";
import { getDatabase } from "./database";

const SESSION_COOKIE = "wave_tune_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export type AuthUserDocument = {
  id: string;
  email: string;
  emailNormalized: string;
  name: string;
  image?: string;
  googleSub?: string;
  passwordHash?: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  image?: string;
  emailVerified: boolean;
};

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function appendSetCookie(response: Response, value: string) {
  const current = response.getHeader("Set-Cookie");
  if (!current) {
    response.setHeader("Set-Cookie", value);
    return;
  }
  const cookies = Array.isArray(current) ? current : [String(current)];
  response.setHeader("Set-Cookie", [...cookies, value]);
}

function secureCookie(request: Request) {
  const forwardedProto = request.get("x-forwarded-proto")?.split(",")[0].trim();
  return request.secure || forwardedProto === "https";
}

function sessionCookie(request: Request, value: string, maxAgeSeconds: number) {
  const secure = secureCookie(request) ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function safeImage(value: unknown) {
  if (typeof value !== "string") return undefined;
  try {
    return new URL(value).protocol === "https:" ? value : undefined;
  } catch {
    return undefined;
  }
}

export function publicUser(user: AuthUserDocument): SessionUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    emailVerified: user.emailVerified,
  };
}

export async function createSession(request: Request, response: Response, userId: string) {
  const database = await getDatabase();
  const existingToken = readCookie(request, SESSION_COOKIE);
  if (existingToken) {
    await database.collection("auth_sessions").deleteOne({ tokenHash: tokenHash(existingToken) });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
  await database.collection("auth_sessions").insertOne({
    tokenHash: tokenHash(token),
    userId,
    createdAt: new Date(),
    expiresAt,
  });
  appendSetCookie(response, sessionCookie(request, token, Math.floor(SESSION_LIFETIME_MS / 1000)));
}

export async function destroySession(request: Request, response: Response) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) {
    const database = await getDatabase();
    await database.collection("auth_sessions").deleteOne({ tokenHash: tokenHash(token) });
  }
  appendSetCookie(response, sessionCookie(request, "", 0));
}

export async function getCurrentUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const database = await getDatabase();
  const session = await database.collection<{ tokenHash: string; userId: string; expiresAt: Date }>("auth_sessions")
    .findOne({ tokenHash: tokenHash(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;

  const user = await database.collection<AuthUserDocument>("auth_users").findOne({ id: session.userId });
  if (!user) {
    await database.collection("auth_sessions").deleteOne({ tokenHash: tokenHash(token) });
    return null;
  }
  return publicUser(user);
}

export const requireAuth: RequestHandler = (request, response, next) => {
  void getCurrentUser(request).then((user) => {
    if (!user) {
      response.status(401).json({ error: "Sign in to access your Wave Tune account." });
      return;
    }
    response.locals.authUser = user;
    next();
  }).catch(next);
};

export function sessionUserFrom(response: Response) {
  return response.locals.authUser as SessionUser;
}
