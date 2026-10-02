import {
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature,
} from "node:crypto";
import { Router, type NextFunction, type Request, type RequestHandler, type Response } from "express";
import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  normalizeEmail,
  publicUser,
  safeImage,
  verifyPassword,
  type AuthUserDocument,
} from "./auth";
import { getDatabase } from "./database";

const router = Router();
const GOOGLE_STATE_COOKIE = "wave_tune_google_state";
const GOOGLE_NONCE_COOKIE = "wave_tune_google_nonce";
const GOOGLE_VERIFIER_COOKIE = "wave_tune_google_verifier";
const GOOGLE_COOKIE_PATH = "/api/auth/google";
const AUTH_RATE_WINDOW_MS = 15 * 60_000;
const AUTH_RATE_LIMIT = 12;
const authAttempts = new Map<string, number[]>();

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
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
};

let googleKeys: { keys: GoogleKey[]; expiresAt: number } | undefined;
let dummyPasswordHash: Promise<string> | undefined;

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

function appendCookie(response: Response, value: string) {
  const current = response.getHeader("Set-Cookie");
  if (!current) {
    response.setHeader("Set-Cookie", value);
    return;
  }
  const cookies = Array.isArray(current) ? current : [String(current)];
  response.setHeader("Set-Cookie", [...cookies, value]);
}

function requestIsSecure(request: Request) {
  return request.secure || request.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

function setShortCookie(request: Request, response: Response, name: string, value: string) {
  const secure = requestIsSecure(request) ? "; Secure" : "";
  appendCookie(
    response,
    `${name}=${encodeURIComponent(value)}; Path=${GOOGLE_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
  );
}

function clearGoogleCookies(request: Request, response: Response) {
  const secure = requestIsSecure(request) ? "; Secure" : "";
  for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_NONCE_COOKIE, GOOGLE_VERIFIER_COOKIE]) {
    appendCookie(
      response,
      `${name}=; Path=${GOOGLE_COOKIE_PATH}; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    );
  }
}

function limitAuthAttempts(request: Request, response: Response, email: string) {
  const ip = request.ip || request.socket.remoteAddress || "unknown";
  const key = `${ip}:${email}`;
  const now = Date.now();
  const attempts = (authAttempts.get(key) ?? []).filter((time) => time > now - AUTH_RATE_WINDOW_MS);
  if (attempts.length >= AUTH_RATE_LIMIT) {
    authAttempts.set(key, attempts);
    response.status(429).json({ error: "Too many attempts. Wait a little and try again." });
    return false;
  }
  attempts.push(now);
  authAttempts.set(key, attempts);
  if (authAttempts.size > 4_000) {
    for (const [storedKey, times] of authAttempts) {
      if (!times.some((time) => time > now - AUTH_RATE_WINDOW_MS)) authAttempts.delete(storedKey);
    }
  }
  return true;
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function forwardedOrigin(request: Request) {
  const proto = request.get("x-forwarded-proto")?.split(",")[0].trim()
    || (requestIsSecure(request) ? "https" : "http");
  const host = request.get("x-forwarded-host")?.split(",")[0].trim() || request.get("host");
  if (!host || !/^[a-z\d.-]+(?::\d+)?$/i.test(host)) {
    throw new Error("Could not determine the Google sign-in callback host.");
  }
  return `${proto}://${host}`;
}

function googleRedirectUri(request: Request) {
  return process.env.GOOGLE_REDIRECT_URI?.trim()
    || `${forwardedOrigin(request)}/api/auth/google/callback`;
}

function redirectWithError(response: Response, code: string) {
  response.redirect(302, `/sign-in?auth_error=${encodeURIComponent(code)}`);
}

function base64UrlJson(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
}

async function loadGoogleKeys() {
  if (googleKeys && googleKeys.expiresAt > Date.now()) return googleKeys.keys;
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new Error("Google sign-in keys could not be loaded.");
  const data = await response.json() as { keys?: GoogleKey[] };
  const cacheControl = response.headers.get("cache-control") ?? "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
  googleKeys = {
    keys: data.keys ?? [],
    expiresAt: Date.now() + Math.min(Math.max(maxAge, 60), 86_400) * 1000,
  };
  return googleKeys.keys;
}

async function verifyGoogleIdToken(idToken: string, clientId: string, expectedNonce: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Google returned an invalid sign-in token.");

  const header = base64UrlJson(parts[0]);
  const claims = base64UrlJson(parts[1]) as GoogleClaims;
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new Error("Google returned an unsupported sign-in token.");
  }

  const jwk = (await loadGoogleKeys()).find((key) => key.kid === header.kid && key.kty === "RSA");
  if (!jwk) {
    googleKeys = undefined;
    throw new Error("Google sign-in keys have changed. Try again.");
  }
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
    || !claims.exp || claims.exp <= now
    || !claims.iat || claims.iat > now + 60
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
  await users.insertOne(user);
  return user;
}

