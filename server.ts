import 'dotenv/config';
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { closeDatabase, db, ensureOfficialWdupStore, initDatabase, logNotification, nowIso, uid } from './server/db.js';
import {
  type AuthRequest,
  clearSessionCookie,
  extractBearerToken,
  extractCookieToken,
  getUserById,
  hasAdminClaimed,
  hashPassword,
  isApprovedMentorOrAdmin,
  isUserProActive,
  optionalAuth,
  requireAuth,
  requireMentorOrAdmin,
  requireRole,
  revokeSessionToken,
  setSessionCookie,
  signToken,
  verifyPassword,
} from './server/auth.js';
import { askWdupAssistant, generateCreatorContent } from './server/ai.js';

initDatabase();

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '16mb' }));

function cleanString(v: unknown, maxLen = 500): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

function cleanSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 40);
}

function cleanHttpUrl(v: unknown, maxLen = 1000): string {
  const s = cleanString(v, maxLen);
  if (!s) return '';
  try {
    const parsed = new URL(s);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return '';
  } catch {
    return '';
  }
}

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

const PRO_PLANS = {
  pro_1m: {
    id: 'pro_1m',
    name: 'WD.UP Pro · 1 Bulan',
    price: 79000,
    duration_days: 30,
    badge: 'Mulai Hemat Biaya 0%',
    highlight: 'Gratis potongan transaksi 5% selama 30 hari',
  },
  pro_3m: {
    id: 'pro_3m',
    name: 'WD.UP Pro · 3 Bulan',
    price: 159000,
    duration_days: 90,
    badge: 'Paling Populer · Hemat 33%',
    highlight: 'Setara Rp 53.000/bulan + prioritas sorotan Market',
  },
  pro_6m: {
    id: 'pro_6m',
    name: 'WD.UP Pro · 6 Bulan',
    price: 399000,
    duration_days: 180,
    badge: 'Paket Kreator & Bisnis',
    highlight: 'Akses penuh 6 bulan + prioritas fitur bisnis',
  },
} as const;

type ProPlanId = keyof typeof PRO_PLANS;

function sanitizeCustomHtml(raw: unknown, maxLen = 450_000): string {
  if (typeof raw !== 'string') return '';
  let html = raw.trim().slice(0, maxLen);
  if (!html) return '';
  // Defense-in-depth strip dangerous executable tags/attributes; client also renders in sandbox="" iframe
  html = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script\b[^>]*>/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/<(iframe|object|embed|applet|base|meta\s+http-equiv)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(iframe|object|embed|applet|base|meta\s+http-equiv)\b[^>]*\/?>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/vbscript\s*:/gi, 'blocked:')
    .replace(/data\s*:\s*(?!image\/(?:png|jpe?g|webp|gif|avif);base64,)/gi, 'blocked:');
  return html;
}

const VALID_DISPLAY_STYLES = new Set(['classic', 'editorial', 'showcase', 'compact']);

function cleanDisplayStyle(v: unknown, fallback = 'classic'): string {
  const s = cleanString(v, 30);
  return VALID_DISPLAY_STYLES.has(s) ? s : fallback;
}

const MAX_UPLOAD_IMAGE_DATA_LENGTH = 2_200_000; // ~1.6MB raw binary in base64
const SAFE_RASTER_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

function validateAndCleanMediaUrl(
  v: unknown,
  fallback = '',
  label = 'Gambar'
): { url: string; error?: string } {
  if (v === undefined) return { url: fallback };
  if (v === null) return { url: '' };
  if (typeof v !== 'string') return { url: '' };
  const trimmed = v.trim();
  if (!trimmed) return { url: '' }; // explicitly cleared / omitted (supports image-less products!)
  if (trimmed.startsWith('/src/assets/') || trimmed.startsWith('/assets/')) {
    return { url: trimmed.slice(0, 300) };
  }
  if (trimmed.startsWith('data:image/')) {
    if (!SAFE_RASTER_DATA_IMAGE_RE.test(trimmed)) {
      return {
        url: '',
        error: `${label} harus berupa file gambar JPG, PNG, WebP, atau GIF yang valid.`,
      };
    }
    if (trimmed.length > MAX_UPLOAD_IMAGE_DATA_LENGTH) {
      return {
        url: '',
        error: `${label} melebihi batas kuota unggahan (maks 1.5 MB). Silakan masukkan Link URL gambar sebagai gantinya.`,
      };
    }
    return { url: trimmed };
  }
  const http = cleanHttpUrl(trimmed, 1000);
  if (!http) {
    return {
      url: '',
      error: `Link ${label} harus berupa URL http:// atau https:// yang valid.`,
    };
  }
  return { url: http };
}

function cleanProductCoverUrl(v: unknown, fallback = ''): string {
  const res = validateAndCleanMediaUrl(v, fallback, 'Gambar Sampul');
  return res.error ? fallback : res.url;
}

function validateAccessInput(body: Record<string, unknown>): {
  accessType: 'link' | 'pdf' | 'image' | 'video';
  accessUrl: string;
  accessFileData: string;
  accessFileName: string;
  error?: string;
} {
  const rawType = cleanString(body?.access_type, 20);
  const accessType: 'link' | 'pdf' | 'image' | 'video' =
    rawType === 'pdf' || rawType === 'image' || rawType === 'video' ? rawType : 'link';
  const rawUrl = cleanString(body?.access_url, 1000);
  const accessUrl = rawUrl ? cleanHttpUrl(rawUrl, 1000) : '';
  if (rawUrl && !accessUrl) {
    return {
      accessType,
      accessUrl: '',
      accessFileData: '',
      accessFileName: '',
      error: 'Link akses harus berupa URL http:// atau https:// yang valid.',
    };
  }

  const rawFileData = typeof body?.access_file_data === 'string' ? body.access_file_data.trim() : '';
  const accessFileName = cleanString(body?.access_file_name, 160);
  if (rawFileData) {
    const validMime =
      rawFileData.startsWith('data:application/pdf;base64,') ||
      rawFileData.startsWith('data:image/') ||
      rawFileData.startsWith('data:video/');
    if (!validMime || rawFileData.length > 14_500_000) {
      return {
        accessType,
        accessUrl,
        accessFileData: '',
        accessFileName: '',
        error: 'File akses harus berupa PDF, Gambar, atau Video yang valid (maksimal 10 MB).',
      };
    }
  }

  return { accessType, accessUrl, accessFileData: rawFileData, accessFileName };
}

const MAX_UPLOAD_VIDEO_DATA_LENGTH = 12_000_000;
const SAFE_VIDEO_DATA_RE = /^data:video\/(?:mp4|webm|ogg);base64,[a-z0-9+/=\s]+$/i;

function validateHomeCmsMedia(
  body: Record<string, unknown>,
  existing?: Record<string, unknown>
): {
  mediaType: 'image' | 'video' | 'link';
  imageUrl: string;
  mediaUrl: string;
  linkUrl: string;
  error?: string;
} {
  const rawType = cleanString(body?.media_type ?? existing?.media_type, 20);
  const mediaType: 'image' | 'video' | 'link' =
    rawType === 'video' || rawType === 'link' ? rawType : 'image';

  const fallbackImg = (existing?.image_url as string) || '';
  const coverRes = validateAndCleanMediaUrl(
    body?.image_url !== undefined ? body.image_url : existing?.image_url,
    fallbackImg,
    'Cover'
  );
  if (coverRes.error) {
    return { mediaType, imageUrl: '', mediaUrl: '', linkUrl: '', error: coverRes.error };
  }

  let mediaUrl = body?.media_url !== undefined ? String(body.media_url || '').trim() : String(existing?.media_url || '');
  if (mediaType === 'video') {
    if (!mediaUrl) {
      return {
        mediaType,
        imageUrl: coverRes.url,
        mediaUrl: '',
        linkUrl: '',
        error: 'Unggah file video (MP4/WebM/OGG) atau masukkan URL video yang valid.',
      };
    }
    if (mediaUrl.startsWith('data:video/')) {
      if (!SAFE_VIDEO_DATA_RE.test(mediaUrl) || mediaUrl.length > MAX_UPLOAD_VIDEO_DATA_LENGTH) {
        return {
          mediaType,
          imageUrl: coverRes.url,
          mediaUrl: '',
          linkUrl: '',
          error: 'Video harus berformat MP4, WebM, atau OGG maksimal ~8 MB, atau gunakan URL video http(s)://.',
        };
      }
    } else {
      const cleanVid = cleanHttpUrl(mediaUrl, 1000);
      if (!cleanVid) {
        return {
          mediaType,
          imageUrl: coverRes.url,
          mediaUrl: '',
          linkUrl: '',
          error: 'Link video harus berupa URL http:// atau https:// yang valid.',
        };
      }
      mediaUrl = cleanVid;
    }
  } else {
    mediaUrl = '';
  }

  let linkUrl = body?.link_url !== undefined ? cleanString(body.link_url, 1000) : String(existing?.link_url || '');
  if (mediaType === 'link') {
    if (!linkUrl) {
      return {
        mediaType,
        imageUrl: coverRes.url,
        mediaUrl,
        linkUrl: '',
        error: 'Masukkan link tautan tujuan (http:// atau https://).',
      };
    }
    const validLink = cleanHttpUrl(linkUrl, 1000);
    if (!validLink) {
      return {
        mediaType,
        imageUrl: coverRes.url,
        mediaUrl,
        linkUrl: '',
        error: 'Link tautan harus berupa URL http:// atau https:// yang valid.',
      };
    }
    linkUrl = validLink;
  } else if (linkUrl) {
    linkUrl = cleanHttpUrl(linkUrl, 1000);
  }

  return {
    mediaType,
    imageUrl: coverRes.url,
    mediaUrl,
    linkUrl,
  };
}

function getSystemSetting(key: string): string {
  const row = db.prepare(`SELECT value FROM system_settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value || '';
}

function hasRoleAccessCodeConfigured(targetRole: 'mentor' | 'admin'): boolean {
  if (targetRole === 'mentor') {
    return Boolean(process.env.MENTOR_PASSCODE?.trim() || getSystemSetting('mentor_access_code_hash'));
  }
  return Boolean(process.env.ADMIN_PASSCODE?.trim() || getSystemSetting('admin_access_code_hash'));
}

function verifyRoleAccessCode(targetRole: 'mentor' | 'admin', inputCode: string): boolean {
  const cleanCode = inputCode.trim();
  if (!cleanCode) return false;
  const envVal =
    targetRole === 'mentor'
      ? process.env.MENTOR_PASSCODE?.trim() || ''
      : process.env.ADMIN_PASSCODE?.trim() || '';
  if (envVal) {
    const a = Buffer.from(cleanCode);
    const b = Buffer.from(envVal);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
  }
  const settingHash =
    targetRole === 'mentor'
      ? getSystemSetting('mentor_access_code_hash')
      : getSystemSetting('admin_access_code_hash');
  if (settingHash && verifyPassword(cleanCode, settingHash)) return true;
  return false;
}

function hasEditorAccess(req: AuthRequest, scope: string): boolean {
  if (!req.authUser) return false;
  if (req.authUser.role === 'admin') return true;
  if (req.authUser.role === 'editor') {
    const perms = req.authUser.editor_permissions;
    return perms.length === 0 || perms.includes(scope) || perms.includes('all');
  }
  return false;
}

function getVisitorIdFromCookie(req: express.Request): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 'wdup_visitor' && /^[a-zA-Z0-9_-]{8,80}$/.test(v)) return v;
  }
  return null;
}

function setVisitorCookie(req: express.Request, res: express.Response, visitorId: string): void {
  const xfProto = req.headers['x-forwarded-proto'];
  const protoStr = Array.isArray(xfProto) ? xfProto.join(',') : xfProto || '';
  const origin = (req.get('origin') || '').toLowerCase();
  const referer = (req.get('referer') || '').toLowerCase();
  const host = (req.get('x-forwarded-host') || req.get('host') || '').toLowerCase();
  const isHttps =
    req.secure ||
    req.protocol === 'https' ||
    protoStr.toLowerCase().includes('https') ||
    origin.startsWith('https://') ||
    referer.startsWith('https://') ||
    Boolean(host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1'));
  const parts = [
    `wdup_visitor=${visitorId}`,
    'Path=/',
    'Max-Age=31536000',
    'HttpOnly',
    ...(isHttps ? ['Secure', 'SameSite=None', 'Partitioned'] : ['SameSite=Lax']),
  ];
  res.append('Set-Cookie', parts.join('; '));
}

function migrateGuestEngagements(visitorId: string | null, userId: string): void {
  if (!visitorId) return;
  const rows = db
    .prepare(`SELECT cms_item_id, engagement_type, note, created_at FROM guest_engagements WHERE visitor_id = ?`)
    .all(visitorId) as Array<{ cms_item_id: string; engagement_type: string; note: string; created_at: string }>;
  if (rows.length === 0) return;
  const ins = db.prepare(
    `INSERT OR IGNORE INTO user_engagements (id, user_id, cms_item_id, engagement_type, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const r of rows) {
    ins.run(uid('eng'), userId, r.cms_item_id, r.engagement_type, r.note, r.created_at);
  }
}

function getSiteFooter(): Record<string, string> {
  const rows = db
    .prepare(`SELECT key, value FROM system_settings WHERE key LIKE 'footer_%'`)
    .all() as Array<{ key: string; value: string }>;
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    license_title: map.footer_license_title || 'Lisensi Resmi Platform Ekosistem Digital Perempuan WD.UP',
    license_number: map.footer_license_number || 'WDUP-ID-2026-001 · Terdaftar Resmi',
    copyright: map.footer_copyright || '© 2026 WD.UP — Women Digital Level Up. Seluruh hak cipta dilindungi.',
    email: map.footer_email || 'halo@wdup.com',
    whatsapp: map.footer_whatsapp || '+62 811-0000-2026',
    address: map.footer_address || 'Jakarta, Indonesia',
    instagram: map.footer_instagram || '',
    tiktok: map.footer_tiktok || '',
    youtube: map.footer_youtube || '',
    website: map.footer_website || '',
  };
}

function notifyAdminsAndBuyer(params: {
  buyerUserId: string;
  buyerEmail: string;
  buyerWhatsapp?: string;
  buyerEventType: string;
  buyerTitle: string;
  buyerMessage: string;
  adminEventType: string;
  adminTitle: string;
  adminMessage: string;
}) {
  const buyerNotif = logNotification({
    userId: params.buyerUserId,
    eventType: params.buyerEventType,
    title: params.buyerTitle,
    message: params.buyerMessage,
    overrideEmail: params.buyerEmail,
    overrideWhatsapp: params.buyerWhatsapp,
  });

  const admins = db.prepare(`SELECT id, email, whatsapp FROM users WHERE role = 'admin'`).all() as Array<{
    id: string;
    email: string;
    whatsapp: string;
  }>;
  for (const adm of admins) {
    logNotification({
      userId: adm.id,
      eventType: params.adminEventType,
      title: params.adminTitle,
      message: params.adminMessage,
      overrideEmail: adm.email,
      overrideWhatsapp: adm.whatsapp,
    });
  }

  return {
    buyerNotif,
    adminCount: admins.length,
    adminEmails: admins.map((a) => a.email),
  };
}

function validateVoucherForCart(params: {
  code: string;
  items: Array<{ store_id: string | null; subtotal: number }>;
  subtotalBeforeDiscount: number;
}): {
  valid: boolean;
  error?: string;
  voucher?: Record<string, unknown>;
  discountAmount: number;
} {
  const cleanCode = cleanString(params.code, 40).toUpperCase();
  if (!cleanCode) return { valid: false, error: 'Kode voucher wajib diisi.', discountAmount: 0 };

  const voucher = db
    .prepare(`SELECT * FROM vouchers WHERE LOWER(code) = LOWER(?) AND is_active = 1`)
    .get(cleanCode) as Record<string, unknown> | undefined;

  if (!voucher) {
    return { valid: false, error: `Voucher "${cleanCode}" tidak ditemukan atau sudah tidak aktif.`, discountAmount: 0 };
  }

  if (voucher.expires_at) {
    const expMs = Date.parse(String(voucher.expires_at));
    if (Number.isFinite(expMs) && expMs < Date.now()) {
      return { valid: false, error: `Voucher "${cleanCode}" sudah kedaluwarsa.`, discountAmount: 0 };
    }
  }

  if (voucher.quota_limit !== null && voucher.quota_limit !== undefined) {
    if (Number(voucher.used_count || 0) >= Number(voucher.quota_limit)) {
      return { valid: false, error: `Kuota voucher "${cleanCode}" sudah habis.`, discountAmount: 0 };
    }
  }

  let eligibleSubtotal = params.subtotalBeforeDiscount;
  if (voucher.scope === 'store') {
    const targetStoreId = String(voucher.store_id || '');
    eligibleSubtotal = params.items
      .filter((i) => i.store_id === targetStoreId)
      .reduce((s, i) => s + Number(i.subtotal || 0), 0);
    if (eligibleSubtotal <= 0) {
      return {
        valid: false,
        error: `Voucher "${cleanCode}" hanya berlaku untuk produk dari toko penerbit voucher.`,
        discountAmount: 0,
      };
    }
  }

  const minPurchase = Number(voucher.min_purchase || 0);
  if (eligibleSubtotal < minPurchase) {
    return {
      valid: false,
      error: `Minimal belanja Rp ${minPurchase.toLocaleString('id-ID')} untuk menggunakan voucher "${cleanCode}".`,
      discountAmount: 0,
    };
  }

  const dType = String(voucher.discount_type || 'fixed');
  const dVal = Number(voucher.discount_value || 0);
  let discountAmount = 0;
  if (dType === 'percent') {
    discountAmount = Math.round((eligibleSubtotal * Math.min(100, Math.max(1, dVal))) / 100);
    if (voucher.max_discount !== null && voucher.max_discount !== undefined && Number(voucher.max_discount) > 0) {
      discountAmount = Math.min(discountAmount, Number(voucher.max_discount));
    }
  } else {
    discountAmount = Math.max(0, Math.round(dVal));
  }
  discountAmount = Math.min(eligibleSubtotal, discountAmount);

  return { valid: true, voucher, discountAmount };
}

// ==========================================
// 0. HEALTHCHECK
// ==========================================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, ts: nowIso() });
});

app.get('/api/pro/plans', (_req, res) => {
  res.json({
    plans: Object.values(PRO_PLANS),
    benefits: [
      {
        title: 'Gratis Biaya Transaksi 0%',
        desc: 'Hemat potongan 5% per transaksi produk di toko Anda selama masa berlangganan Pro.',
      },
      {
        title: 'Prioritas Sorotan Home & Market',
        desc: 'Produk dan toko member Pro diprioritaskan tampil lebih atas dengan label Pro resmi.',
      },
      {
        title: 'Editor Coding Landing Page Penuh',
        desc: 'Buat landing page HTML/CSS kustom yang menarik untuk toko maupun per produk.',
      },
      {
        title: 'Voucher Toko & Analisa Bisnis',
        desc: 'Terbitkan kode voucher promo toko Anda sendiri dan akses laporan omzet tanpa potongan.',
      },
    ],
  });
});

// ==========================================
// 1. AUTHENTICATION & ADMIN BOOTSTRAP
// ==========================================

app.get('/api/auth/status', optionalAuth, (req: AuthRequest, res) => {
  if (!req.authUser && extractCookieToken(req)) {
    clearSessionCookie(req, res);
  }
  res.json({
    adminClaimed: hasAdminClaimed(),
    envPasscodeConfigured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()),
    adminPasscodeConfigured: hasRoleAccessCodeConfigured('admin'),
    mentorPasscodeConfigured: hasRoleAccessCodeConfigured('mentor'),
    currentUser: req.authUser || null,
    authenticatedVia: req.authViaCookie ? 'cookie' : req.authUser ? 'bearer' : 'none',
  });
});

app.post('/api/auth/register', (req, res) => {
  const name = cleanString(req.body?.name, 100);
  const email = cleanString(req.body?.email, 160).toLowerCase();
  const whatsapp = cleanString(req.body?.whatsapp, 30);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const selectedRole = cleanString(req.body?.selected_role, 20) || 'member';
  const accessCode = typeof req.body?.access_code === 'string' ? req.body.access_code.trim() : '';

  if (!name || !email || !email.includes('@') || password.length < 6) {
    return res.status(400).json({ error: 'Nama, email valid, dan password minimal 6 karakter wajib diisi.' });
  }

  if (selectedRole === 'admin') {
    return res.status(403).json({
      error: 'Pendaftaran Admin baru tidak tersedia dari formulir publik. Gunakan tab Masuk Admin atau Admin Setup.',
    });
  }

  const isMentorRequest = selectedRole === 'mentor';
  if (isMentorRequest && hasRoleAccessCodeConfigured('mentor')) {
    if (!accessCode) {
      return res.status(400).json({ error: 'Kode akses Mentor wajib diisi.' });
    }
    if (!verifyRoleAccessCode('mentor', accessCode)) {
      return res.status(403).json({ error: 'Kode akses Mentor tidak sesuai. Hubungi Admin WD.UP.' });
    }
  }

  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) {
    return res.status(409).json({ error: 'Email sudah terdaftar. Silakan masuk menggunakan akun Anda.' });
  }

  const userId = uid('usr');
  const passwordHash = hashPassword(password);
  const roleToInsert = isMentorRequest ? 'mentor' : 'member';
  const mentorStatus = isMentorRequest ? 'pending' : 'none';

  db.prepare(
    `INSERT INTO users (id, name, email, whatsapp, password_hash, role, mentor_status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, name, email, whatsapp, passwordHash, roleToInsert, mentorStatus, nowIso());

  logNotification({
    userId,
    eventType: 'registration',
    title: isMentorRequest ? 'Pendaftaran Mentor Dikirim (Menunggu ACC Admin)' : 'Selamat Datang di WD.UP',
    message: isMentorRequest
      ? `Permintaan akses Mentor untuk akun ${email} telah dikirim dan menunggu persetujuan (ACC) dari Admin WD.UP.`
      : `Akun terintegrasi Anda (${email}) berhasil dibuat. Anda dapat belajar di Academy, berbelanja di Market, membuat Toko, dan mengakses Creator Studio.`,
  });

  if (isMentorRequest) {
    const admins = db.prepare(`SELECT id, email, whatsapp FROM users WHERE role = 'admin'`).all() as Array<{
      id: string;
      email: string;
      whatsapp: string;
    }>;
    for (const adm of admins) {
      logNotification({
        userId: adm.id,
        eventType: 'admin_mentor_request',
        title: `Permintaan Akses Mentor Baru: ${name}`,
        message: `${name} (${email}) mendaftar sebagai Mentor Academy dan menunggu ACC Anda di tab Users & Role.`,
        overrideEmail: adm.email,
        overrideWhatsapp: adm.whatsapp,
      });
    }
  }

  migrateGuestEngagements(getVisitorIdFromCookie(req), userId);
  const user = getUserById(userId);
  const token = signToken(userId);
  setSessionCookie(req, res, token);
  res.status(201).json({
    token,
    user,
    pendingApproval: isMentorRequest,
    message: isMentorRequest
      ? 'Pendaftaran Mentor berhasil! Akun menunggu ACC Admin WD.UP sebelum fitur Mentor terbuka.'
      : undefined,
  });
});

app.post('/api/auth/login', (req, res) => {
  const email = cleanString(req.body?.email, 160).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const selectedRole = cleanString(req.body?.selected_role, 20);
  const accessCode = typeof req.body?.access_code === 'string' ? req.body.access_code.trim() : '';

  if (!email || !password) {
    return res.status(400).json({ error: 'Email dan password wajib diisi.' });
  }

  const row = db
    .prepare(`SELECT id, password_hash, role, COALESCE(mentor_status, 'none') as mentor_status FROM users WHERE email = ?`)
    .get(email) as { id: string; password_hash: string; role: string; mentor_status: string } | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email atau password tidak sesuai.' });
  }

  if (selectedRole === 'admin') {
    if (row.role !== 'admin') {
      return res.status(403).json({ error: 'Akun ini tidak terdaftar sebagai Admin WD.UP.' });
    }
    if (hasRoleAccessCodeConfigured('admin') && !verifyRoleAccessCode('admin', accessCode)) {
      return res.status(403).json({ error: 'Kode akses Admin tidak valid atau belum diisi.' });
    }
  } else if (selectedRole === 'mentor') {
    if (row.role !== 'mentor' && row.role !== 'admin') {
      return res.status(403).json({ error: 'Akun ini belum terdaftar sebagai Mentor.' });
    }
    if (row.role === 'mentor') {
      if (row.mentor_status === 'pending') {
        return res.status(403).json({
          error: 'Akses Mentor Anda masih menunggu persetujuan (ACC) dari Admin WD.UP.',
        });
      }
      if (row.mentor_status === 'rejected') {
        return res.status(403).json({
          error: 'Pengajuan akses Mentor untuk akun ini belum disetujui Admin.',
        });
      }
      if (row.mentor_status !== 'approved') {
        return res.status(403).json({
          error: 'Akses Mentor belum aktif. Hubungi Admin WD.UP untuk ACC akun Mentor.',
        });
      }
      if (hasRoleAccessCodeConfigured('mentor') && !verifyRoleAccessCode('mentor', accessCode)) {
        return res.status(403).json({ error: 'Kode akses Mentor tidak valid atau belum diisi.' });
      }
    }
  }

  migrateGuestEngagements(getVisitorIdFromCookie(req), row.id);
  const user = getUserById(row.id);
  const token = signToken(row.id);
  setSessionCookie(req, res, token);
  res.json({ token, user });
});

app.post('/api/auth/logout', (req, res) => {
  revokeSessionToken(extractBearerToken(req));
  revokeSessionToken(extractCookieToken(req));
  clearSessionCookie(req, res);
  res.json({ ok: true });
});

app.post('/api/auth/refresh-cookie', requireAuth, (req: AuthRequest, res) => {
  const token = req.authToken || signToken(req.authUser!.id);
  setSessionCookie(req, res, token);
  res.json({ ok: true });
});

app.post('/api/auth/claim-admin', optionalAuth, (req: AuthRequest, res) => {
  const envPass = process.env.ADMIN_PASSCODE?.trim() || '';
  if (envPass) {
    return res.status(403).json({ error: 'Admin passcode dikelola melalui Secrets environment server.' });
  }

  const name = cleanString(req.body?.name, 100) || req.authUser?.name || 'Administrator WD.UP';
  const email = cleanString(req.body?.email, 160).toLowerCase() || req.authUser?.email || '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!email || !email.includes('@') || password.length < 8) {
    return res.status(400).json({ error: 'Email valid dan password admin minimal 8 karakter wajib diisi.' });
  }

  const claimTx = db.transaction(() => {
    if (hasAdminClaimed()) {
      throw new Error('ADMIN_ALREADY_CLAIMED');
    }

    const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as { id: string } | undefined;
    const pwHash = hashPassword(password);
    if (existing) {
      db.prepare(`UPDATE users SET role = 'admin', password_hash = ?, name = ? WHERE id = ?`).run(
        pwHash,
        name,
        existing.id
      );
      return existing.id;
    } else {
      const userId = uid('usr');
      db.prepare(
        `INSERT INTO users (id, name, email, whatsapp, password_hash, role, created_at)
         VALUES (?, ?, ?, '', ?, 'admin', ?)`
      ).run(userId, name, email, pwHash, nowIso());
      return userId;
    }
  });

  try {
    const adminId = claimTx();
    const user = getUserById(adminId);
    const token = signToken(adminId);
    setSessionCookie(req, res, token);
    res.status(201).json({ token, user });
  } catch (err) {
    if (err instanceof Error && err.message === 'ADMIN_ALREADY_CLAIMED') {
      return res.status(409).json({ error: 'Akun Admin utama sudah diklaim sebelumnya.' });
    }
    throw err;
  }
});

app.post('/api/auth/admin-passcode-login', (req, res) => {
  const envPass = process.env.ADMIN_PASSCODE?.trim() || '';
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!envPass) {
    return res.status(400).json({ error: 'ADMIN_PASSCODE belum diatur di environment.' });
  }
  const a = Buffer.from(passcode);
  const b = Buffer.from(envPass);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Passcode admin tidak sesuai.' });
  }

  let adminRow = db.prepare(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`).get() as { id: string } | undefined;
  if (!adminRow) {
    const adminId = uid('usr');
    db.prepare(
      `INSERT INTO users (id, name, email, whatsapp, password_hash, role, created_at)
       VALUES (?, 'WD.UP Admin', 'admin@wdup.com', '', ?, 'admin', ?)`
    ).run(adminId, hashPassword(envPass), nowIso());
    adminRow = { id: adminId };
  }
  const user = getUserById(adminRow.id);
  const token = signToken(adminRow.id);
  setSessionCookie(req, res, token);
  res.json({ token, user });
});

