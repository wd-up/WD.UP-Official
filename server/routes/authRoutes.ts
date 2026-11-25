import crypto from 'crypto';
import express from 'express';
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  affiliateProducts,
  commissions,
  creatorStudioEntries,
  enrollments,
  homeCmsItems,
  notifications,
  orderItems,
  orders,
  paymentMethods,
  payments,
  products,
  stores,
  userEngagements,
  users,
} from '../../src/db/schema.ts';
import { adminAuth } from '../../src/lib/firebase-admin.ts';
import {
  type AuthRequest,
  clearSessionCookie,
  extractBearerToken,
  extractCookieToken,
  getOrCreateUserByFirebaseUid,
  getUserById,
  hasAdminClaimed,
  hashPassword,
  optionalAuth,
  requireAuth,
  revokeSessionToken,
  setSessionCookie,
  signToken,
} from '../auth.ts';
import { logNotification, nowIso, uid } from '../db.ts';
import {
  cleanString,
  getVisitorIdFromCookie,
  handleRouteError,
  hasRoleAccessCodeConfigured,
  migrateGuestEngagements,
  parseStoredAddons,
  PRO_PLANS,
  verifyRoleAccessCode,
} from '../helpers.ts';

export const authRouter = express.Router();

// ==========================================
// 0. PRO PLANS
// ==========================================

authRouter.get('/api/pro/plans', (_req, res) => {
  res.json({
    plans: Object.values(PRO_PLANS),
    benefits: [
      {
        title: 'Gratis Biaya Transaksi 0%',
        desc: 'Bebas potongan platform pada setiap transaksi produk di toko Anda selama masa berlangganan Pro.',
      },
      {
        title: 'AI Creator WD.UP di Penambahan Produk',
        desc: 'Susun judul, deskripsi menjual, highlight manfaat, hingga copy promosi produk otomatis langsung saat membuat produk.',
      },
      {
        title: 'Bayar Suka-Suka dengan Minimal Harga',
        desc: 'Aktifkan batas minimal harga pada fitur Bayar Suka-Suka agar kontribusi pembeli tetap menguntungkan.',
      },
      {
        title: 'Edit Sendiri Teks Tombol Beli & Bentuk Cover Unggulan',
        desc: 'Kustomisasi teks tombol CTA sesuka hati serta gunakan bentuk cover Vertikal, Sinematik, Arch Elegan, dan Lingkaran.',
      },
      {
        title: 'Editor Coding Landing Page Penuh & Voucher Toko',
        desc: 'Buat landing page HTML/CSS kustom untuk toko maupun per produk serta terbitkan kode voucher promo toko Anda.',
      },
      {
        title: 'Prioritas Sorotan Home & Market',
        desc: 'Produk dan toko member Pro diprioritaskan tampil lebih atas dengan lencana PRO resmi.',
      },
    ],
  });
});

// ==========================================
// 1. AUTHENTICATION & ADMIN BOOTSTRAP
// ==========================================

