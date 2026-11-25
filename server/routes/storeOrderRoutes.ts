import crypto from 'crypto';
import express from 'express';
import { and, asc, desc, eq, gte, ne, or, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  academyClasses,
  academyPrograms,
  affiliateClicks,
  affiliateProducts,
  commissions,
  creatorStudioEntries,
  creatorTools,
  enrollments,
  orderItems,
  orders,
  paymentMethods,
  payments,
  products,
  storeExternalAffiliates,
  storeVisits,
  stores,
  users,
  vouchers,
  walletTransactions,
  withdrawals,
} from '../../src/db/schema.ts';
import { askWdupAssistant, generateCreatorContent } from '../ai.ts';
import { type AuthRequest, getUserById, optionalAuth, requireAuth } from '../auth.ts';
import { nowIso, uid } from '../db.ts';
import {
  cleanDisplayStyle,
  cleanHttpUrl,
  cleanSlug,
  cleanString,
  handleRouteError,
  hasProFeatureAccess,
  notifyAdminsAndBuyer,
  parseStoredAddons,
  PRO_PLANS,
  type ProPlanId,
  safeJsonParse,
  sanitizeCustomHtml,
  sanitizeProductAddons,
  validateAccessInput,
  validateAndCleanMediaUrl,
  validateCoverShape,
  validateCtaLabel,
  validateVoucherForCart,
} from '../helpers.ts';

export const storeOrderRouter = express.Router();

// ==========================================
// 6. MY STORE & AFFILIATE ECOSYSTEM
// ==========================================

storeOrderRouter.get('/api/my-store/check-availability', requireAuth, async (req: AuthRequest, res) => {
  try {
    const name = cleanString(req.query.name as string, 80);
    const username = cleanSlug(cleanString(req.query.username as string, 40));
    const ownStoreRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.user_id, req.authUser!.id))
      .limit(1);
    const ownStoreId = ownStoreRows[0]?.id || '';

    let nameAvailable = true;
    let usernameAvailable = true;

    if (name) {
      const existingName = await db
        .select({ id: stores.id })
        .from(stores)
        .where(and(sql`LOWER(${stores.name}) = LOWER(${name})`, ne(stores.id, ownStoreId)))
        .limit(1);
      nameAvailable = !existingName[0];
    }

    if (username) {
      const existingUser = await db
        .select({ id: stores.id })
        .from(stores)
        .where(and(sql`LOWER(${stores.username}) = LOWER(${username})`, ne(stores.id, ownStoreId)))
        .limit(1);
      usernameAvailable = !existingUser[0];
    }

    res.json({ nameAvailable, usernameAvailable, sanitizedUsername: username });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memeriksa ketersediaan nama/username toko.');
  }
});