// ==========================================
// 2. MY ACCOUNT (PROFILE, SUMMARY, ACTIVITY)
// ==========================================

app.put('/api/account/profile', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const name = cleanString(req.body?.name, 100) || req.authUser!.name;
  const whatsapp = cleanString(req.body?.whatsapp, 30);
  const bio = cleanString(req.body?.bio, 400);
  const avatarUrl = cleanString(req.body?.avatar_url, 300);
  const notifyEmail = req.body?.notify_email === false || req.body?.notify_email === 0 ? 0 : 1;
  const notifyWhatsapp = req.body?.notify_whatsapp === false || req.body?.notify_whatsapp === 0 ? 0 : 1;

  db.prepare(
    `UPDATE users SET name = ?, whatsapp = ?, bio = ?, avatar_url = ?, notify_email = ?, notify_whatsapp = ? WHERE id = ?`
  ).run(name, whatsapp, bio, avatarUrl, notifyEmail, notifyWhatsapp, userId);

  res.json({ user: getUserById(userId) });
});

app.post('/api/account/change-password', requireAuth, (req: AuthRequest, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password baru minimal 6 karakter.' });
  }
  const row = db.prepare(`SELECT password_hash FROM users WHERE id = ?`).get(req.authUser!.id) as {
    password_hash: string;
  };
  if (!verifyPassword(currentPassword, row.password_hash)) {
    return res.status(401).json({ error: 'Password saat ini tidak sesuai.' });
  }
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), req.authUser!.id);
  res.json({ ok: true });
});

app.get('/api/account/summary', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT id, name, username, visitors_count FROM stores WHERE user_id = ?`).get(userId) as
    | { id: string; name: string; username: string; visitors_count: number }
    | undefined;

  const ownProductsCount = store
    ? (db.prepare(`SELECT COUNT(*) as c FROM products WHERE store_id = ?`).get(store.id) as { c: number }).c
    : 0;
  const affiliateProductsCount = store
    ? (db.prepare(`SELECT COUNT(*) as c FROM affiliate_products WHERE store_id = ?`).get(store.id) as { c: number }).c
    : 0;

  const enrollmentsCount = (
    db.prepare(`SELECT COUNT(*) as c FROM enrollments WHERE user_id = ?`).get(userId) as { c: number }
  ).c;
  const avgProgress =
    (
      db.prepare(`SELECT COALESCE(AVG(progress_pct), 0) as avg FROM enrollments WHERE user_id = ?`).get(userId) as {
        avg: number;
      }
    ).avg || 0;

  const studioEntriesCount = (
    db.prepare(`SELECT COUNT(*) as c FROM creator_studio_entries WHERE user_id = ?`).get(userId) as { c: number }
  ).c;
  const ordersCount = (
    db.prepare(`SELECT COUNT(*) as c FROM orders WHERE buyer_user_id = ?`).get(userId) as { c: number }
  ).c;
  const unreadNotifications = (
    db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(userId) as { c: number }
  ).c;
  const commissionsTotal = (
    db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM commissions WHERE affiliate_user_id = ? AND status = 'credited'`)
      .get(userId) as { total: number }
  ).total;

  res.json({
    user: req.authUser,
    store: store || null,
    stats: {
      ownProductsCount,
      affiliateProductsCount,
      enrollmentsCount,
      avgProgress: Math.round(avgProgress),
      studioEntriesCount,
      ordersCount,
      unreadNotifications,
      commissionsTotal,
    },
  });
});

app.get('/api/account/activity', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const rawOrders = db
    .prepare(
      `SELECT o.*, pm.provider_name, pm.provider_name as payment_method_name, pm.account_number, pm.account_holder,
              p.sender_name, p.transfer_reference, p.proof_note, p.submitted_at, p.verification_note
       FROM orders o
       LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.buyer_user_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const orders = rawOrders.map((o) => {
    const items = db
      .prepare(
        `SELECT oi.*, pr.delivery_content, pr.image_url, pr.is_physical,
                pr.access_type, pr.access_url, pr.access_file_name,
                CASE WHEN pr.access_file_data != '' THEN 1 ELSE 0 END as has_access_file
         FROM order_items oi
         LEFT JOIN products pr ON oi.item_type = 'product' AND pr.id = oi.item_id
         WHERE oi.order_id = ?`
      )
      .all(o.id) as Array<Record<string, unknown>>;

    const isPaid = o.status === 'Paid';
    return {
      ...o,
      items: items.map((it) => ({
        ...it,
        delivery_content: isPaid ? it.delivery_content : '',
        access_url: isPaid ? it.access_url : '',
        access_file_name: isPaid ? it.access_file_name : '',
        has_access_file: isPaid ? Boolean(it.has_access_file) : false,
      })),
    };
  });

  const commissions = db
    .prepare(
      `SELECT c.*, o.order_code
       FROM commissions c
       JOIN orders o ON o.id = c.order_id
       WHERE c.affiliate_user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(userId);

  const engagements = db
    .prepare(
      `SELECT ue.*, h.title, h.subtitle, h.section_type
       FROM user_engagements ue
       JOIN home_cms_items h ON h.id = ue.cms_item_id
       WHERE ue.user_id = ?
       ORDER BY ue.created_at DESC`
    )
    .all(userId);

  const notifications = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 50`)
    .all(userId);

  res.json({ orders, commissions, engagements, notifications });
});

app.post('/api/account/notifications/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser!.id);
  res.json({ ok: true });
});

app.get('/api/notifications', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const notifications = db
    .prepare(`SELECT * FROM notifications WHERE user_id = ? OR user_id IS NULL ORDER BY created_at DESC LIMIT 30`)
    .all(userId);
  const unreadCount = (
    db.prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`).get(userId) as { c: number }
  ).c;
  res.json({ notifications, unreadCount });
});

app.put('/api/notifications/read-all', requireAuth, (req: AuthRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE user_id = ?`).run(req.authUser!.id);
  res.json({ ok: true, unreadCount: 0 });
});

app.put('/api/notifications/:id/read', requireAuth, (req: AuthRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`).run(
    req.params.id,
    req.authUser!.id
  );
  const unreadCount = (
    db
      .prepare(`SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0`)
      .get(req.authUser!.id) as { c: number }
  ).c;
  res.json({ ok: true, unreadCount });
});

// ==========================================
// 3. WD.UP HOME (CMS + DISCOVERY + SEARCH)
// ==========================================

app.get('/api/home', optionalAuth, (req: AuthRequest, res) => {
  const q = cleanString(req.query.q as string, 100).toLowerCase();
  const cmsItems = db
    .prepare(`SELECT * FROM home_cms_items WHERE is_active = 1 ORDER BY sort_order ASC`)
    .all() as Array<Record<string, unknown>>;

  const banners = cmsItems.filter((i) => i.section_type === 'banner');
  const lifestyleCategories = cmsItems.filter((i) => i.section_type === 'lifestyle_category');
  const opportunities = cmsItems.filter((i) => i.section_type === 'opportunity');
  const communities = cmsItems.filter((i) => i.section_type === 'community');
  const affiliateInfo = cmsItems.filter((i) => i.section_type === 'affiliate_info');

  const baseProdQuery = `
    SELECT p.id, p.store_id, p.title, p.slug, p.category, p.home_pillar, p.price, p.original_price,
           p.quota_limit, p.landing_page_url, p.custom_landing_html, p.display_style, p.description,
           p.image_url, p.access_type, p.is_physical, p.is_featured, p.is_recommended, p.affiliate_enabled,
           p.affiliate_commission_pct, p.clicks_count, p.sales_count, p.created_at,
           s.name as store_name, s.username as store_username, s.initials as store_initials,
           u.pro_expires_at as seller_pro_expires_at
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN users u ON u.id = p.owner_user_id
    WHERE p.status = 'active' AND p.is_physical = 0 AND p.category != 'Produk fisik'
  `;

  const allProducts: Array<Record<string, unknown> & { is_pro_seller: boolean }> = (
    db.prepare(`${baseProdQuery} ORDER BY p.created_at DESC`).all() as Array<Record<string, unknown>>
  ).map((p) => ({
    ...p,
    is_pro_seller: isUserProActive(p.seller_pro_expires_at as string | null),
  }));
  const featuredProducts = [...allProducts]
    .filter((p) => p.is_featured === 1 || p.is_pro_seller)
    .sort((a, b) => Number(b.is_pro_seller) - Number(a.is_pro_seller))
    .slice(0, 4);
  const latestProducts = allProducts.slice(0, 4);
  const recommendedProducts = [...allProducts]
    .filter((p) => p.is_recommended === 1 || p.is_pro_seller)
    .sort((a, b) => Number(b.is_pro_seller) - Number(a.is_pro_seller))
    .slice(0, 4);

  const featuredStores = (
    db
      .prepare(
        `SELECT s.id, s.name, s.username, s.initials, s.logo_url, s.banner_url, s.description, s.category, s.theme, s.visitors_count,
                u.pro_expires_at as owner_pro_expires_at,
                (SELECT COUNT(*) FROM products WHERE store_id = s.id AND status = 'active') as own_products_count,
                (SELECT COUNT(*) FROM affiliate_products WHERE store_id = s.id) as affiliate_products_count
         FROM stores s
         JOIN users u ON u.id = s.user_id
         ORDER BY s.is_featured DESC, s.visitors_count DESC
         LIMIT 12`
      )
      .all() as Array<Record<string, unknown>>
  )
    .map((st) => ({
      ...st,
      is_pro: isUserProActive(st.owner_pro_expires_at as string | null),
    }))
    .sort((a, b) => Number(b.is_pro) - Number(a.is_pro))
    .slice(0, 6);

  let userEngagementIds: string[] = [];
  if (req.authUser) {
    const rows = db
      .prepare(`SELECT cms_item_id FROM user_engagements WHERE user_id = ?`)
      .all(req.authUser.id) as Array<{ cms_item_id: string }>;
    userEngagementIds = rows.map((r) => r.cms_item_id);
  } else {
    const visitorId = getVisitorIdFromCookie(req);
    if (visitorId) {
      const rows = db
        .prepare(`SELECT cms_item_id FROM guest_engagements WHERE visitor_id = ?`)
        .all(visitorId) as Array<{ cms_item_id: string }>;
      userEngagementIds = rows.map((r) => r.cms_item_id);
    }
  }

  let searchResults = null;
  if (q) {
    const like = `%${q}%`;
    const matchedProducts = db
      .prepare(`${baseProdQuery} AND (LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.category) LIKE ?) LIMIT 12`)
      .all(like, like, like);
    const matchedClasses = db
      .prepare(
        `SELECT c.id, c.title, c.description, c.price, c.cover_url, c.mentor_name, cat.name as category_name
         FROM academy_classes c
         JOIN academy_categories cat ON cat.id = c.category_id
         WHERE LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ?
         LIMIT 8`
      )
      .all(like, like);
    const matchedStores = db
      .prepare(
        `SELECT id, name, username, initials, logo_url, category, description
         FROM stores
         WHERE LOWER(name) LIKE ? OR LOWER(username) LIKE ? OR LOWER(description) LIKE ?
         LIMIT 6`
      )
      .all(like, like, like);
    searchResults = { products: matchedProducts, classes: matchedClasses, stores: matchedStores };
  }

  res.json({
    banners,
    lifestyleCategories,
    featuredProducts,
    latestProducts,
    recommendedProducts,
    totalProductsCount: allProducts.length,
    featuredStores,
    opportunities,
    communities,
    affiliateInfo,
    userEngagementIds,
    siteFooter: getSiteFooter(),
    searchResults,
  });
});