authRouter.get('/api/auth/status', optionalAuth, async (req: AuthRequest, res) => {
  try {
    if (!req.authUser && extractCookieToken(req)) {
      clearSessionCookie(req, res);
    }
    const [claimed, adminCodeCfg, mentorCodeCfg] = await Promise.all([
      hasAdminClaimed(),
      hasRoleAccessCodeConfigured('admin'),
      hasRoleAccessCodeConfigured('mentor'),
    ]);
    res.json({
      adminClaimed: claimed,
      envPasscodeConfigured: Boolean(process.env.ADMIN_PASSCODE && process.env.ADMIN_PASSCODE.trim()),
      adminPasscodeConfigured: adminCodeCfg,
      mentorPasscodeConfigured: mentorCodeCfg,
      currentUser: req.authUser || null,
      authenticatedVia: req.authViaCookie ? 'cookie' : req.authUser ? 'bearer' : 'none',
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memeriksa status autentikasi.');
  }
});

authRouter.post('/api/auth/firebase-login', async (req, res) => {
  try {
    const bearer = extractBearerToken(req);
    if (!bearer) {
      return res.status(401).json({ error: 'Token Firebase tidak ditemukan. Silakan masuk dengan Google.' });
    }

    let decoded;
    try {
      decoded = await adminAuth.verifyIdToken(bearer);
    } catch {
      return res.status(401).json({ error: 'Sesi Google tidak valid atau sudah kedaluwarsa. Silakan coba masuk lagi.' });
    }

    const selectedRole = cleanString(req.body?.selected_role, 20) || 'member';
    const accessCode = typeof req.body?.access_code === 'string' ? req.body.access_code.trim() : '';
    const whatsapp = cleanString(req.body?.whatsapp, 30);

    let user = await getOrCreateUserByFirebaseUid(
      decoded.uid,
      decoded.email || `${decoded.uid}@firebase.local`,
      typeof decoded.name === 'string' ? decoded.name : undefined,
      typeof decoded.picture === 'string' ? decoded.picture : undefined
    );

    const isFirstLogin = Date.now() - Date.parse(user.created_at) < 15_000;
    let pendingApproval = false;
    let message: string | undefined;

    if (selectedRole === 'admin') {
      if (user.role !== 'admin') {
        return res.status(403).json({
          error: 'Akun Google ini belum terdaftar sebagai Admin WD.UP.',
        });
      }
      if ((await hasRoleAccessCodeConfigured('admin')) && !(await verifyRoleAccessCode('admin', accessCode))) {
        return res.status(403).json({ error: 'Kode akses Admin tidak valid atau belum diisi.' });
      }
    } else if (selectedRole === 'mentor') {
      if (user.role === 'member') {
        if (await hasRoleAccessCodeConfigured('mentor')) {
          if (!accessCode) {
            return res.status(400).json({ error: 'Kode akses Mentor wajib diisi.' });
          }
          if (!(await verifyRoleAccessCode('mentor', accessCode))) {
            return res.status(403).json({ error: 'Kode akses Mentor tidak sesuai. Hubungi Admin WD.UP.' });
          }
        }

        await db
          .update(users)
          .set({
            role: 'mentor',
            mentor_status: 'pending',
            ...(whatsapp ? { whatsapp } : {}),
          })
          .where(eq(users.id, user.id));

        user = (await getUserById(user.id)) || user;
        pendingApproval = true;
        message = 'Pengajuan Mentor berhasil dikirim! Akun menunggu ACC Admin WD.UP sebelum Panel Mentor terbuka.';

        await logNotification({
          userId: user.id,
          eventType: 'registration',
          title: 'Pengajuan Mentor Dikirim (Menunggu ACC Admin)',
          message: `Permintaan akses Mentor untuk akun ${user.email} telah dikirim dan menunggu persetujuan (ACC) dari Admin WD.UP.`,
        });

        const admins = await db
          .select({ id: users.id, email: users.email, whatsapp: users.whatsapp })
          .from(users)
          .where(eq(users.role, 'admin'));
        for (const adm of admins) {
          await logNotification({
            userId: adm.id,
            eventType: 'admin_mentor_request',
            title: `Permintaan Akses Mentor Baru: ${user.name}`,
            message: `${user.name} (${user.email}) mengajukan akses sebagai Mentor Academy dan menunggu ACC Anda di tab Users & Role.`,
            overrideEmail: adm.email,
            overrideWhatsapp: adm.whatsapp,
          });
        }
      } else if (user.role === 'mentor') {
        if (user.mentor_status === 'rejected') {
          return res.status(403).json({
            error: 'Pengajuan akses Mentor untuk akun ini belum disetujui Admin.',
          });
        }
        if (user.mentor_status === 'pending') {
          pendingApproval = true;
          message = 'Akses Mentor Anda masih menunggu persetujuan (ACC) dari Admin WD.UP.';
        } else if (user.mentor_status !== 'approved') {
          return res.status(403).json({
            error: 'Akses Mentor belum aktif. Hubungi Admin WD.UP untuk ACC akun Mentor.',
          });
        } else if ((await hasRoleAccessCodeConfigured('mentor')) && !(await verifyRoleAccessCode('mentor', accessCode))) {
          return res.status(403).json({ error: 'Kode akses Mentor tidak valid atau belum diisi.' });
        }
      }
    } else if (whatsapp && !user.whatsapp) {
      await db.update(users).set({ whatsapp }).where(eq(users.id, user.id));
      user = (await getUserById(user.id)) || user;
    }

    if (isFirstLogin && selectedRole === 'member') {
      await logNotification({
        userId: user.id,
        eventType: 'registration',
        title: 'Selamat Datang di WD.UP',
        message: `Akun terintegrasi Anda (${user.email}) siap digunakan untuk belajar di Academy, berbelanja di Market, dan membangun Toko Digital Anda.`,
      });
    }

    await migrateGuestEngagements(getVisitorIdFromCookie(req), user.id);
    const sessionToken = await signToken(user.id);
    setSessionCookie(req, res, sessionToken);

    res.json({
      token: bearer,
      user,
      pendingApproval,
      message,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memproses masuk dengan Google.');
  }
});

authRouter.post('/api/auth/logout', async (req, res) => {
  try {
    await revokeSessionToken(extractBearerToken(req));
    await revokeSessionToken(extractCookieToken(req));
    clearSessionCookie(req, res);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal keluar dari sesi.');
  }
});

authRouter.post('/api/auth/refresh-cookie', requireAuth, async (req: AuthRequest, res) => {
  try {
    const token =
      req.authToken && req.authToken.startsWith('wdup_')
        ? req.authToken
        : await signToken(req.authUser!.id);
    setSessionCookie(req, res, token);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyegarkan sesi cookie.');
  }
});

authRouter.post('/api/auth/claim-admin', requireAuth, async (req: AuthRequest, res) => {
  try {
    const envPass = process.env.ADMIN_PASSCODE?.trim() || '';
    if (envPass) {
      return res.status(403).json({ error: 'Admin passcode dikelola melalui Secrets environment server.' });
    }

    const userId = req.authUser!.id;
    const claimResult = await db.transaction(async (tx) => {
      const existingAdmins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);
      if (existingAdmins[0]) {
        throw new Error('ADMIN_ALREADY_CLAIMED');
      }
      await tx.update(users).set({ role: 'admin' }).where(eq(users.id, userId));
      return userId;
    });

    const user = await getUserById(claimResult);
    const sessionToken = await signToken(claimResult);
    setSessionCookie(req, res, sessionToken);
    res.status(201).json({ token: req.authToken || sessionToken, user });
  } catch (err) {
    if (err instanceof Error && err.message === 'ADMIN_ALREADY_CLAIMED') {
      return res.status(409).json({ error: 'Akun Admin utama sudah diklaim sebelumnya.' });
    }
    handleRouteError(res, err, 'Gagal mengaktifkan akses Admin utama.');
  }
});

authRouter.post('/api/auth/admin-passcode-login', async (req, res) => {
  try {
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

    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);
    let adminId = admins[0]?.id;
    if (!adminId) {
      adminId = uid('usr');
      await db.insert(users).values({
        id: adminId,
        uid: null,
        name: 'WD.UP Admin',
        email: 'admin@wdup.com',
        whatsapp: '',
        password_hash: hashPassword(envPass),
        role: 'admin',
        mentor_status: 'none',
        created_at: nowIso(),
      });
    }
    const user = await getUserById(adminId);
    const token = await signToken(adminId);
    setSessionCookie(req, res, token);
    res.json({ token, user });
  } catch (err) {
    handleRouteError(res, err, 'Gagal masuk dengan passcode admin.');
  }
});

// ==========================================
// 2. MY ACCOUNT (PROFILE, SUMMARY, ACTIVITY)
// ==========================================

authRouter.put('/api/account/profile', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const name = cleanString(req.body?.name, 100) || req.authUser!.name;
    const whatsapp = cleanString(req.body?.whatsapp, 30);
    const bio = cleanString(req.body?.bio, 400);
    const avatarUrl = cleanString(req.body?.avatar_url, 300);
    const notifyEmail = req.body?.notify_email === false || req.body?.notify_email === 0 ? 0 : 1;
    const notifyWhatsapp = req.body?.notify_whatsapp === false || req.body?.notify_whatsapp === 0 ? 0 : 1;

    await db
      .update(users)
      .set({
        name,
        whatsapp,
        bio,
        avatar_url: avatarUrl || req.authUser!.avatar_url,
        notify_email: notifyEmail,
        notify_whatsapp: notifyWhatsapp,
      })
      .where(eq(users.id, userId));

    res.json({ user: await getUserById(userId) });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan perubahan profil.');
  }
});

