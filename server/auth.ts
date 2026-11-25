import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import { users, userSessions } from '../src/db/schema.ts';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import { nowIso, uid } from './db.ts';

const SESSION_COOKIE_NAME = 'wdup_session';
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

export type UserRole = 'member' | 'editor' | 'mentor' | 'admin';
export type MentorStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: string;
  uid: string | null;
  name: string;
  email: string;
  whatsapp: string;
  role: UserRole;
  mentor_status: MentorStatus;
  editor_permissions: string[];
  bio: string;
  avatar_url: string;
  notify_email: number;
  notify_whatsapp: number;
  wallet_available: number;
  wallet_pending: number;
  pro_plan: string;
  pro_expires_at: string | null;
  is_pro: boolean;
  created_at: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthUser;
  authViaCookie?: boolean;
  authToken?: string;
  firebaseUid?: string;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  try {
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derived = crypto.scryptSync(password, salt, 64);
    if (keyBuf.length !== derived.length) return false;
    return crypto.timingSafeEqual(keyBuf, derived);
  } catch {
    return false;
  }
}

function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function signToken(userId: string): Promise<string> {
  const rawToken = `wdup_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashSessionToken(rawToken);
  const ts = nowIso();
  await db.insert(userSessions).values({
    id: uid('ses'),
    user_id: userId,
    token_hash: tokenHash,
    created_at: ts,
    last_used_at: ts,
  });
  return rawToken;
}

export async function verifyToken(token: string): Promise<string | null> {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({
      id: userSessions.id,
      user_id: userSessions.user_id,
      last_used_at: userSessions.last_used_at,
    })
    .from(userSessions)
    .where(eq(userSessions.token_hash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const lastMs = Date.parse(row.last_used_at);
  if (!Number.isFinite(lastMs) || Date.now() - lastMs > 5 * 60 * 1000) {
    await db.update(userSessions).set({ last_used_at: nowIso() }).where(eq(userSessions.id, row.id));
  }
  return row.user_id;
}

export async function revokeSessionToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await db.delete(userSessions).where(eq(userSessions.token_hash, tokenHash));
}

export function isUserProActive(proExpiresAt: string | null | undefined): boolean {
  if (!proExpiresAt) return false;
  const ms = Date.parse(proExpiresAt);
  return Number.isFinite(ms) && ms > Date.now();
}

function formatUserRow(row: typeof users.$inferSelect): AuthUser {
  let perms: string[] = [];
  try {
    perms = JSON.parse(row.editor_permissions || '[]');
  } catch {
    perms = [];
  }
  const activePro = isUserProActive(row.pro_expires_at);
  return {
    id: row.id,
    uid: row.uid ?? null,
    name: row.name,
    email: row.email,
    whatsapp: row.whatsapp,
    role: row.role as UserRole,
    mentor_status: (row.mentor_status || 'none') as MentorStatus,
    editor_permissions: Array.isArray(perms) ? perms : [],
    bio: row.bio,
    avatar_url: row.avatar_url,
    notify_email: row.notify_email,
    notify_whatsapp: row.notify_whatsapp,
    wallet_available: row.wallet_available,
    wallet_pending: row.wallet_pending,
    pro_plan: activePro ? row.pro_plan : '',
    pro_expires_at: row.pro_expires_at,
    is_pro: activePro,
    created_at: row.created_at,
  };
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  try {
    const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    return rows[0] ? formatUserRow(rows[0]) : null;
  } catch (err) {
    console.error('Database query failed in getUserById:', err);
    throw new Error('Gagal memuat data akun.', { cause: err });
  }
}

export async function getOrCreateUserByFirebaseUid(
  firebaseUid: string,
  email: string,
  name?: string,
  avatarUrl?: string
): Promise<AuthUser> {
  try {
    const cleanEmail = (email || `${firebaseUid}@firebase.local`).toLowerCase().trim();
    const displayName = (name || cleanEmail.split('@')[0] || 'Member WD.UP').trim().slice(0, 100);

    // Check if an account with the same email already exists (e.g. pre-existing admin/member)
    const existingByEmail = await db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${cleanEmail})`)
      .limit(1);

    if (existingByEmail[0]) {
      const updated = await db
        .update(users)
        .set({
          uid: firebaseUid,
          avatar_url: existingByEmail[0].avatar_url || avatarUrl || '',
        })
        .where(eq(users.id, existingByEmail[0].id))
        .returning();
      return formatUserRow(updated[0] || existingByEmail[0]);
    }

    const result = await db
      .insert(users)
      .values({
        id: firebaseUid,
        uid: firebaseUid,
        name: displayName,
        email: cleanEmail,
        whatsapp: '',
        password_hash: 'firebase_auth',
        role: 'member',
        mentor_status: 'none',
        avatar_url: avatarUrl || '',
        created_at: nowIso(),
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: cleanEmail,
        },
      })
      .returning();

    return formatUserRow(result[0]);
  } catch (err) {
    console.error('Database query failed in getOrCreateUserByFirebaseUid:', err);
    throw new Error('Gagal menyinkronkan akun pengguna.', { cause: err });
  }
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        out[key] = decodeURIComponent(val);
      } catch {
        out[key] = val;
      }
    }
  }
  return out;
}