app.post('/api/engagements', optionalAuth, (req: AuthRequest, res) => {
  const cmsItemId = cleanString(req.body?.cms_item_id, 64);
  const note = cleanString(req.body?.note, 300);
  const item = db
    .prepare(`SELECT id, section_type, title FROM home_cms_items WHERE id = ? AND section_type IN ('community', 'opportunity')`)
    .get(cmsItemId) as { id: string; section_type: string; title: string } | undefined;

  if (!item) {
    return res.status(404).json({ error: 'Community atau Opportunity tidak ditemukan.' });
  }

  if (req.authUser) {
    const existing = db
      .prepare(`SELECT id FROM user_engagements WHERE user_id = ? AND cms_item_id = ?`)
      .get(req.authUser.id, cmsItemId) as { id: string } | undefined;

    if (existing) {
      db.prepare(`DELETE FROM user_engagements WHERE id = ?`).run(existing.id);
      return res.json({ joined: false, isGuest: false });
    }

    db.prepare(
      `INSERT INTO user_engagements (id, user_id, cms_item_id, engagement_type, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uid('eng'), req.authUser.id, cmsItemId, item.section_type, note, nowIso());

    logNotification({
      userId: req.authUser.id,
      eventType: item.section_type,
      title: item.section_type === 'community' ? 'Bergabung ke Community' : 'Pendaftaran Opportunity Tercatat',
      message: `Anda tercatat mengikuti "${item.title}". Cek riwayat lengkapnya di My Activity.`,
    });

    return res.json({ joined: true, isGuest: false });
  }

  // Frictionless guest engagement via visitor cookie (no login popup required)
  let visitorId = getVisitorIdFromCookie(req);
  if (!visitorId) {
    visitorId = uid('vis');
    setVisitorCookie(req, res, visitorId);
  }

  const existingGuest = db
    .prepare(`SELECT id FROM guest_engagements WHERE visitor_id = ? AND cms_item_id = ?`)
    .get(visitorId, cmsItemId) as { id: string } | undefined;

  if (existingGuest) {
    db.prepare(`DELETE FROM guest_engagements WHERE id = ?`).run(existingGuest.id);
    return res.json({ joined: false, isGuest: true });
  }

  db.prepare(
    `INSERT INTO guest_engagements (id, visitor_id, cms_item_id, engagement_type, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(uid('geng'), visitorId, cmsItemId, item.section_type, note, nowIso());

  return res.json({ joined: true, isGuest: true });
});

// ==========================================
// 4. WD.UP ACADEMY (CATEGORIES, PROGRAMS, CLASSES, LMS)
// ==========================================

app.get('/api/academy', optionalAuth, (req: AuthRequest, res) => {
  const categories = db.prepare(`SELECT * FROM academy_categories ORDER BY sort_order ASC`).all();
  const programs = db.prepare(`SELECT * FROM academy_programs`).all();
  const classes = (
    db
      .prepare(
        `SELECT c.*, cat.name as category_name, p.title as program_title, p.level as program_level,
                (SELECT COUNT(*) FROM academy_modules WHERE class_id = c.id) as modules_count
         FROM academy_classes c
         JOIN academy_categories cat ON cat.id = c.category_id
         JOIN academy_programs p ON p.id = c.program_id
         ORDER BY c.created_at ASC`
      )
      .all() as Array<Record<string, unknown>>
  ).map((c) => ({
    ...c,
    objectives: safeJsonParse<string[]>(c.objectives, []),
  }));

  let enrollments: Array<Record<string, unknown>> = [];
  if (req.authUser) {
    enrollments = (
      db.prepare(`SELECT * FROM enrollments WHERE user_id = ?`).all(req.authUser.id) as Array<Record<string, unknown>>
    ).map((e) => ({
      ...e,
      completed_modules: safeJsonParse<string[]>(e.completed_modules, []),
    }));
  }

  res.json({ categories, programs, classes, enrollments });
});

app.get('/api/academy/classes/:id', optionalAuth, (req: AuthRequest, res) => {
  const cls = db
    .prepare(
      `SELECT c.*, cat.name as category_name, p.title as program_title, p.level as program_level
       FROM academy_classes c
       JOIN academy_categories cat ON cat.id = c.category_id
       JOIN academy_programs p ON p.id = c.program_id
       WHERE c.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!cls) {
    return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
  }

  const isPrivileged = isApprovedMentorOrAdmin(req.authUser);
  const enrollmentRow = req.authUser
    ? (db
        .prepare(`SELECT * FROM enrollments WHERE user_id = ? AND class_id = ?`)
        .get(req.authUser.id, req.params.id) as Record<string, unknown> | undefined)
    : undefined;

  const hasFullAccess = Boolean(enrollmentRow || isPrivileged);

  const rawModules = db
    .prepare(`SELECT * FROM academy_modules WHERE class_id = ? ORDER BY sort_order ASC`)
    .all(req.params.id) as Array<Record<string, unknown>>;

  const modules = rawModules.map((m) => ({
    id: m.id,
    class_id: m.class_id,
    sort_order: m.sort_order,
    title: m.title,
    duration_minutes: m.duration_minutes,
    video_title: m.video_title,
    video_summary: m.video_summary,
    video_script_captions: hasFullAccess ? safeJsonParse(m.video_script_captions, []) : [],
    text_material: hasFullAccess ? m.text_material : 'Materi lengkap, video interaktif, worksheet autosave, tugas, dan quiz terbuka otomatis setelah pembelian kelas terverifikasi Paid.',
    interactive_exercise_prompt: hasFullAccess ? m.interactive_exercise_prompt : '',
    interactive_exercise_choices: hasFullAccess ? safeJsonParse(m.interactive_exercise_choices, []) : [],
    worksheet_prompt: hasFullAccess ? m.worksheet_prompt : '',
    assignment_prompt: hasFullAccess ? m.assignment_prompt : '',
    quiz_questions: hasFullAccess ? safeJsonParse(m.quiz_questions, []) : [],
  }));

  let submissions: Record<string, unknown>[] = [];
  if (req.authUser && hasFullAccess) {
    submissions = (
      db
        .prepare(`SELECT * FROM worksheets_assignments WHERE user_id = ? AND class_id = ?`)
        .all(req.authUser.id, req.params.id) as Array<Record<string, unknown>>
    ).map((s) => ({
      ...s,
      quiz_answers: safeJsonParse(s.quiz_answers, []),
      feedback_history: safeJsonParse(s.feedback_history, []),
    }));
  }

  res.json({
    classDetail: {
      ...cls,
      objectives: safeJsonParse<string[]>(cls.objectives, []),
      pdf_guide_content: '',
      group_link: hasFullAccess ? (cls.group_link as string) || '' : '',
      group_duration_note: (cls.group_duration_note as string) || '',
    },
    modules,
    hasFullAccess,
    enrollment: enrollmentRow
      ? {
          ...enrollmentRow,
          completed_modules: safeJsonParse<string[]>(enrollmentRow.completed_modules, []),
        }
      : null,
    submissions,
  });
});

function ensureEnrolled(user: AuthRequest['authUser'], classId: string): boolean {
  if (!user) return false;
  if (isApprovedMentorOrAdmin(user)) return true;
  const row = db.prepare(`SELECT id FROM enrollments WHERE user_id = ? AND class_id = ?`).get(user.id, classId);
  return Boolean(row);
}

app.post('/api/academy/classes/:classId/modules/:moduleId/worksheet', requireAuth, (req: AuthRequest, res) => {
  const { classId, moduleId } = req.params;
  const userId = req.authUser!.id;
  if (!ensureEnrolled(req.authUser, classId)) {
    return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
  }

  const answer = cleanString(req.body?.answer, 8000);
  const action = req.body?.action === 'submit' ? 'submit' : 'autosave';
  const ts = nowIso();

  const existing = db
    .prepare(`SELECT * FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as Record<string, unknown> | undefined;

  let history: Array<Record<string, unknown>> = [];
  if (existing?.feedback_history) {
    try {
      history = JSON.parse(existing.feedback_history as string);
    } catch {
      history = [];
    }
  }

  const nextStatus =
    action === 'submit'
      ? 'submitted'
      : existing?.worksheet_status === 'revision_requested'
      ? 'revision_requested'
      : 'draft';

  if (action === 'submit') {
    history.push({
      at: ts,
      by: req.authUser!.name,
      status: existing?.worksheet_status === 'revision_requested' ? 'Revisi Dikirim' : 'Worksheet Dikirim',
      note: 'Peserta mengirim jawaban worksheet untuk ditinjau mentor.',
    });
  }

  if (existing) {
    db.prepare(
      `UPDATE worksheets_assignments
       SET worksheet_answer = ?, worksheet_status = ?, feedback_history = ?, updated_at = ?
       WHERE id = ?`
    ).run(answer, nextStatus, JSON.stringify(history), ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO worksheets_assignments (id, user_id, class_id, module_id, worksheet_answer, worksheet_status, feedback_history, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uid('wa'), userId, classId, moduleId, answer, nextStatus, JSON.stringify(history), ts);
  }

  const updated = db
    .prepare(`SELECT * FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as Record<string, unknown>;
  res.json({
    submission: {
      ...updated,
      quiz_answers: safeJsonParse(updated.quiz_answers, []),
      feedback_history: safeJsonParse(updated.feedback_history, []),
    },
  });
});

app.post('/api/academy/classes/:classId/modules/:moduleId/assignment', requireAuth, (req: AuthRequest, res) => {
  const { classId, moduleId } = req.params;
  const userId = req.authUser!.id;
  if (!ensureEnrolled(req.authUser, classId)) {
    return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
  }

  const answer = cleanString(req.body?.answer, 8000);
  const rawLink = cleanString(req.body?.link, 600);
  const link = rawLink ? cleanHttpUrl(rawLink, 600) : '';
  if (rawLink && !link) {
    return res.status(400).json({ error: 'Format tautan tugas harus berupa URL http:// atau https:// yang valid.' });
  }
  if (!answer && !link) {
    return res.status(400).json({ error: 'Isi jawaban tugas atau tautan karya Anda.' });
  }

  const ts = nowIso();
  const existing = db
    .prepare(`SELECT * FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as Record<string, unknown> | undefined;

  let history: Array<Record<string, unknown>> = [];
  if (existing?.feedback_history) {
    history = safeJsonParse<Array<Record<string, unknown>>>(existing.feedback_history, []);
  }
  history.push({
    at: ts,
    by: req.authUser!.name,
    status: 'Tugas Dikirim',
    note: link ? `Mengumpulkan tugas beserta tautan: ${link}` : 'Mengumpulkan tugas tertulis.',
  });

  if (existing) {
    db.prepare(
      `UPDATE worksheets_assignments
       SET assignment_answer = ?, assignment_link = ?, assignment_status = 'submitted', feedback_history = ?, updated_at = ?
       WHERE id = ?`
    ).run(answer, link, JSON.stringify(history), ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO worksheets_assignments (id, user_id, class_id, module_id, assignment_answer, assignment_link, assignment_status, feedback_history, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'submitted', ?, ?)`
    ).run(uid('wa'), userId, classId, moduleId, answer, link, JSON.stringify(history), ts);
  }

  const updated = db
    .prepare(`SELECT * FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as Record<string, unknown>;
  res.json({
    submission: {
      ...updated,
      quiz_answers: safeJsonParse(updated.quiz_answers, []),
      feedback_history: safeJsonParse(updated.feedback_history, []),
    },
  });
});

app.post('/api/academy/classes/:classId/modules/:moduleId/exercise', requireAuth, (req: AuthRequest, res) => {
  const { classId, moduleId } = req.params;
  const userId = req.authUser!.id;
  if (!ensureEnrolled(req.authUser, classId)) {
    return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
  }
  const ts = nowIso();
  const existing = db
    .prepare(`SELECT id FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as { id: string } | undefined;

  if (existing) {
    db.prepare(`UPDATE worksheets_assignments SET exercise_completed = 1, updated_at = ? WHERE id = ?`).run(
      ts,
      existing.id
    );
  } else {
    db.prepare(
      `INSERT INTO worksheets_assignments (id, user_id, class_id, module_id, exercise_completed, updated_at)
       VALUES (?, ?, ?, ?, 1, ?)`
    ).run(uid('wa'), userId, classId, moduleId, ts);
  }
  res.json({ ok: true });
});

app.post('/api/academy/classes/:classId/modules/:moduleId/quiz', requireAuth, (req: AuthRequest, res) => {
  const { classId, moduleId } = req.params;
  const userId = req.authUser!.id;
  if (!ensureEnrolled(req.authUser, classId)) {
    return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
  }

  const mod = db.prepare(`SELECT quiz_questions FROM academy_modules WHERE id = ? AND class_id = ?`).get(
    moduleId,
    classId
  ) as { quiz_questions: string } | undefined;

  if (!mod) return res.status(404).json({ error: 'Modul tidak ditemukan.' });

  const questions = safeJsonParse<Array<{ id: string; correctIndex: number }>>(mod.quiz_questions, []);
  const answers = Array.isArray(req.body?.answers) ? (req.body.answers as number[]) : [];

  let correctCount = 0;
  questions.forEach((q, idx) => {
    if (answers[idx] === q.correctIndex) correctCount += 1;
  });
  const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;
  const ts = nowIso();

  const existing = db
    .prepare(`SELECT id FROM worksheets_assignments WHERE user_id = ? AND module_id = ?`)
    .get(userId, moduleId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE worksheets_assignments SET quiz_score = ?, quiz_answers = ?, updated_at = ? WHERE id = ?`
    ).run(score, JSON.stringify(answers), ts, existing.id);
  } else {
    db.prepare(
      `INSERT INTO worksheets_assignments (id, user_id, class_id, module_id, quiz_score, quiz_answers, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(uid('wa'), userId, classId, moduleId, score, JSON.stringify(answers), ts);
  }

  res.json({ score, correctCount, total: questions.length });
});

app.post('/api/academy/classes/:classId/modules/:moduleId/complete', requireAuth, (req: AuthRequest, res) => {
  const { classId, moduleId } = req.params;
  const userId = req.authUser!.id;

  const enrollment = db
    .prepare(`SELECT * FROM enrollments WHERE user_id = ? AND class_id = ?`)
    .get(userId, classId) as Record<string, unknown> | undefined;

  if (!enrollment) {
    return res.status(403).json({ error: 'Anda belum terdaftar pada kelas ini.' });
  }

  const allModules = db
    .prepare(`SELECT id FROM academy_modules WHERE class_id = ?`)
    .all(classId) as Array<{ id: string }>;

  const completed = new Set<string>(safeJsonParse<string[]>(enrollment.completed_modules, []));
  completed.add(moduleId);

  const completedArr = Array.from(completed);
  const progressPct = allModules.length > 0 ? Math.round((completedArr.length / allModules.length) * 100) : 100;
  const isDone = progressPct >= 100;
  const certCode =
    isDone && !enrollment.certificate_code
      ? `WDUP-CERT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
      : (enrollment.certificate_code as string | null);
  const completedAt = isDone && !enrollment.completed_at ? nowIso() : (enrollment.completed_at as string | null);

  db.prepare(
    `UPDATE enrollments SET completed_modules = ?, progress_pct = ?, certificate_code = ?, completed_at = ? WHERE id = ?`
  ).run(JSON.stringify(completedArr), progressPct, certCode, completedAt, enrollment.id);

  res.json({
    completed_modules: completedArr,
    progress_pct: progressPct,
    certificate_code: certCode,
    completed_at: completedAt,
  });
});

// ==========================================
// 5. WD.UP MARKET & PUBLIC STOREFRONTS
// ==========================================

app.get('/api/market/products', (req, res) => {
  const category = cleanString(req.query.category as string, 60);
  const pillar = cleanString(req.query.pillar as string, 60);
  const q = cleanString(req.query.q as string, 100).toLowerCase();
  const sort = cleanString(req.query.sort as string, 20);

  let sql = `
    SELECT p.id, p.store_id, p.owner_user_id, p.title, p.slug, p.category, p.home_pillar, p.price,
           p.original_price, p.quota_limit, p.landing_page_url, p.custom_landing_html, p.display_style,
           p.description, p.image_url, p.access_type, p.is_physical, p.is_featured, p.is_recommended,
           p.affiliate_enabled, p.affiliate_commission_pct, p.clicks_count, p.sales_count, p.created_at,
           s.name as store_name, s.username as store_username, s.initials as store_initials, s.logo_url as store_logo,
           u.pro_expires_at as seller_pro_expires_at
    FROM products p
    JOIN stores s ON s.id = p.store_id
    JOIN users u ON u.id = p.owner_user_id
    WHERE p.status = 'active' AND p.is_physical = 0 AND p.category != 'Produk fisik'
  `;
  const params: unknown[] = [];

  if (category && category !== 'Semua') {
    sql += ` AND p.category = ?`;
    params.push(category);
  }
  if (pillar && pillar !== 'Semua') {
    sql += ` AND p.home_pillar = ?`;
    params.push(pillar);
  }
  if (q) {
    sql += ` AND (LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(s.name) LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  if (sort === 'price_asc') sql += ` ORDER BY p.price ASC`;
  else if (sort === 'price_desc') sql += ` ORDER BY p.price DESC`;
  else if (sort === 'popular') sql += ` ORDER BY p.sales_count DESC, p.clicks_count DESC`;
  else sql += ` ORDER BY p.created_at DESC`;

  const rawProducts = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const products = rawProducts.map((p) => ({
    ...p,
    is_pro_seller: isUserProActive(p.seller_pro_expires_at as string | null),
  }));
  if (!sort || sort === 'latest') {
    products.sort((a, b) => Number(b.is_pro_seller) - Number(a.is_pro_seller));
  }
  res.json({ products });
});

app.get('/api/market/products/:id', optionalAuth, (req: AuthRequest, res) => {
  const product = db
    .prepare(
      `SELECT p.id, p.store_id, p.owner_user_id, p.title, p.slug, p.category, p.home_pillar, p.price,
              p.original_price, p.quota_limit, p.landing_page_url, p.custom_landing_html, p.display_style,
              p.description, p.image_url, p.delivery_content, p.access_type, p.access_url, p.access_file_name,
              CASE WHEN p.access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              p.is_physical, p.is_featured, p.is_recommended, p.affiliate_enabled, p.affiliate_commission_pct,
              p.clicks_count, p.sales_count, p.status, p.created_at,
              s.name as store_name, s.username as store_username, s.initials as store_initials,
              s.logo_url as store_logo, s.contact_whatsapp as store_whatsapp, s.description as store_description,
              u.pro_expires_at as seller_pro_expires_at
       FROM products p
       JOIN stores s ON s.id = p.store_id
       JOIN users u ON u.id = p.owner_user_id
       WHERE p.id = ? AND p.status = 'active' AND p.is_physical = 0 AND p.category != 'Produk fisik'`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

  db.prepare(`UPDATE products SET clicks_count = clicks_count + 1 WHERE id = ?`).run(req.params.id);

  let hasAccess = false;
  if (req.authUser) {
    if (req.authUser.role === 'admin' || req.authUser.id === product.owner_user_id) {
      hasAccess = true;
    } else {
      const paidOrder = db
        .prepare(
          `SELECT oi.id FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           WHERE o.buyer_user_id = ? AND o.status = 'Paid' AND oi.item_type = 'product' AND oi.item_id = ?
           LIMIT 1`
        )
        .get(req.authUser.id, req.params.id);
      hasAccess = Boolean(paidOrder);
    }
  }

  res.json({
    product: {
      ...product,
      is_pro_seller: isUserProActive(product.seller_pro_expires_at as string | null),
      delivery_content: hasAccess ? product.delivery_content : '',
      access_url: hasAccess ? product.access_url : '',
      access_file_name: hasAccess ? product.access_file_name : '',
      has_access_file: hasAccess ? Boolean(product.has_access_file) : false,
      hasAccess,
    },
  });
});

app.get('/api/products/:id/access-file', requireAuth, (req: AuthRequest, res) => {
  const product = db
    .prepare(`SELECT id, owner_user_id, access_file_data, access_file_name FROM products WHERE id = ?`)
    .get(req.params.id) as
    | { id: string; owner_user_id: string; access_file_data: string; access_file_name: string }
    | undefined;

  if (!product || !product.access_file_data) {
    return res.status(404).json({ error: 'File akses produk tidak tersedia.' });
  }

  let allowed = req.authUser!.role === 'admin' || req.authUser!.id === product.owner_user_id;
  if (!allowed) {
    const paidOrder = db
      .prepare(
        `SELECT oi.id FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.buyer_user_id = ? AND o.status = 'Paid' AND oi.item_type = 'product' AND oi.item_id = ?
         LIMIT 1`
      )
      .get(req.authUser!.id, product.id);
    allowed = Boolean(paidOrder);
  }

  if (!allowed) {
    return res.status(403).json({ error: 'Akses file hanya tersedia setelah pembayaran berstatus Paid.' });
  }

  const match = /^data:([^;]+);base64,(.+)$/.exec(product.access_file_data);
  if (!match) {
    return res.status(400).json({ error: 'Format file produk tidak valid.' });
  }

  const mime = match[1];
  const buffer = Buffer.from(match[2], 'base64');
  const safeFilename = (product.access_file_name || `wdup-produk-${product.id}`).replace(/[^a-zA-Z0-9._-]/g, '_');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';

  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `${disposition}; filename="${safeFilename}"`);
  res.send(buffer);
});

app.get('/api/stores/:username', optionalAuth, (req: AuthRequest, res) => {
  const username = cleanSlug(req.params.username);
  const store = db
    .prepare(
      `SELECT s.*, u.pro_expires_at as owner_pro_expires_at
       FROM stores s
       JOIN users u ON u.id = s.user_id
       WHERE s.username = ?`
    )
    .get(username) as Record<string, unknown> | undefined;

  if (!store) return res.status(404).json({ error: 'Toko tidak ditemukan.' });

  db.prepare(`UPDATE stores SET visitors_count = visitors_count + 1 WHERE id = ?`).run(store.id);
  db.prepare(`INSERT INTO store_visits (id, store_id, visitor_user_id, created_at) VALUES (?, ?, ?, ?)`).run(
    uid('sv'),
    store.id,
    req.authUser?.id || null,
    nowIso()
  );

  const isStorePro = isUserProActive(store.owner_pro_expires_at as string | null);

  const ownProducts = db
    .prepare(
      `SELECT p.id, p.store_id, p.title, p.category, p.home_pillar, p.price, p.original_price,
              p.quota_limit, p.landing_page_url, p.custom_landing_html, p.display_style, p.description, p.image_url,
              p.access_type, p.is_physical, p.is_featured, p.affiliate_enabled, p.affiliate_commission_pct, p.sales_count,
              s.name as owner_store_name, s.username as owner_store_username
       FROM products p
       JOIN stores s ON s.id = p.store_id
       WHERE p.store_id = ? AND p.status = 'active' AND p.is_physical = 0 AND p.category != 'Produk fisik'
       ORDER BY p.is_featured DESC, p.created_at DESC`
    )
    .all(store.id);

  // Affiliate items presented seamlessly as seller's store catalog items (referral attribution tracked in background)
  const affiliateProducts = db
    .prepare(
      `SELECT p.id, p.store_id as original_store_id, p.title, p.category, p.home_pillar, p.price, p.original_price,
              p.quota_limit, p.landing_page_url, p.custom_landing_html, p.display_style, p.description,
              p.image_url, p.access_type, p.is_physical, p.affiliate_enabled, p.affiliate_commission_pct, p.sales_count,
              ? as owner_store_name, ? as owner_store_username,
              ap.referral_code
       FROM affiliate_products ap
       JOIN products p ON p.id = ap.product_id
       WHERE ap.store_id = ? AND p.status = 'active' AND p.affiliate_enabled = 1 AND p.is_physical = 0 AND p.category != 'Produk fisik'
       ORDER BY ap.created_at DESC`
    )
    .all(store.name, store.username, store.id);

  const externalAffiliates = db
    .prepare(
      `SELECT id, store_id, title, category, price, original_price, description, image_url, affiliate_url, display_style, clicks_count, created_at
       FROM store_external_affiliates
       WHERE store_id = ?
       ORDER BY created_at DESC`
    )
    .all(store.id);

  const storeVouchers = db
    .prepare(
      `SELECT id, code, title, discount_type, discount_value, min_purchase, max_discount, expires_at
       FROM vouchers
       WHERE scope = 'store' AND store_id = ? AND is_active = 1
       ORDER BY created_at DESC`
    )
    .all(store.id);

  res.json({
    store: { ...store, is_pro: isStorePro },
    ownProducts,
    affiliateProducts,
    externalAffiliates,
    storeVouchers,
  });
});

app.post('/api/stores/:username/external-affiliates/:id/click', (req, res) => {
  const id = cleanString(req.params.id, 64);
  const row = db.prepare(`SELECT id, affiliate_url FROM store_external_affiliates WHERE id = ?`).get(id) as
    | { id: string; affiliate_url: string }
    | undefined;
  if (!row) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
  db.prepare(`UPDATE store_external_affiliates SET clicks_count = clicks_count + 1 WHERE id = ?`).run(id);
  res.json({ ok: true, affiliate_url: row.affiliate_url });
});

// ==========================================
// 6. MY STORE & AFFILIATE ECOSYSTEM
// ==========================================

app.get('/api/my-store/check-availability', requireAuth, (req: AuthRequest, res) => {
  const name = cleanString(req.query.name as string, 80);
  const username = cleanSlug(cleanString(req.query.username as string, 40));
  const ownStore = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(req.authUser!.id) as
    | { id: string }
    | undefined;

  let nameAvailable = true;
  let usernameAvailable = true;

  if (name) {
    const existingName = db
      .prepare(`SELECT id FROM stores WHERE LOWER(name) = LOWER(?) AND id != ?`)
      .get(name, ownStore?.id || '') as { id: string } | undefined;
    nameAvailable = !existingName;
  }

  if (username) {
    const existingUser = db
      .prepare(`SELECT id FROM stores WHERE LOWER(username) = LOWER(?) AND id != ?`)
      .get(username, ownStore?.id || '') as { id: string } | undefined;
    usernameAvailable = !existingUser;
  }

  res.json({ nameAvailable, usernameAvailable, sanitizedUsername: username });
});

app.get('/api/my-store', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT * FROM stores WHERE user_id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;

  if (!store) {
    return res.json({ store: null, is_pro: req.authUser!.is_pro });
  }

  const ownProducts = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products
       WHERE store_id = ? AND is_physical = 0 AND category != 'Produk fisik' AND status != 'archived'
       ORDER BY created_at DESC`
    )
    .all(store.id) as Array<Record<string, unknown>>;

  const affiliateProducts = db
    .prepare(
      `SELECT ap.id as affiliate_listing_id, ap.referral_code, ap.clicks_count as affiliate_clicks, ap.created_at as added_at,
              p.id, p.title, p.category, p.price, p.original_price, p.quota_limit, p.landing_page_url, p.display_style,
              p.image_url, p.affiliate_commission_pct, p.sales_count,
              owner_store.name as owner_store_name, owner_store.username as owner_store_username
       FROM affiliate_products ap
       JOIN products p ON p.id = ap.product_id
       JOIN stores owner_store ON owner_store.id = p.store_id
       WHERE ap.store_id = ? AND p.status = 'active' AND p.is_physical = 0 AND p.category != 'Produk fisik'
       ORDER BY ap.created_at DESC`
    )
    .all(store.id);

  const externalAffiliates = db
    .prepare(
      `SELECT * FROM store_external_affiliates WHERE store_id = ? ORDER BY created_at DESC`
    )
    .all(store.id);

  const vouchers = db
    .prepare(
      `SELECT * FROM vouchers WHERE scope = 'store' AND store_id = ? ORDER BY created_at DESC`
    )
    .all(store.id);

  const storeOrders = db
    .prepare(
      `SELECT oi.id as order_item_id, oi.title, oi.quantity, oi.unit_price, oi.subtotal, oi.platform_fee_amount, oi.seller_net_amount, oi.seller_user_id, oi.affiliate_user_id,
              o.id as order_id, o.order_code, o.status, o.created_at,
              buyer.name as buyer_name
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN users buyer ON buyer.id = o.buyer_user_id
       WHERE oi.seller_user_id = ? OR oi.affiliate_user_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(userId, userId);

  const period = cleanString(req.query.period as string, 20) || 'monthly';
  const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
  const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const periodVisits = (
    db
      .prepare(`SELECT COUNT(*) as c FROM store_visits WHERE store_id = ? AND created_at >= ?`)
      .get(store.id, cutoffIso) as { c: number }
  ).c;

  const totalProductClicks = (
    db
      .prepare(`SELECT COALESCE(SUM(clicks_count), 0) as c FROM products WHERE store_id = ?`)
      .get(store.id) as { c: number }
  ).c;

  const totalAffiliateClicks = (
    db
      .prepare(`SELECT COUNT(*) as c FROM affiliate_clicks WHERE store_id = ?`)
      .get(store.id) as { c: number }
  ).c;

  const periodClicks =
    totalProductClicks +
    (
      db
        .prepare(`SELECT COUNT(*) as c FROM affiliate_clicks WHERE store_id = ? AND created_at >= ?`)
        .get(store.id, cutoffIso) as { c: number }
    ).c;

  const salesAgg = db
    .prepare(
      `SELECT COUNT(DISTINCT o.id) as orders_count,
              COALESCE(SUM(oi.quantity), 0) as units_sold,
              COALESCE(SUM(oi.subtotal), 0) as gross_revenue
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_user_id = ? AND o.status = 'Paid' AND o.created_at >= ?`
    )
    .get(userId, cutoffIso) as { orders_count: number; units_sold: number; gross_revenue: number };

  const periodCommission = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM commissions
         WHERE affiliate_user_id = ? AND status = 'credited' AND created_at >= ?`
      )
      .get(userId, cutoffIso) as { total: number }
  ).total;

  const paidItemsAll = db
    .prepare(
      `SELECT oi.subtotal, oi.quantity, oi.affiliate_user_id, oi.affiliate_commission_pct,
              oi.platform_fee_amount, oi.seller_net_amount, o.id as order_id, o.created_at
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_user_id = ? AND o.status = 'Paid'`
    )
    .all(userId) as Array<{
    subtotal: number;
    quantity: number;
    affiliate_user_id: string | null;
    affiliate_commission_pct: number;
    platform_fee_amount: number;
    seller_net_amount: number;
    order_id: string;
    created_at: string;
  }>;

  const creditedCommsAll = db
    .prepare(
      `SELECT amount, created_at FROM commissions WHERE affiliate_user_id = ? AND status = 'credited'`
    )
    .all(userId) as Array<{ amount: number; created_at: string }>;

  const visitsAll = db
    .prepare(`SELECT created_at FROM store_visits WHERE store_id = ?`)
    .all(store.id) as Array<{ created_at: string }>;

  const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const now = new Date();
  const dailyMap = new Map<
    string,
    {
      date: string;
      label: string;
      shortLabel: string;
      grossRevenue: number;
      platformFee: number;
      sellerNetIncome: number;
      affiliateCommission: number;
      orderIds: Set<string>;
      unitsSold: number;
      visits: number;
    }
  >();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const dayNum = String(d.getUTCDate()).padStart(2, '0');
    const label = `${dayNum} ${monthNamesId[d.getUTCMonth()]}`;
    dailyMap.set(key, {
      date: key,
      label,
      shortLabel: dayNum,
      grossRevenue: 0,
      platformFee: 0,
      sellerNetIncome: 0,
      affiliateCommission: 0,
      orderIds: new Set<string>(),
      unitsSold: 0,
      visits: 0,
    });
  }

  let lifetimeGrossRevenue = 0;
  let lifetimePlatformFee = 0;
  let lifetimeSellerNetIncome = 0;
  const lifetimeOrderIds = new Set<string>();
  let lifetimeUnitsSold = 0;
  const last30OrderIds = new Set<string>();

  for (const item of paidItemsAll) {
    const subtotal = Number(item.subtotal || 0);
    const commPaidOut =
      item.affiliate_user_id && Number(item.affiliate_commission_pct) > 0
        ? Math.round((subtotal * Number(item.affiliate_commission_pct)) / 100)
        : 0;
    const fee = Number(item.platform_fee_amount || 0);
    const net =
      Number(item.seller_net_amount || 0) > 0
        ? Number(item.seller_net_amount)
        : Math.max(0, subtotal - commPaidOut - fee);

    lifetimeGrossRevenue += subtotal;
    lifetimePlatformFee += fee;
    lifetimeSellerNetIncome += net;
    lifetimeOrderIds.add(item.order_id);
    lifetimeUnitsSold += Number(item.quantity || 0);

    const dKey = String(item.created_at || '').slice(0, 10);
    const bucket = dailyMap.get(dKey);
    if (bucket) {
      bucket.grossRevenue += subtotal;
      bucket.platformFee += fee;
      bucket.sellerNetIncome += net;
      bucket.orderIds.add(item.order_id);
      bucket.unitsSold += Number(item.quantity || 0);
      last30OrderIds.add(item.order_id);
    }
  }

  let lifetimeAffiliateCommission = 0;
  for (const c of creditedCommsAll) {
    const amt = Number(c.amount || 0);
    lifetimeAffiliateCommission += amt;
    const dKey = String(c.created_at || '').slice(0, 10);
    const bucket = dailyMap.get(dKey);
    if (bucket) {
      bucket.affiliateCommission += amt;
    }
  }

  for (const v of visitsAll) {
    const dKey = String(v.created_at || '').slice(0, 10);
    const bucket = dailyMap.get(dKey);
    if (bucket) {
      bucket.visits += 1;
    }
  }

  const dailyList = Array.from(dailyMap.values());
  const dailyBreakdown30d = dailyList.map((b) => ({
    date: b.date,
    label: b.label,
    shortLabel: b.shortLabel,
    grossRevenue: b.grossRevenue,
    platformFee: b.platformFee,
    sellerNetIncome: b.sellerNetIncome,
    affiliateCommission: b.affiliateCommission,
    accumulatedBalance: b.sellerNetIncome + b.affiliateCommission,
    ordersCount: b.orderIds.size,
    unitsSold: b.unitsSold,
    visits: b.visits,
  }));

  const weekRanges: Array<[number, number, string]> = [
    [0, 7, 'Pekan 1'],
    [7, 14, 'Pekan 2'],
    [14, 22, 'Pekan 3'],
    [22, 30, 'Pekan 4'],
  ];

  const weeklyBreakdown1m = weekRanges.map(([start, end, wLabel], idx) => {
    const slice = dailyList.slice(start, end);
    const weekOrderIds = new Set<string>();
    let grossRevenue = 0;
    let platformFee = 0;
    let sellerNetIncome = 0;
    let affiliateCommission = 0;
    let unitsSold = 0;
    let visits = 0;
    for (const day of slice) {
      grossRevenue += day.grossRevenue;
      platformFee += day.platformFee;
      sellerNetIncome += day.sellerNetIncome;
      affiliateCommission += day.affiliateCommission;
      unitsSold += day.unitsSold;
      visits += day.visits;
      day.orderIds.forEach((id) => weekOrderIds.add(id));
    }
    const first = slice[0]?.label || '';
    const last = slice[slice.length - 1]?.label || '';
    return {
      week: `W${idx + 1}`,
      label: wLabel,
      dateRange: first && last ? `${first} - ${last}` : wLabel,
      grossRevenue,
      platformFee,
      sellerNetIncome,
      affiliateCommission,
      accumulatedBalance: sellerNetIncome + affiliateCommission,
      ordersCount: weekOrderIds.size,
      unitsSold,
      visits,
    };
  });

  const last30dGross = dailyBreakdown30d.reduce((acc, d) => acc + d.grossRevenue, 0);
  const last30dPlatformFee = dailyBreakdown30d.reduce((acc, d) => acc + d.platformFee, 0);
  const last30dSellerNet = dailyBreakdown30d.reduce((acc, d) => acc + d.sellerNetIncome, 0);
  const last30dAffComm = dailyBreakdown30d.reduce((acc, d) => acc + d.affiliateCommission, 0);
  const last30dUnits = dailyBreakdown30d.reduce((acc, d) => acc + d.unitsSold, 0);
  const last30dVisits = dailyBreakdown30d.reduce((acc, d) => acc + d.visits, 0);

  const last30d = {
    rangeLabel: `${dailyBreakdown30d[0]?.label || ''} – ${dailyBreakdown30d[dailyBreakdown30d.length - 1]?.label || ''}`,
    grossRevenue: last30dGross,
    platformFee: last30dPlatformFee,
    sellerNetIncome: last30dSellerNet,
    affiliateCommission: last30dAffComm,
    accumulatedBalance: last30dSellerNet + last30dAffComm,
    paidOrders: last30OrderIds.size,
    unitsSold: last30dUnits,
    visits: last30dVisits,
  };

  const userWallet = db
    .prepare(`SELECT wallet_available, wallet_pending FROM users WHERE id = ?`)
    .get(userId) as { wallet_available: number; wallet_pending: number } | undefined;

  const topProducts = db
    .prepare(
      `SELECT id, title, price, original_price, quota_limit, sales_count, clicks_count, image_url
       FROM products WHERE store_id = ? AND is_physical = 0 AND category != 'Produk fisik' AND status != 'archived'
       ORDER BY sales_count DESC, clicks_count DESC
       LIMIT 5`
    )
    .all(store.id);

  res.json({
    store: { ...store, is_pro: req.authUser!.is_pro },
    is_pro: req.authUser!.is_pro,
    platform_fee_pct: req.authUser!.is_pro ? 0 : 5,
    ownProducts: ownProducts.map((p) => ({ ...p, has_access_file: Boolean(p.has_access_file) })),
    affiliateProducts,
    externalAffiliates,
    vouchers,
    storeOrders,
    analytics: {
      period,
      totalVisitors: store.visitors_count,
      periodVisits,
      productClicks: periodClicks,
      paidOrders: salesAgg.orders_count,
      unitsSold: salesAgg.units_sold,
      grossRevenue: salesAgg.gross_revenue,
      affiliateCommission: periodCommission,
      topProducts,
      last30d,
      dailyBreakdown30d,
      weeklyBreakdown1m,
      lifetime: {
        grossRevenue: lifetimeGrossRevenue,
        platformFee: lifetimePlatformFee,
        sellerNetIncome: lifetimeSellerNetIncome,
        affiliateCommission: lifetimeAffiliateCommission,
        accumulatedBalance: lifetimeSellerNetIncome + lifetimeAffiliateCommission,
        paidOrders: lifetimeOrderIds.size,
        unitsSold: lifetimeUnitsSold,
        visitors: Number(store.visitors_count || 0),
        productClicks: totalProductClicks + totalAffiliateClicks,
        walletAvailable: userWallet?.wallet_available || 0,
        walletPending: userWallet?.wallet_pending || 0,
      },
    },
  });
});

app.post('/api/my-store', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const existingUserStore = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(userId);
  if (existingUserStore) {
    return res.status(409).json({ error: 'Anda sudah memiliki toko. Gunakan pengaturan toko untuk mengubahnya.' });
  }

  const name = cleanString(req.body?.name, 80);
  const username = cleanSlug(cleanString(req.body?.username, 40));
  if (!name || username.length < 3) {
    return res.status(400).json({ error: 'Nama toko dan username toko (minimal 3 karakter huruf/angka) wajib diisi.' });
  }

  const dupName = db.prepare(`SELECT id FROM stores WHERE LOWER(name) = LOWER(?)`).get(name);
  if (dupName) {
    return res.status(409).json({ error: 'Nama toko sudah digunakan oleh member lain. Silakan pilih nama lain.' });
  }
  const dupUser = db.prepare(`SELECT id FROM stores WHERE LOWER(username) = LOWER(?)`).get(username);
  if (dupUser) {
    return res.status(409).json({ error: 'Username toko sudah digunakan. Silakan pilih username lain.' });
  }

  const logoRes = validateAndCleanMediaUrl(req.body?.logo_url, '', 'Logo Toko');
  if (logoRes.error) return res.status(400).json({ error: logoRes.error });
  const bannerRes = validateAndCleanMediaUrl(req.body?.banner_url, '', 'Banner Toko');
  if (bannerRes.error) return res.status(400).json({ error: bannerRes.error });

  const initials =
    cleanString(req.body?.initials, 4).toUpperCase() ||
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() || '')
      .join('') ||
    'WD';
  const ts = nowIso();
  const storeId = uid('str');

  db.prepare(
    `INSERT INTO stores (id, user_id, name, username, initials, logo_url, banner_url, description, category, contact_whatsapp, contact_email, social_instagram, social_tiktok, social_youtube, social_twitter, social_shopee, social_website, landing_page_url, custom_landing_html, service_link, theme, store_mode, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    storeId,
    userId,
    name,
    username,
    initials,
    logoRes.url,
    bannerRes.url,
    cleanString(req.body?.description, 600),
    cleanString(req.body?.category, 60) || 'Digital Creator',
    cleanString(req.body?.contact_whatsapp, 30) || req.authUser!.whatsapp,
    cleanString(req.body?.contact_email, 160) || req.authUser!.email,
    cleanString(req.body?.social_instagram, 200),
    cleanString(req.body?.social_tiktok, 200),
    cleanString(req.body?.social_youtube, 200),
    cleanString(req.body?.social_twitter, 200),
    cleanString(req.body?.social_shopee, 200),
    cleanString(req.body?.social_website, 200),
    cleanHttpUrl(req.body?.landing_page_url, 1000),
    sanitizeCustomHtml(req.body?.custom_landing_html),
    cleanHttpUrl(req.body?.service_link, 300),
    cleanString(req.body?.theme, 30) || 'warm-cream',
    cleanString(req.body?.store_mode, 20) || 'hybrid',
    ts,
    ts
  );

  const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(storeId);
  res.status(201).json({ store });
});

app.put('/api/my-store', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT * FROM stores WHERE user_id = ?`).get(userId) as
    | Record<string, unknown>
    | undefined;
  if (!store) return res.status(404).json({ error: 'Toko belum dibuat.' });

  const name = cleanString(req.body?.name, 80) || (store.name as string);
  const rawUsername = cleanString(req.body?.username, 40);
  const username = rawUsername ? cleanSlug(rawUsername) : (store.username as string);

  if (username.length < 3) {
    return res.status(400).json({ error: 'Username toko minimal 3 karakter.' });
  }

  const dupName = db.prepare(`SELECT id FROM stores WHERE LOWER(name) = LOWER(?) AND id != ?`).get(name, store.id);
  if (dupName) return res.status(409).json({ error: 'Nama toko sudah digunakan. Silakan pilih nama lain.' });

  const dupUser = db
    .prepare(`SELECT id FROM stores WHERE LOWER(username) = LOWER(?) AND id != ?`)
    .get(username, store.id);
  if (dupUser) return res.status(409).json({ error: 'Username toko sudah digunakan. Silakan pilih username lain.' });

  const logoRes = validateAndCleanMediaUrl(req.body?.logo_url, store.logo_url as string, 'Logo Toko');
  if (logoRes.error) return res.status(400).json({ error: logoRes.error });
  const bannerRes = validateAndCleanMediaUrl(req.body?.banner_url, store.banner_url as string, 'Banner Toko');
  if (bannerRes.error) return res.status(400).json({ error: bannerRes.error });

  const rawLandingUrl = req.body?.landing_page_url !== undefined ? cleanString(req.body.landing_page_url, 1000) : undefined;
  let landingPageUrl = (store.landing_page_url as string) || '';
  if (rawLandingUrl !== undefined) {
    landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
    if (rawLandingUrl && !landingPageUrl) {
      return res.status(400).json({ error: 'Link landing page toko harus berupa URL http:// atau https:// yang valid.' });
    }
  }

  db.prepare(
    `UPDATE stores SET name = ?, username = ?, initials = ?, logo_url = ?, banner_url = ?, description = ?,
     category = ?, contact_whatsapp = ?, contact_email = ?, social_instagram = ?, social_tiktok = ?,
     social_youtube = ?, social_twitter = ?, social_shopee = ?, social_website = ?,
     landing_page_url = ?, custom_landing_html = ?,
     service_link = ?, theme = ?, store_mode = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    name,
    username,
    cleanString(req.body?.initials, 4).toUpperCase() || (store.initials as string),
    logoRes.url,
    bannerRes.url,
    req.body?.description !== undefined ? cleanString(req.body.description, 600) : store.description,
    cleanString(req.body?.category, 60) || (store.category as string),
    req.body?.contact_whatsapp !== undefined ? cleanString(req.body.contact_whatsapp, 30) : store.contact_whatsapp,
    req.body?.contact_email !== undefined ? cleanString(req.body.contact_email, 160) : store.contact_email,
    req.body?.social_instagram !== undefined ? cleanString(req.body.social_instagram, 200) : store.social_instagram,
    req.body?.social_tiktok !== undefined ? cleanString(req.body.social_tiktok, 200) : store.social_tiktok,
    req.body?.social_youtube !== undefined ? cleanString(req.body.social_youtube, 200) : store.social_youtube,
    req.body?.social_twitter !== undefined ? cleanString(req.body.social_twitter, 200) : store.social_twitter,
    req.body?.social_shopee !== undefined ? cleanString(req.body.social_shopee, 200) : store.social_shopee,
    req.body?.social_website !== undefined ? cleanString(req.body.social_website, 200) : store.social_website,
    landingPageUrl,
    req.body?.custom_landing_html !== undefined
      ? sanitizeCustomHtml(req.body.custom_landing_html)
      : store.custom_landing_html,
    req.body?.service_link !== undefined ? cleanHttpUrl(req.body.service_link, 300) : store.service_link,
    cleanString(req.body?.theme, 30) || (store.theme as string),
    cleanString(req.body?.store_mode, 20) || (store.store_mode as string),
    nowIso(),
    store.id,
    userId
  );

  res.json({ store: db.prepare(`SELECT * FROM stores WHERE id = ?`).get(store.id) });
});

app.post('/api/my-store/products', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(userId) as { id: string } | undefined;
  if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

  const title = cleanString(req.body?.title, 120);
  const category = cleanString(req.body?.category, 60) || 'Produk digital';
  if (category === 'Produk fisik' || req.body?.is_physical) {
    return res.status(400).json({ error: 'Produk fisik saat ini dinonaktifkan. Pilih kategori produk digital atau jasa.' });
  }
  const homePillar = cleanString(req.body?.home_pillar, 40) || 'Self Development';
  const price = Math.max(0, Math.round(Number(req.body?.price || 0)));

  let originalPrice: number | null = null;
  if (req.body?.original_price !== undefined && req.body?.original_price !== null && req.body?.original_price !== '') {
    const parsedOrig = Math.round(Number(req.body.original_price));
    if (!Number.isFinite(parsedOrig) || parsedOrig <= 0) {
      return res.status(400).json({ error: 'Harga awal harus berupa angka lebih dari 0.' });
    }
    if (price <= 0 || price >= parsedOrig) {
      return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
    }
    originalPrice = parsedOrig;
  }

  let quotaLimit: number | null = null;
  if (req.body?.quota_limit !== undefined && req.body?.quota_limit !== null && req.body?.quota_limit !== '') {
    const parsedQuota = Math.round(Number(req.body.quota_limit));
    if (!Number.isFinite(parsedQuota) || parsedQuota < 1) {
      return res.status(400).json({ error: 'Kuota batas minimal 1 unit atau kosongkan jika tanpa batas.' });
    }
    quotaLimit = parsedQuota;
  }

  const rawLandingUrl = cleanString(req.body?.landing_page_url, 1000);
  const landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
  if (rawLandingUrl && !landingPageUrl) {
    return res.status(400).json({ error: 'Link code landing page produk harus berupa URL http:// atau https:// yang valid.' });
  }

  const coverRes = validateAndCleanMediaUrl(req.body?.image_url, '', 'Gambar Sampul');
  if (coverRes.error) {
    return res.status(400).json({ error: coverRes.error });
  }

  const displayStyle = cleanDisplayStyle(req.body?.display_style, 'classic');
  const description = cleanString(req.body?.description, 4000) || `Akses digital resmi untuk ${title}`;
  const customLandingHtml = sanitizeCustomHtml(req.body?.custom_landing_html);
  const deliveryContent = cleanString(req.body?.delivery_content, 1000);
  const affiliateEnabled = req.body?.affiliate_enabled === false ? 0 : 1;
  const affiliateCommissionPct = Math.min(50, Math.max(0, Math.round(Number(req.body?.affiliate_commission_pct ?? 15))));

  const accessValidation = validateAccessInput((req.body || {}) as Record<string, unknown>);
  if (accessValidation.error) {
    return res.status(400).json({ error: accessValidation.error });
  }

  if (!title || price <= 0) {
    return res.status(400).json({ error: 'Judul produk dan harga yang valid wajib diisi.' });
  }

  const productId = uid('prd');
  db.prepare(
    `INSERT INTO products (id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price, quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url, delivery_content, access_type, access_url, access_file_data, access_file_name, is_physical, affiliate_enabled, affiliate_commission_pct, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'active', ?)`
  ).run(
    productId,
    store.id,
    userId,
    title,
    cleanSlug(title) || productId,
    category,
    homePillar,
    price,
    originalPrice,
    quotaLimit,
    landingPageUrl,
    customLandingHtml,
    displayStyle,
    description,
    coverRes.url,
    deliveryContent,
    accessValidation.accessType,
    accessValidation.accessUrl,
    accessValidation.accessFileData,
    accessValidation.accessFileName,
    affiliateEnabled,
    affiliateCommissionPct,
    nowIso()
  );

  const created = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products WHERE id = ?`
    )
    .get(productId) as Record<string, unknown>;

  res.status(201).json({ product: { ...created, has_access_file: Boolean(created.has_access_file) } });
});

app.put('/api/my-store/products/:id', requireAuth, (req: AuthRequest, res) => {
  const prod = db
    .prepare(`SELECT * FROM products WHERE id = ? AND owner_user_id = ?`)
    .get(req.params.id, req.authUser!.id) as Record<string, unknown> | undefined;
  if (!prod) return res.status(404).json({ error: 'Produk tidak ditemukan atau bukan milik toko Anda.' });

  const title = cleanString(req.body?.title, 120) || (prod.title as string);
  const category = cleanString(req.body?.category, 60) || (prod.category as string);
  if (category === 'Produk fisik' || req.body?.is_physical === true) {
    return res.status(400).json({ error: 'Produk fisik saat ini dinonaktifkan. Pilih kategori produk digital atau jasa.' });
  }
  const homePillar = cleanString(req.body?.home_pillar, 40) || (prod.home_pillar as string) || 'Self Development';
  const price = req.body?.price !== undefined ? Math.max(0, Math.round(Number(req.body.price))) : (prod.price as number);

  let originalPrice: number | null =
    prod.original_price !== null && prod.original_price !== undefined ? Number(prod.original_price) : null;
  if (req.body?.original_price !== undefined) {
    if (req.body.original_price === null || req.body.original_price === '') {
      originalPrice = null;
    } else {
      const parsedOrig = Math.round(Number(req.body.original_price));
      if (!Number.isFinite(parsedOrig) || parsedOrig <= 0) {
        return res.status(400).json({ error: 'Harga awal harus berupa angka lebih dari 0.' });
      }
      if (price <= 0 || price >= parsedOrig) {
        return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
      }
      originalPrice = parsedOrig;
    }
  } else if (originalPrice !== null && price >= originalPrice) {
    originalPrice = null;
  }

  let quotaLimit: number | null =
    prod.quota_limit !== null && prod.quota_limit !== undefined ? Number(prod.quota_limit) : null;
  if (req.body?.quota_limit !== undefined) {
    if (req.body.quota_limit === null || req.body.quota_limit === '') {
      quotaLimit = null;
    } else {
      const parsedQuota = Math.round(Number(req.body.quota_limit));
      if (!Number.isFinite(parsedQuota) || parsedQuota < 1) {
        return res.status(400).json({ error: 'Kuota batas minimal 1 unit atau kosongkan jika tanpa batas.' });
      }
      quotaLimit = parsedQuota;
    }
  }

  let landingPageUrl = (prod.landing_page_url as string) || '';
  if (req.body?.landing_page_url !== undefined) {
    const rawLandingUrl = cleanString(req.body.landing_page_url, 1000);
    landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
    if (rawLandingUrl && !landingPageUrl) {
      return res.status(400).json({ error: 'Link code landing page produk harus berupa URL http:// atau https:// yang valid.' });
    }
  }

  const coverRes = validateAndCleanMediaUrl(req.body?.image_url, prod.image_url as string, 'Gambar Sampul');
  if (coverRes.error) {
    return res.status(400).json({ error: coverRes.error });
  }

  const displayStyle =
    req.body?.display_style !== undefined
      ? cleanDisplayStyle(req.body.display_style, (prod.display_style as string) || 'classic')
      : ((prod.display_style as string) || 'classic');

  const description =
    req.body?.description !== undefined
      ? cleanString(req.body.description, 4000) || `Akses digital resmi untuk ${title}`
      : (prod.description as string);
  const customLandingHtml =
    req.body?.custom_landing_html !== undefined
      ? sanitizeCustomHtml(req.body.custom_landing_html)
      : ((prod.custom_landing_html as string) || '');
  const deliveryContent =
    req.body?.delivery_content !== undefined ? cleanString(req.body.delivery_content, 1000) : (prod.delivery_content as string);
  const status = cleanString(req.body?.status, 20) || (prod.status as string);
  const affiliateEnabled =
    req.body?.affiliate_enabled !== undefined ? (req.body.affiliate_enabled ? 1 : 0) : (prod.affiliate_enabled as number);
  const affiliateCommissionPct =
    req.body?.affiliate_commission_pct !== undefined
      ? Math.min(50, Math.max(0, Math.round(Number(req.body.affiliate_commission_pct))))
      : (prod.affiliate_commission_pct as number);

  let accessType = prod.access_type as string;
  let accessUrl = prod.access_url as string;
  let accessFileData = prod.access_file_data as string;
  let accessFileName = prod.access_file_name as string;

  if (
    req.body?.access_type !== undefined ||
    req.body?.access_url !== undefined ||
    req.body?.access_file_data !== undefined
  ) {
    const accessValidation = validateAccessInput({
      access_type: req.body?.access_type ?? prod.access_type,
      access_url: req.body?.access_url ?? prod.access_url,
      access_file_data: req.body?.access_file_data !== undefined ? req.body.access_file_data : prod.access_file_data,
      access_file_name: req.body?.access_file_name ?? prod.access_file_name,
    });
    if (accessValidation.error) {
      return res.status(400).json({ error: accessValidation.error });
    }
    accessType = accessValidation.accessType;
    accessUrl = accessValidation.accessUrl;
    accessFileData = accessValidation.accessFileData;
    accessFileName = accessValidation.accessFileName;
  }

  db.prepare(
    `UPDATE products SET title = ?, category = ?, home_pillar = ?, price = ?, original_price = ?, quota_limit = ?, landing_page_url = ?, custom_landing_html = ?, display_style = ?, description = ?, image_url = ?, delivery_content = ?, access_type = ?, access_url = ?, access_file_data = ?, access_file_name = ?, is_physical = 0, status = ?, affiliate_enabled = ?, affiliate_commission_pct = ? WHERE id = ? AND owner_user_id = ?`
  ).run(
    title,
    category,
    homePillar,
    price,
    originalPrice,
    quotaLimit,
    landingPageUrl,
    customLandingHtml,
    displayStyle,
    description,
    coverRes.url,
    deliveryContent,
    accessType,
    accessUrl,
    accessFileData,
    accessFileName,
    status,
    affiliateEnabled,
    affiliateCommissionPct,
    prod.id,
    req.authUser!.id
  );

  const updated = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products WHERE id = ?`
    )
    .get(prod.id) as Record<string, unknown>;

  res.json({ product: { ...updated, has_access_file: Boolean(updated.has_access_file) } });
});

app.delete('/api/my-store/products/:id', requireAuth, (req: AuthRequest, res) => {
  const info = db
    .prepare(`DELETE FROM products WHERE id = ? AND owner_user_id = ?`)
    .run(req.params.id, req.authUser!.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Produk tidak ditemukan atau bukan milik Anda.' });
  }
  res.json({ ok: true });
});

// Seller custom external affiliate links (displayed seamlessly on their storefront)
app.post('/api/my-store/external-affiliates', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(userId) as { id: string } | undefined;
  if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

  const title = cleanString(req.body?.title, 120);
  const category = cleanString(req.body?.category, 60) || 'Produk digital';
  const price = Math.max(0, Math.round(Number(req.body?.price || 0)));
  const originalPrice =
    req.body?.original_price && Number(req.body.original_price) > price ? Math.round(Number(req.body.original_price)) : null;
  const description = cleanString(req.body?.description, 1000);
  const affiliateUrl = cleanHttpUrl(req.body?.affiliate_url, 1000);
  const displayStyle = cleanDisplayStyle(req.body?.display_style, 'classic');

  if (!title || !affiliateUrl) {
    return res.status(400).json({ error: 'Judul produk dan link affiliate (http/https) wajib diisi.' });
  }

  const coverRes = validateAndCleanMediaUrl(req.body?.image_url, '', 'Gambar Produk');
  if (coverRes.error) return res.status(400).json({ error: coverRes.error });

  const id = uid('extaff');
  db.prepare(
    `INSERT INTO store_external_affiliates (id, store_id, user_id, title, category, price, original_price, description, image_url, affiliate_url, display_style, clicks_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, store.id, userId, title, category, price, originalPrice, description, coverRes.url, affiliateUrl, displayStyle, nowIso());

  res.status(201).json({ item: db.prepare(`SELECT * FROM store_external_affiliates WHERE id = ?`).get(id) });
});

app.delete('/api/my-store/external-affiliates/:id', requireAuth, (req: AuthRequest, res) => {
  const info = db
    .prepare(`DELETE FROM store_external_affiliates WHERE id = ? AND user_id = ?`)
    .run(req.params.id, req.authUser!.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Produk affiliate tidak ditemukan.' });
  res.json({ ok: true });
});

// Store Vouchers CRUD (for seller's own store)
app.get('/api/my-store/vouchers', requireAuth, (req: AuthRequest, res) => {
  const store = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(req.authUser!.id) as { id: string } | undefined;
  if (!store) return res.json({ vouchers: [] });
  const vouchers = db.prepare(`SELECT * FROM vouchers WHERE scope = 'store' AND store_id = ? ORDER BY created_at DESC`).all(store.id);
  res.json({ vouchers });
});

app.post('/api/my-store/vouchers', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(userId) as { id: string } | undefined;
  if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

  const code = cleanString(req.body?.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const title = cleanString(req.body?.title, 100) || `Promo ${code}`;
  const discountType = req.body?.discount_type === 'percent' ? 'percent' : 'fixed';
  const discountValue = Math.max(1, Math.round(Number(req.body?.discount_value || 0)));
  const minPurchase = Math.max(0, Math.round(Number(req.body?.min_purchase || 0)));
  const maxDiscount = req.body?.max_discount ? Math.max(1000, Math.round(Number(req.body.max_discount))) : null;
  const quotaLimit = req.body?.quota_limit ? Math.max(1, Math.round(Number(req.body.quota_limit))) : null;
  const expiresAt = req.body?.expires_at ? cleanString(req.body.expires_at, 40) : null;

  if (code.length < 3) {
    return res.status(400).json({ error: 'Kode voucher minimal 3 karakter huruf/angka.' });
  }
  if (discountType === 'percent' && discountValue > 90) {
    return res.status(400).json({ error: 'Diskon persentase maksimal 90%.' });
  }

  const dup = db.prepare(`SELECT id FROM vouchers WHERE LOWER(code) = LOWER(?)`).get(code);
  if (dup) {
    return res.status(409).json({ error: 'Kode voucher sudah digunakan. Pilih kode unik lain.' });
  }

  const id = uid('vch');
  db.prepare(
    `INSERT INTO vouchers (id, code, scope, store_id, owner_user_id, title, discount_type, discount_value, min_purchase, max_discount, quota_limit, used_count, expires_at, is_active, created_at)
     VALUES (?, ?, 'store', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`
  ).run(id, code, store.id, userId, title, discountType, discountValue, minPurchase, maxDiscount, quotaLimit, expiresAt, nowIso());

  res.status(201).json({ voucher: db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(id) });
});

app.put('/api/my-store/vouchers/:id', requireAuth, (req: AuthRequest, res) => {
  const existing = db
    .prepare(`SELECT * FROM vouchers WHERE id = ? AND owner_user_id = ? AND scope = 'store'`)
    .get(req.params.id, req.authUser!.id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });

  const title = req.body?.title !== undefined ? cleanString(req.body.title, 100) || (existing.title as string) : (existing.title as string);
  const discountType =
    req.body?.discount_type !== undefined
      ? req.body.discount_type === 'percent'
        ? 'percent'
        : 'fixed'
      : String(existing.discount_type || 'fixed');
  const discountValue =
    req.body?.discount_value !== undefined
      ? Math.max(1, Math.round(Number(req.body.discount_value || 0)))
      : Number(existing.discount_value || 0);
  if (discountType === 'percent' && discountValue > 90) {
    return res.status(400).json({ error: 'Diskon persentase maksimal 90%.' });
  }
  const minPurchase =
    req.body?.min_purchase !== undefined
      ? Math.max(0, Math.round(Number(req.body.min_purchase || 0)))
      : Number(existing.min_purchase || 0);
  const maxDiscount =
    req.body?.max_discount !== undefined
      ? req.body.max_discount === null || req.body.max_discount === ''
        ? null
        : Math.max(1000, Math.round(Number(req.body.max_discount)))
      : (existing.max_discount as number | null);
  const quotaLimit =
    req.body?.quota_limit !== undefined
      ? req.body.quota_limit === null || req.body.quota_limit === ''
        ? null
        : Math.max(1, Math.round(Number(req.body.quota_limit)))
      : (existing.quota_limit as number | null);
  const expiresAt =
    req.body?.expires_at !== undefined
      ? req.body.expires_at
        ? cleanString(req.body.expires_at, 40)
        : null
      : (existing.expires_at as string | null);
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

  db.prepare(
    `UPDATE vouchers
     SET title = ?, discount_type = ?, discount_value = ?, min_purchase = ?, max_discount = ?, quota_limit = ?, expires_at = ?, is_active = ?
     WHERE id = ?`
  ).run(title, discountType, discountValue, minPurchase, maxDiscount, quotaLimit, expiresAt, isActive, req.params.id);

  res.json({ voucher: db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(req.params.id) });
});

app.delete('/api/my-store/vouchers/:id', requireAuth, (req: AuthRequest, res) => {
  const info = db
    .prepare(`DELETE FROM vouchers WHERE id = ? AND owner_user_id = ? AND scope = 'store'`)
    .run(req.params.id, req.authUser!.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });
  res.json({ ok: true });
});

app.get('/api/affiliate/catalog', optionalAuth, (req: AuthRequest, res) => {
  const userStore = req.authUser
    ? (db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(req.authUser.id) as { id: string } | undefined)
    : undefined;

  const addedIds = userStore
    ? new Set(
        (
          db.prepare(`SELECT product_id FROM affiliate_products WHERE store_id = ?`).all(userStore.id) as Array<{
            product_id: string;
          }>
        ).map((r) => r.product_id)
      )
    : new Set<string>();

  const catalog = (
    db
      .prepare(
        `SELECT p.id, p.title, p.category, p.price, p.original_price, p.quota_limit, p.landing_page_url, p.display_style,
                p.description, p.image_url, p.affiliate_commission_pct, p.sales_count,
                s.name as owner_store_name, s.username as owner_store_username, p.owner_user_id
         FROM products p
         JOIN stores s ON s.id = p.store_id
         WHERE p.status = 'active' AND p.affiliate_enabled = 1 AND p.is_physical = 0 AND p.category != 'Produk fisik'
         ORDER BY p.affiliate_commission_pct DESC, p.sales_count DESC`
      )
      .all() as Array<Record<string, unknown>>
  ).map((p) => ({
    ...p,
    inMyStore: addedIds.has(p.id as string),
    isOwnProduct: req.authUser ? p.owner_user_id === req.authUser.id : false,
  }));

  res.json({ catalog, hasStore: Boolean(userStore) });
});

app.post('/api/affiliate/store-items', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const store = db.prepare(`SELECT id, username FROM stores WHERE user_id = ?`).get(userId) as
    | { id: string; username: string }
    | undefined;

  if (!store) {
    return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store untuk menambahkan produk affiliate.' });
  }

  const productId = cleanString(req.body?.product_id, 64);
  const product = db
    .prepare(`SELECT id, owner_user_id, affiliate_enabled FROM products WHERE id = ? AND status = 'active'`)
    .get(productId) as { id: string; owner_user_id: string; affiliate_enabled: number } | undefined;

  if (!product || !product.affiliate_enabled) {
    return res.status(404).json({ error: 'Produk tidak tersedia untuk program affiliate.' });
  }
  if (product.owner_user_id === userId) {
    return res.status(400).json({ error: 'Produk milik Anda sendiri otomatis tampil di katalog produk utama toko Anda.' });
  }

  const existing = db
    .prepare(`SELECT id FROM affiliate_products WHERE store_id = ? AND product_id = ?`)
    .get(store.id, productId);
  if (existing) {
    return res.status(409).json({ error: 'Produk ini sudah ada di toko affiliate Anda.' });
  }

  const id = uid('aff');
  db.prepare(
    `INSERT INTO affiliate_products (id, store_id, affiliate_user_id, product_id, referral_code, clicks_count, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).run(id, store.id, userId, productId, store.username, nowIso());

  res.status(201).json({ ok: true, referral_code: store.username });
});

app.delete('/api/affiliate/store-items/:productId', requireAuth, (req: AuthRequest, res) => {
  const store = db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(req.authUser!.id) as
    | { id: string }
    | undefined;
  if (!store) return res.status(404).json({ error: 'Toko tidak ditemukan.' });

  db.prepare(`DELETE FROM affiliate_products WHERE store_id = ? AND product_id = ?`).run(
    store.id,
    req.params.productId
  );
  res.json({ ok: true });
});

app.post('/api/affiliate/track-click', (req, res) => {
  const ref = cleanSlug(cleanString(req.body?.ref, 40));
  const productId = cleanString(req.body?.product_id, 64);
  if (!ref) return res.json({ tracked: false });

  const store = db.prepare(`SELECT id, user_id FROM stores WHERE username = ?`).get(ref) as
    | { id: string; user_id: string }
    | undefined;
  if (!store) return res.json({ tracked: false });

  db.prepare(
    `INSERT INTO affiliate_clicks (id, affiliate_user_id, store_id, product_id, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(uid('aclk'), store.user_id, store.id, productId || null, nowIso());

  if (productId) {
    db.prepare(`UPDATE affiliate_products SET clicks_count = clicks_count + 1 WHERE store_id = ? AND product_id = ?`).run(
      store.id,
      productId
    );
  }
  res.json({ tracked: true, affiliate_store_id: store.id });
});

// ==========================================
// 7. CHECKOUT, ORDERS, PAYMENTS & WALLET
// ==========================================

app.get('/api/payment-methods', (_req, res) => {
  const methods = db.prepare(`SELECT * FROM payment_methods WHERE is_active = 1`).all();
  res.json({ methods });
});

app.post('/api/vouchers/validate', optionalAuth, (req, res) => {
  const code = cleanString(req.body?.code, 40);
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!code) return res.status(400).json({ error: 'Masukkan kode voucher terlebih dahulu.' });
  if (rawItems.length === 0) return res.status(400).json({ error: 'Keranjang belanja masih kosong.' });

  let subtotalBeforeDiscount = 0;
  const pricedItems: Array<{ store_id: string | null; subtotal: number }> = [];

  for (const raw of rawItems) {
    const itemType = raw?.item_type;
    const itemId = cleanString(raw?.item_id, 64);
    const qty = Math.max(1, Math.min(20, Math.round(Number(raw?.quantity || 1))));
    if (itemType === 'product') {
      const p = db.prepare(`SELECT price, store_id FROM products WHERE id = ? AND status = 'active'`).get(itemId) as
        | { price: number; store_id: string }
        | undefined;
      if (p) {
        const sub = Number(p.price) * qty;
        subtotalBeforeDiscount += sub;
        pricedItems.push({ store_id: p.store_id, subtotal: sub });
      }
    } else if (itemType === 'class') {
      const c = db.prepare(`SELECT price FROM academy_classes WHERE id = ?`).get(itemId) as { price: number } | undefined;
      if (c) {
        subtotalBeforeDiscount += Number(c.price);
        pricedItems.push({ store_id: null, subtotal: Number(c.price) });
      }
    } else if (itemType === 'program') {
      const prog = db.prepare(`SELECT bundle_price FROM academy_programs WHERE id = ?`).get(itemId) as
        | { bundle_price: number }
        | undefined;
      if (prog) {
        subtotalBeforeDiscount += Number(prog.bundle_price);
        pricedItems.push({ store_id: null, subtotal: Number(prog.bundle_price) });
      }
    } else if (itemType === 'pro_plan' && itemId in PRO_PLANS) {
      const plan = PRO_PLANS[itemId as ProPlanId];
      subtotalBeforeDiscount += plan.price;
      pricedItems.push({ store_id: null, subtotal: plan.price });
    }
  }

  const check = validateVoucherForCart({ code, items: pricedItems, subtotalBeforeDiscount });
  if (!check.valid || !check.voucher) {
    return res.status(400).json({ error: check.error || 'Voucher tidak valid.' });
  }

  res.json({
    valid: true,
    voucher: {
      id: check.voucher.id,
      code: check.voucher.code,
      scope: check.voucher.scope,
      title: check.voucher.title,
      discount_type: check.voucher.discount_type,
      discount_value: check.voucher.discount_value,
    },
    subtotalBeforeDiscount,
    discountAmount: check.discountAmount,
    finalTotal: Math.max(0, subtotalBeforeDiscount - check.discountAmount),
  });
});

app.post('/api/orders/checkout', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : [];
  const paymentMethodId = cleanString(req.body?.payment_method_id, 64);
  const notes = cleanString(req.body?.notes, 300);
  const buyerWhatsappInput = cleanString(req.body?.buyer_whatsapp, 30);
  const buyerEmailInput = cleanString(req.body?.buyer_email, 160).toLowerCase();
  const voucherCodeInput = cleanString(req.body?.voucher_code, 40).toUpperCase();

  if (rawItems.length === 0) {
    return res.status(400).json({ error: 'Keranjang belanja masih kosong.' });
  }
  if (buyerEmailInput && (!buyerEmailInput.includes('@') || !buyerEmailInput.includes('.'))) {
    return res.status(400).json({ error: 'Format email pembeli tidak valid.' });
  }

  const pm = db.prepare(`SELECT * FROM payment_methods WHERE id = ? AND is_active = 1`).get(paymentMethodId) as
    | Record<string, unknown>
    | undefined;
  if (!pm) {
    return res.status(400).json({ error: 'Pilih metode pembayaran yang valid.' });
  }

  const checkoutTx = db.transaction(() => {
    if (buyerWhatsappInput) {
      db.prepare(`UPDATE users SET whatsapp = ? WHERE id = ?`).run(buyerWhatsappInput, userId);
    }
    const buyerRow = db.prepare(`SELECT name, email, whatsapp FROM users WHERE id = ?`).get(userId) as {
      name: string;
      email: string;
      whatsapp: string;
    };
    const effectiveBuyerEmail = buyerEmailInput || buyerRow.email;
    const effectiveBuyerWhatsapp = buyerWhatsappInput || buyerRow.whatsapp || '';

    let subtotalBeforeDiscount = 0;
    const resolvedItems: Array<{
      item_type: string;
      item_id: string;
      title: string;
      quantity: number;
      unit_price: number;
      subtotal: number;
      seller_user_id: string | null;
      store_id: string | null;
      affiliate_user_id: string | null;
      affiliate_commission_pct: number;
    }> = [];

    for (const raw of rawItems) {
      const itemType = raw?.item_type;
      const itemId = cleanString(raw?.item_id, 64);
      const qty = Math.max(1, Math.min(20, Math.round(Number(raw?.quantity || 1))));
      const affRef = cleanSlug(cleanString(raw?.affiliate_username, 40));

      if (itemType === 'product') {
        const p = db
          .prepare(`SELECT * FROM products WHERE id = ? AND status = 'active'`)
          .get(itemId) as Record<string, unknown> | undefined;
        if (!p || p.is_physical === 1 || p.category === 'Produk fisik') {
          throw new Error(`Produk ${itemId} tidak tersedia.`);
        }
        if (p.quota_limit !== null && p.quota_limit !== undefined) {
          const remaining = Math.max(0, Number(p.quota_limit) - Number(p.sales_count || 0));
          if (remaining <= 0) {
            throw new Error(`Kuota produk "${p.title}" sudah habis.`);
          }
          if (qty > remaining) {
            throw new Error(`Sisa kuota untuk "${p.title}" hanya ${remaining} unit.`);
          }
        }

        let affiliateUserId: string | null = null;
        let commPct = 0;
        if (affRef && p.affiliate_enabled === 1) {
          const affStore = db.prepare(`SELECT user_id FROM stores WHERE username = ?`).get(affRef) as
            | { user_id: string }
            | undefined;
          if (affStore && affStore.user_id !== userId && affStore.user_id !== p.owner_user_id) {
            affiliateUserId = affStore.user_id;
            commPct = Number(p.affiliate_commission_pct || 0);
          }
        }

        const unitPrice = Number(p.price);
        const subtotal = unitPrice * qty;
        subtotalBeforeDiscount += subtotal;
        resolvedItems.push({
          item_type: 'product',
          item_id: itemId,
          title: p.title as string,
          quantity: qty,
          unit_price: unitPrice,
          subtotal,
          seller_user_id: p.owner_user_id as string,
          store_id: p.store_id as string,
          affiliate_user_id: affiliateUserId,
          affiliate_commission_pct: commPct,
        });
      } else if (itemType === 'class') {
        const c = db.prepare(`SELECT * FROM academy_classes WHERE id = ?`).get(itemId) as
          | Record<string, unknown>
          | undefined;
        if (!c) throw new Error(`Kelas ${itemId} tidak tersedia.`);
        const unitPrice = Number(c.price);
        subtotalBeforeDiscount += unitPrice;
        resolvedItems.push({
          item_type: 'class',
          item_id: itemId,
          title: c.title as string,
          quantity: 1,
          unit_price: unitPrice,
          subtotal: unitPrice,
          seller_user_id: null,
          store_id: null,
          affiliate_user_id: null,
          affiliate_commission_pct: 0,
        });
      } else if (itemType === 'program') {
        const prog = db.prepare(`SELECT * FROM academy_programs WHERE id = ?`).get(itemId) as
          | Record<string, unknown>
          | undefined;
        if (!prog) throw new Error(`Program belajar ${itemId} tidak tersedia.`);
        const unitPrice = Number(prog.bundle_price);
        subtotalBeforeDiscount += unitPrice;
        resolvedItems.push({
          item_type: 'program',
          item_id: itemId,
          title: `Bundle Program: ${prog.title as string}`,
          quantity: 1,
          unit_price: unitPrice,
          subtotal: unitPrice,
          seller_user_id: null,
          store_id: null,
          affiliate_user_id: null,
          affiliate_commission_pct: 0,
        });
      } else if (itemType === 'pro_plan') {
        if (!(itemId in PRO_PLANS)) {
          throw new Error(`Paket langganan Pro "${itemId}" tidak valid.`);
        }
        const plan = PRO_PLANS[itemId as ProPlanId];
        subtotalBeforeDiscount += plan.price;
        resolvedItems.push({
          item_type: 'pro_plan',
          item_id: plan.id,
          title: plan.name,
          quantity: 1,
          unit_price: plan.price,
          subtotal: plan.price,
          seller_user_id: null,
          store_id: null,
          affiliate_user_id: null,
          affiliate_commission_pct: 0,
        });
      } else {
        throw new Error('Jenis item tidak valid.');
      }
    }

    let appliedVoucherCode = '';
    let discountAmount = 0;
    if (voucherCodeInput) {
      const vCheck = validateVoucherForCart({
        code: voucherCodeInput,
        items: resolvedItems.map((ri) => ({ store_id: ri.store_id, subtotal: ri.subtotal })),
        subtotalBeforeDiscount,
      });
      if (!vCheck.valid || !vCheck.voucher) {
        throw new Error(vCheck.error || 'Voucher tidak valid.');
      }
      appliedVoucherCode = String(vCheck.voucher.code);
      discountAmount = vCheck.discountAmount;
      db.prepare(`UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?`).run(vCheck.voucher.id);
    }

    const totalAmount = Math.max(0, subtotalBeforeDiscount - discountAmount);
    const orderId = uid('ord');
    const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const orderCode = `WDUP-${datePart}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    const ts = nowIso();

    db.prepare(
      `INSERT INTO orders (id, order_code, buyer_user_id, buyer_email, buyer_whatsapp, voucher_code, discount_amount, payment_method_id, total_amount, status, gateway_provider, notes, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Payment', 'manual', ?, ?, ?)`
    ).run(orderId, orderCode, userId, effectiveBuyerEmail, effectiveBuyerWhatsapp, appliedVoucherCode, discountAmount, paymentMethodId, totalAmount, notes, ts, ts);

    const insItem = db.prepare(
      `INSERT INTO order_items (id, order_id, item_type, item_id, title, quantity, unit_price, subtotal, seller_user_id, store_id, affiliate_user_id, affiliate_commission_pct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of resolvedItems) {
      insItem.run(
        uid('oi'),
        orderId,
        item.item_type,
        item.item_id,
        item.title,
        item.quantity,
        item.unit_price,
        item.subtotal,
        item.seller_user_id,
        item.store_id,
        item.affiliate_user_id,
        item.affiliate_commission_pct
      );
    }

    db.prepare(`INSERT INTO payments (id, order_id, payer_user_id) VALUES (?, ?, ?)`).run(uid('pay'), orderId, userId);

    const reminderTitle = `Segera Posting Bukti Pembayaran — ${orderCode}`;
    const voucherNote = appliedVoucherCode ? ` (Voucher ${appliedVoucherCode}: -Rp ${discountAmount.toLocaleString('id-ID')})` : '';
    const waInfoNote = effectiveBuyerWhatsapp ? ` & WhatsApp ${effectiveBuyerWhatsapp}` : '';
    const reminderMessage = `Halo ${buyerRow.name}, pesanan ${orderCode} senilai Rp ${totalAmount.toLocaleString('id-ID')}${voucherNote} via ${pm.provider_name} (${pm.account_number} a.n. ${pm.account_holder}) telah dibuat. Notifikasi otomatis dikirim ke ${effectiveBuyerEmail}${waInfoNote}. Segera transfer dan unggah bukti pembayaran agar admin dapat memverifikasi dan membuka akses.`;

    const itemsSummaryText = resolvedItems.map((i) => `${i.title} x${i.quantity}`).join(', ');
    const dispatchResult = notifyAdminsAndBuyer({
      buyerUserId: userId,
      buyerEmail: effectiveBuyerEmail,
      buyerWhatsapp: effectiveBuyerWhatsapp,
      buyerEventType: 'payment_reminder',
      buyerTitle: reminderTitle,
      buyerMessage: reminderMessage,
      adminEventType: 'admin_order_new',
      adminTitle: `Pesanan Baru Masuk: ${orderCode} (Rp ${totalAmount.toLocaleString('id-ID')})`,
      adminMessage: `Pembeli: ${buyerRow.name} (${effectiveBuyerEmail}${effectiveBuyerWhatsapp ? ` / ${effectiveBuyerWhatsapp}` : ''}). Item: ${itemsSummaryText}${voucherNote}. Menunggu pembayaran & bukti transfer.`,
    });

    const whatsappShareText = [
      `[WD.UP Pengingat Pembayaran]`,
      `Halo ${buyerRow.name},`,
      `Pesanan: ${orderCode}`,
      `Email Konfirmasi: ${effectiveBuyerEmail}`,
      ...(effectiveBuyerWhatsapp ? [`WhatsApp Pembeli: ${effectiveBuyerWhatsapp}`] : []),
      ...(appliedVoucherCode ? [`Voucher: ${appliedVoucherCode} (-Rp ${discountAmount.toLocaleString('id-ID')})`] : []),
      `Total: Rp ${totalAmount.toLocaleString('id-ID')}`,
      `Transfer ke: ${pm.provider_name} - ${pm.account_number} (a.n. ${pm.account_holder})`,
      ``,
      `Mohon segera transfer dan posting/unggah bukti pembayaran Anda di keranjang WD.UP atau menu My Account -> My Activity agar pesanan segera diverifikasi Paid.`,
    ].join('\n');

    return {
      orderId,
      orderCode,
      totalAmount,
      notificationSummary: {
        id: dispatchResult.buyerNotif.id,
        senderEmail: 'notif@wdup.com',
        buyerEmail: effectiveBuyerEmail,
        buyerWhatsapp: effectiveBuyerWhatsapp,
        emailStatus: dispatchResult.buyerNotif.emailStatus,
        waStatus: dispatchResult.buyerNotif.waStatus,
        adminNotifiedCount: dispatchResult.adminCount,
        reminderTitle,
        reminderMessage,
        whatsappShareText,
      },
    };
  });

  try {
    const result = checkoutTx();
    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(result.orderId);
    res.status(201).json({
      order,
      paymentMethod: pm,
      notificationSummary: result.notificationSummary,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal membuat pesanan.' });
  }
});

app.get('/api/orders', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const orders = db
    .prepare(
      `SELECT o.*, pm.provider_name, pm.account_number, pm.account_holder, pm.instructions,
              p.sender_name, p.transfer_reference, p.proof_note, p.submitted_at, p.verification_note
       FROM orders o
       LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
       LEFT JOIN payments p ON p.order_id = o.id
       WHERE o.buyer_user_id = ?
       ORDER BY o.created_at DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  const enriched = orders.map((o) => {
    const items = db
      .prepare(
        `SELECT oi.*, pr.delivery_content, pr.image_url, pr.is_physical,
                pr.access_type, pr.access_url, pr.access_file_name,
                CASE WHEN pr.access_file_data != '' THEN 1 ELSE 0 END as has_access_file
         FROM order_items oi
         LEFT JOIN products pr ON oi.item_type = 'product' AND pr.id = oi.item_id
         WHERE oi.order_id = ?`
      )
      .all(o.id) as Array<Record<string, unknown>>;

    const isPaid = o.status === 'Paid';
    return {
      ...o,
      items: items.map((it) => ({
        ...it,
        delivery_content: isPaid ? it.delivery_content : '',
        access_url: isPaid ? it.access_url : '',
        access_file_name: isPaid ? it.access_file_name : '',
        has_access_file: isPaid ? Boolean(it.has_access_file) : false,
      })),
    };
  });

  res.json({ orders: enriched });
});

app.post('/api/orders/:id/payment-proof', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ? AND buyer_user_id = ?`)
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!order) return res.status(404).json({ error: 'Pesanan tidak ditemukan.' });
  if (order.status !== 'Pending Payment' && order.status !== 'Rejected') {
    return res.status(400).json({ error: `Status pesanan (${order.status}) tidak dapat menerima unggahan bukti baru.` });
  }

  const rawSenderName = cleanString(req.body?.sender_name, 100);
  const transferRef = cleanString(req.body?.transfer_reference, 100);
  const proofNote = cleanString(req.body?.proof_note, 300);
  const proofImageData = typeof req.body?.proof_image_data === 'string' ? req.body.proof_image_data : '';

  if (proofImageData && (!proofImageData.startsWith('data:image/') || proofImageData.length > 2_800_000)) {
    return res.status(400).json({ error: 'Bukti gambar harus berupa file gambar valid maksimal 2MB.' });
  }
  const senderName = rawSenderName || (proofImageData ? req.authUser!.name : '');
  if (!senderName && !proofImageData) {
    return res.status(400).json({ error: 'Isi nama pengirim rekening/e-wallet atau unggah gambar bukti pembayaran.' });
  }

  const ts = nowIso();
  db.transaction(() => {
    db.prepare(
      `UPDATE payments SET sender_name = ?, transfer_reference = ?, proof_image_data = ?, proof_note = ?, submitted_at = ? WHERE order_id = ?`
    ).run(senderName, transferRef, proofImageData, proofNote, ts, order.id);

    db.prepare(`UPDATE orders SET status = 'Waiting Verification', updated_at = ? WHERE id = ?`).run(ts, order.id);

    const buyerRow = db.prepare(`SELECT name, email, whatsapp FROM users WHERE id = ?`).get(userId) as
      | { name: string; email: string; whatsapp: string }
      | undefined;
    const effectiveEmail = (order.buyer_email as string) || buyerRow?.email || req.authUser!.email;
    const effectiveWhatsapp = (order.buyer_whatsapp as string) || buyerRow?.whatsapp || '';

    notifyAdminsAndBuyer({
      buyerUserId: userId,
      buyerEmail: effectiveEmail,
      buyerWhatsapp: effectiveWhatsapp,
      buyerEventType: 'payment_proof_submitted',
      buyerTitle: `Bukti Pembayaran ${order.order_code} Diterima`,
      buyerMessage: `Bukti pembayaran atas nama ${senderName} sedang dalam antrean verifikasi admin (Waiting Verification).`,
      adminEventType: 'admin_payment_proof',
      adminTitle: `Bukti Bayar Baru: ${order.order_code}`,
      adminMessage: `Pembeli ${buyerRow?.name || ''} (${effectiveEmail}${effectiveWhatsapp ? ` / ${effectiveWhatsapp}` : ''}) mengirim bukti transfer a.n. ${senderName} senilai Rp ${Number(order.total_amount || 0).toLocaleString('id-ID')}. Segera verifikasi di Admin Dashboard.`,
    });
  })();

  res.json({ ok: true, status: 'Waiting Verification' });
});

app.get('/api/wallet', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const user = getUserById(userId)!;
  const transactions = db
    .prepare(`SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`)
    .all(userId);
  const withdrawals = db
    .prepare(`SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 30`)
    .all(userId);
  const commissions = db
    .prepare(
      `SELECT c.*, o.order_code FROM commissions c JOIN orders o ON o.id = c.order_id WHERE c.affiliate_user_id = ? ORDER BY c.created_at DESC`
    )
    .all(userId);

  const totalIncome = (
    db
      .prepare(`SELECT COALESCE(SUM(amount), 0) as t FROM wallet_transactions WHERE user_id = ? AND type = 'sale_income'`)
      .get(userId) as { t: number }
  ).t;
  const totalCommissions = (
    db
      .prepare(
        `SELECT COALESCE(SUM(amount), 0) as t FROM wallet_transactions WHERE user_id = ? AND type = 'affiliate_commission'`
      )
      .get(userId) as { t: number }
  ).t;

  res.json({
    wallet_available: user.wallet_available,
    wallet_pending: user.wallet_pending,
    totalIncome,
    totalCommissions,
    transactions,
    withdrawals,
    commissions,
  });
});

app.post('/api/wallet/withdraw', requireAuth, (req: AuthRequest, res) => {
  const userId = req.authUser!.id;
  const amount = Math.round(Number(req.body?.amount || 0));
  const bankOrEwallet = cleanString(req.body?.bank_or_ewallet, 80);
  const accountNumber = cleanString(req.body?.account_number, 60);
  const accountHolder = cleanString(req.body?.account_holder, 100);
  const MIN_WITHDRAWAL = 50000;
  const TRANSFER_FEE = 3000;

  if (amount < MIN_WITHDRAWAL || !bankOrEwallet || !accountNumber || !accountHolder) {
    return res.status(400).json({
      error: 'Minimal penarikan saldo Rp 50.000 serta nama bank/e-wallet, nomor rekening, dan nama pemilik wajib diisi.',
    });
  }

  const netAmount = Math.max(0, amount - TRANSFER_FEE);

  const withdrawTx = db.transaction(() => {
    const userRow = db.prepare(`SELECT wallet_available FROM users WHERE id = ?`).get(userId) as {
      wallet_available: number;
    };
    if (userRow.wallet_available < amount) {
      throw new Error('Saldo tersedia tidak mencukupi untuk jumlah pencairan ini.');
    }

    const wdId = uid('wd');
    const ts = nowIso();
    db.prepare(`UPDATE users SET wallet_available = wallet_available - ?, wallet_pending = wallet_pending + ? WHERE id = ?`).run(
      amount,
      amount,
      userId
    );
    db.prepare(
      `INSERT INTO withdrawals (id, user_id, amount, transfer_fee, net_amount, bank_or_ewallet, account_number, account_holder, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending', ?)`
    ).run(wdId, userId, amount, TRANSFER_FEE, netAmount, bankOrEwallet, accountNumber, accountHolder, ts);

    db.prepare(
      `INSERT INTO wallet_transactions (id, user_id, type, amount, reference_id, description, created_at)
       VALUES (?, ?, 'withdrawal_request', ?, ?, ?, ?)`
    ).run(
      uid('wt'),
      userId,
      -amount,
      wdId,
      `Penarikan ke ${bankOrEwallet} (${accountNumber}) · Biaya transfer Rp ${TRANSFER_FEE.toLocaleString('id-ID')} · Diterima Rp ${netAmount.toLocaleString('id-ID')}`,
      ts
    );

    notifyAdminsAndBuyer({
      buyerUserId: userId,
      buyerEmail: req.authUser!.email,
      buyerEventType: 'withdrawal',
      buyerTitle: 'Permintaan Penarikan Dana Diajukan',
      buyerMessage: `Penarikan Rp ${amount.toLocaleString('id-ID')} (biaya transfer Rp ${TRANSFER_FEE.toLocaleString('id-ID')}, dana bersih Rp ${netAmount.toLocaleString('id-ID')}) ke ${bankOrEwallet} sedang diproses admin.`,
      adminEventType: 'admin_withdrawal',
      adminTitle: `Pengajuan Penarikan Dana Baru (Rp ${amount.toLocaleString('id-ID')})`,
      adminMessage: `${req.authUser!.name} (${req.authUser!.email}) mengajukan penarikan ke ${bankOrEwallet} ${accountNumber} a.n. ${accountHolder}. Transfer bersih: Rp ${netAmount.toLocaleString('id-ID')}.`,
    });

    return wdId;
  });

  try {
    const withdrawalId = withdrawTx();
    res.status(201).json({ ok: true, withdrawalId, transfer_fee: TRANSFER_FEE, net_amount: netAmount });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memproses pencairan.' });
  }
});

// ==========================================
// 8. CREATOR STUDIO & WD.UP AI
// ==========================================

app.get('/api/creator-studio/tools', requireAuth, (req: AuthRequest, res) => {
  const tools = (
    db
      .prepare(`SELECT * FROM creator_tools WHERE is_active = 1 ORDER BY sort_order ASC`)
      .all() as Array<Record<string, unknown>>
  ).map((t) => ({
    ...t,
    config: safeJsonParse(t.config_json, {}),
  }));

  const entries = (
    db
      .prepare(`SELECT * FROM creator_studio_entries WHERE user_id = ? ORDER BY updated_at DESC LIMIT 80`)
      .all(req.authUser!.id) as Array<Record<string, unknown>>
  ).map((e) => ({
    ...e,
    payload: safeJsonParse(e.payload_json, {}),
  }));

  res.json({ tools, entries });
});

app.post('/api/creator-studio/entries', requireAuth, (req: AuthRequest, res) => {
  const toolSlug = cleanSlug(cleanString(req.body?.tool_slug, 60));
  const title = cleanString(req.body?.title, 160);
  const payload = typeof req.body?.payload === 'object' && req.body.payload !== null ? req.body.payload : {};

  if (!toolSlug || !title) {
    return res.status(400).json({ error: 'Tool dan judul catatan wajib diisi.' });
  }

  const id = uid('cse');
  const ts = nowIso();
  db.prepare(
    `INSERT INTO creator_studio_entries (id, user_id, tool_slug, title, payload_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, req.authUser!.id, toolSlug, title, JSON.stringify(payload), ts, ts);

  res.status(201).json({
    entry: {
      id,
      user_id: req.authUser!.id,
      tool_slug: toolSlug,
      title,
      payload,
      created_at: ts,
      updated_at: ts,
    },
  });
});

app.delete('/api/creator-studio/entries/:id', requireAuth, (req: AuthRequest, res) => {
  db.prepare(`DELETE FROM creator_studio_entries WHERE id = ? AND user_id = ?`).run(
    req.params.id,
    req.authUser!.id
  );
  res.json({ ok: true });
});

app.post('/api/creator-studio/ai-generate', requireAuth, async (req: AuthRequest, res) => {
  const mode = cleanString(req.body?.mode, 80) || 'Hook & Skrip Video';
  const topic = cleanString(req.body?.topic, 400);
  const audience = cleanString(req.body?.audience, 200);
  const tone = cleanString(req.body?.tone, 100);

  if (!topic) {
    return res.status(400).json({ error: 'Topik atau nama produk wajib diisi.' });
  }

  try {
    const result = await generateCreatorContent({ mode, topic, audience, tone });
    res.json({ result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal menghubungi layanan AI.';
    res.status(502).json({ error: msg });
  }
});

app.post('/api/ai/assistant', optionalAuth, async (req: AuthRequest, res) => {
  const question = cleanString(req.body?.question, 1000);
  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'model'; text: string }>)
    : [];

  if (!question) {
    return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  }

  let userContext = null;
  if (req.authUser) {
    const orders = db
      .prepare(`SELECT order_code, status FROM orders WHERE buyer_user_id = ? ORDER BY created_at DESC LIMIT 3`)
      .all(req.authUser.id) as Array<{ order_code: string; status: string }>;
    const enrollmentsCount = (
      db.prepare(`SELECT COUNT(*) as c FROM enrollments WHERE user_id = ?`).get(req.authUser.id) as { c: number }
    ).c;
    const hasStore = Boolean(
      db.prepare(`SELECT id FROM stores WHERE user_id = ?`).get(req.authUser.id)
    );
    userContext = {
      name: req.authUser.name,
      role: req.authUser.role,
      ordersSummary: orders.map((o) => `${o.order_code}: ${o.status}`).join(', '),
      enrollmentsCount,
      hasStore,
    };
  }

  try {
    const answer = await askWdupAssistant({ question, history, userContext });
    res.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Layanan WD.UP AI sedang tidak tersedia.';
    res.status(502).json({ error: msg });
  }
});

// ==========================================
// 9. ADMIN & EDITOR DASHBOARD (ROLE GATED)
// ==========================================

app.get('/api/admin/overview', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  const role = req.authUser!.role;
  const usersCount = (db.prepare(`SELECT COUNT(*) as c FROM users`).get() as { c: number }).c;
  const storesCount = (db.prepare(`SELECT COUNT(*) as c FROM stores`).get() as { c: number }).c;
  const productsCount = (db.prepare(`SELECT COUNT(*) as c FROM products`).get() as { c: number }).c;
  const classesCount = (db.prepare(`SELECT COUNT(*) as c FROM academy_classes`).get() as { c: number }).c;
  const waitingVerificationCount = (
    db.prepare(`SELECT COUNT(*) as c FROM orders WHERE status = 'Waiting Verification'`).get() as { c: number }
  ).c;
  const paidRevenue = (
    db.prepare(`SELECT COALESCE(SUM(total_amount), 0) as t FROM orders WHERE status = 'Paid'`).get() as { t: number }
  ).t;
  const pendingWithdrawals = (
    db.prepare(`SELECT COUNT(*) as c FROM withdrawals WHERE status = 'Pending'`).get() as { c: number }
  ).c;
  const pendingSubmissions = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM worksheets_assignments WHERE worksheet_status = 'submitted' OR assignment_status = 'submitted'`
      )
      .get() as { c: number }
  ).c;

  res.json({
    role,
    editor_permissions: req.authUser!.editor_permissions,
    stats: {
      usersCount,
      storesCount,
      productsCount,
      classesCount,
      waitingVerificationCount: role === 'admin' ? waitingVerificationCount : 0,
      paidRevenue: role === 'admin' ? paidRevenue : 0,
      pendingWithdrawals: role === 'admin' ? pendingWithdrawals : 0,
      pendingSubmissions,
    },
  });
});

// --- Editor + Admin: Home CMS ---
app.get('/api/admin/cms', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
  const items = db.prepare(`SELECT * FROM home_cms_items ORDER BY section_type ASC, sort_order ASC`).all();
  res.json({ items });
});

app.post('/api/admin/cms', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
  const mediaCheck = validateHomeCmsMedia((req.body || {}) as Record<string, unknown>);
  if (mediaCheck.error) return res.status(400).json({ error: mediaCheck.error });

  const id = uid('cms');
  db.prepare(
    `INSERT INTO home_cms_items (id, section_type, title, subtitle, body, image_url, media_type, media_url, link_url, cta_label, cta_target, accent_color, icon_name, sort_order, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(
    id,
    cleanString(req.body?.section_type, 40) || 'banner',
    cleanString(req.body?.title, 160),
    cleanString(req.body?.subtitle, 160),
    cleanString(req.body?.body, 1000),
    mediaCheck.imageUrl || (mediaCheck.mediaType === 'image' ? '/src/assets/images/hero_wdup_banner_1795359344577.jpg' : ''),
    mediaCheck.mediaType,
    mediaCheck.mediaUrl,
    mediaCheck.linkUrl,
    cleanString(req.body?.cta_label, 60),
    cleanString(req.body?.cta_target, 300),
    cleanString(req.body?.accent_color, 30) || 'sage',
    Number(req.body?.sort_order || 1),
    req.body?.is_active === 0 ? 0 : 1
  );
  res.status(201).json({ item: db.prepare(`SELECT * FROM home_cms_items WHERE id = ?`).get(id) });
});

app.put('/api/admin/cms/:id', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
  const existing = db.prepare(`SELECT * FROM home_cms_items WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Konten CMS tidak ditemukan.' });

  const mediaCheck = validateHomeCmsMedia((req.body || {}) as Record<string, unknown>, existing);
  if (mediaCheck.error) return res.status(400).json({ error: mediaCheck.error });

  db.prepare(
    `UPDATE home_cms_items
     SET title = ?, subtitle = ?, body = ?, image_url = ?, media_type = ?, media_url = ?, link_url = ?, cta_label = ?, cta_target = ?, accent_color = ?, icon_name = '', sort_order = ?, is_active = ?
     WHERE id = ?`
  ).run(
    cleanString(req.body?.title, 160) || existing.title,
    req.body?.subtitle !== undefined ? cleanString(req.body.subtitle, 160) : existing.subtitle,
    req.body?.body !== undefined ? cleanString(req.body.body, 1000) : existing.body,
    mediaCheck.imageUrl,
    mediaCheck.mediaType,
    mediaCheck.mediaUrl,
    mediaCheck.linkUrl,
    req.body?.cta_label !== undefined ? cleanString(req.body.cta_label, 60) : existing.cta_label,
    req.body?.cta_target !== undefined ? cleanString(req.body.cta_target, 300) : existing.cta_target,
    cleanString(req.body?.accent_color, 30) || existing.accent_color,
    req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order,
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );
  res.json({ item: db.prepare(`SELECT * FROM home_cms_items WHERE id = ?`).get(req.params.id) });
});

app.delete('/api/admin/cms/:id', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
  db.prepare(`DELETE FROM home_cms_items WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// --- Mentor & Admin: Academy Management, Quiz Editor (Min 5), Active Group Link & Grading ---
app.get('/api/mentor/classes', requireAuth, requireMentorOrAdmin, (_req, res) => {
  const classes = db
    .prepare(
      `SELECT c.*, cat.name as category_name, p.title as program_title
       FROM academy_classes c
       JOIN academy_categories cat ON cat.id = c.category_id
       JOIN academy_programs p ON p.id = c.program_id
       ORDER BY c.created_at ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = classes.map((cls) => {
    const mods = (
      db.prepare(`SELECT * FROM academy_modules WHERE class_id = ? ORDER BY sort_order ASC`).all(cls.id) as Array<
        Record<string, unknown>
      >
    ).map((m) => ({
      id: m.id,
      class_id: m.class_id,
      sort_order: m.sort_order,
      title: m.title,
      duration_minutes: m.duration_minutes,
      quiz_questions: safeJsonParse(m.quiz_questions, []),
    }));
    return {
      ...cls,
      objectives: safeJsonParse(cls.objectives, []),
      modules: mods,
    };
  });
  res.json({ classes: enriched });
});

app.put('/api/mentor/classes/:classId/group-link', requireAuth, requireMentorOrAdmin, (req, res) => {
  const cls = db.prepare(`SELECT id FROM academy_classes WHERE id = ?`).get(req.params.classId) as
    | { id: string }
    | undefined;
  if (!cls) return res.status(404).json({ error: 'Kelas tidak ditemukan.' });

  const rawGroupLink = cleanString(req.body?.group_link, 600);
  const groupLink = rawGroupLink ? cleanHttpUrl(rawGroupLink, 600) : '';
  if (rawGroupLink && !groupLink) {
    return res.status(400).json({ error: 'Link grup WD.UP Academy harus berupa URL http:// atau https:// yang valid.' });
  }
  const durationNote = cleanString(req.body?.group_duration_note, 240);

  db.prepare(`UPDATE academy_classes SET group_link = ?, group_duration_note = ? WHERE id = ?`).run(
    groupLink,
    durationNote,
    req.params.classId
  );

  res.json({
    ok: true,
    group_link: groupLink,
    group_duration_note: durationNote,
  });
});

app.put('/api/mentor/modules/:moduleId/quiz', requireAuth, requireMentorOrAdmin, (req, res) => {
  const mod = db.prepare(`SELECT id FROM academy_modules WHERE id = ?`).get(req.params.moduleId) as
    | { id: string }
    | undefined;
  if (!mod) return res.status(404).json({ error: 'Modul tidak ditemukan.' });

  const rawQuestions = Array.isArray(req.body?.questions) ? req.body.questions : [];
  if (rawQuestions.length < 5) {
    return res.status(400).json({ error: 'Quiz pemahaman wajib memiliki minimal 5 pertanyaan.' });
  }

  const normalized: Array<{ id: string; question: string; options: string[]; correctIndex: number }> = [];
  for (let i = 0; i < rawQuestions.length; i++) {
    const q = rawQuestions[i] as Record<string, unknown>;
    const text = cleanString(q?.question, 400);
    const rawOpts = Array.isArray(q?.options) ? q.options.map((o) => cleanString(o, 240)).filter(Boolean) : [];
    const correctIndex = Math.round(Number(q?.correctIndex ?? 0));
    if (!text) {
      return res.status(400).json({ error: `Pertanyaan quiz nomor ${i + 1} tidak boleh kosong.` });
    }
    if (rawOpts.length < 2) {
      return res.status(400).json({ error: `Pertanyaan quiz nomor ${i + 1} wajib memiliki minimal 2 pilihan jawaban.` });
    }
    if (!Number.isFinite(correctIndex) || correctIndex < 0 || correctIndex >= rawOpts.length) {
      return res.status(400).json({ error: `Jawaban benar pada pertanyaan nomor ${i + 1} tidak valid.` });
    }
    normalized.push({
      id: cleanString(q?.id, 30) || `q${i + 1}`,
      question: text,
      options: rawOpts,
      correctIndex,
    });
  }

  db.prepare(`UPDATE academy_modules SET quiz_questions = ? WHERE id = ?`).run(
    JSON.stringify(normalized),
    req.params.moduleId
  );

  res.json({ ok: true, quiz_questions: normalized });
});

function queryAcademySubmissions() {
  return (
    db
      .prepare(
        `SELECT wa.*, u.name as student_name, u.email as student_email,
                c.title as class_title, m.title as module_title, m.quiz_questions as module_quiz_questions
         FROM worksheets_assignments wa
         JOIN users u ON u.id = wa.user_id
         JOIN academy_classes c ON c.id = wa.class_id
         JOIN academy_modules m ON m.id = wa.module_id
         ORDER BY wa.updated_at DESC`
      )
      .all() as Array<Record<string, unknown>>
  ).map((s) => ({
    ...s,
    quiz_answers: safeJsonParse<number[]>(s.quiz_answers, []),
    quiz_questions: safeJsonParse<Array<{ id: string; question: string; options: string[]; correctIndex: number }>>(
      s.module_quiz_questions,
      []
    ),
    feedback_history: safeJsonParse(s.feedback_history, []),
  }));
}

app.get('/api/mentor/submissions', requireAuth, requireMentorOrAdmin, (_req, res) => {
  res.json({ submissions: queryAcademySubmissions() });
});

app.post('/api/mentor/submissions/:id/grade', requireAuth, requireMentorOrAdmin, (req: AuthRequest, res) => {
  const sub = db.prepare(`SELECT * FROM worksheets_assignments WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!sub) return res.status(404).json({ error: 'Submisi tidak ditemukan.' });

  const grade = req.body?.grade !== undefined && req.body?.grade !== null && req.body?.grade !== ''
    ? Math.min(100, Math.max(0, Math.round(Number(req.body.grade))))
    : null;
  const feedback = cleanString(req.body?.mentor_feedback, 1500);
  const worksheetStatus = cleanString(req.body?.worksheet_status, 30) || (sub.worksheet_status as string);
  const assignmentStatus = cleanString(req.body?.assignment_status, 30) || (sub.assignment_status as string);
  const ts = nowIso();

  const history = safeJsonParse<Array<Record<string, unknown>>>(sub.feedback_history, []);
  history.push({
    at: ts,
    by: `${req.authUser!.name} (${req.authUser!.role === 'admin' ? 'Admin' : 'Mentor'})`,
    status: worksheetStatus === 'revision_requested' || assignmentStatus === 'revision_requested' ? 'Perlu Revisi' : 'Dinilai Mentor',
    note: feedback || 'Penilaian diperbarui oleh mentor.',
    grade,
  });

  db.prepare(
    `UPDATE worksheets_assignments
     SET grade = ?, mentor_feedback = ?, worksheet_status = ?, assignment_status = ?, feedback_history = ?, updated_at = ?
     WHERE id = ?`
  ).run(grade, feedback, worksheetStatus, assignmentStatus, JSON.stringify(history), ts, req.params.id);

  logNotification({
    userId: sub.user_id as string,
    eventType: 'mentor_feedback',
    title: 'Feedback & Penilaian Mentor Tersedia',
    message: `Mentor telah memberikan tanggapan${grade !== null ? ` (Nilai: ${grade})` : ''}: "${feedback.slice(0, 120)}"`,
  });

  res.json({ ok: true });
});

// --- Editor + Admin: Academy Management & Mentor Grading ---
app.get('/api/admin/academy/submissions', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'academy')) return res.status(403).json({ error: 'Tidak ada izin Academy.' });
  res.json({ submissions: queryAcademySubmissions() });
});

app.post('/api/admin/academy/submissions/:id/grade', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'academy')) return res.status(403).json({ error: 'Tidak ada izin Academy.' });
  const sub = db.prepare(`SELECT * FROM worksheets_assignments WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!sub) return res.status(404).json({ error: 'Submisi tidak ditemukan.' });

  const grade = req.body?.grade !== undefined ? Math.min(100, Math.max(0, Math.round(Number(req.body.grade)))) : null;
  const feedback = cleanString(req.body?.mentor_feedback, 1500);
  const worksheetStatus = cleanString(req.body?.worksheet_status, 30) || (sub.worksheet_status as string);
  const assignmentStatus = cleanString(req.body?.assignment_status, 30) || (sub.assignment_status as string);
  const ts = nowIso();

  const history = safeJsonParse<Array<Record<string, unknown>>>(sub.feedback_history, []);
  history.push({
    at: ts,
    by: `${req.authUser!.name} (Mentor)`,
    status: worksheetStatus === 'revision_requested' || assignmentStatus === 'revision_requested' ? 'Perlu Revisi' : 'Dinilai Mentor',
    note: feedback || 'Penilaian diperbarui oleh mentor.',
    grade,
  });

  db.prepare(
    `UPDATE worksheets_assignments
     SET grade = ?, mentor_feedback = ?, worksheet_status = ?, assignment_status = ?, feedback_history = ?, updated_at = ?
     WHERE id = ?`
  ).run(grade, feedback, worksheetStatus, assignmentStatus, JSON.stringify(history), ts, req.params.id);

  logNotification({
    userId: sub.user_id as string,
    eventType: 'mentor_feedback',
    title: 'Feedback & Penilaian Mentor Tersedia',
    message: `Mentor telah memberikan tanggapan${grade !== null ? ` (Nilai: ${grade})` : ''}: "${feedback.slice(0, 120)}"`,
  });

  res.json({ ok: true });
});

app.post('/api/admin/academy/classes', requireAuth, requireRole(['admin', 'editor']), (req: AuthRequest, res) => {
  if (!hasEditorAccess(req, 'academy')) return res.status(403).json({ error: 'Tidak ada izin Academy.' });
  const categoryId = cleanString(req.body?.category_id, 64);
  const programId = cleanString(req.body?.program_id, 64);
  const title = cleanString(req.body?.title, 160);
  const description = cleanString(req.body?.description, 1200);
  const mentorName = cleanString(req.body?.mentor_name, 100) || 'Mentor WD.UP';
  const price = Math.max(0, Math.round(Number(req.body?.price || 0)));
  const rawGroupLink = cleanString(req.body?.group_link, 600);
  const groupLink = rawGroupLink ? cleanHttpUrl(rawGroupLink, 600) : '';
  const groupDurationNote =
    cleanString(req.body?.group_duration_note, 240) || 'Akses grup belajar selama 6 bulan masa aktif';

  if (!categoryId || !programId || !title || price <= 0) {
    return res.status(400).json({ error: 'Kategori, program, judul kelas, dan harga wajib diisi.' });
  }

  const classId = uid('cls');
  const modId = uid('mod');
  db.transaction(() => {
    db.prepare(
      `INSERT INTO academy_classes (id, program_id, category_id, title, description, objectives, mentor_name, price, cover_url, pdf_guide_title, pdf_guide_content, group_link, group_duration_note, certificate_available, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?, 1, ?)`
    ).run(
      classId,
      programId,
      categoryId,
      title,
      description,
      JSON.stringify(['Memahami konsep inti kelas', 'Mempraktikkan studi kasus nyata melalui worksheet']),
      mentorName,
      price,
      '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      groupLink,
      groupDurationNote,
      nowIso()
    );

    db.prepare(
      `INSERT INTO academy_modules (id, class_id, sort_order, title, duration_minutes, video_title, video_summary, video_script_captions, text_material, interactive_exercise_prompt, interactive_exercise_choices, worksheet_prompt, assignment_prompt, quiz_questions)
       VALUES (?, ?, 1, ?, 15, ?, ?, ?, ?, '', '[]', ?, ?, ?)`
    ).run(
      modId,
      classId,
      'Modul 1: Pengantar & Kerangka Praktik',
      `Video Pembelajaran — ${title}`,
      description.slice(0, 180),
      JSON.stringify([{ time: '00:00', heading: 'Pengantar Kelas', text: description }]),
      description,
      'Tuliskan rencana aksi pribadi Anda setelah mempelajari modul ini:',
      'Kumpulkan hasil praktik pertama Anda (teks atau tautan aktif karya):',
      JSON.stringify([
        { id: 'q1', question: `Apa tujuan utama mempelajari ${title}?`, options: ['Menghasilkan karya dan sistem kerja nyata', 'Hanya membaca teori tanpa praktik'], correctIndex: 0 },
        { id: 'q2', question: 'Langkah pertama sebelum mengeksekusi proyek digital adalah...', options: ['Memahami kebutuhan spesifik audiens target', 'Langsung promosi tanpa rencana'], correctIndex: 0 },
        { id: 'q3', question: 'Mengapa worksheet perlu diisi berurutan?', options: ['Agar ide tersusun sistematis dan siap dipraktikkan', 'Tidak memiliki fungsi'], correctIndex: 0 },
        { id: 'q4', question: 'Apa manfaat mengirimkan tautan tugas ke mentor?', options: ['Mendapatkan masukan terarah untuk perbaikan karya', 'Menghapus progres belajar'], correctIndex: 0 },
        { id: 'q5', question: 'Bagaimana menjaga konsistensi setelah menyelesaikan modul 1?', options: ['Menerapkan jadwal praktik rutin dan berdiskusi di grup kelas', 'Berhenti di materi pengantar'], correctIndex: 0 },
      ])
    );
  })();

  res.status(201).json({ classId });
});

// --- Admin Only: Users, Roles, Mentor ACC & Access Codes ---
app.get('/api/admin/users', requireAuth, requireRole(['admin']), (_req, res) => {
  const users = (
    db
      .prepare(
        `SELECT id, name, email, whatsapp, role, COALESCE(mentor_status, 'none') as mentor_status, editor_permissions, wallet_available, wallet_pending, pro_plan, pro_expires_at, created_at
         FROM users
         WHERE password_hash != 'showcase_only_locked'
         ORDER BY created_at DESC`
      )
      .all() as Array<Record<string, unknown>>
  ).map((u) => ({
    ...u,
    is_pro: isUserProActive(u.pro_expires_at as string | null),
    editor_permissions: safeJsonParse<string[]>(u.editor_permissions, []),
  }));
  res.json({ users });
});

app.put('/api/admin/users/:id/pro', requireAuth, requireRole(['admin']), (req, res) => {
  const planId = cleanString(req.body?.plan_id, 30);
  if (!planId || planId === 'none') {
    db.prepare(`UPDATE users SET pro_plan = '', pro_expires_at = NULL WHERE id = ?`).run(req.params.id);
    return res.json({ ok: true });
  }
  if (!(planId in PRO_PLANS)) {
    return res.status(400).json({ error: 'Paket Pro tidak valid.' });
  }
  const plan = PRO_PLANS[planId as ProPlanId];
  const ts = nowIso();
  const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`UPDATE users SET pro_plan = ?, pro_expires_at = ? WHERE id = ?`).run(plan.id, expiresAt, req.params.id);
  db.prepare(
    `INSERT INTO pro_subscriptions (id, user_id, plan_id, plan_name, price, duration_days, order_id, started_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(uid('pro'), req.params.id, plan.id, plan.name, plan.price, plan.duration_days, ts, expiresAt, ts);
  res.json({ ok: true, pro_expires_at: expiresAt });
});

app.put('/api/admin/users/:id/role', requireAuth, requireRole(['admin']), (req: AuthRequest, res) => {
  const role = req.body?.role;
  if (!['member', 'editor', 'mentor', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Role tidak valid.' });
  }
  if (req.params.id === req.authUser!.id && role !== 'admin') {
    return res.status(400).json({ error: 'Anda tidak dapat menurunkan role Admin akun Anda sendiri.' });
  }
  const permissions = Array.isArray(req.body?.editor_permissions) ? req.body.editor_permissions : [];
  const mentorStatus =
    role === 'mentor'
      ? ['pending', 'approved', 'rejected'].includes(req.body?.mentor_status)
        ? req.body.mentor_status
        : 'approved'
      : 'none';
  db.prepare(`UPDATE users SET role = ?, mentor_status = ?, editor_permissions = ? WHERE id = ?`).run(
    role,
    mentorStatus,
    JSON.stringify(permissions),
    req.params.id
  );
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/mentor-status', requireAuth, requireRole(['admin']), (req, res) => {
  const status = cleanString(req.body?.mentor_status, 20);
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return res.status(400).json({ error: 'Status persetujuan Mentor tidak valid.' });
  }
  const target = db.prepare(`SELECT id, name, email, whatsapp FROM users WHERE id = ?`).get(req.params.id) as
    | { id: string; name: string; email: string; whatsapp: string }
    | undefined;
  if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

  const nextRole = status === 'approved' ? 'mentor' : status === 'rejected' ? 'member' : 'mentor';
  db.prepare(`UPDATE users SET role = ?, mentor_status = ? WHERE id = ?`).run(nextRole, status, target.id);

  logNotification({
    userId: target.id,
    eventType: 'mentor_approval',
    title: status === 'approved' ? 'Akses Mentor WD.UP Disetujui (ACC)' : 'Pembaruan Status Mentor WD.UP',
    message:
      status === 'approved'
        ? `Selamat ${target.name}, akun Mentor Anda telah di-ACC Admin! Anda sekarang dapat mengelola Quiz Pemahaman, Link Grup Kelas, dan menilai tugas di Panel Mentor.`
        : status === 'rejected'
        ? `Mohon maaf ${target.name}, pengajuan akun Mentor Anda belum disetujui saat ini.`
        : `Status Mentor Anda diatur ke Menunggu ACC Admin.`,
    overrideEmail: target.email,
    overrideWhatsapp: target.whatsapp,
  });

  res.json({ ok: true, mentor_status: status });
});

app.get('/api/admin/access-codes', requireAuth, requireRole(['admin']), (_req, res) => {
  res.json({
    hasMentorCode: hasRoleAccessCodeConfigured('mentor'),
    hasAdminCode: hasRoleAccessCodeConfigured('admin'),
    envMentorCodeActive: Boolean(process.env.MENTOR_PASSCODE?.trim()),
    envAdminCodeActive: Boolean(process.env.ADMIN_PASSCODE?.trim()),
  });
});

app.put('/api/admin/access-codes', requireAuth, requireRole(['admin']), (req, res) => {
  const mentorCode = typeof req.body?.mentor_code === 'string' ? req.body.mentor_code.trim() : undefined;
  const adminCode = typeof req.body?.admin_code === 'string' ? req.body.admin_code.trim() : undefined;

  const upsert = db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`);
  if (mentorCode !== undefined) {
    if (mentorCode === '') {
      db.prepare(`DELETE FROM system_settings WHERE key = 'mentor_access_code_hash'`).run();
    } else if (mentorCode.length < 4) {
      return res.status(400).json({ error: 'Kode akses Mentor minimal 4 karakter.' });
    } else {
      upsert.run('mentor_access_code_hash', hashPassword(mentorCode));
    }
  }
  if (adminCode !== undefined) {
    if (adminCode === '') {
      db.prepare(`DELETE FROM system_settings WHERE key = 'admin_access_code_hash'`).run();
    } else if (adminCode.length < 4) {
      return res.status(400).json({ error: 'Kode akses Admin minimal 4 karakter.' });
    } else {
      upsert.run('admin_access_code_hash', hashPassword(adminCode));
    }
  }

  res.json({
    ok: true,
    hasMentorCode: hasRoleAccessCodeConfigured('mentor'),
    hasAdminCode: hasRoleAccessCodeConfigured('admin'),
  });
});