storeOrderRouter.get('/api/my-store', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const storeRows = await db.select().from(stores).where(eq(stores.user_id, userId)).limit(1);
    const store = storeRows[0];

    if (!store) {
      return res.json({ store: null, is_pro: req.authUser!.is_pro });
    }

    const period = cleanString(req.query.period as string, 20) || 'monthly';
    const days = period === 'daily' ? 1 : period === 'weekly' ? 7 : 30;
    const cutoffIso = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const [
      ownProductsRaw,
      affiliateProductsRaw,
      externalAffiliates,
      storeVouchers,
      storeOrders,
      periodVisitsRes,
      totalProdClicksRes,
      totalAffClicksRes,
      periodAffClicksRes,
      paidItemsAll,
      creditedCommsAll,
      visitsAll,
      userWalletRows,
      topProducts,
    ] = await Promise.all([
      db
        .select({
          id: products.id,
          store_id: products.store_id,
          owner_user_id: products.owner_user_id,
          title: products.title,
          slug: products.slug,
          category: products.category,
          home_pillar: products.home_pillar,
          price: products.price,
          original_price: products.original_price,
          pricing_mode: products.pricing_mode,
          min_price: products.min_price,
          addons_json: products.addons_json,
          hidden_by_seller: products.hidden_by_seller,
          hidden_by_admin: products.hidden_by_admin,
          cta_label: products.cta_label,
          cover_shape: products.cover_shape,
          quota_limit: products.quota_limit,
          landing_page_url: products.landing_page_url,
          custom_landing_html: products.custom_landing_html,
          description: products.description,
          image_url: products.image_url,
          delivery_content: products.delivery_content,
          access_type: products.access_type,
          access_url: products.access_url,
          access_file_name: products.access_file_name,
          access_file_data: products.access_file_data,
          is_physical: products.is_physical,
          is_featured: products.is_featured,
          is_recommended: products.is_recommended,
          affiliate_enabled: products.affiliate_enabled,
          affiliate_commission_pct: products.affiliate_commission_pct,
          clicks_count: products.clicks_count,
          sales_count: products.sales_count,
          status: products.status,
          created_at: products.created_at,
        })
        .from(products)
        .where(
          and(
            eq(products.store_id, store.id),
            eq(products.is_physical, 0),
            ne(products.category, 'Produk fisik'),
            ne(products.status, 'archived')
          )
        )
        .orderBy(desc(products.created_at)),
      db
        .select({
          affiliate_listing_id: affiliateProducts.id,
          referral_code: affiliateProducts.referral_code,
          affiliate_clicks: affiliateProducts.clicks_count,
          added_at: affiliateProducts.created_at,
          id: products.id,
          title: products.title,
          category: products.category,
          price: products.price,
          original_price: products.original_price,
          pricing_mode: products.pricing_mode,
          min_price: products.min_price,
          cta_label: products.cta_label,
          cover_shape: products.cover_shape,
          quota_limit: products.quota_limit,
          landing_page_url: products.landing_page_url,
          image_url: products.image_url,
          affiliate_commission_pct: products.affiliate_commission_pct,
          sales_count: products.sales_count,
          owner_store_name: stores.name,
          owner_store_username: stores.username,
        })
        .from(affiliateProducts)
        .innerJoin(products, eq(products.id, affiliateProducts.product_id))
        .innerJoin(stores, eq(stores.id, products.store_id))
        .where(
          and(
            eq(affiliateProducts.store_id, store.id),
            eq(products.status, 'active'),
            eq(products.hidden_by_seller, 0),
            eq(products.hidden_by_admin, 0),
            eq(products.is_physical, 0),
            ne(products.category, 'Produk fisik')
          )
        )
        .orderBy(desc(affiliateProducts.created_at)),
      db
        .select()
        .from(storeExternalAffiliates)
        .where(eq(storeExternalAffiliates.store_id, store.id))
        .orderBy(desc(storeExternalAffiliates.created_at)),
      db
        .select()
        .from(vouchers)
        .where(and(eq(vouchers.scope, 'store'), eq(vouchers.store_id, store.id)))
        .orderBy(desc(vouchers.created_at)),
      db
        .select({
          order_item_id: orderItems.id,
          title: orderItems.title,
          quantity: orderItems.quantity,
          unit_price: orderItems.unit_price,
          subtotal: orderItems.subtotal,
          platform_fee_amount: orderItems.platform_fee_amount,
          seller_net_amount: orderItems.seller_net_amount,
          seller_user_id: orderItems.seller_user_id,
          affiliate_user_id: orderItems.affiliate_user_id,
          order_id: orders.id,
          order_code: orders.order_code,
          status: orders.status,
          created_at: orders.created_at,
          buyer_name: users.name,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.order_id))
        .innerJoin(users, eq(users.id, orders.buyer_user_id))
        .where(or(eq(orderItems.seller_user_id, userId), eq(orderItems.affiliate_user_id, userId)))
        .orderBy(desc(orders.created_at)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(storeVisits)
        .where(and(eq(storeVisits.store_id, store.id), gte(storeVisits.created_at, cutoffIso))),
      db
        .select({ c: sql<number>`COALESCE(SUM(${products.clicks_count}), 0)::int` })
        .from(products)
        .where(eq(products.store_id, store.id)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(affiliateClicks)
        .where(eq(affiliateClicks.store_id, store.id)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(affiliateClicks)
        .where(and(eq(affiliateClicks.store_id, store.id), gte(affiliateClicks.created_at, cutoffIso))),
      db
        .select({
          subtotal: orderItems.subtotal,
          quantity: orderItems.quantity,
          affiliate_user_id: orderItems.affiliate_user_id,
          affiliate_commission_pct: orderItems.affiliate_commission_pct,
          platform_fee_amount: orderItems.platform_fee_amount,
          seller_net_amount: orderItems.seller_net_amount,
          order_id: orders.id,
          created_at: orders.created_at,
        })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.order_id))
        .where(and(eq(orderItems.seller_user_id, userId), eq(orders.status, 'Paid'))),
      db
        .select({ amount: commissions.amount, created_at: commissions.created_at })
        .from(commissions)
        .where(and(eq(commissions.affiliate_user_id, userId), eq(commissions.status, 'credited'))),
      db.select({ created_at: storeVisits.created_at }).from(storeVisits).where(eq(storeVisits.store_id, store.id)),
      db
        .select({ wallet_available: users.wallet_available, wallet_pending: users.wallet_pending })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
      db
        .select({
          id: products.id,
          title: products.title,
          price: products.price,
          original_price: products.original_price,
          quota_limit: products.quota_limit,
          sales_count: products.sales_count,
          clicks_count: products.clicks_count,
          image_url: products.image_url,
        })
        .from(products)
        .where(
          and(
            eq(products.store_id, store.id),
            eq(products.is_physical, 0),
            ne(products.category, 'Produk fisik'),
            ne(products.status, 'archived')
          )
        )
        .orderBy(desc(products.sales_count), desc(products.clicks_count))
        .limit(5),
    ]);

    const periodVisits = periodVisitsRes[0]?.c || 0;
    const totalProductClicks = totalProdClicksRes[0]?.c || 0;
    const totalAffiliateClicks = totalAffClicksRes[0]?.c || 0;
    const periodClicks = totalProductClicks + (periodAffClicksRes[0]?.c || 0);

    const periodOrderIds = new Set<string>();
    let periodUnitsSold = 0;
    let periodGrossRevenue = 0;
    for (const item of paidItemsAll) {
      if (item.created_at >= cutoffIso) {
        periodOrderIds.add(item.order_id);
        periodUnitsSold += Number(item.quantity || 0);
        periodGrossRevenue += Number(item.subtotal || 0);
      }
    }

    let periodCommission = 0;
    for (const c of creditedCommsAll) {
      if (c.created_at >= cutoffIso) {
        periodCommission += Number(c.amount || 0);
      }
    }

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

    const userWallet = userWalletRows[0];

    const hasPro = hasProFeatureAccess(req.authUser);

    res.json({
      store: { ...store, is_pro: hasPro },
      is_pro: hasPro,
      platform_fee_pct: hasPro ? 0 : 5,
      ownProducts: ownProductsRaw.map(({ access_file_data, addons_json, ...p }) => ({
        ...p,
        addons: parseStoredAddons(addons_json, true),
        has_access_file: Boolean(access_file_data),
      })),
      affiliateProducts: affiliateProductsRaw,
      externalAffiliates,
      vouchers: storeVouchers,
      storeOrders,
      analytics: {
        period,
        totalVisitors: store.visitors_count,
        periodVisits,
        productClicks: periodClicks,
        paidOrders: periodOrderIds.size,
        unitsSold: periodUnitsSold,
        grossRevenue: periodGrossRevenue,
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
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat dashboard toko.');
  }
});

storeOrderRouter.post('/api/my-store', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const existing = await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, userId)).limit(1);
    if (existing[0]) {
      return res.status(409).json({ error: 'Anda sudah memiliki toko. Gunakan pengaturan toko untuk mengubahnya.' });
    }

    const name = cleanString(req.body?.name, 80);
    const username = cleanSlug(cleanString(req.body?.username, 40));
    if (!name || username.length < 3) {
      return res.status(400).json({ error: 'Nama toko dan username toko (minimal 3 karakter huruf/angka) wajib diisi.' });
    }

    const dupName = await db
      .select({ id: stores.id })
      .from(stores)
      .where(sql`LOWER(${stores.name}) = LOWER(${name})`)
      .limit(1);
    if (dupName[0]) {
      return res.status(409).json({ error: 'Nama toko sudah digunakan oleh member lain. Silakan pilih nama lain.' });
    }
    const dupUser = await db
      .select({ id: stores.id })
      .from(stores)
      .where(sql`LOWER(${stores.username}) = LOWER(${username})`)
      .limit(1);
    if (dupUser[0]) {
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

    const hasPro = hasProFeatureAccess(req.authUser);
    const customLandingHtml = sanitizeCustomHtml(req.body?.custom_landing_html);
    if (customLandingHtml && !hasPro) {
      return res.status(403).json({
        error: 'Editor Coding Landing Page HTML/CSS khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk menggunakannya.',
      });
    }

    const inserted = await db
      .insert(stores)
      .values({
        id: storeId,
        user_id: userId,
        name,
        username,
        initials,
        logo_url: logoRes.url,
        banner_url: bannerRes.url,
        description: cleanString(req.body?.description, 600),
        category: cleanString(req.body?.category, 60) || 'Digital Creator',
        contact_whatsapp: cleanString(req.body?.contact_whatsapp, 30) || req.authUser!.whatsapp,
        contact_email: cleanString(req.body?.contact_email, 160) || req.authUser!.email,
        social_instagram: cleanString(req.body?.social_instagram, 200),
        social_tiktok: cleanString(req.body?.social_tiktok, 200),
        social_youtube: cleanString(req.body?.social_youtube, 200),
        social_twitter: cleanString(req.body?.social_twitter, 200),
        social_shopee: cleanString(req.body?.social_shopee, 200),
        social_website: cleanString(req.body?.social_website, 200),
        landing_page_url: cleanHttpUrl(req.body?.landing_page_url, 1000),
        custom_landing_html: customLandingHtml,
        service_link: cleanHttpUrl(req.body?.service_link, 300),
        theme: cleanString(req.body?.theme, 30) || 'warm-cream',
        store_mode: cleanString(req.body?.store_mode, 20) || 'hybrid',
        created_at: ts,
        updated_at: ts,
      })
      .returning();

    res.status(201).json({ store: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal membuat toko.');
  }
});

storeOrderRouter.put('/api/my-store', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const storeRows = await db.select().from(stores).where(eq(stores.user_id, userId)).limit(1);
    const store = storeRows[0];
    if (!store) return res.status(404).json({ error: 'Toko belum dibuat.' });

    const name = cleanString(req.body?.name, 80) || store.name;
    const rawUsername = cleanString(req.body?.username, 40);
    const username = rawUsername ? cleanSlug(rawUsername) : store.username;

    if (username.length < 3) {
      return res.status(400).json({ error: 'Username toko minimal 3 karakter.' });
    }

    const dupName = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(sql`LOWER(${stores.name}) = LOWER(${name})`, ne(stores.id, store.id)))
      .limit(1);
    if (dupName[0]) return res.status(409).json({ error: 'Nama toko sudah digunakan. Silakan pilih nama lain.' });

    const dupUser = await db
      .select({ id: stores.id })
      .from(stores)
      .where(and(sql`LOWER(${stores.username}) = LOWER(${username})`, ne(stores.id, store.id)))
      .limit(1);
    if (dupUser[0]) return res.status(409).json({ error: 'Username toko sudah digunakan. Silakan pilih username lain.' });

    const logoRes = validateAndCleanMediaUrl(req.body?.logo_url, store.logo_url, 'Logo Toko');
    if (logoRes.error) return res.status(400).json({ error: logoRes.error });
    const bannerRes = validateAndCleanMediaUrl(req.body?.banner_url, store.banner_url, 'Banner Toko');
    if (bannerRes.error) return res.status(400).json({ error: bannerRes.error });

    const rawLandingUrl =
      req.body?.landing_page_url !== undefined ? cleanString(req.body.landing_page_url, 1000) : undefined;
    let landingPageUrl = store.landing_page_url || '';
    if (rawLandingUrl !== undefined) {
      landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
      if (rawLandingUrl && !landingPageUrl) {
        return res.status(400).json({ error: 'Link landing page toko harus berupa URL http:// atau https:// yang valid.' });
      }
    }

    const hasPro = hasProFeatureAccess(req.authUser);
    let nextCustomHtml = store.custom_landing_html;
    if (req.body?.custom_landing_html !== undefined) {
      const sanitized = sanitizeCustomHtml(req.body.custom_landing_html);
      if (sanitized && sanitized !== store.custom_landing_html && !hasPro) {
        return res.status(403).json({
          error: 'Editor Coding Landing Page HTML/CSS khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk menggunakannya.',
        });
      }
      nextCustomHtml = sanitized;
    }

    const updated = await db
      .update(stores)
      .set({
        name,
        username,
        initials: cleanString(req.body?.initials, 4).toUpperCase() || store.initials,
        logo_url: logoRes.url,
        banner_url: bannerRes.url,
        description: req.body?.description !== undefined ? cleanString(req.body.description, 600) : store.description,
        category: cleanString(req.body?.category, 60) || store.category,
        contact_whatsapp:
          req.body?.contact_whatsapp !== undefined ? cleanString(req.body.contact_whatsapp, 30) : store.contact_whatsapp,
        contact_email:
          req.body?.contact_email !== undefined ? cleanString(req.body.contact_email, 160) : store.contact_email,
        social_instagram:
          req.body?.social_instagram !== undefined ? cleanString(req.body.social_instagram, 200) : store.social_instagram,
        social_tiktok:
          req.body?.social_tiktok !== undefined ? cleanString(req.body.social_tiktok, 200) : store.social_tiktok,
        social_youtube:
          req.body?.social_youtube !== undefined ? cleanString(req.body.social_youtube, 200) : store.social_youtube,
        social_twitter:
          req.body?.social_twitter !== undefined ? cleanString(req.body.social_twitter, 200) : store.social_twitter,
        social_shopee:
          req.body?.social_shopee !== undefined ? cleanString(req.body.social_shopee, 200) : store.social_shopee,
        social_website:
          req.body?.social_website !== undefined ? cleanString(req.body.social_website, 200) : store.social_website,
        landing_page_url: landingPageUrl,
        custom_landing_html: nextCustomHtml,
        service_link:
          req.body?.service_link !== undefined ? cleanHttpUrl(req.body.service_link, 300) : store.service_link,
        theme: cleanString(req.body?.theme, 30) || store.theme,
        store_mode: cleanString(req.body?.store_mode, 20) || store.store_mode,
        updated_at: nowIso(),
      })
      .where(and(eq(stores.id, store.id), eq(stores.user_id, userId)))
      .returning();

    res.json({ store: updated[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui pengaturan toko.');
  }
});

storeOrderRouter.post('/api/my-store/products', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const hasPro = hasProFeatureAccess(req.authUser);
    const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, userId)).limit(1);
    const store = storeRows[0];
    if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

    const title = cleanString(req.body?.title, 120);
    const category = cleanString(req.body?.category, 60) || 'Produk digital';
    if (category === 'Produk fisik' || req.body?.is_physical) {
      return res.status(400).json({ error: 'Produk fisik saat ini dinonaktifkan. Pilih kategori produk digital atau jasa.' });
    }
    const homePillar = cleanString(req.body?.home_pillar, 40) || 'Self Development';

    const rawPricingMode = cleanString(req.body?.pricing_mode, 20);
    const pricingMode: 'fixed' | 'pwyw' | 'pwyw_min' =
      rawPricingMode === 'pwyw' || rawPricingMode === 'pwyw_min' ? rawPricingMode : 'fixed';

    if (pricingMode === 'pwyw_min' && !hasPro) {
      return res.status(403).json({
        error: 'Bayar Suka-Suka dengan Minimal Harga khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk menggunakannya.',
      });
    }

    let price = Math.max(0, Math.round(Number(req.body?.price || 0)));
    let minPrice = 0;
    let originalPrice: number | null = null;

    if (pricingMode === 'fixed') {
      if (price <= 0) {
        return res.status(400).json({ error: 'Judul produk dan harga yang valid wajib diisi.' });
      }
      if (req.body?.original_price !== undefined && req.body?.original_price !== null && req.body?.original_price !== '') {
        const parsedOrig = Math.round(Number(req.body.original_price));
        if (!Number.isFinite(parsedOrig) || parsedOrig <= 0) {
          return res.status(400).json({ error: 'Harga awal harus berupa angka lebih dari 0.' });
        }
        if (price >= parsedOrig) {
          return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
        }
        originalPrice = parsedOrig;
      }
    } else if (pricingMode === 'pwyw_min') {
      minPrice = Math.round(Number(req.body?.min_price || 0));
      if (!Number.isFinite(minPrice) || minPrice < 1000) {
        return res.status(400).json({ error: 'Minimal harga untuk Bayar Suka-Suka minimal Rp 1.000.' });
      }
      price = minPrice;
    } else {
      minPrice = 0;
      price = Math.max(0, price);
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

    const customLandingHtml = sanitizeCustomHtml(req.body?.custom_landing_html);
    if (customLandingHtml && !hasPro) {
      return res.status(403).json({
        error: 'Editor Coding Landing Page HTML/CSS khusus untuk Seller WD.UP Pro.',
      });
    }

    const coverShapeRes = validateCoverShape(req.body?.cover_shape, hasPro, 'landscape');
    if (coverShapeRes.error) return res.status(403).json({ error: coverShapeRes.error });

    const ctaRes = validateCtaLabel(req.body?.cta_label, hasPro, 'Beli Sekarang');
    if (ctaRes.error) return res.status(403).json({ error: ctaRes.error });

    const addonsRes = sanitizeProductAddons(req.body?.addons);
    if (addonsRes.error) return res.status(400).json({ error: addonsRes.error });

    const coverRes = validateAndCleanMediaUrl(req.body?.image_url, '', 'Gambar Sampul');
    if (coverRes.error) return res.status(400).json({ error: coverRes.error });

    const description = cleanString(req.body?.description, 4000) || `Akses digital resmi untuk ${title}`;
    const deliveryContent = cleanString(req.body?.delivery_content, 1000);
    const affiliateEnabled = req.body?.affiliate_enabled === false ? 0 : 1;
    const affiliateCommissionPct = Math.min(50, Math.max(0, Math.round(Number(req.body?.affiliate_commission_pct ?? 15))));
    const hiddenBySeller = req.body?.hidden_by_seller ? 1 : 0;

    const accessValidation = validateAccessInput((req.body || {}) as Record<string, unknown>);
    if (accessValidation.error) return res.status(400).json({ error: accessValidation.error });

    if (!title) {
      return res.status(400).json({ error: 'Judul produk wajib diisi.' });
    }

    const productId = uid('prd');
    const inserted = await db
      .insert(products)
      .values({
        id: productId,
        store_id: store.id,
        owner_user_id: userId,
        title,
        slug: cleanSlug(title) || productId,
        category,
        home_pillar: homePillar,
        price,
        original_price: originalPrice,
        pricing_mode: pricingMode,
        min_price: minPrice,
        addons_json: JSON.stringify(addonsRes.addons),
        hidden_by_seller: hiddenBySeller,
        hidden_by_admin: 0,
        cta_label: ctaRes.label,
        cover_shape: coverShapeRes.shape,
        quota_limit: quotaLimit,
        landing_page_url: landingPageUrl,
        custom_landing_html: customLandingHtml,
        display_style: 'classic',
        description,
        image_url: coverRes.url,
        delivery_content: deliveryContent,
        access_type: accessValidation.accessType,
        access_url: accessValidation.accessUrl,
        access_file_data: accessValidation.accessFileData,
        access_file_name: accessValidation.accessFileName,
        is_physical: 0,
        affiliate_enabled: affiliateEnabled,
        affiliate_commission_pct: affiliateCommissionPct,
        status: 'active',
        created_at: nowIso(),
      })
      .returning();

    const { access_file_data, addons_json, ...rest } = inserted[0];
    res.status(201).json({
      product: {
        ...rest,
        addons: parseStoredAddons(addons_json, true),
        has_access_file: Boolean(access_file_data),
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambahkan produk baru.');
  }
});

storeOrderRouter.put('/api/my-store/products/:id/visibility', requireAuth, async (req: AuthRequest, res) => {
  try {
    const prodRows = await db
      .select({ id: products.id, hidden_by_admin: products.hidden_by_admin })
      .from(products)
      .where(and(eq(products.id, req.params.id), eq(products.owner_user_id, req.authUser!.id)))
      .limit(1);
    const prod = prodRows[0];
    if (!prod) return res.status(404).json({ error: 'Produk tidak ditemukan atau bukan milik toko Anda.' });

    const hiddenBySeller = req.body?.hidden_by_seller ? 1 : 0;
    await db
      .update(products)
      .set({ hidden_by_seller: hiddenBySeller })
      .where(and(eq(products.id, prod.id), eq(products.owner_user_id, req.authUser!.id)));

    res.json({ ok: true, hidden_by_seller: hiddenBySeller, hidden_by_admin: prod.hidden_by_admin });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui visibilitas produk.');
  }
});

storeOrderRouter.put('/api/my-store/products/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const hasPro = hasProFeatureAccess(req.authUser);
    const prodRows = await db
      .select()
      .from(products)
      .where(and(eq(products.id, req.params.id), eq(products.owner_user_id, req.authUser!.id)))
      .limit(1);
    const prod = prodRows[0];
    if (!prod) return res.status(404).json({ error: 'Produk tidak ditemukan atau bukan milik toko Anda.' });

    const title = cleanString(req.body?.title, 120) || prod.title;
    const category = cleanString(req.body?.category, 60) || prod.category;
    if (category === 'Produk fisik' || req.body?.is_physical === true) {
      return res.status(400).json({ error: 'Produk fisik saat ini dinonaktifkan. Pilih kategori produk digital atau jasa.' });
    }
    const homePillar = cleanString(req.body?.home_pillar, 40) || prod.home_pillar || 'Self Development';

    const rawPricingMode =
      req.body?.pricing_mode !== undefined ? cleanString(req.body.pricing_mode, 20) : prod.pricing_mode;
    const pricingMode: 'fixed' | 'pwyw' | 'pwyw_min' =
      rawPricingMode === 'pwyw' || rawPricingMode === 'pwyw_min' ? rawPricingMode : 'fixed';

    if (pricingMode === 'pwyw_min' && !hasPro) {
      return res.status(403).json({
        error: 'Bayar Suka-Suka dengan Minimal Harga khusus untuk Seller WD.UP Pro.',
      });
    }

    let price = req.body?.price !== undefined ? Math.max(0, Math.round(Number(req.body.price))) : prod.price;
    let minPrice = req.body?.min_price !== undefined ? Math.max(0, Math.round(Number(req.body.min_price))) : prod.min_price;
    let originalPrice: number | null = prod.original_price ?? null;

    if (pricingMode === 'fixed') {
      minPrice = 0;
      if (price <= 0) {
        return res.status(400).json({ error: 'Harga produk harus lebih dari 0.' });
      }
      if (req.body?.original_price !== undefined) {
        if (req.body.original_price === null || req.body.original_price === '') {
          originalPrice = null;
        } else {
          const parsedOrig = Math.round(Number(req.body.original_price));
          if (!Number.isFinite(parsedOrig) || parsedOrig <= 0) {
            return res.status(400).json({ error: 'Harga awal harus berupa angka lebih dari 0.' });
          }
          if (price >= parsedOrig) {
            return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
          }
          originalPrice = parsedOrig;
        }
      } else if (originalPrice !== null && price >= originalPrice) {
        originalPrice = null;
      }
    } else if (pricingMode === 'pwyw_min') {
      originalPrice = null;
      if (!Number.isFinite(minPrice) || minPrice < 1000) {
        return res.status(400).json({ error: 'Minimal harga untuk Bayar Suka-Suka minimal Rp 1.000.' });
      }
      price = minPrice;
    } else {
      originalPrice = null;
      minPrice = 0;
      price = Math.max(0, price);
    }

    let quotaLimit: number | null = prod.quota_limit ?? null;
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

    let landingPageUrl = prod.landing_page_url || '';
    if (req.body?.landing_page_url !== undefined) {
      const rawLandingUrl = cleanString(req.body.landing_page_url, 1000);
      landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
      if (rawLandingUrl && !landingPageUrl) {
        return res.status(400).json({ error: 'Link code landing page produk harus berupa URL http:// atau https:// yang valid.' });
      }
    }

    let customLandingHtml = prod.custom_landing_html || '';
    if (req.body?.custom_landing_html !== undefined) {
      const sanitized = sanitizeCustomHtml(req.body.custom_landing_html);
      if (sanitized && sanitized !== prod.custom_landing_html && !hasPro) {
        return res.status(403).json({
          error: 'Editor Coding Landing Page HTML/CSS khusus untuk Seller WD.UP Pro.',
        });
      }
      customLandingHtml = sanitized;
    }

    let coverShape = prod.cover_shape || 'landscape';
    if (req.body?.cover_shape !== undefined) {
      const shapeRes = validateCoverShape(req.body.cover_shape, hasPro, prod.cover_shape || 'landscape');
      if (shapeRes.error) return res.status(403).json({ error: shapeRes.error });
      coverShape = shapeRes.shape;
    }

    let ctaLabel = prod.cta_label || 'Beli Sekarang';
    if (req.body?.cta_label !== undefined) {
      const ctaRes = validateCtaLabel(req.body.cta_label, hasPro, prod.cta_label || 'Beli Sekarang');
      if (ctaRes.error) return res.status(403).json({ error: ctaRes.error });
      ctaLabel = ctaRes.label;
    }

    let addonsJson = prod.addons_json || '[]';
    if (req.body?.addons !== undefined) {
      const addonsRes = sanitizeProductAddons(req.body.addons);
      if (addonsRes.error) return res.status(400).json({ error: addonsRes.error });
      addonsJson = JSON.stringify(addonsRes.addons);
    }

    const coverRes = validateAndCleanMediaUrl(req.body?.image_url, prod.image_url, 'Gambar Sampul');
    if (coverRes.error) return res.status(400).json({ error: coverRes.error });

    const description =
      req.body?.description !== undefined
        ? cleanString(req.body.description, 4000) || `Akses digital resmi untuk ${title}`
        : prod.description;
    const deliveryContent =
      req.body?.delivery_content !== undefined ? cleanString(req.body.delivery_content, 1000) : prod.delivery_content;
    const status = cleanString(req.body?.status, 20) || prod.status;
    const hiddenBySeller =
      req.body?.hidden_by_seller !== undefined ? (req.body.hidden_by_seller ? 1 : 0) : prod.hidden_by_seller;
    const affiliateEnabled =
      req.body?.affiliate_enabled !== undefined ? (req.body.affiliate_enabled ? 1 : 0) : prod.affiliate_enabled;
    const affiliateCommissionPct =
      req.body?.affiliate_commission_pct !== undefined
        ? Math.min(50, Math.max(0, Math.round(Number(req.body.affiliate_commission_pct))))
        : prod.affiliate_commission_pct;

    let accessType = prod.access_type;
    let accessUrl = prod.access_url;
    let accessFileData = prod.access_file_data;
    let accessFileName = prod.access_file_name;

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
      if (accessValidation.error) return res.status(400).json({ error: accessValidation.error });
      accessType = accessValidation.accessType;
      accessUrl = accessValidation.accessUrl;
      accessFileData = accessValidation.accessFileData;
      accessFileName = accessValidation.accessFileName;
    }

    const updated = await db
      .update(products)
      .set({
        title,
        category,
        home_pillar: homePillar,
        price,
        original_price: originalPrice,
        pricing_mode: pricingMode,
        min_price: minPrice,
        addons_json: addonsJson,
        hidden_by_seller: hiddenBySeller,
        cta_label: ctaLabel,
        cover_shape: coverShape,
        quota_limit: quotaLimit,
        landing_page_url: landingPageUrl,
        custom_landing_html: customLandingHtml,
        description,
        image_url: coverRes.url,
        delivery_content: deliveryContent,
        access_type: accessType,
        access_url: accessUrl,
        access_file_data: accessFileData,
        access_file_name: accessFileName,
        is_physical: 0,
        status,
        affiliate_enabled: affiliateEnabled,
        affiliate_commission_pct: affiliateCommissionPct,
      })
      .where(and(eq(products.id, prod.id), eq(products.owner_user_id, req.authUser!.id)))
      .returning();

    const { access_file_data, addons_json, ...rest } = updated[0];
    res.json({
      product: {
        ...rest,
        addons: parseStoredAddons(addons_json, true),
        has_access_file: Boolean(access_file_data),
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui produk.');
  }
});

storeOrderRouter.delete('/api/my-store/products/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(products)
      .where(and(eq(products.id, req.params.id), eq(products.owner_user_id, req.authUser!.id)))
      .returning({ id: products.id });
    if (deleted.length === 0) {
      return res.status(404).json({ error: 'Produk tidak ditemukan atau bukan milik Anda.' });
    }
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus produk.');
  }
});