authRouter.get('/api/account/summary', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const storeRows = await db
      .select({
        id: stores.id,
        name: stores.name,
        username: stores.username,
        visitors_count: stores.visitors_count,
      })
      .from(stores)
      .where(eq(stores.user_id, userId))
      .limit(1);
    const store = storeRows[0];

    const [ownCountRes, affCountRes, enrStatsRes, studioCountRes, ordersCountRes, unreadCountRes, commSumRes] =
      await Promise.all([
        store
          ? db
              .select({ c: sql<number>`count(*)::int` })
              .from(products)
              .where(eq(products.store_id, store.id))
          : Promise.resolve([{ c: 0 }]),
        store
          ? db
              .select({ c: sql<number>`count(*)::int` })
              .from(affiliateProducts)
              .where(eq(affiliateProducts.store_id, store.id))
          : Promise.resolve([{ c: 0 }]),
        db
          .select({
            c: sql<number>`count(*)::int`,
            avg: sql<number>`COALESCE(AVG(${enrollments.progress_pct}), 0)::float`,
          })
          .from(enrollments)
          .where(eq(enrollments.user_id, userId)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(creatorStudioEntries)
          .where(eq(creatorStudioEntries.user_id, userId)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(orders)
          .where(eq(orders.buyer_user_id, userId)),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(notifications)
          .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, 0))),
        db
          .select({ total: sql<number>`COALESCE(SUM(${commissions.amount}), 0)::int` })
          .from(commissions)
          .where(and(eq(commissions.affiliate_user_id, userId), eq(commissions.status, 'credited'))),
      ]);

    const enrRow = enrStatsRes[0] || { c: 0, avg: 0 };

    res.json({
      user: req.authUser,
      store: store || null,
      stats: {
        ownProductsCount: ownCountRes[0]?.c || 0,
        affiliateProductsCount: affCountRes[0]?.c || 0,
        enrollmentsCount: enrRow.c || 0,
        avgProgress: Math.round(Number(enrRow.avg || 0)),
        studioEntriesCount: studioCountRes[0]?.c || 0,
        ordersCount: ordersCountRes[0]?.c || 0,
        unreadNotifications: unreadCountRes[0]?.c || 0,
        commissionsTotal: commSumRes[0]?.total || 0,
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat ringkasan akun.');
  }
});