// --- Admin Only: Platform Vouchers ---
app.get('/api/admin/vouchers', requireAuth, requireRole(['admin']), (_req, res) => {
  const vouchers = db
    .prepare(
      `SELECT v.*, s.name as store_name
       FROM vouchers v
       LEFT JOIN stores s ON s.id = v.store_id
       ORDER BY v.created_at DESC`
    )
    .all();
  res.json({ vouchers });
});

app.post('/api/admin/vouchers', requireAuth, requireRole(['admin']), (req: AuthRequest, res) => {
  const code = cleanString(req.body?.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const title = cleanString(req.body?.title, 100) || `Voucher WD.UP ${code}`;
  const discountType = req.body?.discount_type === 'percent' ? 'percent' : 'fixed';
  const discountValue = Math.max(1, Math.round(Number(req.body?.discount_value || 0)));
  const minPurchase = Math.max(0, Math.round(Number(req.body?.min_purchase || 0)));
  const maxDiscount = req.body?.max_discount ? Math.max(1000, Math.round(Number(req.body.max_discount))) : null;
  const quotaLimit = req.body?.quota_limit ? Math.max(1, Math.round(Number(req.body.quota_limit))) : null;
  const expiresAt = req.body?.expires_at ? cleanString(req.body.expires_at, 40) : null;

  if (code.length < 3) return res.status(400).json({ error: 'Kode voucher minimal 3 karakter.' });
  if (discountType === 'percent' && discountValue > 100) {
    return res.status(400).json({ error: 'Diskon persentase maksimal 100%.' });
  }
  const dup = db.prepare(`SELECT id FROM vouchers WHERE LOWER(code) = LOWER(?)`).get(code);
  if (dup) return res.status(409).json({ error: 'Kode voucher sudah digunakan.' });

  const id = uid('vch');
  db.prepare(
    `INSERT INTO vouchers (id, code, scope, store_id, owner_user_id, title, discount_type, discount_value, min_purchase, max_discount, quota_limit, used_count, expires_at, is_active, created_at)
     VALUES (?, ?, 'platform', NULL, ?, ?, ?, ?, ?, ?, ?, 0, ?, 1, ?)`
  ).run(id, code, req.authUser!.id, title, discountType, discountValue, minPurchase, maxDiscount, quotaLimit, expiresAt, nowIso());

  res.status(201).json({ voucher: db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(id) });
});

app.put('/api/admin/vouchers/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const existing = db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });

  const title = req.body?.title !== undefined ? cleanString(req.body.title, 100) || (existing.title as string) : (existing.title as string);
  const discountType =
    req.body?.discount_type !== undefined
      ? req.body.discount_type === 'percent'
        ? 'percent'
        : 'fixed'
      : String(existing.discount_type || 'fixed');
  const discountValue =
    req.body?.discount_value !== undefined
      ? Math.max(1, Math.round(Number(req.body.discount_value || 0)))
      : Number(existing.discount_value || 0);
  if (discountType === 'percent' && discountValue > 100) {
    return res.status(400).json({ error: 'Diskon persentase maksimal 100%.' });
  }
  const minPurchase =
    req.body?.min_purchase !== undefined
      ? Math.max(0, Math.round(Number(req.body.min_purchase || 0)))
      : Number(existing.min_purchase || 0);
  const maxDiscount =
    req.body?.max_discount !== undefined
      ? req.body.max_discount === null || req.body.max_discount === ''
        ? null
        : Math.max(1000, Math.round(Number(req.body.max_discount)))
      : (existing.max_discount as number | null);
  const quotaLimit =
    req.body?.quota_limit !== undefined
      ? req.body.quota_limit === null || req.body.quota_limit === ''
        ? null
        : Math.max(1, Math.round(Number(req.body.quota_limit)))
      : (existing.quota_limit as number | null);
  const expiresAt =
    req.body?.expires_at !== undefined
      ? req.body.expires_at
        ? cleanString(req.body.expires_at, 40)
        : null
      : (existing.expires_at as string | null);
  const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

  db.prepare(
    `UPDATE vouchers
     SET title = ?, discount_type = ?, discount_value = ?, min_purchase = ?, max_discount = ?, quota_limit = ?, expires_at = ?, is_active = ?
     WHERE id = ?`
  ).run(title, discountType, discountValue, minPurchase, maxDiscount, quotaLimit, expiresAt, isActive, req.params.id);

  res.json({ ok: true, voucher: db.prepare(`SELECT * FROM vouchers WHERE id = ?`).get(req.params.id) });
});