export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim() || null;
}

export function extractCookieToken(req: Request): string | null {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE_NAME] || null;
}

function isRequestHttps(req: Request): boolean {
  if (req.secure || req.protocol === 'https') return true;
  const xfProto = req.headers['x-forwarded-proto'];
  const protoStr = Array.isArray(xfProto) ? xfProto.join(',') : xfProto || '';
  if (protoStr.toLowerCase().includes('https')) return true;
  const origin = (req.get('origin') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();
  if (origin.startsWith('https://') || referer.startsWith('https://')) return true;
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) return true;
  return false;
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const https = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    ...(https ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.append('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const https = isRequestHttps(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    ...(https ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.append('Set-Cookie', parts.join('; '));
}

function passesCookieCsrfCheck(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  if (req.headers['x-requested-with']) return true;

  const expectedHost = (req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim().toLowerCase();
  if (!expectedHost) return false;

  const origin = req.get('origin');
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }
  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }
  return false;
}

async function resolveAuthFromRequest(req: AuthRequest): Promise<{
  user: AuthUser | null;
  viaCookie: boolean;
  token: string | null;
  firebaseUid?: string;
}> {
  const bearer = extractBearerToken(req);
  if (bearer) {
    if (bearer.startsWith('wdup_')) {
      const userId = await verifyToken(bearer);
      if (userId) {
        const user = await getUserById(userId);
        if (user) return { user, viaCookie: false, token: bearer };
      }
    } else {
      try {
        const decoded = await adminAuth.verifyIdToken(bearer);
        const user = await getOrCreateUserByFirebaseUid(
          decoded.uid,
          decoded.email || `${decoded.uid}@firebase.local`,
          typeof decoded.name === 'string' ? decoded.name : undefined,
          typeof decoded.picture === 'string' ? decoded.picture : undefined
        );
        return { user, viaCookie: false, token: bearer, firebaseUid: decoded.uid };
      } catch {
        // Fallback check if bearer happened to be a legacy session token
        const userId = await verifyToken(bearer);
        if (userId) {
          const user = await getUserById(userId);
          if (user) return { user, viaCookie: false, token: bearer };
        }
      }
    }
  }

  const cookieToken = extractCookieToken(req);
  if (cookieToken) {
    const userId = await verifyToken(cookieToken);
    if (userId) {
      const user = await getUserById(userId);
      if (user) return { user, viaCookie: true, token: cookieToken };
    }
  }

  return { user: null, viaCookie: false, token: null };
}

export async function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveAuthFromRequest(req);
    if (resolved.user) {
      if (resolved.viaCookie && !passesCookieCsrfCheck(req)) {
        return res.status(403).json({ error: 'Permintaan tidak terverifikasi.' });
      }
      req.authUser = resolved.user;
      req.authViaCookie = resolved.viaCookie;
      req.authToken = resolved.token || undefined;
      req.firebaseUid = resolved.firebaseUid;
    }
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const resolved = await resolveAuthFromRequest(req);
    if (!resolved.user) {
      const hasAnyToken = Boolean(extractBearerToken(req) || extractCookieToken(req));
      return res.status(401).json({
        error: hasAnyToken
          ? 'Sesi berakhir atau tidak valid. Silakan masuk kembali.'
          : 'Silakan masuk ke akun WD.UP Anda terlebih dahulu.',
      });
    }
    if (resolved.viaCookie && !passesCookieCsrfCheck(req)) {
      return res.status(403).json({ error: 'Permintaan tidak terverifikasi.' });
    }
    req.authUser = resolved.user;
    req.authViaCookie = resolved.viaCookie;
    req.authToken = resolved.token || undefined;
    req.firebaseUid = resolved.firebaseUid;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(allowedRoles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk fitur ini.' });
    }
    next();
  };
}

export function isApprovedMentorOrAdmin(user: AuthUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'editor') return true;
  return user.role === 'mentor' && user.mentor_status === 'approved';
}

export function requireMentorOrAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({ error: 'Autentikasi diperlukan.' });
  }
  if (!isApprovedMentorOrAdmin(req.authUser)) {
    if (req.authUser.role === 'mentor' && req.authUser.mentor_status === 'pending') {
      return res.status(403).json({
        error: 'Akun Mentor Anda masih menunggu persetujuan (ACC) dari Admin WD.UP.',
      });
    }
    return res.status(403).json({ error: 'Hanya Mentor terverifikasi atau Admin yang dapat mengakses fitur ini.' });
  }
  next();
}

export async function hasAdminClaimed(): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);
    return Boolean(rows[0]);
  } catch (err) {
    console.error('Database query failed in hasAdminClaimed:', err);
    return false;
  }
}
