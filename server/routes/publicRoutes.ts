import crypto from 'crypto';
import express from 'express';
import { and, asc, desc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  academyCategories,
  academyClasses,
  academyModules,
  academyPrograms,
  affiliateProducts,
  enrollments,
  guestEngagements,
  homeCmsItems,
  orderItems,
  orders,
  products,
  storeExternalAffiliates,
  storeVisits,
  stores,
  userEngagements,
  users,
  vouchers,
  worksheetsAssignments,
} from '../../src/db/schema.ts';
import { type AuthRequest, isApprovedMentorOrAdmin, isUserProActive, optionalAuth, requireAuth } from '../auth.ts';
import { logNotification, nowIso, uid } from '../db.ts';
import {
  cleanHttpUrl,
  cleanSlug,
  cleanString,
  ensureEnrolled,
  getSiteFooter,
  getVisitorIdFromCookie,
  handleRouteError,
  parseStoredAddons,
  safeJsonParse,
  setVisitorCookie,
} from '../helpers.ts';

export const publicRouter = express.Router();

// ==========================================
// 3. WD.UP HOME (CMS + DISCOVERY + SEARCH)
// ==========================================

publicRouter.get('/api/home', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const q = cleanString(req.query.q as string, 100).toLowerCase();
    const cmsItems = await db
      .select()
      .from(homeCmsItems)
      .where(eq(homeCmsItems.is_active, 1))
      .orderBy(asc(homeCmsItems.sort_order));

    const banners = cmsItems.filter((i) => i.section_type === 'banner');
    const lifestyleCategories = cmsItems.filter((i) => i.section_type === 'lifestyle_category');
    const opportunities = cmsItems.filter((i) => i.section_type === 'opportunity');
    const communities = cmsItems.filter((i) => i.section_type === 'community');
    const affiliateInfo = cmsItems.filter((i) => i.section_type === 'affiliate_info');

    const rawProducts = await db
      .select({
        id: products.id,
        store_id: products.store_id,
        title: products.title,
        slug: products.slug,
        category: products.category,
        home_pillar: products.home_pillar,
        price: products.price,
        original_price: products.original_price,
        pricing_mode: products.pricing_mode,
        min_price: products.min_price,
        addons_json: products.addons_json,
        cta_label: products.cta_label,
        cover_shape: products.cover_shape,
        quota_limit: products.quota_limit,
        landing_page_url: products.landing_page_url,
        custom_landing_html: products.custom_landing_html,
        description: products.description,
        image_url: products.image_url,
        access_type: products.access_type,
        is_physical: products.is_physical,
        is_featured: products.is_featured,
        is_recommended: products.is_recommended,
        affiliate_enabled: products.affiliate_enabled,
        affiliate_commission_pct: products.affiliate_commission_pct,
        clicks_count: products.clicks_count,
        sales_count: products.sales_count,
        created_at: products.created_at,
        store_name: stores.name,
        store_username: stores.username,
        store_initials: stores.initials,
        seller_pro_expires_at: users.pro_expires_at,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.store_id))
      .innerJoin(users, eq(users.id, products.owner_user_id))
      .where(
        and(
          eq(products.status, 'active'),
          eq(products.hidden_by_seller, 0),
          eq(products.hidden_by_admin, 0),
          eq(products.is_physical, 0),
          ne(products.category, 'Produk fisik')
        )
      )
      .orderBy(desc(products.created_at));

    const allProducts = rawProducts.map(({ addons_json, ...p }) => ({
      ...p,
      addons: parseStoredAddons(addons_json, false),
      is_pro_seller: isUserProActive(p.seller_pro_expires_at),
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

    const rawFeaturedStores = await db
      .select({
        id: stores.id,
        name: stores.name,
        username: stores.username,
        initials: stores.initials,
        logo_url: stores.logo_url,
        banner_url: stores.banner_url,
        description: stores.description,
        category: stores.category,
        theme: stores.theme,
        visitors_count: stores.visitors_count,
        owner_pro_expires_at: users.pro_expires_at,
      })
      .from(stores)
      .innerJoin(users, eq(users.id, stores.user_id))
      .orderBy(desc(stores.is_featured), desc(stores.visitors_count))
      .limit(12);

    const featuredStores = await Promise.all(
      rawFeaturedStores.map(async (st) => {
        const [ownCnt, affCnt] = await Promise.all([
          db
            .select({ c: sql<number>`count(*)::int` })
            .from(products)
            .where(
              and(
                eq(products.store_id, st.id),
                eq(products.status, 'active'),
                eq(products.hidden_by_seller, 0),
                eq(products.hidden_by_admin, 0)
              )
            ),
          db
            .select({ c: sql<number>`count(*)::int` })
            .from(affiliateProducts)
            .where(eq(affiliateProducts.store_id, st.id)),
        ]);
        return {
          ...st,
          own_products_count: ownCnt[0]?.c || 0,
          affiliate_products_count: affCnt[0]?.c || 0,
          is_pro: isUserProActive(st.owner_pro_expires_at),
        };
      })
    );
    featuredStores.sort((a, b) => Number(b.is_pro) - Number(a.is_pro));
    const topFeaturedStores = featuredStores.slice(0, 6);

    let userEngagementIds: string[] = [];
    if (req.authUser) {
      const rows = await db
        .select({ cms_item_id: userEngagements.cms_item_id })
        .from(userEngagements)
        .where(eq(userEngagements.user_id, req.authUser.id));
      userEngagementIds = rows.map((r) => r.cms_item_id);
    } else {
      const visitorId = getVisitorIdFromCookie(req);
      if (visitorId) {
        const rows = await db
          .select({ cms_item_id: guestEngagements.cms_item_id })
          .from(guestEngagements)
          .where(eq(guestEngagements.visitor_id, visitorId));
        userEngagementIds = rows.map((r) => r.cms_item_id);
      }
    }

    let searchResults = null;
    if (q) {
      const matchedProducts = allProducts
        .filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        )
        .slice(0, 12);

      const likePat = `%${q}%`;
      const [matchedClasses, matchedStores] = await Promise.all([
        db
          .select({
            id: academyClasses.id,
            title: academyClasses.title,
            description: academyClasses.description,
            price: academyClasses.price,
            cover_url: academyClasses.cover_url,
            mentor_name: academyClasses.mentor_name,
            category_name: academyCategories.name,
          })
          .from(academyClasses)
          .innerJoin(academyCategories, eq(academyCategories.id, academyClasses.category_id))
          .where(
            or(
              sql`LOWER(${academyClasses.title}) LIKE ${likePat}`,
              sql`LOWER(${academyClasses.description}) LIKE ${likePat}`
            )
          )
          .limit(8),
        db
          .select({
            id: stores.id,
            name: stores.name,
            username: stores.username,
            initials: stores.initials,
            logo_url: stores.logo_url,
            category: stores.category,
            description: stores.description,
          })
          .from(stores)
          .where(
            or(
              sql`LOWER(${stores.name}) LIKE ${likePat}`,
              sql`LOWER(${stores.username}) LIKE ${likePat}`,
              sql`LOWER(${stores.description}) LIKE ${likePat}`
            )
          )
          .limit(6),
      ]);
      searchResults = { products: matchedProducts, classes: matchedClasses, stores: matchedStores };
    }

    res.json({
      banners,
      lifestyleCategories,
      featuredProducts,
      latestProducts,
      recommendedProducts,
      totalProductsCount: allProducts.length,
      featuredStores: topFeaturedStores,
      opportunities,
      communities,
      affiliateInfo,
      userEngagementIds,
      siteFooter: await getSiteFooter(),
      searchResults,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat halaman beranda.');
  }
});

publicRouter.post('/api/engagements', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const cmsItemId = cleanString(req.body?.cms_item_id, 64);
    const note = cleanString(req.body?.note, 300);
    const items = await db
      .select({
        id: homeCmsItems.id,
        section_type: homeCmsItems.section_type,
        title: homeCmsItems.title,
      })
      .from(homeCmsItems)
      .where(and(eq(homeCmsItems.id, cmsItemId), inArray(homeCmsItems.section_type, ['community', 'opportunity'])))
      .limit(1);
    const item = items[0];

    if (!item) {
      return res.status(404).json({ error: 'Community atau Opportunity tidak ditemukan.' });
    }

    if (req.authUser) {
      const existing = await db
        .select({ id: userEngagements.id })
        .from(userEngagements)
        .where(and(eq(userEngagements.user_id, req.authUser.id), eq(userEngagements.cms_item_id, cmsItemId)))
        .limit(1);

      if (existing[0]) {
        await db.delete(userEngagements).where(eq(userEngagements.id, existing[0].id));
        return res.json({ joined: false, isGuest: false });
      }

      await db.insert(userEngagements).values({
        id: uid('eng'),
        user_id: req.authUser.id,
        cms_item_id: cmsItemId,
        engagement_type: item.section_type,
        note,
        created_at: nowIso(),
      });

      await logNotification({
        userId: req.authUser.id,
        eventType: item.section_type,
        title: item.section_type === 'community' ? 'Bergabung ke Community' : 'Pendaftaran Opportunity Tercatat',
        message: `Anda tercatat mengikuti "${item.title}". Cek riwayat lengkapnya di My Activity.`,
      });

      return res.json({ joined: true, isGuest: false });
    }

    let visitorId = getVisitorIdFromCookie(req);
    if (!visitorId) {
      visitorId = uid('vis');
      setVisitorCookie(req, res, visitorId);
    }

    const existingGuest = await db
      .select({ id: guestEngagements.id })
      .from(guestEngagements)
      .where(and(eq(guestEngagements.visitor_id, visitorId), eq(guestEngagements.cms_item_id, cmsItemId)))
      .limit(1);

    if (existingGuest[0]) {
      await db.delete(guestEngagements).where(eq(guestEngagements.id, existingGuest[0].id));
      return res.json({ joined: false, isGuest: true });
    }

    await db.insert(guestEngagements).values({
      id: uid('geng'),
      visitor_id: visitorId,
      cms_item_id: cmsItemId,
      engagement_type: item.section_type,
      note,
      created_at: nowIso(),
    });

    return res.json({ joined: true, isGuest: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan partisipasi.');
  }
});

// ==========================================
// 4. WD.UP ACADEMY (CATEGORIES, PROGRAMS, CLASSES, LMS)
// ==========================================

publicRouter.get('/api/academy', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const [categories, programs, rawClasses, modCounts] = await Promise.all([
      db.select().from(academyCategories).orderBy(asc(academyCategories.sort_order)),
      db.select().from(academyPrograms),
      db
        .select({
          id: academyClasses.id,
          program_id: academyClasses.program_id,
          category_id: academyClasses.category_id,
          title: academyClasses.title,
          description: academyClasses.description,
          objectives: academyClasses.objectives,
          mentor_name: academyClasses.mentor_name,
          price: academyClasses.price,
          cover_url: academyClasses.cover_url,
          pdf_guide_title: academyClasses.pdf_guide_title,
          pdf_guide_content: academyClasses.pdf_guide_content,
          group_link: academyClasses.group_link,
          group_duration_note: academyClasses.group_duration_note,
          certificate_available: academyClasses.certificate_available,
          created_at: academyClasses.created_at,
          category_name: academyCategories.name,
          program_title: academyPrograms.title,
          program_level: academyPrograms.level,
        })
        .from(academyClasses)
        .innerJoin(academyCategories, eq(academyCategories.id, academyClasses.category_id))
        .innerJoin(academyPrograms, eq(academyPrograms.id, academyClasses.program_id))
        .orderBy(asc(academyClasses.created_at)),
      db
        .select({
          class_id: academyModules.class_id,
          c: sql<number>`count(*)::int`,
        })
        .from(academyModules)
        .groupBy(academyModules.class_id),
    ]);

    const modCountMap = new Map(modCounts.map((m) => [m.class_id, m.c]));
    const classes = rawClasses.map((c) => ({
      ...c,
      modules_count: modCountMap.get(c.id) || 0,
      objectives: safeJsonParse<string[]>(c.objectives, []),
    }));

    let userEnrollments: Array<Record<string, unknown>> = [];
    if (req.authUser) {
      const enrs = await db.select().from(enrollments).where(eq(enrollments.user_id, req.authUser.id));
      userEnrollments = enrs.map((e) => ({
        ...e,
        completed_modules: safeJsonParse<string[]>(e.completed_modules, []),
      }));
    }

    res.json({ categories, programs, classes, enrollments: userEnrollments });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat katalog WD.UP Academy.');
  }
});