app.delete('/api/admin/vouchers/:id', requireAuth, requireRole(['admin']), (req, res) => {
  db.prepare(`DELETE FROM vouchers WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// --- Admin Only: Payment Methods & Order Verification ---
app.get('/api/admin/payment-methods', requireAuth, requireRole(['admin']), (_req, res) => {
  res.json({ methods: db.prepare(`SELECT * FROM payment_methods`).all() });
});

app.post('/api/admin/payment-methods', requireAuth, requireRole(['admin']), (req, res) => {
  const providerName = cleanString(req.body?.provider_name, 80);
  const accountNumber = cleanString(req.body?.account_number, 60);
  const accountHolder = cleanString(req.body?.account_holder, 100);
  if (!providerName || !accountNumber || !accountHolder) {
    return res.status(400).json({ error: 'Nama bank/e-wallet, nomor rekening, dan nama pemilik wajib diisi.' });
  }
  const id = uid('pm');
  db.prepare(
    `INSERT INTO payment_methods (id, type, provider_name, account_number, account_holder, instructions, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).run(
    id,
    cleanString(req.body?.type, 30) || 'bank_transfer',
    providerName,
    accountNumber,
    accountHolder,
    cleanString(req.body?.instructions, 500)
  );
  res.status(201).json({ method: db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(id) });
});

app.put('/api/admin/payment-methods/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const existing = db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });

  db.prepare(
    `UPDATE payment_methods SET type = ?, provider_name = ?, account_number = ?, account_holder = ?, instructions = ?, is_active = ? WHERE id = ?`
  ).run(
    cleanString(req.body?.type, 30) || existing.type,
    cleanString(req.body?.provider_name, 80) || existing.provider_name,
    cleanString(req.body?.account_number, 60) || existing.account_number,
    cleanString(req.body?.account_holder, 100) || existing.account_holder,
    req.body?.instructions !== undefined ? cleanString(req.body.instructions, 500) : existing.instructions,
    req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
    req.params.id
  );
  res.json({ method: db.prepare(`SELECT * FROM payment_methods WHERE id = ?`).get(req.params.id) });
});

