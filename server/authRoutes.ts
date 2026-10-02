import {
  createHash,
  createPublicKey,
  randomBytes,
  verify as verifySignature,
} from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import {
  createSession,
  destroySession,
  getCurrentUser,
  normalizeEmail,
  publicUser,
  safeImage,
  type AuthUserDocument,
} from "./auth";
import { getDatabase } from "./database";
import { hashPassword, passwordValidationError, verifyPassword } from "./passwords";

const router = Router();
const GOOGLE_NONCE_COOKIE = "wave_tune_google_nonce";
const GOOGLE_COOKIE_PATH = "/api/auth/google";

type GoogleKey = {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
  use?: string;
};

type GoogleClaims = {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  exp?: number;
  iat?: number;
  nonce?: string;
  azp?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

let googleKeys: { keys: GoogleKey[]; expiresAt: number } | undefined;
const passwordAttemptBuckets = new Map<string, { count: number; expiresAt: number }>();

class AuthFlowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthFlowError";
  }
}

function asyncRoute(handler: (request: Request, response: Response) => Promise<void>): RequestHandler {
  return (request, response, next: NextFunction) => {
    void handler(request, response).catch(next);
  };
}

function userCollection() {
  return getDatabase().then((database) => database.collection<AuthUserDocument>("auth_users"));
}