publicRouter.get('/api/academy/classes/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const clsRows = await db
      .select({
        id: academyClasses.id,
        program_id: academyClasses.program_id,
        category_id: academyClasses.category_id,
        title: academyClasses.title,
        description: academyClasses.description,
        objectives: academyClasses.objectives,
        mentor_name: academyClasses.mentor_name,
        price: academyClasses.price,
        cover_url: academyClasses.cover_url,
        pdf_guide_title: academyClasses.pdf_guide_title,
        pdf_guide_content: academyClasses.pdf_guide_content,
        group_link: academyClasses.group_link,
        group_duration_note: academyClasses.group_duration_note,
        certificate_available: academyClasses.certificate_available,
        created_at: academyClasses.created_at,
        category_name: academyCategories.name,
        program_title: academyPrograms.title,
        program_level: academyPrograms.level,
      })
      .from(academyClasses)
      .innerJoin(academyCategories, eq(academyCategories.id, academyClasses.category_id))
      .innerJoin(academyPrograms, eq(academyPrograms.id, academyClasses.program_id))
      .where(eq(academyClasses.id, req.params.id))
      .limit(1);

    const cls = clsRows[0];
    if (!cls) {
      return res.status(404).json({ error: 'Kelas tidak ditemukan.' });
    }

    const isPrivileged = isApprovedMentorOrAdmin(req.authUser);
    const enrollmentRows = req.authUser
      ? await db
          .select()
          .from(enrollments)
          .where(and(eq(enrollments.user_id, req.authUser.id), eq(enrollments.class_id, req.params.id)))
          .limit(1)
      : [];
    const enrollmentRow = enrollmentRows[0];
    const hasFullAccess = Boolean(enrollmentRow || isPrivileged);

    const rawModules = await db
      .select()
      .from(academyModules)
      .where(eq(academyModules.class_id, req.params.id))
      .orderBy(asc(academyModules.sort_order));

    const modules = rawModules.map((m) => ({
      id: m.id,
      class_id: m.class_id,
      sort_order: m.sort_order,
      title: m.title,
      duration_minutes: m.duration_minutes,
      video_title: m.video_title,
      video_summary: m.video_summary,
      video_script_captions: hasFullAccess ? safeJsonParse(m.video_script_captions, []) : [],
      text_material: hasFullAccess
        ? m.text_material
        : 'Materi lengkap, video interaktif, worksheet autosave, tugas, dan quiz terbuka otomatis setelah pembelian kelas terverifikasi Paid.',
      interactive_exercise_prompt: hasFullAccess ? m.interactive_exercise_prompt : '',
      interactive_exercise_choices: hasFullAccess ? safeJsonParse(m.interactive_exercise_choices, []) : [],
      worksheet_prompt: hasFullAccess ? m.worksheet_prompt : '',
      assignment_prompt: hasFullAccess ? m.assignment_prompt : '',
      quiz_questions: hasFullAccess ? safeJsonParse(m.quiz_questions, []) : [],
    }));

    let submissions: Array<Record<string, unknown>> = [];
    if (req.authUser && hasFullAccess) {
      const subRows = await db
        .select()
        .from(worksheetsAssignments)
        .where(and(eq(worksheetsAssignments.user_id, req.authUser.id), eq(worksheetsAssignments.class_id, req.params.id)));
      submissions = subRows.map((s) => ({
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
        group_link: hasFullAccess ? cls.group_link || '' : '',
        group_duration_note: cls.group_duration_note || '',
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
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat detail kelas.');
  }
});

publicRouter.post('/api/academy/classes/:classId/modules/:moduleId/worksheet', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { classId, moduleId } = req.params;
    const userId = req.authUser!.id;
    if (!(await ensureEnrolled(req.authUser, classId))) {
      return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
    }

    const answer = cleanString(req.body?.answer, 8000);
    const action = req.body?.action === 'submit' ? 'submit' : 'autosave';
    const ts = nowIso();

    const existingRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);
    const existing = existingRows[0];

    let history = safeJsonParse<Array<Record<string, unknown>>>(existing?.feedback_history, []);
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
      await db
        .update(worksheetsAssignments)
        .set({
          worksheet_answer: answer,
          worksheet_status: nextStatus,
          feedback_history: JSON.stringify(history),
          updated_at: ts,
        })
        .where(eq(worksheetsAssignments.id, existing.id));
    } else {
      await db.insert(worksheetsAssignments).values({
        id: uid('wa'),
        user_id: userId,
        class_id: classId,
        module_id: moduleId,
        worksheet_answer: answer,
        worksheet_status: nextStatus,
        feedback_history: JSON.stringify(history),
        updated_at: ts,
      });
    }

    const updatedRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);
    const updated = updatedRows[0];
    res.json({
      submission: {
        ...updated,
        quiz_answers: safeJsonParse(updated.quiz_answers, []),
        feedback_history: safeJsonParse(updated.feedback_history, []),
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan worksheet.');
  }
});