authRouter.get('/api/account/activity', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const rawOrders = await db
      .select({
        id: orders.id,
        order_code: orders.order_code,
        buyer_user_id: orders.buyer_user_id,
        payment_method_id: orders.payment_method_id,
        total_amount: orders.total_amount,
        status: orders.status,
        gateway_provider: orders.gateway_provider,
        gateway_reference: orders.gateway_reference,
        buyer_email: orders.buyer_email,
        buyer_whatsapp: orders.buyer_whatsapp,
        voucher_code: orders.voucher_code,
        discount_amount: orders.discount_amount,
        is_guest: orders.is_guest,
        buyer_name: orders.buyer_name,
        notes: orders.notes,
        created_at: orders.created_at,
        updated_at: orders.updated_at,
        provider_name: paymentMethods.provider_name,
        payment_method_name: paymentMethods.provider_name,
        account_number: paymentMethods.account_number,
        account_holder: paymentMethods.account_holder,
        sender_name: payments.sender_name,
        transfer_reference: payments.transfer_reference,
        proof_note: payments.proof_note,
        submitted_at: payments.submitted_at,
        verification_note: payments.verification_note,
      })
      .from(orders)
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .leftJoin(payments, eq(payments.order_id, orders.id))
      .where(eq(orders.buyer_user_id, userId))
      .orderBy(desc(orders.created_at));

    const enrichedOrders = await Promise.all(
      rawOrders.map(async (o) => {
        const items = await db
          .select({
            id: orderItems.id,
            order_id: orderItems.order_id,
            item_type: orderItems.item_type,
            item_id: orderItems.item_id,
            title: orderItems.title,
            quantity: orderItems.quantity,
            unit_price: orderItems.unit_price,
            subtotal: orderItems.subtotal,
            seller_user_id: orderItems.seller_user_id,
            store_id: orderItems.store_id,
            affiliate_user_id: orderItems.affiliate_user_id,
            affiliate_commission_pct: orderItems.affiliate_commission_pct,
            platform_fee_amount: orderItems.platform_fee_amount,
            seller_net_amount: orderItems.seller_net_amount,
            selected_addons_json: orderItems.selected_addons_json,
            delivery_content: products.delivery_content,
            image_url: products.image_url,
            is_physical: products.is_physical,
            access_type: products.access_type,
            access_url: products.access_url,
            access_file_name: products.access_file_name,
            access_file_data: products.access_file_data,
          })
          .from(orderItems)
          .leftJoin(products, and(eq(orderItems.item_type, 'product'), eq(products.id, orderItems.item_id)))
          .where(eq(orderItems.order_id, o.id));

        const isPaid = o.status === 'Paid';
        return {
          ...o,
          items: items.map(({ access_file_data, selected_addons_json, ...it }) => ({
            ...it,
            delivery_content: isPaid ? it.delivery_content || '' : '',
            access_url: isPaid ? it.access_url || '' : '',
            access_file_name: isPaid ? it.access_file_name || '' : '',
            has_access_file: isPaid ? Boolean(access_file_data) : false,
            selected_addons: parseStoredAddons(selected_addons_json, isPaid),
          })),
        };
      })
    );

    const [commRows, engRows, notifRows] = await Promise.all([
      db
        .select({
          id: commissions.id,
          order_id: commissions.order_id,
          order_item_id: commissions.order_item_id,
          affiliate_user_id: commissions.affiliate_user_id,
          seller_user_id: commissions.seller_user_id,
          amount: commissions.amount,
          status: commissions.status,
          created_at: commissions.created_at,
          order_code: orders.order_code,
        })
        .from(commissions)
        .innerJoin(orders, eq(orders.id, commissions.order_id))
        .where(eq(commissions.affiliate_user_id, userId))
        .orderBy(desc(commissions.created_at)),
      db
        .select({
          id: userEngagements.id,
          user_id: userEngagements.user_id,
          cms_item_id: userEngagements.cms_item_id,
          engagement_type: userEngagements.engagement_type,
          note: userEngagements.note,
          created_at: userEngagements.created_at,
          title: homeCmsItems.title,
          subtitle: homeCmsItems.subtitle,
          section_type: homeCmsItems.section_type,
        })
        .from(userEngagements)
        .innerJoin(homeCmsItems, eq(homeCmsItems.id, userEngagements.cms_item_id))
        .where(eq(userEngagements.user_id, userId))
        .orderBy(desc(userEngagements.created_at)),
      db
        .select()
        .from(notifications)
        .where(or(eq(notifications.user_id, userId), isNull(notifications.user_id)))
        .orderBy(desc(notifications.created_at))
        .limit(50),
    ]);

    res.json({
      orders: enrichedOrders,
      commissions: commRows,
      engagements: engRows,
      notifications: notifRows,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat aktivitas akun.');
  }
});