function stringValue(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function duplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

function requestIsSecure(request: Request) {
  return request.secure || request.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

function setShortCookie(request: Request, response: Response, name: string, value: string) {
  const secure = requestIsSecure(request) ? "; Secure" : "";
  response.cookie(name, value, {
    path: GOOGLE_COOKIE_PATH,
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(secure),
    maxAge: 10 * 60 * 1000,
  });
}

function clearGoogleCookies(request: Request, response: Response) {
  const secure = requestIsSecure(request) ? "; Secure" : "";
  response.append(
    "Set-Cookie",
    `${GOOGLE_NONCE_COOKIE}=; Path=${GOOGLE_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
  );
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function consumePasswordAttempt(key: string, limit: number, now: number) {
  const existing = passwordAttemptBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    passwordAttemptBuckets.set(key, { count: 1, expiresAt: now + 15 * 60 * 1000 });
    return undefined;
  }
  if (existing.count >= limit) return existing.expiresAt;
  existing.count += 1;
  return undefined;
}

const passwordAuthRateLimit: RequestHandler = (request, response, next) => {
  const now = Date.now();
  const address = request.ip || request.socket.remoteAddress || "unknown";
  const email = normalizeEmail(request.body?.email);
  const ipKey = createHash("sha256").update(`ip:${address}`).digest("hex");
  const accountKey = createHash("sha256").update(`account:${address}:${email}`).digest("hex");
  const blockedUntil = [
    consumePasswordAttempt(`ip:${ipKey}`, 40, now),
    consumePasswordAttempt(`account:${accountKey}`, 10, now),
  ].filter((expiresAt): expiresAt is number => expiresAt !== undefined);

  if (blockedUntil.length) {
    const retryAfterSeconds = Math.max(1, Math.ceil((Math.max(...blockedUntil) - now) / 1000));
    response.setHeader("Retry-After", String(retryAfterSeconds));
    response.status(429).json({ error: "Too many sign-in attempts. Wait a few minutes and try again." });
    return;
  }

  if (passwordAttemptBuckets.size > 5000) {
    for (const [key, bucket] of passwordAttemptBuckets) {
      if (bucket.expiresAt <= now) passwordAttemptBuckets.delete(key);
    }
  }
  next();
};

function base64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

class GoogleVerificationUnavailableError extends Error {}

async function loadGoogleKeys() {
  if (googleKeys && googleKeys.expiresAt > Date.now()) return googleKeys.keys;
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Google returned an unsuccessful key response.");
    const data = await response.json() as { keys?: GoogleKey[] };
    const cacheControl = response.headers.get("cache-control") ?? "";
    const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
    googleKeys = {
      keys: data.keys ?? [],
      expiresAt: Date.now() + Math.min(Math.max(maxAge, 60), 86_400) * 1000,
    };
    return googleKeys.keys;
  } catch {
    throw new GoogleVerificationUnavailableError("Google sign-in verification is temporarily unavailable.");
  }
}

async function verifyGoogleIdToken(idToken: string, clientId: string, expectedNonce: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid sign-in token.");

  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]) as GoogleClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Google returned an unsupported sign-in token.");
  }

  let keys = await loadGoogleKeys();
  let jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    googleKeys = undefined;
    keys = await loadGoogleKeys();
    jwk = keys.find((key) => key.kid === header.kid && key.kty === "RSA");
  }
  if (!jwk) throw new Error("Google sign-in keys have changed. Try again.");
  const publicKey = createPublicKey({
    key: { kty: "RSA", n: jwk.n, e: jwk.e },
    format: "jwk",
  });
  const signedPayload = Buffer.from(`${parts[0]}.${parts[1]}`);
  const signature = Buffer.from(parts[2], "base64url");
  if (!verifySignature("RSA-SHA256", signedPayload, publicKey, signature)) {
    throw new Error("Google returned an invalid sign-in token.");
  }

  const now = Math.floor(Date.now() / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (
    !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss ?? "")
    || !audience.includes(clientId)
    || (audience.length > 1 && claims.azp !== clientId)
    || (claims.azp !== undefined && claims.azp !== clientId)
    || !claims.exp || claims.exp <= now
    || !claims.iat || claims.iat > now + 60
    || claims.iat < now - 600
    || claims.nonce !== expectedNonce
    || !claims.sub
    || claims.email_verified !== true
    || !claims.email
  ) {
    throw new Error("Google could not verify this account for Wave Tune.");
  }
  return claims;
}

async function findOrCreateGoogleUser(claims: GoogleClaims) {
  const email = normalizeEmail(claims.email);
  if (!email || !validEmail(email) || !claims.sub) throw new Error("Google did not return a valid email address.");
  const users = await userCollection();
  const now = new Date();
  const existingByGoogle = await users.findOne({ googleSub: claims.sub });

  if (existingByGoogle) {
    if (existingByGoogle.emailNormalized !== email) {
      const emailOwner = await users.findOne({ emailNormalized: email, id: { $ne: existingByGoogle.id } });
      if (emailOwner) throw new Error("That email is already linked to another Wave Tune account.");
    }
    await users.updateOne(
      { id: existingByGoogle.id },
      {
        $set: {
          email,
          emailNormalized: email,
          emailVerified: true,
          name: stringValue(claims.name, 120) || existingByGoogle.name,
          image: safeImage(claims.picture),
          updatedAt: now,
        },
      },
    );
    return await users.findOne({ id: existingByGoogle.id }) ?? existingByGoogle;
  }

  const existingByEmail = await users.findOne({ emailNormalized: email });
  if (existingByEmail) {
    if (existingByEmail.passwordHash && !existingByEmail.googleSub) {
      throw new AuthFlowError("This email has a password account. Sign in with your password; sign-in methods cannot be linked yet.");
    }
    if (existingByEmail.googleSub && existingByEmail.googleSub !== claims.sub) {
      throw new Error("That email is already linked to a different Google account.");
    }
    await users.updateOne(
      { id: existingByEmail.id },
      {
        $set: {
          googleSub: claims.sub,
          emailVerified: true,
          name: stringValue(claims.name, 120) || existingByEmail.name,
          image: safeImage(claims.picture) ?? existingByEmail.image,
          updatedAt: now,
        },
      },
    );
    return await users.findOne({ id: existingByEmail.id }) ?? existingByEmail;
  }

  const user: AuthUserDocument = {
    id: randomBytes(16).toString("hex"),
    email,
    emailNormalized: email,
    name: stringValue(claims.name, 120) || email.split("@")[0],
    image: safeImage(claims.picture),
    googleSub: claims.sub,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await users.insertOne(user);
    return user;
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    const racedUser = await users.findOne({
      $or: [{ googleSub: claims.sub }, { emailNormalized: email }],
    });
    if (racedUser?.passwordHash && !racedUser.googleSub) {
      throw new AuthFlowError("This email has a password account. Sign in with your password; sign-in methods cannot be linked yet.");
    }
    if (racedUser) return racedUser;
    throw error;
  }
}

router.get("/me", asyncRoute(async (request, response) => {
  response.json({ user: await getCurrentUser(request) });
}));

router.post("/logout", asyncRoute(async (request, response) => {
  await destroySession(request, response);
  response.json({ ok: true });
}));

router.post("/register", passwordAuthRateLimit, asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = request.body?.password;
  if (!email || !validEmail(email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const passwordError = passwordValidationError(password);
  if (passwordError) {
    response.status(400).json({ error: passwordError });
    return;
  }

  const now = new Date();
  const user: AuthUserDocument = {
    id: randomBytes(16).toString("hex"),
    email,
    emailNormalized: email,
    name: email.split("@")[0].slice(0, 120) || "Wave Tune listener",
    passwordHash: await hashPassword(password as string),
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };
  const users = await userCollection();
  try {
    await users.insertOne(user);
  } catch (error) {
    if (!duplicateKey(error)) throw error;
    response.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    return;
  }

  await createSession(request, response, user.id);
  response.status(201).json({ user: publicUser(user) });
}));

router.post("/login", passwordAuthRateLimit, asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  const user = email && validEmail(email)
    ? await (await userCollection()).findOne({ emailNormalized: email })
    : null;
  const passwordMatches = await verifyPassword(password, user?.passwordHash);
  if (!user?.passwordHash || !passwordMatches) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  await createSession(request, response, user.id);
  response.json({ user: publicUser(user) });
}));

router.get("/google/config", (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    response.status(503).json({ error: "Google sign-in is not configured yet." });
    return;
  }
  const nonce = randomBytes(32).toString("base64url");
  setShortCookie(request, response, GOOGLE_NONCE_COOKIE, nonce);
  response.setHeader("Cache-Control", "no-store");
  response.json({ clientId, nonce });
});

router.post("/google", asyncRoute(async (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const nonceCookie = cookieValue(request, GOOGLE_NONCE_COOKIE);
  const credential = typeof request.body?.credential === "string" ? request.body.credential : "";
  if (!clientId) {
    clearGoogleCookies(request, response);
    response.status(503).json({ error: "Google sign-in is not configured yet." });
    return;
  }
  if (!nonceCookie || !credential || credential.length > 16_384) {
    clearGoogleCookies(request, response);
    response.status(401).json({ error: "Google sign-in expired. Choose your account again." });
    return;
  }

  let claims: GoogleClaims;
  try {
    claims = await verifyGoogleIdToken(credential, clientId, nonceCookie);
  } catch (error) {
    clearGoogleCookies(request, response);
    const unavailable = error instanceof GoogleVerificationUnavailableError;
    console.warn("Google identity verification failed:", error instanceof Error ? error.message : "unknown error");
    response.status(unavailable ? 503 : 401).json({
      error: unavailable
        ? "Google sign-in is temporarily unavailable. Try again."
        : "Google could not verify this account. Choose your account again.",
    });
    return;
  }

  try {
    const user = await findOrCreateGoogleUser(claims);
    await createSession(request, response, user.id);
    clearGoogleCookies(request, response);
    response.json({ user: publicUser(user) });
  } catch (error) {
    clearGoogleCookies(request, response);
    if (error instanceof AuthFlowError) {
      response.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }
}));

export const authRouter = router;