publicRouter.post('/api/academy/classes/:classId/modules/:moduleId/assignment', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { classId, moduleId } = req.params;
    const userId = req.authUser!.id;
    if (!(await ensureEnrolled(req.authUser, classId))) {
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
    const existingRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);
    const existing = existingRows[0];

    const history = safeJsonParse<Array<Record<string, unknown>>>(existing?.feedback_history, []);
    history.push({
      at: ts,
      by: req.authUser!.name,
      status: 'Tugas Dikirim',
      note: link ? `Mengumpulkan tugas beserta tautan: ${link}` : 'Mengumpulkan tugas tertulis.',
    });

    if (existing) {
      await db
        .update(worksheetsAssignments)
        .set({
          assignment_answer: answer,
          assignment_link: link,
          assignment_status: 'submitted',
          feedback_history: JSON.stringify(history),
          updated_at: ts,
        })
        .where(eq(worksheetsAssignments.id, existing.id));
    } else {
      await db.insert(worksheetsAssignments).values({
        id: uid('wa'),
        user_id: userId,
        class_id: classId,
        module_id: moduleId,
        assignment_answer: answer,
        assignment_link: link,
        assignment_status: 'submitted',
        feedback_history: JSON.stringify(history),
        updated_at: ts,
      });
    }

    const updatedRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);
    const updated = updatedRows[0];
    res.json({
      submission: {
        ...updated,
        quiz_answers: safeJsonParse(updated.quiz_answers, []),
        feedback_history: safeJsonParse(updated.feedback_history, []),
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mengirim tugas modul.');
  }
});