storeOrderRouter.post('/api/my-store/external-affiliates', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, userId)).limit(1);
    const store = storeRows[0];
    if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

    const title = cleanString(req.body?.title, 120);
    const category = cleanString(req.body?.category, 60) || 'Produk digital';
    const price = Math.max(0, Math.round(Number(req.body?.price || 0)));
    const originalPrice =
      req.body?.original_price && Number(req.body.original_price) > price
        ? Math.round(Number(req.body.original_price))
        : null;
    const description = cleanString(req.body?.description, 1000);
    const affiliateUrl = cleanHttpUrl(req.body?.affiliate_url, 1000);
    const displayStyle = cleanDisplayStyle(req.body?.display_style, 'classic');

    if (!title || !affiliateUrl) {
      return res.status(400).json({ error: 'Judul produk dan link affiliate (http/https) wajib diisi.' });
    }

    const coverRes = validateAndCleanMediaUrl(req.body?.image_url, '', 'Gambar Produk');
    if (coverRes.error) return res.status(400).json({ error: coverRes.error });

    const inserted = await db
      .insert(storeExternalAffiliates)
      .values({
        id: uid('extaff'),
        store_id: store.id,
        user_id: userId,
        title,
        category,
        price,
        original_price: originalPrice,
        description,
        image_url: coverRes.url,
        affiliate_url: affiliateUrl,
        display_style: displayStyle,
        clicks_count: 0,
        created_at: nowIso(),
      })
      .returning();

    res.status(201).json({ item: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambahkan produk affiliate eksternal.');
  }
});