authRouter.post('/api/account/notifications/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ is_read: 1 }).where(eq(notifications.user_id, req.authUser!.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menandai notifikasi sudah dibaca.');
  }
});

authRouter.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const [notifs, unreadRes] = await Promise.all([
      db
        .select()
        .from(notifications)
        .where(or(eq(notifications.user_id, userId), isNull(notifications.user_id)))
        .orderBy(desc(notifications.created_at))
        .limit(30),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, 0))),
    ]);
    res.json({ notifications: notifs, unreadCount: unreadRes[0]?.c || 0 });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat notifikasi.');
  }
});

authRouter.put('/api/notifications/read-all', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db.update(notifications).set({ is_read: 1 }).where(eq(notifications.user_id, req.authUser!.id));
    res.json({ ok: true, unreadCount: 0 });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menandai semua notifikasi.');
  }
});

authRouter.put('/api/notifications/:id/read', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .update(notifications)
      .set({ is_read: 1 })
      .where(and(eq(notifications.id, req.params.id), eq(notifications.user_id, req.authUser!.id)));
    const unreadRes = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.user_id, req.authUser!.id), eq(notifications.is_read, 0)));
    res.json({ ok: true, unreadCount: unreadRes[0]?.c || 0 });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status notifikasi.');
  }
});