publicRouter.post('/api/academy/classes/:classId/modules/:moduleId/exercise', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { classId, moduleId } = req.params;
    const userId = req.authUser!.id;
    if (!(await ensureEnrolled(req.authUser, classId))) {
      return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
    }
    const ts = nowIso();
    const existingRows = await db
      .select({ id: worksheetsAssignments.id })
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);

    if (existingRows[0]) {
      await db
        .update(worksheetsAssignments)
        .set({ exercise_completed: 1, updated_at: ts })
        .where(eq(worksheetsAssignments.id, existingRows[0].id));
    } else {
      await db.insert(worksheetsAssignments).values({
        id: uid('wa'),
        user_id: userId,
        class_id: classId,
        module_id: moduleId,
        exercise_completed: 1,
        updated_at: ts,
      });
    }
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mencatat latihan.');
  }
});

publicRouter.post('/api/academy/classes/:classId/modules/:moduleId/quiz', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { classId, moduleId } = req.params;
    const userId = req.authUser!.id;
    if (!(await ensureEnrolled(req.authUser, classId))) {
      return res.status(403).json({ error: 'Anda belum memiliki akses ke kelas ini.' });
    }

    const modRows = await db
      .select({ quiz_questions: academyModules.quiz_questions })
      .from(academyModules)
      .where(and(eq(academyModules.id, moduleId), eq(academyModules.class_id, classId)))
      .limit(1);
    const mod = modRows[0];
    if (!mod) return res.status(404).json({ error: 'Modul tidak ditemukan.' });

    const questions = safeJsonParse<Array<{ id: string; correctIndex: number }>>(mod.quiz_questions, []);
    const answers = Array.isArray(req.body?.answers) ? (req.body.answers as number[]) : [];

    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctIndex) correctCount += 1;
    });
    const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 100;
    const ts = nowIso();

    const existingRows = await db
      .select({ id: worksheetsAssignments.id })
      .from(worksheetsAssignments)
      .where(and(eq(worksheetsAssignments.user_id, userId), eq(worksheetsAssignments.module_id, moduleId)))
      .limit(1);

    if (existingRows[0]) {
      await db
        .update(worksheetsAssignments)
        .set({ quiz_score: score, quiz_answers: JSON.stringify(answers), updated_at: ts })
        .where(eq(worksheetsAssignments.id, existingRows[0].id));
    } else {
      await db.insert(worksheetsAssignments).values({
        id: uid('wa'),
        user_id: userId,
        class_id: classId,
        module_id: moduleId,
        quiz_score: score,
        quiz_answers: JSON.stringify(answers),
        updated_at: ts,
      });
    }

    res.json({ score, correctCount, total: questions.length });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memproses jawaban quiz.');
  }
});