storeOrderRouter.delete('/api/my-store/external-affiliates/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(storeExternalAffiliates)
      .where(and(eq(storeExternalAffiliates.id, req.params.id), eq(storeExternalAffiliates.user_id, req.authUser!.id)))
      .returning({ id: storeExternalAffiliates.id });
    if (deleted.length === 0) return res.status(404).json({ error: 'Produk affiliate tidak ditemukan.' });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus produk affiliate.');
  }
});

storeOrderRouter.get('/api/my-store/vouchers', requireAuth, async (req: AuthRequest, res) => {
  try {
    const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, req.authUser!.id)).limit(1);
    const store = storeRows[0];
    if (!store) return res.json({ vouchers: [] });
    const rows = await db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.scope, 'store'), eq(vouchers.store_id, store.id)))
      .orderBy(desc(vouchers.created_at));
    res.json({ vouchers: rows });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat voucher toko.');
  }
});

storeOrderRouter.post('/api/my-store/vouchers', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!hasProFeatureAccess(req.authUser)) {
      return res.status(403).json({
        error: 'Fitur Voucher Toko khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk menerbitkan kode promo toko Anda.',
      });
    }
    const userId = req.authUser!.id;
    const storeRows = await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, userId)).limit(1);
    const store = storeRows[0];
    if (!store) return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store.' });

    const code = cleanString(req.body?.code, 30).toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const title = cleanString(req.body?.title, 100) || `Promo ${code}`;
    const discountType = req.body?.discount_type === 'percent' ? 'percent' : 'fixed';
    const discountValue = Math.max(1, Math.round(Number(req.body?.discount_value || 0)));
    const minPurchase = Math.max(0, Math.round(Number(req.body?.min_purchase || 0)));
    const maxDiscount = req.body?.max_discount ? Math.max(1000, Math.round(Number(req.body.max_discount))) : null;
    const quotaLimit = req.body?.quota_limit ? Math.max(1, Math.round(Number(req.body.quota_limit))) : null;
    const expiresAt = req.body?.expires_at ? cleanString(req.body.expires_at, 40) : null;

    if (code.length < 3) return res.status(400).json({ error: 'Kode voucher minimal 3 karakter huruf/angka.' });
    if (discountType === 'percent' && discountValue > 90) {
      return res.status(400).json({ error: 'Diskon persentase maksimal 90%.' });
    }

    const dup = await db
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(sql`LOWER(${vouchers.code}) = LOWER(${code})`)
      .limit(1);
    if (dup[0]) return res.status(409).json({ error: 'Kode voucher sudah digunakan. Pilih kode unik lain.' });

    const inserted = await db
      .insert(vouchers)
      .values({
        id: uid('vch'),
        code,
        scope: 'store',
        store_id: store.id,
        owner_user_id: userId,
        title,
        discount_type: discountType,
        discount_value: discountValue,
        min_purchase: minPurchase,
        max_discount: maxDiscount,
        quota_limit: quotaLimit,
        used_count: 0,
        expires_at: expiresAt,
        is_active: 1,
        created_at: nowIso(),
      })
      .returning();

    res.status(201).json({ voucher: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal membuat voucher toko.');
  }
});

