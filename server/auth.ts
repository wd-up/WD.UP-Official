import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, nowIso, uid } from './db.js';

const SESSION_COOKIE_NAME = 'wdup_session';
const COOKIE_MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // 400 days (maximum allowed by modern browsers)

export type UserRole = 'member' | 'editor' | 'mentor' | 'admin';
export type MentorStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface AuthUser {
  id: string;
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

export function signToken(userId: string): string {
  const rawToken = `wdup_${crypto.randomBytes(32).toString('hex')}`;
  const tokenHash = hashSessionToken(rawToken);
  const ts = nowIso();
  db.prepare(
    `INSERT INTO user_sessions (id, user_id, token_hash, created_at, last_used_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(uid('ses'), userId, tokenHash, ts, ts);
  return rawToken;
}

export function verifyToken(token: string): string | null {
  if (!token) return null;
  const tokenHash = hashSessionToken(token);
  const row = db
    .prepare(`SELECT id, user_id, last_used_at FROM user_sessions WHERE token_hash = ?`)
    .get(tokenHash) as { id: string; user_id: string; last_used_at: string } | undefined;
  if (!row) return null;

  // Throttle last_used_at updates to once every 5 minutes to avoid unnecessary writes
  const lastMs = Date.parse(row.last_used_at);
  if (!Number.isFinite(lastMs) || Date.now() - lastMs > 5 * 60 * 1000) {
    db.prepare(`UPDATE user_sessions SET last_used_at = ? WHERE id = ?`).run(nowIso(), row.id);
  }
  return row.user_id;
}

export function revokeSessionToken(token: string | null | undefined): void {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  db.prepare(`DELETE FROM user_sessions WHERE token_hash = ?`).run(tokenHash);
}

export function isUserProActive(proExpiresAt: string | null | undefined): boolean {
  if (!proExpiresAt) return false;
  const ms = Date.parse(proExpiresAt);
  return Number.isFinite(ms) && ms > Date.now();
}

export function getUserById(userId: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT id, name, email, whatsapp, role, COALESCE(mentor_status, 'none') as mentor_status, editor_permissions, bio, avatar_url, notify_email, notify_whatsapp, wallet_available, wallet_pending, pro_plan, pro_expires_at, created_at
       FROM users WHERE id = ?`
    )
    .get(userId) as
    | (Omit<AuthUser, 'editor_permissions' | 'is_pro'> & { editor_permissions: string })
    | undefined;
  if (!row) return null;
  let perms: string[] = [];
  try {
    perms = JSON.parse(row.editor_permissions || '[]');
  } catch {
    perms = [];
  }
  const activePro = isUserProActive(row.pro_expires_at);
  return {
    ...row,
    mentor_status: (row.mentor_status || 'none') as MentorStatus,
    pro_plan: activePro ? row.pro_plan : '',
    editor_permissions: Array.isArray(perms) ? perms : [],
    is_pro: activePro,
  };
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

function resolveAuthFromRequest(req: AuthRequest): {
  user: AuthUser | null;
  viaCookie: boolean;
  token: string | null;
} {
  const bearer = extractBearerToken(req);
  if (bearer) {
    const userId = verifyToken(bearer);
    if (userId) {
      const user = getUserById(userId);
      if (user) return { user, viaCookie: false, token: bearer };
    }
  }

  const cookieToken = extractCookieToken(req);
  if (cookieToken) {
    const userId = verifyToken(cookieToken);
    if (userId) {
      const user = getUserById(userId);
      if (user) return { user, viaCookie: true, token: cookieToken };
    }
  }

  return { user: null, viaCookie: false, token: null };
}

export function optionalAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const resolved = resolveAuthFromRequest(req);
  if (resolved.user) {
    if (resolved.viaCookie && !passesCookieCsrfCheck(req)) {
      return res.status(403).json({ error: 'Permintaan tidak terverifikasi.' });
    }
    req.authUser = resolved.user;
    req.authViaCookie = resolved.viaCookie;
    req.authToken = resolved.token || undefined;
  }
  next();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const resolved = resolveAuthFromRequest(req);
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
  next();
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

export function hasAdminClaimed(): boolean {
  const adminRow = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get();
  return Boolean(adminRow);
}