app.delete('/api/admin/payment-methods/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const existing = db.prepare(`SELECT id FROM payment_methods WHERE id = ?`).get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });

  db.transaction(() => {
    db.prepare(`UPDATE orders SET payment_method_id = NULL WHERE payment_method_id = ?`).run(req.params.id);
    db.prepare(`DELETE FROM payment_methods WHERE id = ?`).run(req.params.id);
  })();
  res.json({ ok: true });
});

app.get('/api/admin/orders', requireAuth, requireRole(['admin']), (_req, res) => {
  const orders = db
    .prepare(
      `SELECT o.*, u.name as buyer_name, COALESCE(NULLIF(o.buyer_email, ''), u.email) as buyer_email, COALESCE(NULLIF(o.buyer_whatsapp, ''), u.whatsapp) as buyer_whatsapp,
              pm.provider_name, p.sender_name, p.transfer_reference, p.proof_image_data, p.proof_note, p.submitted_at, p.verification_note
       FROM orders o
       JOIN users u ON u.id = o.buyer_user_id
       LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
       LEFT JOIN payments p ON p.order_id = o.id
       ORDER BY o.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = orders.map((o) => ({
    ...o,
    items: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(o.id),
  }));
  res.json({ orders: enriched });
});

app.post('/api/admin/orders/:id/verify', requireAuth, requireRole(['admin']), (req: AuthRequest, res) => {
  const targetStatus = req.body?.status;
  const verificationNote = cleanString(req.body?.verification_note, 300);

  if (!['Paid', 'Rejected', 'Cancelled', 'Refunded'].includes(targetStatus)) {
    return res.status(400).json({ error: 'Status verifikasi tidak valid.' });
  }

  const verifyTx = db.transaction(() => {
    const order = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!order) throw new Error('Pesanan tidak ditemukan.');

    if (order.status === 'Paid' && targetStatus === 'Paid') {
      throw new Error('Pesanan sudah terverifikasi Paid sebelumnya (mencegah transaksi ganda).');
    }

    const buyerRow = db.prepare(`SELECT name, email, whatsapp FROM users WHERE id = ?`).get(order.buyer_user_id) as
      | { name: string; email: string; whatsapp: string }
      | undefined;
    const effectiveBuyerEmail = (order.buyer_email as string) || buyerRow?.email || '';
    const effectiveBuyerWhatsapp = (order.buyer_whatsapp as string) || buyerRow?.whatsapp || '';

    const ts = nowIso();
    db.prepare(`UPDATE orders SET status = ?, updated_at = ? WHERE id = ?`).run(targetStatus, ts, order.id);
    db.prepare(
      `UPDATE payments SET verified_by_user_id = ?, verification_note = ?, verified_at = ? WHERE order_id = ?`
    ).run(req.authUser!.id, verificationNote, ts, order.id);

    if (targetStatus === 'Paid') {
      const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(order.id) as Array<
        Record<string, unknown>
      >;

      for (const item of items) {
        if (item.item_type === 'class') {
          const cls = db.prepare(`SELECT program_id FROM academy_classes WHERE id = ?`).get(item.item_id) as
            | { program_id: string }
            | undefined;
          db.prepare(
            `INSERT OR IGNORE INTO enrollments (id, user_id, class_id, program_id, order_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`
          ).run(uid('enr'), order.buyer_user_id, item.item_id, cls?.program_id || null, order.id, ts);
        } else if (item.item_type === 'program') {
          const classes = db
            .prepare(`SELECT id FROM academy_classes WHERE program_id = ?`)
            .all(item.item_id) as Array<{ id: string }>;
          for (const cl of classes) {
            db.prepare(
              `INSERT OR IGNORE INTO enrollments (id, user_id, class_id, program_id, order_id, created_at)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(uid('enr'), order.buyer_user_id, cl.id, item.item_id, order.id, ts);
          }
        } else if (item.item_type === 'pro_plan') {
          const plan = PRO_PLANS[(item.item_id as ProPlanId) in PRO_PLANS ? (item.item_id as ProPlanId) : 'pro_1m'];
          const curUser = db
            .prepare(`SELECT pro_expires_at FROM users WHERE id = ?`)
            .get(order.buyer_user_id) as { pro_expires_at: string | null } | undefined;
          const baseMs =
            curUser?.pro_expires_at && Date.parse(curUser.pro_expires_at) > Date.now()
              ? Date.parse(curUser.pro_expires_at)
              : Date.now();
          const nextExpiresAt = new Date(baseMs + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

          db.prepare(`UPDATE users SET pro_plan = ?, pro_expires_at = ? WHERE id = ?`).run(
            plan.id,
            nextExpiresAt,
            order.buyer_user_id
          );
          db.prepare(
            `INSERT INTO pro_subscriptions (id, user_id, plan_id, plan_name, price, duration_days, order_id, started_at, expires_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
            uid('pro'),
            order.buyer_user_id,
            plan.id,
            plan.name,
            plan.price,
            plan.duration_days,
            order.id,
            ts,
            nextExpiresAt,
            ts
          );
        } else if (item.item_type === 'product') {
          db.prepare(`UPDATE products SET sales_count = sales_count + ? WHERE id = ?`).run(
            Number(item.quantity),
            item.item_id
          );

          const subtotal = Number(item.subtotal);
          let commissionAmt = 0;

          if (item.affiliate_user_id && Number(item.affiliate_commission_pct) > 0) {
            commissionAmt = Math.round((subtotal * Number(item.affiliate_commission_pct)) / 100);
            const existingComm = db
              .prepare(`SELECT id FROM commissions WHERE order_item_id = ?`)
              .get(item.id);
            if (!existingComm && commissionAmt > 0) {
              db.prepare(
                `INSERT INTO commissions (id, order_id, order_item_id, affiliate_user_id, seller_user_id, amount, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, 'credited', ?)`
              ).run(
                uid('com'),
                order.id,
                item.id,
                item.affiliate_user_id,
                item.seller_user_id,
                commissionAmt,
                ts
              );

              db.prepare(`UPDATE users SET wallet_available = wallet_available + ? WHERE id = ?`).run(
                commissionAmt,
                item.affiliate_user_id
              );

              db.prepare(
                `INSERT INTO wallet_transactions (id, user_id, type, amount, reference_id, description, created_at)
                 VALUES (?, ?, 'affiliate_commission', ?, ?, ?, ?)`
              ).run(
                uid('wt'),
                item.affiliate_user_id,
                commissionAmt,
                order.id as string,
                `Komisi affiliate dari pesanan ${order.order_code} (${item.title})`,
                ts
              );

              logNotification({
                userId: item.affiliate_user_id as string,
                eventType: 'affiliate_commission',
                title: 'Komisi Affiliate Tercatat',
                message: `Komisi sebesar Rp ${commissionAmt.toLocaleString('id-ID')} dari pesanan ${order.order_code} telah masuk ke saldo tersedia Anda.`,
              });
            }
          }

          if (item.seller_user_id && item.seller_user_id !== 'usr_wdup_official') {
            const sellerRow = db
              .prepare(`SELECT pro_expires_at FROM users WHERE id = ?`)
              .get(item.seller_user_id) as { pro_expires_at: string | null } | undefined;
            const sellerIsPro = isUserProActive(sellerRow?.pro_expires_at);
            const platformFee = sellerIsPro ? 0 : Math.round(subtotal * 0.05);
            const sellerNet = Math.max(0, subtotal - platformFee - commissionAmt);

            db.prepare(`UPDATE order_items SET platform_fee_amount = ?, seller_net_amount = ? WHERE id = ?`).run(
              platformFee,
              sellerNet,
              item.id
            );

            db.prepare(`UPDATE users SET wallet_available = wallet_available + ? WHERE id = ?`).run(
              sellerNet,
              item.seller_user_id
            );
            const feeNote = sellerIsPro
              ? 'Biaya transaksi 0% (Member Pro)'
              : `Potongan 5% Rp ${platformFee.toLocaleString('id-ID')}`;
            db.prepare(
              `INSERT INTO wallet_transactions (id, user_id, type, amount, reference_id, description, created_at)
               VALUES (?, ?, 'sale_income', ?, ?, ?, ?)`
            ).run(
              uid('wt'),
              item.seller_user_id,
              sellerNet,
              order.id as string,
              `Penjualan ${item.title} (${order.order_code}) · ${feeNote}`,
              ts
            );

            logNotification({
              userId: item.seller_user_id as string,
              eventType: 'seller_order',
              title: `Pesanan Baru Terverifikasi (${order.order_code})`,
              message: `Produk "${item.title}" terjual. ${feeNote}. Pendapatan bersih Rp ${sellerNet.toLocaleString('id-ID')} masuk ke saldo toko.`,
            });
          }
        }
      }

      notifyAdminsAndBuyer({
        buyerUserId: order.buyer_user_id as string,
        buyerEmail: effectiveBuyerEmail,
        buyerWhatsapp: effectiveBuyerWhatsapp,
        buyerEventType: 'payment_confirmed',
        buyerTitle: `Pembayaran ${order.order_code} Terverifikasi (Paid)`,
        buyerMessage: `Pembayaran Anda valid! Akses kelas Academy, paket WD.UP Pro, atau produk digital pada pesanan ini telah dibuka otomatis. Salinan konfirmasi dikirim ke ${effectiveBuyerEmail}${effectiveBuyerWhatsapp ? ` & WA ${effectiveBuyerWhatsapp}` : ''}.`,
        adminEventType: 'admin_order_verified',
        adminTitle: `Verifikasi Selesai (Paid): ${order.order_code}`,
        adminMessage: `Order ${order.order_code} (${effectiveBuyerEmail}) telah diverifikasi Paid oleh ${req.authUser!.name}.`,
      });
    } else {
      notifyAdminsAndBuyer({
        buyerUserId: order.buyer_user_id as string,
        buyerEmail: effectiveBuyerEmail,
        buyerWhatsapp: effectiveBuyerWhatsapp,
        buyerEventType: 'payment_status',
        buyerTitle: `Status Pesanan ${order.order_code}: ${targetStatus}`,
        buyerMessage: verificationNote || `Status pesanan diperbarui menjadi ${targetStatus}.`,
        adminEventType: 'admin_order_verified',
        adminTitle: `Update Status Order ${order.order_code}: ${targetStatus}`,
        adminMessage: `Order ${order.order_code} diubah ke ${targetStatus} oleh ${req.authUser!.name}.`,
      });
    }
  });

  try {
    verifyTx();
    res.json({ ok: true, status: targetStatus });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.' });
  }
});

// --- Admin Only: Withdrawals ---
app.get('/api/admin/withdrawals', requireAuth, requireRole(['admin']), (_req, res) => {
  const withdrawals = db
    .prepare(
      `SELECT w.*, u.name as user_name, u.email as user_email
       FROM withdrawals w
       JOIN users u ON u.id = w.user_id
       ORDER BY w.created_at DESC`
    )
    .all();
  res.json({ withdrawals });
});

app.post('/api/admin/withdrawals/:id/process', requireAuth, requireRole(['admin']), (req, res) => {
  const status = req.body?.status;
  const adminNote = cleanString(req.body?.admin_note, 300);
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status pencairan harus Approved atau Rejected.' });
  }

  const processTx = db.transaction(() => {
    const wd = db.prepare(`SELECT * FROM withdrawals WHERE id = ?`).get(req.params.id) as
      | Record<string, unknown>
      | undefined;
    if (!wd) throw new Error('Permintaan pencairan tidak ditemukan.');
    if (wd.status !== 'Pending') throw new Error('Permintaan pencairan sudah diproses sebelumnya.');

    const amount = Number(wd.amount);
    const fee = Number(wd.transfer_fee || 3000);
    const netAmount = Number(wd.net_amount || Math.max(0, amount - fee));
    const ts = nowIso();
    db.prepare(`UPDATE withdrawals SET status = ?, admin_note = ?, processed_at = ? WHERE id = ?`).run(
      status,
      adminNote,
      ts,
      wd.id
    );

    if (status === 'Approved') {
      db.prepare(`UPDATE users SET wallet_pending = MAX(0, wallet_pending - ?) WHERE id = ?`).run(amount, wd.user_id);
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, reference_id, description, created_at)
         VALUES (?, ?, 'withdrawal_paid', ?, ?, ?, ?)`
      ).run(
        uid('wt'),
        wd.user_id,
        0,
        wd.id as string,
        `Pencairan disetujui & ditransfer bersih Rp ${netAmount.toLocaleString('id-ID')} (${wd.bank_or_ewallet}, biaya Rp ${fee.toLocaleString('id-ID')})`,
        ts
      );
    } else {
      db.prepare(
        `UPDATE users SET wallet_pending = MAX(0, wallet_pending - ?), wallet_available = wallet_available + ? WHERE id = ?`
      ).run(amount, amount, wd.user_id);
      db.prepare(
        `INSERT INTO wallet_transactions (id, user_id, type, amount, reference_id, description, created_at)
         VALUES (?, ?, 'withdrawal_rejected', ?, ?, ?, ?)`
      ).run(uid('wt'), wd.user_id, amount, wd.id as string, `Pencairan ditolak, dana dikembalikan ke saldo tersedia`, ts);
    }

    logNotification({
      userId: wd.user_id as string,
      eventType: 'withdrawal',
      title: `Pencairan Dana ${status === 'Approved' ? 'Disetujui' : 'Ditolak'}`,
      message:
        status === 'Approved'
          ? `Dana bersih Rp ${netAmount.toLocaleString('id-ID')} (setelah biaya transfer Rp ${fee.toLocaleString('id-ID')}) telah ditransfer ke ${wd.bank_or_ewallet}.`
          : `Pencairan Rp ${amount.toLocaleString('id-ID')} ditolak (${adminNote || 'Cek detail rekening'}) dan saldo dikembalikan.`,
    });
  });

  try {
    processTx();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memproses pencairan.' });
  }
});