storeOrderRouter.put('/api/my-store/vouchers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    if (!hasProFeatureAccess(req.authUser)) {
      return res.status(403).json({
        error: 'Pengelolaan Voucher Toko khusus untuk Seller WD.UP Pro.',
      });
    }
    const rows = await db
      .select()
      .from(vouchers)
      .where(and(eq(vouchers.id, req.params.id), eq(vouchers.owner_user_id, req.authUser!.id), eq(vouchers.scope, 'store')))
      .limit(1);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });

    const title = req.body?.title !== undefined ? cleanString(req.body.title, 100) || existing.title : existing.title;
    const discountType =
      req.body?.discount_type !== undefined
        ? req.body.discount_type === 'percent'
          ? 'percent'
          : 'fixed'
        : existing.discount_type;
    const discountValue =
      req.body?.discount_value !== undefined
        ? Math.max(1, Math.round(Number(req.body.discount_value || 0)))
        : existing.discount_value;
    if (discountType === 'percent' && discountValue > 90) {
      return res.status(400).json({ error: 'Diskon persentase maksimal 90%.' });
    }
    const minPurchase =
      req.body?.min_purchase !== undefined
        ? Math.max(0, Math.round(Number(req.body.min_purchase || 0)))
        : existing.min_purchase;
    const maxDiscount =
      req.body?.max_discount !== undefined
        ? req.body.max_discount === null || req.body.max_discount === ''
          ? null
          : Math.max(1000, Math.round(Number(req.body.max_discount)))
        : existing.max_discount;
    const quotaLimit =
      req.body?.quota_limit !== undefined
        ? req.body.quota_limit === null || req.body.quota_limit === ''
          ? null
          : Math.max(1, Math.round(Number(req.body.quota_limit)))
        : existing.quota_limit;
    const expiresAt =
      req.body?.expires_at !== undefined
        ? req.body.expires_at
          ? cleanString(req.body.expires_at, 40)
          : null
        : existing.expires_at;
    const isActive = req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active;

    const updated = await db
      .update(vouchers)
      .set({
        title,
        discount_type: discountType,
        discount_value: discountValue,
        min_purchase: minPurchase,
        max_discount: maxDiscount,
        quota_limit: quotaLimit,
        expires_at: expiresAt,
        is_active: isActive,
      })
      .where(eq(vouchers.id, req.params.id))
      .returning();

    res.json({ voucher: updated[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui voucher toko.');
  }
});

storeOrderRouter.delete('/api/my-store/vouchers/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const deleted = await db
      .delete(vouchers)
      .where(and(eq(vouchers.id, req.params.id), eq(vouchers.owner_user_id, req.authUser!.id), eq(vouchers.scope, 'store')))
      .returning({ id: vouchers.id });
    if (deleted.length === 0) return res.status(404).json({ error: 'Voucher tidak ditemukan.' });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus voucher.');
  }
});

storeOrderRouter.get('/api/affiliate/catalog', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const userStoreRows = req.authUser
      ? await db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, req.authUser.id)).limit(1)
      : [];
    const userStore = userStoreRows[0];

    const addedRows = userStore
      ? await db
          .select({ product_id: affiliateProducts.product_id })
          .from(affiliateProducts)
          .where(eq(affiliateProducts.store_id, userStore.id))
      : [];
    const addedIds = new Set(addedRows.map((r) => r.product_id));

    const catalogRaw = await db
      .select({
        id: products.id,
        title: products.title,
        category: products.category,
        price: products.price,
        original_price: products.original_price,
        quota_limit: products.quota_limit,
        landing_page_url: products.landing_page_url,
        display_style: products.display_style,
        description: products.description,
        image_url: products.image_url,
        affiliate_commission_pct: products.affiliate_commission_pct,
        sales_count: products.sales_count,
        owner_store_name: stores.name,
        owner_store_username: stores.username,
        owner_user_id: products.owner_user_id,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.store_id))
      .where(
        and(
          eq(products.status, 'active'),
          eq(products.hidden_by_seller, 0),
          eq(products.hidden_by_admin, 0),
          eq(products.affiliate_enabled, 1),
          eq(products.is_physical, 0),
          ne(products.category, 'Produk fisik')
        )
      )
      .orderBy(desc(products.affiliate_commission_pct), desc(products.sales_count));

    const catalog = catalogRaw.map((p) => ({
      ...p,
      inMyStore: addedIds.has(p.id),
      isOwnProduct: req.authUser ? p.owner_user_id === req.authUser.id : false,
    }));

    res.json({ catalog, hasStore: Boolean(userStore) });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat katalog affiliate.');
  }
});

storeOrderRouter.post('/api/affiliate/store-items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const storeRows = await db
      .select({ id: stores.id, username: stores.username })
      .from(stores)
      .where(eq(stores.user_id, userId))
      .limit(1);
    const store = storeRows[0];
    if (!store) {
      return res.status(400).json({ error: 'Buat toko Anda terlebih dahulu di My Store untuk menambahkan produk affiliate.' });
    }

    const productId = cleanString(req.body?.product_id, 64);
    const prodRows = await db
      .select({
        id: products.id,
        owner_user_id: products.owner_user_id,
        affiliate_enabled: products.affiliate_enabled,
      })
      .from(products)
      .where(
        and(
          eq(products.id, productId),
          eq(products.status, 'active'),
          eq(products.hidden_by_seller, 0),
          eq(products.hidden_by_admin, 0)
        )
      )
      .limit(1);
    const product = prodRows[0];

    if (!product || !product.affiliate_enabled) {
      return res.status(404).json({ error: 'Produk tidak tersedia untuk program affiliate.' });
    }
    if (product.owner_user_id === userId) {
      return res.status(400).json({ error: 'Produk milik Anda sendiri otomatis tampil di katalog produk utama toko Anda.' });
    }

    const existing = await db
      .select({ id: affiliateProducts.id })
      .from(affiliateProducts)
      .where(and(eq(affiliateProducts.store_id, store.id), eq(affiliateProducts.product_id, productId)))
      .limit(1);
    if (existing[0]) {
      return res.status(409).json({ error: 'Produk ini sudah ada di toko affiliate Anda.' });
    }

    await db.insert(affiliateProducts).values({
      id: uid('aff'),
      store_id: store.id,
      affiliate_user_id: userId,
      product_id: productId,
      referral_code: store.username,
      clicks_count: 0,
      created_at: nowIso(),
    });

    res.status(201).json({ ok: true, referral_code: store.username });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambahkan produk ke etalase affiliate.');
  }
});