publicRouter.post('/api/academy/classes/:classId/modules/:moduleId/complete', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { classId, moduleId } = req.params;
    const userId = req.authUser!.id;

    const enrollmentRows = await db
      .select()
      .from(enrollments)
      .where(and(eq(enrollments.user_id, userId), eq(enrollments.class_id, classId)))
      .limit(1);
    const enrollment = enrollmentRows[0];

    if (!enrollment) {
      return res.status(403).json({ error: 'Anda belum terdaftar pada kelas ini.' });
    }

    const allModules = await db
      .select({ id: academyModules.id })
      .from(academyModules)
      .where(eq(academyModules.class_id, classId));

    const completed = new Set<string>(safeJsonParse<string[]>(enrollment.completed_modules, []));
    completed.add(moduleId);

    const completedArr = Array.from(completed);
    const progressPct = allModules.length > 0 ? Math.round((completedArr.length / allModules.length) * 100) : 100;
    const isDone = progressPct >= 100;
    const certCode =
      isDone && !enrollment.certificate_code
        ? `WDUP-CERT-${crypto.randomBytes(3).toString('hex').toUpperCase()}`
        : enrollment.certificate_code;
    const completedAt = isDone && !enrollment.completed_at ? nowIso() : enrollment.completed_at;

    await db
      .update(enrollments)
      .set({
        completed_modules: JSON.stringify(completedArr),
        progress_pct: progressPct,
        certificate_code: certCode,
        completed_at: completedAt,
      })
      .where(eq(enrollments.id, enrollment.id));

    res.json({
      completed_modules: completedArr,
      progress_pct: progressPct,
      certificate_code: certCode,
      completed_at: completedAt,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyelesaikan modul.');
  }
});