// --- Admin Only: Market & Stores Oversight ---
app.get('/api/admin/market-stores', requireAuth, requireRole(['admin']), (_req, res) => {
  const stores = db.prepare(`SELECT * FROM stores ORDER BY created_at DESC`).all();
  const products = db
    .prepare(
      `SELECT p.*, s.name as store_name FROM products p JOIN stores s ON s.id = p.store_id ORDER BY p.created_at DESC`
    )
    .all();
  res.json({ stores, products });
});

app.put('/api/admin/products/:id/flags', requireAuth, requireRole(['admin']), (req, res) => {
  const isFeatured = req.body?.is_featured ? 1 : 0;
  const isRecommended = req.body?.is_recommended ? 1 : 0;
  const status = cleanString(req.body?.status, 20) || 'active';
  db.prepare(`UPDATE products SET is_featured = ?, is_recommended = ?, status = ? WHERE id = ?`).run(
    isFeatured,
    isRecommended,
    status,
    req.params.id
  );
  res.json({ ok: true });
});

app.put('/api/admin/stores/:id/featured', requireAuth, requireRole(['admin']), (req, res) => {
  const isFeatured = req.body?.is_featured ? 1 : 0;
  db.prepare(`UPDATE stores SET is_featured = ? WHERE id = ?`).run(isFeatured, req.params.id);
  res.json({ ok: true });
});