storeOrderRouter.delete('/api/affiliate/store-items/:productId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const storeRows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(eq(stores.user_id, req.authUser!.id))
      .limit(1);
    const store = storeRows[0];
    if (!store) return res.status(404).json({ error: 'Toko tidak ditemukan.' });

    await db
      .delete(affiliateProducts)
      .where(and(eq(affiliateProducts.store_id, store.id), eq(affiliateProducts.product_id, req.params.productId)));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus produk affiliate.');
  }
});

storeOrderRouter.post('/api/affiliate/track-click', async (req, res) => {
  try {
    const ref = cleanSlug(cleanString(req.body?.ref, 40));
    const productId = cleanString(req.body?.product_id, 64);
    if (!ref) return res.json({ tracked: false });

    const storeRows = await db
      .select({ id: stores.id, user_id: stores.user_id })
      .from(stores)
      .where(eq(stores.username, ref))
      .limit(1);
    const store = storeRows[0];
    if (!store) return res.json({ tracked: false });

    await db.insert(affiliateClicks).values({
      id: uid('aclk'),
      affiliate_user_id: store.user_id,
      store_id: store.id,
      product_id: productId || null,
      created_at: nowIso(),
    });

    if (productId) {
      await db
        .update(affiliateProducts)
        .set({ clicks_count: sql`${affiliateProducts.clicks_count} + 1` })
        .where(and(eq(affiliateProducts.store_id, store.id), eq(affiliateProducts.product_id, productId)));
    }
    res.json({ tracked: true, affiliate_store_id: store.id });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mencatat klik referral.');
  }
});

// ==========================================
// 7. CHECKOUT, ORDERS, PAYMENTS & WALLET
// ==========================================

storeOrderRouter.get('/api/payment-methods', async (_req, res) => {
  try {
    const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.is_active, 1));
    res.json({ methods });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat metode pembayaran.');
  }
});

storeOrderRouter.post('/api/vouchers/validate', optionalAuth, async (req, res) => {
  try {
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
        const pRows = await db
          .select({
            price: products.price,
            pricing_mode: products.pricing_mode,
            min_price: products.min_price,
            addons_json: products.addons_json,
            store_id: products.store_id,
            hidden_by_seller: products.hidden_by_seller,
            hidden_by_admin: products.hidden_by_admin,
          })
          .from(products)
          .where(and(eq(products.id, itemId), eq(products.status, 'active')))
          .limit(1);
        const p = pRows[0];
        if (p && p.hidden_by_seller === 0 && p.hidden_by_admin === 0) {
          let baseUnitPrice = Number(p.price);
          if (p.pricing_mode === 'pwyw' || p.pricing_mode === 'pwyw_min') {
            const minRequired = p.pricing_mode === 'pwyw_min' ? Math.max(1000, Number(p.min_price || 1000)) : 1000;
            const requested = Math.round(Number(raw?.custom_price || 0));
            baseUnitPrice = Math.max(minRequired, Number.isFinite(requested) ? requested : minRequired);
          }
          const availableAddons = parseStoredAddons(p.addons_json, true);
          const wantedAddonIds = new Set(
            Array.isArray(raw?.selected_addon_ids) ? (raw.selected_addon_ids as unknown[]).map((x) => String(x)) : []
          );
          const addonsTotal = availableAddons
            .filter((a) => wantedAddonIds.has(a.id))
            .reduce((s, a) => s + Number(a.price || 0), 0);
          const sub = (baseUnitPrice + addonsTotal) * qty;
          subtotalBeforeDiscount += sub;
          pricedItems.push({ store_id: p.store_id, subtotal: sub });
        }
      } else if (itemType === 'class') {
        const cRows = await db
          .select({ price: academyClasses.price })
          .from(academyClasses)
          .where(eq(academyClasses.id, itemId))
          .limit(1);
        if (cRows[0]) {
          subtotalBeforeDiscount += Number(cRows[0].price);
          pricedItems.push({ store_id: null, subtotal: Number(cRows[0].price) });
        }
      } else if (itemType === 'program') {
        const progRows = await db
          .select({ bundle_price: academyPrograms.bundle_price })
          .from(academyPrograms)
          .where(eq(academyPrograms.id, itemId))
          .limit(1);
        if (progRows[0]) {
          subtotalBeforeDiscount += Number(progRows[0].bundle_price);
          pricedItems.push({ store_id: null, subtotal: Number(progRows[0].bundle_price) });
        }
      } else if (itemType === 'pro_plan' && itemId in PRO_PLANS) {
        const plan = PRO_PLANS[itemId as ProPlanId];
        subtotalBeforeDiscount += plan.price;
        pricedItems.push({ store_id: null, subtotal: plan.price });
      }
    }

    const check = await validateVoucherForCart({ code, items: pricedItems, subtotalBeforeDiscount });
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
  } catch (err) {
    handleRouteError(res, err, 'Gagal memvalidasi voucher.');
  }
});

