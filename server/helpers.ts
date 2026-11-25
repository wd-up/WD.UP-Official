import crypto from 'crypto';
import type express from 'express';
import { desc, eq, like, sql } from 'drizzle-orm';
import { db } from '../src/db/index.ts';
import {
  academyClasses,
  academyModules,
  enrollments,
  guestEngagements,
  systemSettings,
  userEngagements,
  users,
  vouchers,
  worksheetsAssignments,
} from '../src/db/schema.ts';
import { type AuthRequest, isApprovedMentorOrAdmin, verifyPassword } from './auth.ts';
import { logNotification, nowIso, uid } from './db.ts';

export function cleanString(v: unknown, maxLen = 500): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

export function cleanSlug(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '')
    .slice(0, 40);
}

export function cleanHttpUrl(v: unknown, maxLen = 1000): string {
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

export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const PRO_PLANS = {
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

export type ProPlanId = keyof typeof PRO_PLANS;

export function sanitizeCustomHtml(raw: unknown, maxLen = 450_000): string {
  if (typeof raw !== 'string') return '';
  let html = raw.trim().slice(0, maxLen);
  if (!html) return '';
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

export function cleanDisplayStyle(v: unknown, fallback = 'classic'): string {
  const s = cleanString(v, 30);
  return VALID_DISPLAY_STYLES.has(s) ? s : fallback;
}

export const FREE_COVER_SHAPES = new Set(['landscape', 'square']);
export const PRO_COVER_SHAPES = new Set(['portrait', 'wide', 'rounded_arch', 'circle']);
export const ALL_COVER_SHAPES = new Set([...FREE_COVER_SHAPES, ...PRO_COVER_SHAPES]);

export function validateCoverShape(
  v: unknown,
  hasPro: boolean,
  fallback = 'landscape'
): { shape: string; error?: string } {
  const s = cleanString(v, 30) || fallback;
  if (!ALL_COVER_SHAPES.has(s)) {
    return { shape: fallback };
  }
  if (PRO_COVER_SHAPES.has(s) && !hasPro) {
    return {
      shape: fallback,
      error: 'Bentuk cover unggulan ini khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk menggunakannya.',
    };
  }
  return { shape: s };
}

export const FREE_CTA_PRESETS = [
  'Beli Sekarang',
  'Dapatkan Sekarang',
  'Akses Sekarang',
  'Ambil Sekarang',
] as const;
const FREE_CTA_SET = new Set<string>(FREE_CTA_PRESETS);

export function validateCtaLabel(
  v: unknown,
  hasPro: boolean,
  fallback = 'Beli Sekarang'
): { label: string; error?: string } {
  const s = cleanString(v, 36) || fallback;
  if (FREE_CTA_SET.has(s)) {
    return { label: s };
  }
  if (!hasPro) {
    return {
      label: fallback,
      error: 'Edit teks tombol beli sendiri khusus untuk Seller WD.UP Pro. Pilih salah satu pilihan standar atau upgrade ke Pro.',
    };
  }
  return { label: s };
}

export interface StoredProductAddon {
  id: string;
  title: string;
  link: string;
  price: number;
}

export function sanitizeProductAddons(raw: unknown): { addons: StoredProductAddon[]; error?: string } {
  if (!raw) return { addons: [] };
  const arr = Array.isArray(raw) ? raw : [];
  const cleaned: StoredProductAddon[] = [];
  for (let i = 0; i < Math.min(arr.length, 10); i++) {
    const item = arr[i] as Record<string, unknown>;
    if (!item || typeof item !== 'object') continue;
    const title = cleanString(item.title, 120);
    const rawLink = cleanString(item.link, 1000);
    const price = Math.max(0, Math.round(Number(item.price || 0)));
    if (!title && !rawLink) continue;
    if (!title) {
      return { addons: [], error: `Judul Add-On #${i + 1} wajib diisi.` };
    }
    const cleanLink = rawLink ? cleanHttpUrl(rawLink, 1000) : '';
    if (rawLink && !cleanLink) {
      return {
        addons: [],
        error: `Link Add-On "${title}" harus berupa URL http:// atau https:// yang valid.`,
      };
    }
    const rawId = cleanString(item.id, 40);
    cleaned.push({
      id: rawId || `addon_${i + 1}_${crypto.randomBytes(3).toString('hex')}`,
      title,
      link: cleanLink,
      price,
    });
  }
  return { addons: cleaned };
}

export function parseStoredAddons(raw: unknown, includeLinks: boolean): Array<{ id: string; title: string; price: number; link?: string }> {
  const parsed = safeJsonParse<StoredProductAddon[]>(raw, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((a) => a && typeof a.title === 'string' && a.title.trim())
    .map((a) => ({
      id: String(a.id || ''),
      title: String(a.title || ''),
      price: Math.max(0, Math.round(Number(a.price || 0))),
      ...(includeLinks ? { link: String(a.link || '') } : {}),
    }));
}

export function hasProFeatureAccess(user?: { is_pro?: boolean; role?: string } | null): boolean {
  if (!user) return false;
  return Boolean(user.is_pro || user.role === 'admin');
}

const MAX_UPLOAD_IMAGE_DATA_LENGTH = 2_200_000;
const SAFE_RASTER_DATA_IMAGE_RE = /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;

export function validateAndCleanMediaUrl(
  v: unknown,
  fallback = '',
  label = 'Gambar'
): { url: string; error?: string } {
  if (v === undefined) return { url: fallback };
  if (v === null) return { url: '' };
  if (typeof v !== 'string') return { url: '' };
  const trimmed = v.trim();
  if (!trimmed) return { url: '' };
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

export function cleanProductCoverUrl(v: unknown, fallback = ''): string {
  const res = validateAndCleanMediaUrl(v, fallback, 'Gambar Sampul');
  return res.error ? fallback : res.url;
}

export function validateAccessInput(body: Record<string, unknown>): {
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

export function validateHomeCmsMedia(
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

  let mediaUrl =
    body?.media_url !== undefined ? String(body.media_url || '').trim() : String(existing?.media_url || '');
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

export async function getSystemSetting(key: string): Promise<string> {
  const rows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, key))
    .limit(1);
  return rows[0]?.value || '';
}

export async function upsertSystemSetting(key: string, value: string): Promise<void> {
  await db
    .insert(systemSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value },
    });
}

export async function hasRoleAccessCodeConfigured(targetRole: 'mentor' | 'admin'): Promise<boolean> {
  if (targetRole === 'mentor') {
    if (process.env.MENTOR_PASSCODE?.trim()) return true;
    return Boolean(await getSystemSetting('mentor_access_code_hash'));
  }
  if (process.env.ADMIN_PASSCODE?.trim()) return true;
  return Boolean(await getSystemSetting('admin_access_code_hash'));
}

export async function verifyRoleAccessCode(targetRole: 'mentor' | 'admin', inputCode: string): Promise<boolean> {
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
      ? await getSystemSetting('mentor_access_code_hash')
      : await getSystemSetting('admin_access_code_hash');
  if (settingHash && verifyPassword(cleanCode, settingHash)) return true;
  return false;
}

export function hasEditorAccess(req: AuthRequest, scope: string): boolean {
  if (!req.authUser) return false;
  if (req.authUser.role === 'admin') return true;
  if (req.authUser.role === 'editor') {
    const perms = req.authUser.editor_permissions;
    return perms.length === 0 || perms.includes(scope) || perms.includes('all');
  }
  return false;
}

export function getVisitorIdFromCookie(req: express.Request): string | null {
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

export function setVisitorCookie(req: express.Request, res: express.Response, visitorId: string): void {
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

export async function migrateGuestEngagements(visitorId: string | null, userId: string): Promise<void> {
  if (!visitorId) return;
  const rows = await db
    .select({
      cms_item_id: guestEngagements.cms_item_id,
      engagement_type: guestEngagements.engagement_type,
      note: guestEngagements.note,
      created_at: guestEngagements.created_at,
    })
    .from(guestEngagements)
    .where(eq(guestEngagements.visitor_id, visitorId));
  if (rows.length === 0) return;

  for (const r of rows) {
    await db
      .insert(userEngagements)
      .values({
        id: uid('eng'),
        user_id: userId,
        cms_item_id: r.cms_item_id,
        engagement_type: r.engagement_type,
        note: r.note,
        created_at: r.created_at,
      })
      .onConflictDoNothing();
  }
}

export async function getSiteFooter(): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(like(systemSettings.key, 'footer_%'));
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

export async function notifyAdminsAndBuyer(params: {
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
  const buyerNotif = await logNotification({
    userId: params.buyerUserId,
    eventType: params.buyerEventType,
    title: params.buyerTitle,
    message: params.buyerMessage,
    overrideEmail: params.buyerEmail,
    overrideWhatsapp: params.buyerWhatsapp,
  });

  const admins = await db
    .select({ id: users.id, email: users.email, whatsapp: users.whatsapp })
    .from(users)
    .where(eq(users.role, 'admin'));

  for (const adm of admins) {
    await logNotification({
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

export async function validateVoucherForCart(params: {
  code: string;
  items: Array<{ store_id: string | null; subtotal: number }>;
  subtotalBeforeDiscount: number;
}): Promise<{
  valid: boolean;
  error?: string;
  voucher?: typeof vouchers.$inferSelect;
  discountAmount: number;
}> {
  const cleanCode = cleanString(params.code, 40).toUpperCase();
  if (!cleanCode) return { valid: false, error: 'Kode voucher wajib diisi.', discountAmount: 0 };

  const rows = await db
    .select()
    .from(vouchers)
    .where(sql`LOWER(${vouchers.code}) = LOWER(${cleanCode}) AND ${vouchers.is_active} = 1`)
    .limit(1);
  const voucher = rows[0];

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

export async function ensureEnrolled(user: AuthRequest['authUser'], classId: string): Promise<boolean> {
  if (!user) return false;
  if (isApprovedMentorOrAdmin(user)) return true;
  const rows = await db
    .select({ id: enrollments.id })
    .from(enrollments)
    .where(sql`${enrollments.user_id} = ${user.id} AND ${enrollments.class_id} = ${classId}`)
    .limit(1);
  return Boolean(rows[0]);
}

export async function queryAcademySubmissions() {
  const rows = await db
    .select({
      id: worksheetsAssignments.id,
      user_id: worksheetsAssignments.user_id,
      class_id: worksheetsAssignments.class_id,
      module_id: worksheetsAssignments.module_id,
      worksheet_answer: worksheetsAssignments.worksheet_answer,
      worksheet_status: worksheetsAssignments.worksheet_status,
      assignment_answer: worksheetsAssignments.assignment_answer,
      assignment_link: worksheetsAssignments.assignment_link,
      assignment_status: worksheetsAssignments.assignment_status,
      exercise_completed: worksheetsAssignments.exercise_completed,
      quiz_score: worksheetsAssignments.quiz_score,
      quiz_answers: worksheetsAssignments.quiz_answers,
      grade: worksheetsAssignments.grade,
      mentor_feedback: worksheetsAssignments.mentor_feedback,
      feedback_history: worksheetsAssignments.feedback_history,
      updated_at: worksheetsAssignments.updated_at,
      student_name: users.name,
      student_email: users.email,
      class_title: academyClasses.title,
      module_title: academyModules.title,
      module_quiz_questions: academyModules.quiz_questions,
    })
    .from(worksheetsAssignments)
    .innerJoin(users, eq(users.id, worksheetsAssignments.user_id))
    .innerJoin(academyClasses, eq(academyClasses.id, worksheetsAssignments.class_id))
    .innerJoin(academyModules, eq(academyModules.id, worksheetsAssignments.module_id))
    .orderBy(desc(worksheetsAssignments.updated_at));

  return rows.map((s) => ({
    ...s,
    quiz_answers: safeJsonParse<number[]>(s.quiz_answers, []),
    quiz_questions: safeJsonParse<Array<{ id: string; question: string; options: string[]; correctIndex: number }>>(
      s.module_quiz_questions,
      []
    ),
    feedback_history: safeJsonParse(s.feedback_history, []),
  }));
}

export function handleRouteError(res: express.Response, err: unknown, fallbackMessage = 'Terjadi kesalahan pada server.') {
  console.error('Route handler error:', err);
  return res.status(500).json({ error: fallbackMessage });
}