// ==========================================
// 5. WD.UP MARKET & PUBLIC STOREFRONTS
// ==========================================

publicRouter.get('/api/market/products', async (req, res) => {
  try {
    const category = cleanString(req.query.category as string, 60);
    const pillar = cleanString(req.query.pillar as string, 60);
    const q = cleanString(req.query.q as string, 100).toLowerCase();
    const sort = cleanString(req.query.sort as string, 20);

    const conditions = [
      eq(products.status, 'active'),
      eq(products.hidden_by_seller, 0),
      eq(products.hidden_by_admin, 0),
      eq(products.is_physical, 0),
      ne(products.category, 'Produk fisik'),
    ];
    if (category && category !== 'Semua') {
      conditions.push(eq(products.category, category));
    }
    if (pillar && pillar !== 'Semua') {
      conditions.push(eq(products.home_pillar, pillar));
    }
    if (q) {
      const likePat = `%${q}%`;
      conditions.push(
        or(
          sql`LOWER(${products.title}) LIKE ${likePat}`,
          sql`LOWER(${products.description}) LIKE ${likePat}`,
          sql`LOWER(${stores.name}) LIKE ${likePat}`
        )!
      );
    }

    const orderByCol =
      sort === 'price_asc'
        ? asc(products.price)
        : sort === 'price_desc'
        ? desc(products.price)
        : sort === 'popular'
        ? desc(products.sales_count)
        : desc(products.created_at);

    const rawProducts = await db
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
        cta_label: products.cta_label,
        cover_shape: products.cover_shape,
        quota_limit: products.quota_limit,
        landing_page_url: products.landing_page_url,
        custom_landing_html: products.custom_landing_html,
        description: products.description,
        image_url: products.image_url,
        access_type: products.access_type,
        is_physical: products.is_physical,
        is_featured: products.is_featured,
        is_recommended: products.is_recommended,
        affiliate_enabled: products.affiliate_enabled,
        affiliate_commission_pct: products.affiliate_commission_pct,
        clicks_count: products.clicks_count,
        sales_count: products.sales_count,
        created_at: products.created_at,
        store_name: stores.name,
        store_username: stores.username,
        store_initials: stores.initials,
        store_logo: stores.logo_url,
        seller_pro_expires_at: users.pro_expires_at,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.store_id))
      .innerJoin(users, eq(users.id, products.owner_user_id))
      .where(and(...conditions))
      .orderBy(orderByCol);

    const mapped = rawProducts.map(({ addons_json, ...p }) => ({
      ...p,
      addons: parseStoredAddons(addons_json, false),
      is_pro_seller: isUserProActive(p.seller_pro_expires_at),
    }));
    if (!sort || sort === 'latest') {
      mapped.sort((a, b) => Number(b.is_pro_seller) - Number(a.is_pro_seller));
    }
    res.json({ products: mapped });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat produk WD.UP Market.');
  }
});

publicRouter.get('/api/market/products/:id', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
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
        cta_label: products.cta_label,
        cover_shape: products.cover_shape,
        hidden_by_seller: products.hidden_by_seller,
        hidden_by_admin: products.hidden_by_admin,
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
        store_name: stores.name,
        store_username: stores.username,
        store_initials: stores.initials,
        store_logo: stores.logo_url,
        store_whatsapp: stores.contact_whatsapp,
        store_description: stores.description,
        seller_pro_expires_at: users.pro_expires_at,
      })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.store_id))
      .innerJoin(users, eq(users.id, products.owner_user_id))
      .where(
        and(
          eq(products.id, req.params.id),
          eq(products.status, 'active'),
          eq(products.is_physical, 0),
          ne(products.category, 'Produk fisik')
        )
      )
      .limit(1);

    const product = rows[0];
    if (!product) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

    const isOwnerOrAdmin = Boolean(
      req.authUser && (req.authUser.role === 'admin' || req.authUser.id === product.owner_user_id)
    );
    if ((product.hidden_by_seller === 1 || product.hidden_by_admin === 1) && !isOwnerOrAdmin) {
      return res.status(404).json({ error: 'Produk ini sedang tidak ditampilkan.' });
    }

    await db
      .update(products)
      .set({ clicks_count: sql`${products.clicks_count} + 1` })
      .where(eq(products.id, req.params.id));

    let hasAccess = false;
    if (req.authUser) {
      if (isOwnerOrAdmin) {
        hasAccess = true;
      } else {
        const paidRows = await db
          .select({ id: orderItems.id })
          .from(orderItems)
          .innerJoin(orders, eq(orders.id, orderItems.order_id))
          .where(
            and(
              eq(orders.buyer_user_id, req.authUser.id),
              eq(orders.status, 'Paid'),
              eq(orderItems.item_type, 'product'),
              eq(orderItems.item_id, req.params.id)
            )
          )
          .limit(1);
        hasAccess = Boolean(paidRows[0]);
      }
    }

    const { access_file_data, addons_json, ...rest } = product;
    res.json({
      product: {
        ...rest,
        addons: parseStoredAddons(addons_json, isOwnerOrAdmin),
        is_pro_seller: isUserProActive(product.seller_pro_expires_at),
        delivery_content: hasAccess ? product.delivery_content : '',
        access_url: hasAccess ? product.access_url : '',
        access_file_name: hasAccess ? product.access_file_name : '',
        has_access_file: hasAccess ? Boolean(access_file_data) : false,
        hasAccess,
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat detail produk.');
  }
});