storeOrderRouter.post('/api/orders/checkout', requireAuth, async (req: AuthRequest, res) => {
  try {
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

    const pmRows = await db
      .select()
      .from(paymentMethods)
      .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.is_active, 1)))
      .limit(1);
    const pm = pmRows[0];
    if (!pm) {
      return res.status(400).json({ error: 'Pilih metode pembayaran yang valid.' });
    }

    const txResult = await db.transaction(async (tx) => {
      if (buyerWhatsappInput) {
        await tx.update(users).set({ whatsapp: buyerWhatsappInput }).where(eq(users.id, userId));
      }
      const buyerRows = await tx
        .select({ name: users.name, email: users.email, whatsapp: users.whatsapp })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const buyerRow = buyerRows[0];
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
        selected_addons_json: string;
      }> = [];

      for (const raw of rawItems) {
        const itemType = raw?.item_type;
        const itemId = cleanString(raw?.item_id, 64);
        const qty = Math.max(1, Math.min(20, Math.round(Number(raw?.quantity || 1))));
        const affRef = cleanSlug(cleanString(raw?.affiliate_username, 40));

        if (itemType === 'product') {
          const pRows = await tx
            .select()
            .from(products)
            .where(and(eq(products.id, itemId), eq(products.status, 'active')))
            .limit(1);
          const p = pRows[0];
          if (
            !p ||
            p.is_physical === 1 ||
            p.category === 'Produk fisik' ||
            p.hidden_by_seller === 1 ||
            p.hidden_by_admin === 1
          ) {
            throw new Error(`Produk ${itemId} tidak tersedia atau sedang disembunyikan.`);
          }
          if (p.quota_limit !== null && p.quota_limit !== undefined) {
            const remaining = Math.max(0, Number(p.quota_limit) - Number(p.sales_count || 0));
            if (remaining <= 0) throw new Error(`Kuota produk "${p.title}" sudah habis.`);
            if (qty > remaining) throw new Error(`Sisa kuota untuk "${p.title}" hanya ${remaining} unit.`);
          }

          let affiliateUserId: string | null = null;
          let commPct = 0;
          if (affRef && p.affiliate_enabled === 1) {
            const affStoreRows = await tx
              .select({ user_id: stores.user_id })
              .from(stores)
              .where(eq(stores.username, affRef))
              .limit(1);
            const affStore = affStoreRows[0];
            if (affStore && affStore.user_id !== userId && affStore.user_id !== p.owner_user_id) {
              affiliateUserId = affStore.user_id;
              commPct = Number(p.affiliate_commission_pct || 0);
            }
          }

          let baseUnitPrice = Number(p.price);
          if (p.pricing_mode === 'pwyw' || p.pricing_mode === 'pwyw_min') {
            const minRequired = p.pricing_mode === 'pwyw_min' ? Math.max(1000, Number(p.min_price || 1000)) : 1000;
            const requested = Math.round(Number(raw?.custom_price || 0));
            if (!Number.isFinite(requested) || requested < minRequired) {
              throw new Error(
                `Nominal bayar untuk "${p.title}" minimal Rp ${minRequired.toLocaleString('id-ID')}.`
              );
            }
            baseUnitPrice = requested;
          }

          const availableAddons = parseStoredAddons(p.addons_json, true);
          const wantedAddonIds = new Set(
            Array.isArray(raw?.selected_addon_ids) ? (raw.selected_addon_ids as unknown[]).map((x) => String(x)) : []
          );
          const chosenAddons = availableAddons.filter((a) => wantedAddonIds.has(a.id));
          const addonsTotal = chosenAddons.reduce((s, a) => s + Number(a.price || 0), 0);

          const unitPrice = baseUnitPrice + addonsTotal;
          const subtotal = unitPrice * qty;
          subtotalBeforeDiscount += subtotal;
          resolvedItems.push({
            item_type: 'product',
            item_id: itemId,
            title: chosenAddons.length > 0 ? `${p.title} (+${chosenAddons.length} Add-On)` : p.title,
            quantity: qty,
            unit_price: unitPrice,
            subtotal,
            seller_user_id: p.owner_user_id,
            store_id: p.store_id,
            affiliate_user_id: affiliateUserId,
            affiliate_commission_pct: commPct,
            selected_addons_json: JSON.stringify(chosenAddons),
          });
        } else if (itemType === 'class') {
          const cRows = await tx.select().from(academyClasses).where(eq(academyClasses.id, itemId)).limit(1);
          const c = cRows[0];
          if (!c) throw new Error(`Kelas ${itemId} tidak tersedia.`);
          const unitPrice = Number(c.price);
          subtotalBeforeDiscount += unitPrice;
          resolvedItems.push({
            item_type: 'class',
            item_id: itemId,
            title: c.title,
            quantity: 1,
            unit_price: unitPrice,
            subtotal: unitPrice,
            seller_user_id: null,
            store_id: null,
            affiliate_user_id: null,
            affiliate_commission_pct: 0,
            selected_addons_json: '[]',
          });
        } else if (itemType === 'program') {
          const progRows = await tx.select().from(academyPrograms).where(eq(academyPrograms.id, itemId)).limit(1);
          const prog = progRows[0];
          if (!prog) throw new Error(`Program belajar ${itemId} tidak tersedia.`);
          const unitPrice = Number(prog.bundle_price);
          subtotalBeforeDiscount += unitPrice;
          resolvedItems.push({
            item_type: 'program',
            item_id: itemId,
            title: `Bundle Program: ${prog.title}`,
            quantity: 1,
            unit_price: unitPrice,
            subtotal: unitPrice,
            seller_user_id: null,
            store_id: null,
            affiliate_user_id: null,
            affiliate_commission_pct: 0,
            selected_addons_json: '[]',
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
            selected_addons_json: '[]',
          });
        } else {
          throw new Error('Jenis item tidak valid.');
        }
      }

      let appliedVoucherCode = '';
      let discountAmount = 0;
      if (voucherCodeInput) {
        const vCheck = await validateVoucherForCart({
          code: voucherCodeInput,
          items: resolvedItems.map((ri) => ({ store_id: ri.store_id, subtotal: ri.subtotal })),
          subtotalBeforeDiscount,
        });
        if (!vCheck.valid || !vCheck.voucher) {
          throw new Error(vCheck.error || 'Voucher tidak valid.');
        }
        appliedVoucherCode = String(vCheck.voucher.code);
        discountAmount = vCheck.discountAmount;
        await tx
          .update(vouchers)
          .set({ used_count: sql`${vouchers.used_count} + 1` })
          .where(eq(vouchers.id, vCheck.voucher.id));
      }

      const totalAmount = Math.max(0, subtotalBeforeDiscount - discountAmount);
      const orderId = uid('ord');
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderCode = `WDUP-${datePart}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const ts = nowIso();

      const insertedOrders = await tx
        .insert(orders)
        .values({
          id: orderId,
          order_code: orderCode,
          buyer_user_id: userId,
          buyer_email: effectiveBuyerEmail,
          buyer_whatsapp: effectiveBuyerWhatsapp,
          voucher_code: appliedVoucherCode,
          discount_amount: discountAmount,
          payment_method_id: paymentMethodId,
          total_amount: totalAmount,
          status: 'Pending Payment',
          gateway_provider: 'manual',
          notes,
          created_at: ts,
          updated_at: ts,
        })
        .returning();

      for (const item of resolvedItems) {
        await tx.insert(orderItems).values({
          id: uid('oi'),
          order_id: orderId,
          item_type: item.item_type,
          item_id: item.item_id,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          seller_user_id: item.seller_user_id,
          store_id: item.store_id,
          affiliate_user_id: item.affiliate_user_id,
          affiliate_commission_pct: item.affiliate_commission_pct,
          selected_addons_json: item.selected_addons_json,
        });
      }

      await tx.insert(payments).values({
        id: uid('pay'),
        order_id: orderId,
        payer_user_id: userId,
      });

      return {
        order: insertedOrders[0],
        buyerName: buyerRow.name,
        effectiveBuyerEmail,
        effectiveBuyerWhatsapp,
        appliedVoucherCode,
        discountAmount,
        totalAmount,
        orderCode,
        resolvedItems,
      };
    });

    const reminderTitle = `Segera Posting Bukti Pembayaran — ${txResult.orderCode}`;
    const voucherNote = txResult.appliedVoucherCode
      ? ` (Voucher ${txResult.appliedVoucherCode}: -Rp ${txResult.discountAmount.toLocaleString('id-ID')})`
      : '';
    const waInfoNote = txResult.effectiveBuyerWhatsapp ? ` & WhatsApp ${txResult.effectiveBuyerWhatsapp}` : '';
    const reminderMessage = `Halo ${txResult.buyerName}, pesanan ${txResult.orderCode} senilai Rp ${txResult.totalAmount.toLocaleString('id-ID')}${voucherNote} via ${pm.provider_name} (${pm.account_number} a.n. ${pm.account_holder}) telah dibuat. Notifikasi otomatis dikirim ke ${txResult.effectiveBuyerEmail}${waInfoNote}. Segera transfer dan unggah bukti pembayaran agar admin dapat memverifikasi dan membuka akses.`;
    const itemsSummaryText = txResult.resolvedItems.map((i) => `${i.title} x${i.quantity}`).join(', ');

    const dispatchResult = await notifyAdminsAndBuyer({
      buyerUserId: userId,
      buyerEmail: txResult.effectiveBuyerEmail,
      buyerWhatsapp: txResult.effectiveBuyerWhatsapp,
      buyerEventType: 'payment_reminder',
      buyerTitle: reminderTitle,
      buyerMessage: reminderMessage,
      adminEventType: 'admin_order_new',
      adminTitle: `Pesanan Baru Masuk: ${txResult.orderCode} (Rp ${txResult.totalAmount.toLocaleString('id-ID')})`,
      adminMessage: `Pembeli: ${txResult.buyerName} (${txResult.effectiveBuyerEmail}${txResult.effectiveBuyerWhatsapp ? ` / ${txResult.effectiveBuyerWhatsapp}` : ''}). Item: ${itemsSummaryText}${voucherNote}. Menunggu pembayaran & bukti transfer.`,
    });

    const whatsappShareText = [
      `[WD.UP Pengingat Pembayaran]`,
      `Halo ${txResult.buyerName},`,
      `Pesanan: ${txResult.orderCode}`,
      `Email Konfirmasi: ${txResult.effectiveBuyerEmail}`,
      ...(txResult.effectiveBuyerWhatsapp ? [`WhatsApp Pembeli: ${txResult.effectiveBuyerWhatsapp}`] : []),
      ...(txResult.appliedVoucherCode
        ? [`Voucher: ${txResult.appliedVoucherCode} (-Rp ${txResult.discountAmount.toLocaleString('id-ID')})`]
        : []),
      `Total: Rp ${txResult.totalAmount.toLocaleString('id-ID')}`,
      `Transfer ke: ${pm.provider_name} - ${pm.account_number} (a.n. ${pm.account_holder})`,
      ``,
      `Mohon segera transfer dan posting/unggah bukti pembayaran Anda di keranjang WD.UP atau menu My Account -> My Activity agar pesanan segera diverifikasi Paid.`,
    ].join('\n');

    res.status(201).json({
      order: txResult.order,
      paymentMethod: pm,
      notificationSummary: {
        id: dispatchResult.buyerNotif.id,
        senderEmail: 'notif@wdup.com',
        buyerEmail: txResult.effectiveBuyerEmail,
        buyerWhatsapp: txResult.effectiveBuyerWhatsapp,
        emailStatus: dispatchResult.buyerNotif.emailStatus,
        waStatus: dispatchResult.buyerNotif.waStatus,
        adminNotifiedCount: dispatchResult.adminCount,
        reminderTitle,
        reminderMessage,
        whatsappShareText,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Gagal membuat pesanan.';
    res.status(400).json({ error: msg });
  }
});

storeOrderRouter.get('/api/orders', requireAuth, async (req: AuthRequest, res) => {
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
        account_number: paymentMethods.account_number,
        account_holder: paymentMethods.account_holder,
        instructions: paymentMethods.instructions,
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

    const enriched = await Promise.all(
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

    res.json({ orders: enriched });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat riwayat pesanan.');
  }
});

storeOrderRouter.post('/api/orders/:id/payment-proof', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const orderRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, req.params.id), eq(orders.buyer_user_id, userId)))
      .limit(1);
    const order = orderRows[0];

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
    await db.transaction(async (tx) => {
      await tx
        .update(payments)
        .set({
          sender_name: senderName,
          transfer_reference: transferRef,
          proof_image_data: proofImageData,
          proof_note: proofNote,
          submitted_at: ts,
        })
        .where(eq(payments.order_id, order.id));

      await tx.update(orders).set({ status: 'Waiting Verification', updated_at: ts }).where(eq(orders.id, order.id));
    });

    const buyerRows = await db
      .select({ name: users.name, email: users.email, whatsapp: users.whatsapp })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const buyerRow = buyerRows[0];
    const effectiveEmail = order.buyer_email || buyerRow?.email || req.authUser!.email;
    const effectiveWhatsapp = order.buyer_whatsapp || buyerRow?.whatsapp || '';

    await notifyAdminsAndBuyer({
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

    res.json({ ok: true, status: 'Waiting Verification' });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mengunggah bukti pembayaran.');
  }
});

storeOrderRouter.get('/api/wallet', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.authUser!.id;
    const [user, txRows, wdRows, commRows, saleIncRes, affCommRes] = await Promise.all([
      getUserById(userId),
      db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.user_id, userId))
        .orderBy(desc(walletTransactions.created_at))
        .limit(50),
      db
        .select()
        .from(withdrawals)
        .where(eq(withdrawals.user_id, userId))
        .orderBy(desc(withdrawals.created_at))
        .limit(30),
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
        .select({ t: sql<number>`COALESCE(SUM(${walletTransactions.amount}), 0)::int` })
        .from(walletTransactions)
        .where(and(eq(walletTransactions.user_id, userId), eq(walletTransactions.type, 'sale_income'))),
      db
        .select({ t: sql<number>`COALESCE(SUM(${walletTransactions.amount}), 0)::int` })
        .from(walletTransactions)
        .where(and(eq(walletTransactions.user_id, userId), eq(walletTransactions.type, 'affiliate_commission'))),
    ]);

    res.json({
      wallet_available: user?.wallet_available || 0,
      wallet_pending: user?.wallet_pending || 0,
      totalIncome: saleIncRes[0]?.t || 0,
      totalCommissions: affCommRes[0]?.t || 0,
      transactions: txRows,
      withdrawals: wdRows,
      commissions: commRows,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat saldo wallet.');
  }
});

storeOrderRouter.post('/api/wallet/withdraw', requireAuth, async (req: AuthRequest, res) => {
  try {
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

    const withdrawalId = await db.transaction(async (tx) => {
      const userRows = await tx
        .select({ wallet_available: users.wallet_available })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      const userRow = userRows[0];
      if (!userRow || userRow.wallet_available < amount) {
        throw new Error('Saldo tersedia tidak mencukupi untuk jumlah pencairan ini.');
      }

      const wdId = uid('wd');
      const ts = nowIso();
      await tx
        .update(users)
        .set({
          wallet_available: sql`${users.wallet_available} - ${amount}`,
          wallet_pending: sql`${users.wallet_pending} + ${amount}`,
        })
        .where(eq(users.id, userId));

      await tx.insert(withdrawals).values({
        id: wdId,
        user_id: userId,
        amount,
        transfer_fee: TRANSFER_FEE,
        net_amount: netAmount,
        bank_or_ewallet: bankOrEwallet,
        account_number: accountNumber,
        account_holder: accountHolder,
        status: 'Pending',
        created_at: ts,
      });

      await tx.insert(walletTransactions).values({
        id: uid('wt'),
        user_id: userId,
        type: 'withdrawal_request',
        amount: -amount,
        reference_id: wdId,
        description: `Penarikan ke ${bankOrEwallet} (${accountNumber}) · Biaya transfer Rp ${TRANSFER_FEE.toLocaleString('id-ID')} · Diterima Rp ${netAmount.toLocaleString('id-ID')}`,
        created_at: ts,
      });

      return wdId;
    });

    await notifyAdminsAndBuyer({
      buyerUserId: userId,
      buyerEmail: req.authUser!.email,
      buyerEventType: 'withdrawal',
      buyerTitle: 'Permintaan Penarikan Dana Diajukan',
      buyerMessage: `Penarikan Rp ${amount.toLocaleString('id-ID')} (biaya transfer Rp ${TRANSFER_FEE.toLocaleString('id-ID')}, dana bersih Rp ${netAmount.toLocaleString('id-ID')}) ke ${bankOrEwallet} sedang diproses admin.`,
      adminEventType: 'admin_withdrawal',
      adminTitle: `Pengajuan Penarikan Dana Baru (Rp ${amount.toLocaleString('id-ID')})`,
      adminMessage: `${req.authUser!.name} (${req.authUser!.email}) mengajukan penarikan ke ${bankOrEwallet} ${accountNumber} a.n. ${accountHolder}. Transfer bersih: Rp ${netAmount.toLocaleString('id-ID')}.`,
    });

    res.status(201).json({ ok: true, withdrawalId, transfer_fee: TRANSFER_FEE, net_amount: netAmount });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memproses pencairan.' });
  }
});

// ==========================================
// 8. CREATOR STUDIO & WD.UP AI
// ==========================================

storeOrderRouter.get('/api/creator-studio/tools', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [rawTools, rawEntries] = await Promise.all([
      db.select().from(creatorTools).where(eq(creatorTools.is_active, 1)).orderBy(asc(creatorTools.sort_order)),
      db
        .select()
        .from(creatorStudioEntries)
        .where(eq(creatorStudioEntries.user_id, req.authUser!.id))
        .orderBy(desc(creatorStudioEntries.updated_at))
        .limit(80),
    ]);

    res.json({
      tools: rawTools.map((t) => ({ ...t, config: safeJsonParse(t.config_json, {}) })),
      entries: rawEntries.map((e) => ({ ...e, payload: safeJsonParse(e.payload_json, {}) })),
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat Creator Studio.');
  }
});

storeOrderRouter.post('/api/creator-studio/entries', requireAuth, async (req: AuthRequest, res) => {
  try {
    const toolSlug = cleanSlug(cleanString(req.body?.tool_slug, 60));
    const title = cleanString(req.body?.title, 160);
    const payload = typeof req.body?.payload === 'object' && req.body.payload !== null ? req.body.payload : {};

    if (!toolSlug || !title) {
      return res.status(400).json({ error: 'Tool dan judul catatan wajib diisi.' });
    }

    const id = uid('cse');
    const ts = nowIso();
    await db.insert(creatorStudioEntries).values({
      id,
      user_id: req.authUser!.id,
      tool_slug: toolSlug,
      title,
      payload_json: JSON.stringify(payload),
      created_at: ts,
      updated_at: ts,
    });

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
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan catatan Creator Studio.');
  }
});

storeOrderRouter.delete('/api/creator-studio/entries/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    await db
      .delete(creatorStudioEntries)
      .where(and(eq(creatorStudioEntries.id, req.params.id), eq(creatorStudioEntries.user_id, req.authUser!.id)));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus catatan.');
  }
});

storeOrderRouter.post('/api/creator-studio/ai-generate', requireAuth, async (req: AuthRequest, res) => {
  if (!hasProFeatureAccess(req.authUser)) {
    return res.status(403).json({
      error: 'AI Creator WD.UP khusus untuk Seller WD.UP Pro. Upgrade ke Pro untuk membuat deskripsi & copy produk otomatis.',
    });
  }
  const mode = cleanString(req.body?.mode, 80) || 'Deskripsi Produk Menjual';
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

storeOrderRouter.post('/api/ai/assistant', optionalAuth, async (req: AuthRequest, res) => {
  const question = cleanString(req.body?.question, 1000);
  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'model'; text: string }>)
    : [];

  if (!question) {
    return res.status(400).json({ error: 'Pertanyaan tidak boleh kosong.' });
  }

  let userContext = null;
  try {
    if (req.authUser) {
      const [recentOrders, enrCountRes, userStoreRows] = await Promise.all([
        db
          .select({ order_code: orders.order_code, status: orders.status })
          .from(orders)
          .where(eq(orders.buyer_user_id, req.authUser.id))
          .orderBy(desc(orders.created_at))
          .limit(3),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(enrollments)
          .where(eq(enrollments.user_id, req.authUser.id)),
        db.select({ id: stores.id }).from(stores).where(eq(stores.user_id, req.authUser.id)).limit(1),
      ]);
      userContext = {
        name: req.authUser.name,
        role: req.authUser.role,
        ordersSummary: recentOrders.map((o) => `${o.order_code}: ${o.status}`).join(', '),
        enrollmentsCount: enrCountRes[0]?.c || 0,
        hasStore: Boolean(userStoreRows[0]),
      };
    }

    const answer = await askWdupAssistant({ question, history, userContext });
    res.json({ answer });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Layanan WD.UP AI sedang tidak tersedia.';
    res.status(502).json({ error: msg });
  }
});