// --- Admin Only: Official WD.UP Products (published under WD.UP Official store) ---
app.get('/api/admin/official-products', requireAuth, requireRole(['admin']), (_req, res) => {
  const { storeId } = ensureOfficialWdupStore();
  const products = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products WHERE store_id = ? ORDER BY created_at DESC`
    )
    .all(storeId) as Array<Record<string, unknown>>;

  res.json({
    storeId,
    products: products.map((p) => ({ ...p, has_access_file: Boolean(p.has_access_file) })),
  });
});

app.post('/api/admin/official-products', requireAuth, requireRole(['admin']), (req, res) => {
  const { storeId, ownerUserId } = ensureOfficialWdupStore();
  const title = cleanString(req.body?.title, 120);
  const category = cleanString(req.body?.category, 60) || 'Produk digital';
  if (category === 'Produk fisik' || req.body?.is_physical === true) {
    return res.status(400).json({ error: 'Produk fisik dinonaktifkan. Pilih kategori produk digital atau jasa.' });
  }
  const homePillar = cleanString(req.body?.home_pillar, 40) || 'Digital Career';
  const price = Math.max(0, Math.round(Number(req.body?.price || 0)));

  let originalPrice: number | null = null;
  if (req.body?.original_price !== undefined && req.body?.original_price !== null && req.body?.original_price !== '') {
    const parsedOrig = Math.round(Number(req.body.original_price));
    if (!Number.isFinite(parsedOrig) || parsedOrig <= 0) {
      return res.status(400).json({ error: 'Harga awal harus berupa angka lebih dari 0.' });
    }
    if (price <= 0 || price >= parsedOrig) {
      return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
    }
    originalPrice = parsedOrig;
  }

  let quotaLimit: number | null = null;
  if (req.body?.quota_limit !== undefined && req.body?.quota_limit !== null && req.body?.quota_limit !== '') {
    const parsedQuota = Math.round(Number(req.body.quota_limit));
    if (!Number.isFinite(parsedQuota) || parsedQuota < 1) {
      return res.status(400).json({ error: 'Kuota batas minimal 1 unit atau kosongkan jika tanpa batas.' });
    }
    quotaLimit = parsedQuota;
  }

  const rawLandingUrl = cleanString(req.body?.landing_page_url, 1000);
  const landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
  if (rawLandingUrl && !landingPageUrl) {
    return res.status(400).json({ error: 'Link code landing page harus berupa URL http:// atau https:// yang valid.' });
  }

  const coverRes = validateAndCleanMediaUrl(req.body?.image_url, '', 'Gambar Sampul');
  if (coverRes.error) return res.status(400).json({ error: coverRes.error });

  const displayStyle = cleanDisplayStyle(req.body?.display_style, 'classic');
  const description = cleanString(req.body?.description, 4000) || `Produk resmi WD.UP: ${title}`;
  const customLandingHtml = sanitizeCustomHtml(req.body?.custom_landing_html);
  const deliveryContent = cleanString(req.body?.delivery_content, 1000);
  const affiliateEnabled = req.body?.affiliate_enabled === false ? 0 : 1;
  const affiliateCommissionPct = Math.min(50, Math.max(0, Math.round(Number(req.body?.affiliate_commission_pct ?? 15))));
  const isFeatured = req.body?.is_featured ? 1 : 0;
  const isRecommended = req.body?.is_recommended === false ? 0 : 1;

  const accessValidation = validateAccessInput((req.body || {}) as Record<string, unknown>);
  if (accessValidation.error) return res.status(400).json({ error: accessValidation.error });

  if (!title || price <= 0) {
    return res.status(400).json({ error: 'Judul produk dan harga yang valid wajib diisi.' });
  }

  const productId = uid('prd');
  db.prepare(
    `INSERT INTO products (id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price, quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url, delivery_content, access_type, access_url, access_file_data, access_file_name, is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'active', ?)`
  ).run(
    productId,
    storeId,
    ownerUserId,
    title,
    cleanSlug(title) || productId,
    category,
    homePillar,
    price,
    originalPrice,
    quotaLimit,
    landingPageUrl,
    customLandingHtml,
    displayStyle,
    description,
    coverRes.url,
    deliveryContent,
    accessValidation.accessType,
    accessValidation.accessUrl,
    accessValidation.accessFileData,
    accessValidation.accessFileName,
    isFeatured,
    isRecommended,
    affiliateEnabled,
    affiliateCommissionPct,
    nowIso()
  );

  const created = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products WHERE id = ?`
    )
    .get(productId) as Record<string, unknown>;

  res.status(201).json({ product: { ...created, has_access_file: Boolean(created.has_access_file) } });
});

app.put('/api/admin/official-products/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { storeId } = ensureOfficialWdupStore();
  const prod = db.prepare(`SELECT * FROM products WHERE id = ? AND store_id = ?`).get(req.params.id, storeId) as
    | Record<string, unknown>
    | undefined;
  if (!prod) return res.status(404).json({ error: 'Produk resmi WD.UP tidak ditemukan.' });

  const title = cleanString(req.body?.title, 120) || (prod.title as string);
  const category = cleanString(req.body?.category, 60) || (prod.category as string);
  const price = req.body?.price !== undefined ? Math.max(0, Math.round(Number(req.body.price))) : (prod.price as number);

  let originalPrice: number | null =
    prod.original_price !== null && prod.original_price !== undefined ? Number(prod.original_price) : null;
  if (req.body?.original_price !== undefined) {
    if (req.body.original_price === null || req.body.original_price === '') {
      originalPrice = null;
    } else {
      const parsedOrig = Math.round(Number(req.body.original_price));
      if (!Number.isFinite(parsedOrig) || parsedOrig <= 0 || price <= 0 || price >= parsedOrig) {
        return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
      }
      originalPrice = parsedOrig;
    }
  } else if (originalPrice !== null && price >= originalPrice) {
    originalPrice = null;
  }

  let quotaLimit: number | null =
    prod.quota_limit !== null && prod.quota_limit !== undefined ? Number(prod.quota_limit) : null;
  if (req.body?.quota_limit !== undefined) {
    quotaLimit = req.body.quota_limit === null || req.body.quota_limit === '' ? null : Math.max(1, Math.round(Number(req.body.quota_limit)));
  }

  let landingPageUrl = (prod.landing_page_url as string) || '';
  if (req.body?.landing_page_url !== undefined) {
    const rawLandingUrl = cleanString(req.body.landing_page_url, 1000);
    landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
    if (rawLandingUrl && !landingPageUrl) {
      return res.status(400).json({ error: 'Link landing page harus berupa URL http:// atau https:// yang valid.' });
    }
  }

  const coverRes = validateAndCleanMediaUrl(req.body?.image_url, prod.image_url as string, 'Gambar Sampul');
  if (coverRes.error) return res.status(400).json({ error: coverRes.error });

  const displayStyle =
    req.body?.display_style !== undefined
      ? cleanDisplayStyle(req.body.display_style, (prod.display_style as string) || 'classic')
      : ((prod.display_style as string) || 'classic');
  const description =
    req.body?.description !== undefined ? cleanString(req.body.description, 4000) || `Produk resmi WD.UP: ${title}` : (prod.description as string);
  const customLandingHtml =
    req.body?.custom_landing_html !== undefined ? sanitizeCustomHtml(req.body.custom_landing_html) : ((prod.custom_landing_html as string) || '');
  const deliveryContent =
    req.body?.delivery_content !== undefined ? cleanString(req.body.delivery_content, 1000) : (prod.delivery_content as string);
  const isFeatured = req.body?.is_featured !== undefined ? (req.body.is_featured ? 1 : 0) : (prod.is_featured as number);
  const isRecommended = req.body?.is_recommended !== undefined ? (req.body.is_recommended ? 1 : 0) : (prod.is_recommended as number);
  const affiliateEnabled = req.body?.affiliate_enabled !== undefined ? (req.body.affiliate_enabled ? 1 : 0) : (prod.affiliate_enabled as number);
  const affiliateCommissionPct =
    req.body?.affiliate_commission_pct !== undefined
      ? Math.min(50, Math.max(0, Math.round(Number(req.body.affiliate_commission_pct))))
      : (prod.affiliate_commission_pct as number);

  let accessType = prod.access_type as string;
  let accessUrl = prod.access_url as string;
  let accessFileData = prod.access_file_data as string;
  let accessFileName = prod.access_file_name as string;
  if (req.body?.access_type !== undefined || req.body?.access_url !== undefined || req.body?.access_file_data !== undefined) {
    const accessValidation = validateAccessInput({
      access_type: req.body?.access_type ?? prod.access_type,
      access_url: req.body?.access_url ?? prod.access_url,
      access_file_data: req.body?.access_file_data !== undefined ? req.body.access_file_data : prod.access_file_data,
      access_file_name: req.body?.access_file_name ?? prod.access_file_name,
    });
    if (accessValidation.error) return res.status(400).json({ error: accessValidation.error });
    accessType = accessValidation.accessType;
    accessUrl = accessValidation.accessUrl;
    accessFileData = accessValidation.accessFileData;
    accessFileName = accessValidation.accessFileName;
  }

  db.prepare(
    `UPDATE products SET title = ?, category = ?, price = ?, original_price = ?, quota_limit = ?, landing_page_url = ?, custom_landing_html = ?, display_style = ?, description = ?, image_url = ?, delivery_content = ?, access_type = ?, access_url = ?, access_file_data = ?, access_file_name = ?, is_featured = ?, is_recommended = ?, affiliate_enabled = ?, affiliate_commission_pct = ? WHERE id = ? AND store_id = ?`
  ).run(
    title,
    category,
    price,
    originalPrice,
    quotaLimit,
    landingPageUrl,
    customLandingHtml,
    displayStyle,
    description,
    coverRes.url,
    deliveryContent,
    accessType,
    accessUrl,
    accessFileData,
    accessFileName,
    isFeatured,
    isRecommended,
    affiliateEnabled,
    affiliateCommissionPct,
    prod.id,
    storeId
  );

  const updated = db
    .prepare(
      `SELECT id, store_id, owner_user_id, title, slug, category, home_pillar, price, original_price,
              quota_limit, landing_page_url, custom_landing_html, display_style, description, image_url,
              delivery_content, access_type, access_url, access_file_name,
              CASE WHEN access_file_data != '' THEN 1 ELSE 0 END as has_access_file,
              is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct,
              clicks_count, sales_count, status, created_at
       FROM products WHERE id = ?`
    )
    .get(prod.id) as Record<string, unknown>;

  res.json({ product: { ...updated, has_access_file: Boolean(updated.has_access_file) } });
});

app.delete('/api/admin/official-products/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const { storeId } = ensureOfficialWdupStore();
  const info = db.prepare(`DELETE FROM products WHERE id = ? AND store_id = ?`).run(req.params.id, storeId);
  if (info.changes === 0) return res.status(404).json({ error: 'Produk resmi WD.UP tidak ditemukan.' });
  res.json({ ok: true });
});

// --- Admin Only: Modular Creator Studio Tools ---
app.get('/api/admin/creator-tools', requireAuth, requireRole(['admin']), (_req, res) => {
  res.json({ tools: db.prepare(`SELECT * FROM creator_tools ORDER BY sort_order ASC`).all() });
});

app.post('/api/admin/creator-tools', requireAuth, requireRole(['admin']), (req, res) => {
  const name = cleanString(req.body?.name, 80);
  const slug = cleanSlug(cleanString(req.body?.slug, 50) || name);
  const tagline = cleanString(req.body?.tagline, 200);
  const category = cleanString(req.body?.category, 60) || 'Produktivitas';
  const accentColor = cleanString(req.body?.accent_color, 30) || 'sage';
  if (!name || !slug) return res.status(400).json({ error: 'Nama tool wajib diisi.' });

  const id = uid('tool');
  db.prepare(
    `INSERT INTO creator_tools (id, slug, name, tagline, category, icon_name, accent_color, tool_type, config_json, is_active, sort_order)
     VALUES (?, ?, ?, ?, ?, 'Wand2', ?, 'custom_template', ?, 1, 99)`
  ).run(
    id,
    slug,
    name,
    tagline,
    category,
    accentColor,
    JSON.stringify({ promptLabel: cleanString(req.body?.prompt_label, 160) || 'Catatan / Hasil Kerja Anda' })
  );
  res.status(201).json({ tool: db.prepare(`SELECT * FROM creator_tools WHERE id = ?`).get(id) });
});

app.put('/api/admin/creator-tools/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const isActive = req.body?.is_active ? 1 : 0;
  db.prepare(`UPDATE creator_tools SET is_active = ? WHERE id = ?`).run(isActive, req.params.id);
  res.json({ ok: true });
});

// --- Admin Only: Notifications Config & Announcements ---
app.get('/api/admin/notifications', requireAuth, requireRole(['admin']), (_req, res) => {
  const settingsRows = db.prepare(`SELECT key, value FROM system_settings`).all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = {};
  for (const r of settingsRows) settings[r.key] = r.value;
  const logs = db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 60`).all();
  res.json({ settings, logs });
});

app.put('/api/admin/notifications/settings', requireAuth, requireRole(['admin']), (req, res) => {
  const emailActive = req.body?.email_provider_active ? '1' : '0';
  const waActive = req.body?.whatsapp_provider_active ? '1' : '0';
  db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('email_provider_active', ?)`).run(emailActive);
  db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES ('whatsapp_provider_active', ?)`).run(waActive);
  res.json({ ok: true });
});

app.post('/api/admin/announcements', requireAuth, requireRole(['admin']), (req, res) => {
  const title = cleanString(req.body?.title, 120);
  const message = cleanString(req.body?.message, 600);
  if (!title || !message) return res.status(400).json({ error: 'Judul dan pesan pengumuman wajib diisi.' });
  logNotification({ userId: null, eventType: 'announcement', title, message });
  res.status(201).json({ ok: true });
});

// --- Admin Only: WD.UP AI Knowledge Base ---
app.get('/api/admin/knowledge-base', requireAuth, requireRole(['admin']), (_req, res) => {
  res.json({ entries: db.prepare(`SELECT * FROM ai_knowledge_base ORDER BY topic ASC`).all() });
});

app.post('/api/admin/knowledge-base', requireAuth, requireRole(['admin']), (req, res) => {
  const topic = cleanString(req.body?.topic, 80);
  const title = cleanString(req.body?.title, 140);
  const content = cleanString(req.body?.content, 4000);
  if (!topic || !title || !content) return res.status(400).json({ error: 'Topik, judul, dan isi wajib diisi.' });
  const id = uid('kb');
  db.prepare(`INSERT INTO ai_knowledge_base (id, topic, title, content, updated_at) VALUES (?, ?, ?, ?, ?)`).run(
    id,
    topic,
    title,
    content,
    nowIso()
  );
  res.status(201).json({ entry: db.prepare(`SELECT * FROM ai_knowledge_base WHERE id = ?`).get(id) });
});

app.put('/api/admin/knowledge-base/:id', requireAuth, requireRole(['admin']), (req, res) => {
  const topic = cleanString(req.body?.topic, 80);
  const title = cleanString(req.body?.title, 140);
  const content = cleanString(req.body?.content, 4000);
  db.prepare(`UPDATE ai_knowledge_base SET topic = ?, title = ?, content = ?, updated_at = ? WHERE id = ?`).run(
    topic,
    title,
    content,
    nowIso(),
    req.params.id
  );
  res.json({ ok: true });
});

app.delete('/api/admin/knowledge-base/:id', requireAuth, requireRole(['admin']), (req, res) => {
  db.prepare(`DELETE FROM ai_knowledge_base WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// --- Admin Only: Official Site Footer & License Settings ---
app.get('/api/admin/site-footer', requireAuth, requireRole(['admin']), (_req, res) => {
  res.json({ siteFooter: getSiteFooter() });
});

app.put('/api/admin/site-footer', requireAuth, requireRole(['admin']), (req, res) => {
  const fields: Record<string, string> = {
    footer_license_title: cleanString(req.body?.license_title, 200),
    footer_license_number: cleanString(req.body?.license_number, 160),
    footer_copyright: cleanString(req.body?.copyright, 240),
    footer_email: cleanString(req.body?.email, 160),
    footer_whatsapp: cleanString(req.body?.whatsapp, 80),
    footer_address: cleanString(req.body?.address, 200),
    footer_instagram: req.body?.instagram ? cleanHttpUrl(req.body.instagram, 300) : '',
    footer_tiktok: req.body?.tiktok ? cleanHttpUrl(req.body.tiktok, 300) : '',
    footer_youtube: req.body?.youtube ? cleanHttpUrl(req.body.youtube, 300) : '',
    footer_website: req.body?.website ? cleanHttpUrl(req.body.website, 300) : '',
  };

  for (const [label, raw] of [
    ['Instagram', req.body?.instagram],
    ['TikTok', req.body?.tiktok],
    ['YouTube', req.body?.youtube],
    ['Website', req.body?.website],
  ] as const) {
    if (typeof raw === 'string' && raw.trim() && !cleanHttpUrl(raw, 300)) {
      return res.status(400).json({ error: `Tautan ${label} harus menggunakan http:// atau https:// yang valid.` });
    }
  }

  const upsert = db.prepare(`INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(fields)) {
    upsert.run(k, v);
  }
  res.json({ siteFooter: getSiteFooter() });
});

// ==========================================
// 10. GLOBAL JSON ERROR HANDLER & VITE STATIC SERVING
// ==========================================

app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  if (req.path.startsWith('/api/')) {
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Format data permintaan tidak valid.' });
    }
    const msg = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
    return res.status(500).json({ error: msg });
  }
  return next(err);
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    process.env.DISABLE_HMR = 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        watch: null,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found.');
      }
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`WD.UP server listening on http://0.0.0.0:${PORT}`);
  });

  const gracefulShutdown = () => {
    server.close(() => {
      closeDatabase();
      process.exit(0);
    });
    setTimeout(() => {
      closeDatabase();
      process.exit(0);
    }, 1500).unref();
  };

  process.once('SIGINT', gracefulShutdown);
  process.once('SIGTERM', gracefulShutdown);
}

startServer();