publicRouter.get('/api/products/:id/access-file', requireAuth, async (req: AuthRequest, res) => {
  try {
    const prodRows = await db
      .select({
        id: products.id,
        owner_user_id: products.owner_user_id,
        access_file_data: products.access_file_data,
        access_file_name: products.access_file_name,
      })
      .from(products)
      .where(eq(products.id, req.params.id))
      .limit(1);
    const product = prodRows[0];

    if (!product || !product.access_file_data) {
      return res.status(404).json({ error: 'File akses produk tidak tersedia.' });
    }

    let allowed = req.authUser!.role === 'admin' || req.authUser!.id === product.owner_user_id;
    if (!allowed) {
      const paidRows = await db
        .select({ id: orderItems.id })
        .from(orderItems)
        .innerJoin(orders, eq(orders.id, orderItems.order_id))
        .where(
          and(
            eq(orders.buyer_user_id, req.authUser!.id),
            eq(orders.status, 'Paid'),
            eq(orderItems.item_type, 'product'),
            eq(orderItems.item_id, product.id)
          )
        )
        .limit(1);
      allowed = Boolean(paidRows[0]);
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
  } catch (err) {
    handleRouteError(res, err, 'Gagal mengunduh file produk.');
  }
});

publicRouter.get('/api/stores/:username', optionalAuth, async (req: AuthRequest, res) => {
  try {
    const username = cleanSlug(req.params.username);
    const storeRows = await db
      .select({
        id: stores.id,
        user_id: stores.user_id,
        name: stores.name,
        username: stores.username,
        initials: stores.initials,
        logo_url: stores.logo_url,
        banner_url: stores.banner_url,
        description: stores.description,
        category: stores.category,
        contact_whatsapp: stores.contact_whatsapp,
        contact_email: stores.contact_email,
        social_instagram: stores.social_instagram,
        social_tiktok: stores.social_tiktok,
        social_youtube: stores.social_youtube,
        social_twitter: stores.social_twitter,
        social_shopee: stores.social_shopee,
        social_website: stores.social_website,
        landing_page_url: stores.landing_page_url,
        custom_landing_html: stores.custom_landing_html,
        service_link: stores.service_link,
        theme: stores.theme,
        store_mode: stores.store_mode,
        is_featured: stores.is_featured,
        visitors_count: stores.visitors_count,
        created_at: stores.created_at,
        updated_at: stores.updated_at,
        owner_pro_expires_at: users.pro_expires_at,
      })
      .from(stores)
      .innerJoin(users, eq(users.id, stores.user_id))
      .where(eq(stores.username, username))
      .limit(1);

    const store = storeRows[0];
    if (!store) return res.status(404).json({ error: 'Toko tidak ditemukan.' });

    await db
      .update(stores)
      .set({ visitors_count: sql`${stores.visitors_count} + 1` })
      .where(eq(stores.id, store.id));
    await db.insert(storeVisits).values({
      id: uid('sv'),
      store_id: store.id,
      visitor_user_id: req.authUser?.id || null,
      created_at: nowIso(),
    });

    const isStorePro = isUserProActive(store.owner_pro_expires_at);

    const [rawOwnProducts, rawAffProducts, externalAffiliates, storeVouchers] = await Promise.all([
      db
        .select({
          id: products.id,
          store_id: products.store_id,
          title: products.title,
          category: products.category,
          home_pillar: products.home_pillar,
          price: products.price,
          original_price: products.original_price,
          pricing_mode: products.pricing_mode,
          min_price: products.min_price,
          addons_json: products.addons_json,
          cta_label: products.cta_label,
          cover_shape: products.cover_shape,
          quota_limit: products.quota_limit,
          landing_page_url: products.landing_page_url,
          custom_landing_html: products.custom_landing_html,
          description: products.description,
          image_url: products.image_url,
          access_type: products.access_type,
          is_physical: products.is_physical,
          is_featured: products.is_featured,
          affiliate_enabled: products.affiliate_enabled,
          affiliate_commission_pct: products.affiliate_commission_pct,
          sales_count: products.sales_count,
          owner_store_name: stores.name,
          owner_store_username: stores.username,
        })
        .from(products)
        .innerJoin(stores, eq(stores.id, products.store_id))
        .where(
          and(
            eq(products.store_id, store.id),
            eq(products.status, 'active'),
            eq(products.hidden_by_seller, 0),
            eq(products.hidden_by_admin, 0),
            eq(products.is_physical, 0),
            ne(products.category, 'Produk fisik')
          )
        )
        .orderBy(desc(products.is_featured), desc(products.created_at)),
      db
        .select({
          id: products.id,
          original_store_id: products.store_id,
          title: products.title,
          category: products.category,
          home_pillar: products.home_pillar,
          price: products.price,
          original_price: products.original_price,
          pricing_mode: products.pricing_mode,
          min_price: products.min_price,
          addons_json: products.addons_json,
          cta_label: products.cta_label,
          cover_shape: products.cover_shape,
          quota_limit: products.quota_limit,
          landing_page_url: products.landing_page_url,
          custom_landing_html: products.custom_landing_html,
          description: products.description,
          image_url: products.image_url,
          access_type: products.access_type,
          is_physical: products.is_physical,
          affiliate_enabled: products.affiliate_enabled,
          affiliate_commission_pct: products.affiliate_commission_pct,
          sales_count: products.sales_count,
          referral_code: affiliateProducts.referral_code,
        })
        .from(affiliateProducts)
        .innerJoin(products, eq(products.id, affiliateProducts.product_id))
        .where(
          and(
            eq(affiliateProducts.store_id, store.id),
            eq(products.status, 'active'),
            eq(products.hidden_by_seller, 0),
            eq(products.hidden_by_admin, 0),
            eq(products.affiliate_enabled, 1),
            eq(products.is_physical, 0),
            ne(products.category, 'Produk fisik')
          )
        )
        .orderBy(desc(affiliateProducts.created_at)),
      db
        .select({
          id: storeExternalAffiliates.id,
          store_id: storeExternalAffiliates.store_id,
          title: storeExternalAffiliates.title,
          category: storeExternalAffiliates.category,
          price: storeExternalAffiliates.price,
          original_price: storeExternalAffiliates.original_price,
          description: storeExternalAffiliates.description,
          image_url: storeExternalAffiliates.image_url,
          affiliate_url: storeExternalAffiliates.affiliate_url,
          clicks_count: storeExternalAffiliates.clicks_count,
          created_at: storeExternalAffiliates.created_at,
        })
        .from(storeExternalAffiliates)
        .where(eq(storeExternalAffiliates.store_id, store.id))
        .orderBy(desc(storeExternalAffiliates.created_at)),
      db
        .select({
          id: vouchers.id,
          code: vouchers.code,
          title: vouchers.title,
          discount_type: vouchers.discount_type,
          discount_value: vouchers.discount_value,
          min_purchase: vouchers.min_purchase,
          max_discount: vouchers.max_discount,
          expires_at: vouchers.expires_at,
        })
        .from(vouchers)
        .where(and(eq(vouchers.scope, 'store'), eq(vouchers.store_id, store.id), eq(vouchers.is_active, 1)))
        .orderBy(desc(vouchers.created_at)),
    ]);

    const ownProducts = rawOwnProducts.map(({ addons_json, ...p }) => ({
      ...p,
      addons: parseStoredAddons(addons_json, false),
    }));

    const affProducts = rawAffProducts.map(({ addons_json, ...p }) => ({
      ...p,
      addons: parseStoredAddons(addons_json, false),
      owner_store_name: store.name,
      owner_store_username: store.username,
    }));

    res.json({
      store: { ...store, is_pro: isStorePro },
      ownProducts,
      affiliateProducts: affProducts,
      externalAffiliates,
      storeVouchers,
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat etalase toko.');
  }
});

publicRouter.post('/api/stores/:username/external-affiliates/:id/click', async (req, res) => {
  try {
    const id = cleanString(req.params.id, 64);
    const rows = await db
      .select({ id: storeExternalAffiliates.id, affiliate_url: storeExternalAffiliates.affiliate_url })
      .from(storeExternalAffiliates)
      .where(eq(storeExternalAffiliates.id, id))
      .limit(1);
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Produk tidak ditemukan.' });
    await db
      .update(storeExternalAffiliates)
      .set({ clicks_count: sql`${storeExternalAffiliates.clicks_count} + 1` })
      .where(eq(storeExternalAffiliates.id, id));
    res.json({ ok: true, affiliate_url: row.affiliate_url });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mencatat klik produk affiliate.');
  }
});