router.get("/me", asyncRoute(async (request, response) => {
  response.json({ user: await getCurrentUser(request) });
}));

router.post("/register", asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const name = stringValue(request.body?.name, 120);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!validEmail(email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  if (name.length < 2) {
    response.status(400).json({ error: "Enter your name." });
    return;
  }
  if (password.length < 8 || password.length > 128) {
    response.status(400).json({ error: "Use a password between 8 and 128 characters." });
    return;
  }
  if (!limitAuthAttempts(request, response, email)) return;

  const now = new Date();
  const user: AuthUserDocument = {
    id: randomBytes(16).toString("hex"),
    email,
    emailNormalized: email,
    name,
    passwordHash: await hashPassword(password),
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await (await userCollection()).insertOne(user);
  } catch (error) {
    if (duplicateKey(error)) {
      response.status(409).json({ error: "An account already uses this email. Sign in instead." });
      return;
    }
    throw error;
  }
  await createSession(request, response, user.id);
  response.status(201).json({ user: publicUser(user) });
}));

router.post("/login", asyncRoute(async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const password = typeof request.body?.password === "string" ? request.body.password : "";
  if (!validEmail(email) || !password || password.length > 128) {
    response.status(400).json({ error: "Enter your email and password." });
    return;
  }
  if (!limitAuthAttempts(request, response, email)) return;

  const users = await userCollection();
  const user = await users.findOne({ emailNormalized: email });
  if (!dummyPasswordHash) dummyPasswordHash = hashPassword("WaveTune-invalid-login-sentinel");
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? await dummyPasswordHash);
  if (!user || !user.passwordHash || !passwordMatches) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  await createSession(request, response, user.id);
  response.json({ user: publicUser(user) });
}));

router.post("/logout", asyncRoute(async (request, response) => {
  await destroySession(request, response);
  response.json({ ok: true });
}));

router.get("/google/start", (request, response) => {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    redirectWithError(response, "google_not_configured");
    return;
  }
  try {
    const state = randomBytes(32).toString("base64url");
    const nonce = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    setShortCookie(request, response, GOOGLE_STATE_COOKIE, state);
    setShortCookie(request, response, GOOGLE_NONCE_COOKIE, nonce);
    setShortCookie(request, response, GOOGLE_VERIFIER_COOKIE, verifier);

    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: googleRedirectUri(request),
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    response.redirect(302, authorizationUrl.toString());
  } catch (error) {
    console.error("Could not start Google sign-in:", error instanceof Error ? error.message : "unknown error");
    redirectWithError(response, "google_unavailable");
  }
});

router.get("/google/callback", asyncRoute(async (request, response) => {
  const stateCookie = cookieValue(request, GOOGLE_STATE_COOKIE);
  const nonceCookie = cookieValue(request, GOOGLE_NONCE_COOKIE);
  const verifierCookie = cookieValue(request, GOOGLE_VERIFIER_COOKIE);
  const state = typeof request.query.state === "string" ? request.query.state : "";
  const code = typeof request.query.code === "string" ? request.query.code : "";
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!stateCookie || !nonceCookie || !verifierCookie || !state || !code || !clientId || !clientSecret) {
    clearGoogleCookies(request, response);
    redirectWithError(response, "google_failed");
    return;
  }
  const expectedState = Buffer.from(stateCookie);
  const suppliedState = Buffer.from(state);
  if (expectedState.length !== suppliedState.length || !timingSafeEqual(expectedState, suppliedState)) {
    clearGoogleCookies(request, response);
    redirectWithError(response, "google_failed");
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleRedirectUri(request),
        grant_type: "authorization_code",
        code_verifier: verifierCookie,
      }),
    });
    if (!tokenResponse.ok) throw new Error("Google did not accept the sign-in code.");
    const tokenData = await tokenResponse.json() as { id_token?: string };
    if (!tokenData.id_token) throw new Error("Google did not return an identity token.");

    const claims = await verifyGoogleIdToken(tokenData.id_token, clientId, nonceCookie);
    const user = await findOrCreateGoogleUser(claims);
    await createSession(request, response, user.id);
    clearGoogleCookies(request, response);
    response.redirect(302, "/");
  } catch (error) {
    console.error("Google sign-in failed:", error instanceof Error ? error.message : "unknown error");
    clearGoogleCookies(request, response);
    redirectWithError(response, "google_failed");
  }
}));

export const authRouter = router;
