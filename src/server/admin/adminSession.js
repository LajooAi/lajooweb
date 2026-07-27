import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  authenticateAdminCredentials,
  createLegacySignedSessionPayload,
  createPersistedAdminMfaChallenge,
  createPersistedAdminSession,
  revokePersistedAdminSessionToken,
  verifyPersistedAdminMfaChallenge,
  verifyPersistedAdminSessionToken,
} from "./adminPersistence.js";
import {
  getDefaultAdminHrefForRole,
  getPermissionsForRole,
  hasAdminPermission,
  isValidAdminRole,
  normalizeAdminRole,
} from "./adminRoles.js";

export const ADMIN_SESSION_COOKIE = "lajoo_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function parseBase64UrlJson(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function getSessionSecret() {
  return process.env.LAJOO_ADMIN_SESSION_SECRET || process.env.LAJOO_ADMIN_PASSWORD || "";
}

function signPayload(payload) {
  const secret = getSessionSecret();
  if (!secret) return "";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(left = "", right = "") {
  const leftHash = createHash("sha256").update(String(left)).digest();
  const rightHash = createHash("sha256").update(String(right)).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function sanitizeSession(payload) {
  if (!payload?.email || !payload?.role || !payload?.exp) return null;
  if (Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
  if (!isValidAdminRole(payload.role)) return null;
  const role = normalizeAdminRole(payload.role);
  const roles = Array.isArray(payload.roles) ? payload.roles.filter(isValidAdminRole) : [role];
  if (!roles.length || !roles.includes(role)) roles.unshift(role);
  return {
    id: payload.sub || payload.email,
    email: payload.email,
    name: payload.name || "LAJOO Admin",
    role,
    roles,
    mfaStatus: payload.mfaStatus || "not_configured",
    issuedAt: payload.iat,
    expiresAt: payload.exp,
    permissions: getPermissionsForRole(role),
    source: "signed_cookie",
  };
}

export function getAdminCredentialConfig() {
  const email = process.env.LAJOO_ADMIN_EMAIL || "";
  const password = process.env.LAJOO_ADMIN_PASSWORD || "";
  const databaseConfigured = Boolean(process.env.DATABASE_URL);
  const bootstrapConfigured = Boolean(email && password);
  return {
    configured: bootstrapConfigured || databaseConfigured,
    bootstrapConfigured,
    databaseConfigured,
    emailConfigured: Boolean(email),
    passwordConfigured: Boolean(password),
  };
}

export async function verifyAdminCredentials(email, password) {
  return authenticateAdminCredentials(email, password);
}

function createSignedAdminSessionToken(admin) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    ...createLegacySignedSessionPayload(admin),
    iat: now,
    exp: now + ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  const signature = signPayload(payload);
  if (!signature) return "";
  return `${payload}.${signature}`;
}

export async function createAdminSessionToken(admin, request = null) {
  const persistedToken = await createPersistedAdminSession(admin, request, ADMIN_SESSION_MAX_AGE_SECONDS);
  return persistedToken || createSignedAdminSessionToken(admin);
}

export async function createAdminMfaChallenge(admin, request = null) {
  return createPersistedAdminMfaChallenge(admin, request);
}

export async function verifyAdminMfaChallenge(payload) {
  return verifyPersistedAdminMfaChallenge(payload);
}

function verifySignedAdminSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expectedSignature = signPayload(payload);
  if (!expectedSignature || !safeEqual(signature, expectedSignature)) return null;

  try {
    return sanitizeSession(parseBase64UrlJson(payload));
  } catch {
    return null;
  }
}

export async function verifyAdminSessionToken(token) {
  return await verifyPersistedAdminSessionToken(token) || verifySignedAdminSessionToken(token);
}

export async function getAdminSessionFromRequest(request) {
  const token = request?.cookies?.get(ADMIN_SESSION_COOKIE)?.value || "";
  return await verifyAdminSessionToken(token);
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value || "";
  return await verifyAdminSessionToken(token);
}

export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireAdminPermission(permission) {
  const session = await requireAdminSession();
  if (!hasAdminPermission(session.role, permission)) {
    redirect(getDefaultAdminHrefForRole(session.role));
  }
  return session;
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  };
}

export async function revokeAdminSessionToken(token) {
  return revokePersistedAdminSessionToken(token);
}
