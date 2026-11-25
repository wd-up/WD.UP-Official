import express from 'express';
import { and, asc, desc, eq, ne, or, sql } from 'drizzle-orm';
import { db } from '../../src/db/index.ts';
import {
  academyCategories,
  academyClasses,
  academyModules,
  academyPrograms,
  aiKnowledgeBase,
  commissions,
  creatorTools,
  enrollments,
  homeCmsItems,
  notifications,
  orderItems,
  orders,
  paymentMethods,
  payments,
  proSubscriptions,
  products,
  stores,
  systemSettings,
  users,
  vouchers,
  walletTransactions,
  withdrawals,
  worksheetsAssignments,
} from '../../src/db/schema.ts';
import {
  type AuthRequest,
  hashPassword,
  isUserProActive,
  requireAuth,
  requireMentorOrAdmin,
  requireRole,
} from '../auth.ts';
import { ensureOfficialWdupStore, logNotification, nowIso, uid } from '../db.ts';
import {
  cleanDisplayStyle,
  cleanHttpUrl,
  cleanSlug,
  cleanString,
  getSiteFooter,
  handleRouteError,
  hasEditorAccess,
  hasRoleAccessCodeConfigured,
  notifyAdminsAndBuyer,
  parseStoredAddons,
  PRO_PLANS,
  type ProPlanId,
  queryAcademySubmissions,
  safeJsonParse,
  sanitizeCustomHtml,
  sanitizeProductAddons,
  upsertSystemSetting,
  validateAccessInput,
  validateAndCleanMediaUrl,
  validateCoverShape,
  validateCtaLabel,
  validateHomeCmsMedia,
} from '../helpers.ts';

export const adminRouter = express.Router();

// ==========================================
// 9. ADMIN, EDITOR & MENTOR DASHBOARD
// ==========================================

adminRouter.get('/api/admin/overview', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    const role = req.authUser!.role;
    const [
      usersCountRes,
      storesCountRes,
      productsCountRes,
      classesCountRes,
      waitingVerificationRes,
      paidRevenueRes,
      pendingWithdrawalsRes,
      pendingSubmissionsRes,
    ] = await Promise.all([
      db.select({ c: sql<number>`count(*)::int` }).from(users),
      db.select({ c: sql<number>`count(*)::int` }).from(stores),
      db.select({ c: sql<number>`count(*)::int` }).from(products),
      db.select({ c: sql<number>`count(*)::int` }).from(academyClasses),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.status, 'Waiting Verification')),
      db
        .select({ t: sql<number>`COALESCE(SUM(${orders.total_amount}), 0)::int` })
        .from(orders)
        .where(eq(orders.status, 'Paid')),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(withdrawals)
        .where(eq(withdrawals.status, 'Pending')),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(worksheetsAssignments)
        .where(or(eq(worksheetsAssignments.worksheet_status, 'submitted'), eq(worksheetsAssignments.assignment_status, 'submitted'))),
    ]);

    res.json({
      role,
      editor_permissions: req.authUser!.editor_permissions,
      stats: {
        usersCount: usersCountRes[0]?.c || 0,
        storesCount: storesCountRes[0]?.c || 0,
        productsCount: productsCountRes[0]?.c || 0,
        classesCount: classesCountRes[0]?.c || 0,
        waitingVerificationCount: role === 'admin' ? waitingVerificationRes[0]?.c || 0 : 0,
        paidRevenue: role === 'admin' ? paidRevenueRes[0]?.t || 0 : 0,
        pendingWithdrawals: role === 'admin' ? pendingWithdrawalsRes[0]?.c || 0 : 0,
        pendingSubmissions: pendingSubmissionsRes[0]?.c || 0,
      },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat ringkasan dashboard.');
  }
});

// --- Editor + Admin: Home CMS ---
adminRouter.get('/api/admin/cms', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
    const items = await db
      .select()
      .from(homeCmsItems)
      .orderBy(asc(homeCmsItems.section_type), asc(homeCmsItems.sort_order));
    res.json({ items });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat data CMS Home.');
  }
});

adminRouter.post('/api/admin/cms', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
    const mediaCheck = validateHomeCmsMedia((req.body || {}) as Record<string, unknown>);
    if (mediaCheck.error) return res.status(400).json({ error: mediaCheck.error });

    const id = uid('cms');
    const inserted = await db
      .insert(homeCmsItems)
      .values({
        id,
        section_type: cleanString(req.body?.section_type, 40) || 'banner',
        title: cleanString(req.body?.title, 160),
        subtitle: cleanString(req.body?.subtitle, 160),
        body: cleanString(req.body?.body, 1000),
        image_url:
          mediaCheck.imageUrl ||
          (mediaCheck.mediaType === 'image' ? '/src/assets/images/hero_wdup_banner_1795359344577.jpg' : ''),
        media_type: mediaCheck.mediaType,
        media_url: mediaCheck.mediaUrl,
        link_url: mediaCheck.linkUrl,
        cta_label: cleanString(req.body?.cta_label, 60),
        cta_target: cleanString(req.body?.cta_target, 300),
        accent_color: cleanString(req.body?.accent_color, 30) || 'sage',
        icon_name: '',
        sort_order: Number(req.body?.sort_order || 1),
        is_active: req.body?.is_active === 0 ? 0 : 1,
      })
      .returning();

    res.status(201).json({ item: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambah konten CMS.');
  }
});

adminRouter.put('/api/admin/cms/:id', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
    const rows = await db.select().from(homeCmsItems).where(eq(homeCmsItems.id, req.params.id)).limit(1);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Konten CMS tidak ditemukan.' });

    const mediaCheck = validateHomeCmsMedia(
      (req.body || {}) as Record<string, unknown>,
      existing as unknown as Record<string, unknown>
    );
    if (mediaCheck.error) return res.status(400).json({ error: mediaCheck.error });

    const updated = await db
      .update(homeCmsItems)
      .set({
        title: cleanString(req.body?.title, 160) || existing.title,
        subtitle: req.body?.subtitle !== undefined ? cleanString(req.body.subtitle, 160) : existing.subtitle,
        body: req.body?.body !== undefined ? cleanString(req.body.body, 1000) : existing.body,
        image_url: mediaCheck.imageUrl,
        media_type: mediaCheck.mediaType,
        media_url: mediaCheck.mediaUrl,
        link_url: mediaCheck.linkUrl,
        cta_label: req.body?.cta_label !== undefined ? cleanString(req.body.cta_label, 60) : existing.cta_label,
        cta_target: req.body?.cta_target !== undefined ? cleanString(req.body.cta_target, 300) : existing.cta_target,
        accent_color: cleanString(req.body?.accent_color, 30) || existing.accent_color,
        icon_name: '',
        sort_order: req.body?.sort_order !== undefined ? Number(req.body.sort_order) : existing.sort_order,
        is_active: req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
      })
      .where(eq(homeCmsItems.id, req.params.id))
      .returning();

    res.json({ item: updated[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui konten CMS.');
  }
});

adminRouter.delete('/api/admin/cms/:id', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'home_cms')) return res.status(403).json({ error: 'Tidak ada izin CMS Home.' });
    await db.delete(homeCmsItems).where(eq(homeCmsItems.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus konten CMS.');
  }
});

// --- Mentor & Admin: Academy Management, Quiz Editor, Group Link & Grading ---
adminRouter.get('/api/mentor/classes', requireAuth, requireMentorOrAdmin, async (_req, res) => {
  try {
    const rawClasses = await db
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
      })
      .from(academyClasses)
      .innerJoin(academyCategories, eq(academyCategories.id, academyClasses.category_id))
      .innerJoin(academyPrograms, eq(academyPrograms.id, academyClasses.program_id))
      .orderBy(asc(academyClasses.created_at));

    const enriched = await Promise.all(
      rawClasses.map(async (cls) => {
        const mods = await db
          .select()
          .from(academyModules)
          .where(eq(academyModules.class_id, cls.id))
          .orderBy(asc(academyModules.sort_order));
        return {
          ...cls,
          objectives: safeJsonParse(cls.objectives, []),
          modules: mods.map((m) => ({
            id: m.id,
            class_id: m.class_id,
            sort_order: m.sort_order,
            title: m.title,
            duration_minutes: m.duration_minutes,
            quiz_questions: safeJsonParse(m.quiz_questions, []),
          })),
        };
      })
    );
    res.json({ classes: enriched });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat daftar kelas mentor.');
  }
});

adminRouter.put('/api/mentor/classes/:classId/group-link', requireAuth, requireMentorOrAdmin, async (req, res) => {
  try {
    const clsRows = await db
      .select({ id: academyClasses.id })
      .from(academyClasses)
      .where(eq(academyClasses.id, req.params.classId))
      .limit(1);
    if (!clsRows[0]) return res.status(404).json({ error: 'Kelas tidak ditemukan.' });

    const rawGroupLink = cleanString(req.body?.group_link, 600);
    const groupLink = rawGroupLink ? cleanHttpUrl(rawGroupLink, 600) : '';
    if (rawGroupLink && !groupLink) {
      return res.status(400).json({ error: 'Link grup WD.UP Academy harus berupa URL http:// atau https:// yang valid.' });
    }
    const durationNote = cleanString(req.body?.group_duration_note, 240);

    await db
      .update(academyClasses)
      .set({ group_link: groupLink, group_duration_note: durationNote })
      .where(eq(academyClasses.id, req.params.classId));

    res.json({ ok: true, group_link: groupLink, group_duration_note: durationNote });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan link grup kelas.');
  }
});

adminRouter.put('/api/mentor/modules/:moduleId/quiz', requireAuth, requireMentorOrAdmin, async (req, res) => {
  try {
    const modRows = await db
      .select({ id: academyModules.id })
      .from(academyModules)
      .where(eq(academyModules.id, req.params.moduleId))
      .limit(1);
    if (!modRows[0]) return res.status(404).json({ error: 'Modul tidak ditemukan.' });

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
      if (!text) return res.status(400).json({ error: `Pertanyaan quiz nomor ${i + 1} tidak boleh kosong.` });
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

    await db
      .update(academyModules)
      .set({ quiz_questions: JSON.stringify(normalized) })
      .where(eq(academyModules.id, req.params.moduleId));

    res.json({ ok: true, quiz_questions: normalized });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui quiz modul.');
  }
});

adminRouter.get('/api/mentor/submissions', requireAuth, requireMentorOrAdmin, async (_req, res) => {
  try {
    res.json({ submissions: await queryAcademySubmissions() });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat submisi peserta.');
  }
});

adminRouter.post('/api/mentor/submissions/:id/grade', requireAuth, requireMentorOrAdmin, async (req: AuthRequest, res) => {
  try {
    const subRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(eq(worksheetsAssignments.id, req.params.id))
      .limit(1);
    const sub = subRows[0];
    if (!sub) return res.status(404).json({ error: 'Submisi tidak ditemukan.' });

    const grade =
      req.body?.grade !== undefined && req.body?.grade !== null && req.body?.grade !== ''
        ? Math.min(100, Math.max(0, Math.round(Number(req.body.grade))))
        : null;
    const feedback = cleanString(req.body?.mentor_feedback, 1500);
    const worksheetStatus = cleanString(req.body?.worksheet_status, 30) || sub.worksheet_status;
    const assignmentStatus = cleanString(req.body?.assignment_status, 30) || sub.assignment_status;
    const ts = nowIso();

    const history = safeJsonParse<Array<Record<string, unknown>>>(sub.feedback_history, []);
    history.push({
      at: ts,
      by: `${req.authUser!.name} (${req.authUser!.role === 'admin' ? 'Admin' : 'Mentor'})`,
      status:
        worksheetStatus === 'revision_requested' || assignmentStatus === 'revision_requested'
          ? 'Perlu Revisi'
          : 'Dinilai Mentor',
      note: feedback || 'Penilaian diperbarui oleh mentor.',
      grade,
    });

    await db
      .update(worksheetsAssignments)
      .set({
        grade,
        mentor_feedback: feedback,
        worksheet_status: worksheetStatus,
        assignment_status: assignmentStatus,
        feedback_history: JSON.stringify(history),
        updated_at: ts,
      })
      .where(eq(worksheetsAssignments.id, req.params.id));

    await logNotification({
      userId: sub.user_id,
      eventType: 'mentor_feedback',
      title: 'Feedback & Penilaian Mentor Tersedia',
      message: `Mentor telah memberikan tanggapan${grade !== null ? ` (Nilai: ${grade})` : ''}: "${feedback.slice(0, 120)}"`,
    });

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan penilaian mentor.');
  }
});

// --- Editor + Admin: Academy Management ---
adminRouter.get('/api/admin/academy/submissions', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'academy')) return res.status(403).json({ error: 'Tidak ada izin Academy.' });
    res.json({ submissions: await queryAcademySubmissions() });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat submisi Academy.');
  }
});

adminRouter.post('/api/admin/academy/submissions/:id/grade', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
    if (!hasEditorAccess(req, 'academy')) return res.status(403).json({ error: 'Tidak ada izin Academy.' });
    const subRows = await db
      .select()
      .from(worksheetsAssignments)
      .where(eq(worksheetsAssignments.id, req.params.id))
      .limit(1);
    const sub = subRows[0];
    if (!sub) return res.status(404).json({ error: 'Submisi tidak ditemukan.' });

    const grade = req.body?.grade !== undefined ? Math.min(100, Math.max(0, Math.round(Number(req.body.grade)))) : null;
    const feedback = cleanString(req.body?.mentor_feedback, 1500);
    const worksheetStatus = cleanString(req.body?.worksheet_status, 30) || sub.worksheet_status;
    const assignmentStatus = cleanString(req.body?.assignment_status, 30) || sub.assignment_status;
    const ts = nowIso();

    const history = safeJsonParse<Array<Record<string, unknown>>>(sub.feedback_history, []);
    history.push({
      at: ts,
      by: `${req.authUser!.name} (Mentor)`,
      status:
        worksheetStatus === 'revision_requested' || assignmentStatus === 'revision_requested'
          ? 'Perlu Revisi'
          : 'Dinilai Mentor',
      note: feedback || 'Penilaian diperbarui oleh mentor.',
      grade,
    });

    await db
      .update(worksheetsAssignments)
      .set({
        grade,
        mentor_feedback: feedback,
        worksheet_status: worksheetStatus,
        assignment_status: assignmentStatus,
        feedback_history: JSON.stringify(history),
        updated_at: ts,
      })
      .where(eq(worksheetsAssignments.id, req.params.id));

    await logNotification({
      userId: sub.user_id,
      eventType: 'mentor_feedback',
      title: 'Feedback & Penilaian Mentor Tersedia',
      message: `Mentor telah memberikan tanggapan${grade !== null ? ` (Nilai: ${grade})` : ''}: "${feedback.slice(0, 120)}"`,
    });

    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan penilaian tugas.');
  }
});

adminRouter.post('/api/admin/academy/classes', requireAuth, requireRole(['admin', 'editor']), async (req: AuthRequest, res) => {
  try {
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
    await db.transaction(async (tx) => {
      await tx.insert(academyClasses).values({
        id: classId,
        program_id: programId,
        category_id: categoryId,
        title,
        description,
        objectives: JSON.stringify(['Memahami konsep inti kelas', 'Mempraktikkan studi kasus nyata melalui worksheet']),
        mentor_name: mentorName,
        price,
        cover_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        pdf_guide_title: '',
        pdf_guide_content: '',
        group_link: groupLink,
        group_duration_note: groupDurationNote,
        certificate_available: 1,
        created_at: nowIso(),
      });

      await tx.insert(academyModules).values({
        id: modId,
        class_id: classId,
        sort_order: 1,
        title: 'Modul 1: Pengantar & Kerangka Praktik',
        duration_minutes: 15,
        video_title: `Video Pembelajaran — ${title}`,
        video_summary: description.slice(0, 180),
        video_script_captions: JSON.stringify([{ time: '00:00', heading: 'Pengantar Kelas', text: description }]),
        text_material: description,
        interactive_exercise_prompt: '',
        interactive_exercise_choices: '[]',
        worksheet_prompt: 'Tuliskan rencana aksi pribadi Anda setelah mempelajari modul ini:',
        assignment_prompt: 'Kumpulkan hasil praktik pertama Anda (teks atau tautan aktif karya):',
        quiz_questions: JSON.stringify([
          { id: 'q1', question: `Apa tujuan utama mempelajari ${title}?`, options: ['Menghasilkan karya dan sistem kerja nyata', 'Hanya membaca teori tanpa praktik'], correctIndex: 0 },
          { id: 'q2', question: 'Langkah pertama sebelum mengeksekusi proyek digital adalah...', options: ['Memahami kebutuhan spesifik audiens target', 'Langsung promosi tanpa rencana'], correctIndex: 0 },
          { id: 'q3', question: 'Mengapa worksheet perlu diisi berurutan?', options: ['Agar ide tersusun sistematis dan siap dipraktikkan', 'Tidak memiliki fungsi'], correctIndex: 0 },
          { id: 'q4', question: 'Apa manfaat mengirimkan tautan tugas ke mentor?', options: ['Mendapatkan masukan terarah untuk perbaikan karya', 'Menghapus progres belajar'], correctIndex: 0 },
          { id: 'q5', question: 'Bagaimana menjaga konsistensi setelah menyelesaikan modul 1?', options: ['Menerapkan jadwal praktik rutin dan berdiskusi di grup kelas', 'Berhenti di materi pengantar'], correctIndex: 0 },
        ]),
      });
    });

    res.status(201).json({ classId });
  } catch (err) {
    handleRouteError(res, err, 'Gagal membuat kelas baru.');
  }
});

// --- Admin Only: Users, Roles, Mentor ACC & Access Codes ---
adminRouter.get('/api/admin/users', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const rawUsers = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        whatsapp: users.whatsapp,
        role: users.role,
        mentor_status: users.mentor_status,
        editor_permissions: users.editor_permissions,
        wallet_available: users.wallet_available,
        wallet_pending: users.wallet_pending,
        pro_plan: users.pro_plan,
        pro_expires_at: users.pro_expires_at,
        created_at: users.created_at,
      })
      .from(users)
      .where(ne(users.password_hash, 'showcase_only_locked'))
      .orderBy(desc(users.created_at));

    const mapped = rawUsers.map((u) => ({
      ...u,
      mentor_status: u.mentor_status || 'none',
      is_pro: isUserProActive(u.pro_expires_at),
      editor_permissions: safeJsonParse<string[]>(u.editor_permissions, []),
    }));
    res.json({ users: mapped });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat daftar pengguna.');
  }
});

adminRouter.put('/api/admin/users/:id/pro', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const planId = cleanString(req.body?.plan_id, 30);
    if (!planId || planId === 'none') {
      await db.update(users).set({ pro_plan: '', pro_expires_at: null }).where(eq(users.id, req.params.id));
      return res.json({ ok: true });
    }
    if (!(planId in PRO_PLANS)) {
      return res.status(400).json({ error: 'Paket Pro tidak valid.' });
    }
    const plan = PRO_PLANS[planId as ProPlanId];
    const ts = nowIso();
    const expiresAt = new Date(Date.now() + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();
    await db.update(users).set({ pro_plan: plan.id, pro_expires_at: expiresAt }).where(eq(users.id, req.params.id));
    await db.insert(proSubscriptions).values({
      id: uid('pro'),
      user_id: req.params.id,
      plan_id: plan.id,
      plan_name: plan.name,
      price: plan.price,
      duration_days: plan.duration_days,
      order_id: null,
      started_at: ts,
      expires_at: expiresAt,
      created_at: ts,
    });
    res.json({ ok: true, pro_expires_at: expiresAt });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status Pro pengguna.');
  }
});

adminRouter.put('/api/admin/users/:id/role', requireAuth, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
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
    await db
      .update(users)
      .set({
        role,
        mentor_status: mentorStatus,
        editor_permissions: JSON.stringify(permissions),
      })
      .where(eq(users.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui role pengguna.');
  }
});

adminRouter.put('/api/admin/users/:id/mentor-status', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const status = cleanString(req.body?.mentor_status, 20);
    if (!['approved', 'rejected', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Status persetujuan Mentor tidak valid.' });
    }
    const targetRows = await db
      .select({ id: users.id, name: users.name, email: users.email, whatsapp: users.whatsapp })
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);
    const target = targetRows[0];
    if (!target) return res.status(404).json({ error: 'Pengguna tidak ditemukan.' });

    const nextRole = status === 'approved' ? 'mentor' : status === 'rejected' ? 'member' : 'mentor';
    await db.update(users).set({ role: nextRole, mentor_status: status }).where(eq(users.id, target.id));

    await logNotification({
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
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status Mentor.');
  }
});

adminRouter.get('/api/admin/access-codes', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const [hasMentorCode, hasAdminCode] = await Promise.all([
      hasRoleAccessCodeConfigured('mentor'),
      hasRoleAccessCodeConfigured('admin'),
    ]);
    res.json({
      hasMentorCode,
      hasAdminCode,
      envMentorCodeActive: Boolean(process.env.MENTOR_PASSCODE?.trim()),
      envAdminCodeActive: Boolean(process.env.ADMIN_PASSCODE?.trim()),
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat status kode akses.');
  }
});

adminRouter.put('/api/admin/access-codes', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const mentorCode = typeof req.body?.mentor_code === 'string' ? req.body.mentor_code.trim() : undefined;
    const adminCode = typeof req.body?.admin_code === 'string' ? req.body.admin_code.trim() : undefined;

    if (mentorCode !== undefined) {
      if (mentorCode === '') {
        await db.delete(systemSettings).where(eq(systemSettings.key, 'mentor_access_code_hash'));
      } else if (mentorCode.length < 4) {
        return res.status(400).json({ error: 'Kode akses Mentor minimal 4 karakter.' });
      } else {
        await upsertSystemSetting('mentor_access_code_hash', hashPassword(mentorCode));
      }
    }
    if (adminCode !== undefined) {
      if (adminCode === '') {
        await db.delete(systemSettings).where(eq(systemSettings.key, 'admin_access_code_hash'));
      } else if (adminCode.length < 4) {
        return res.status(400).json({ error: 'Kode akses Admin minimal 4 karakter.' });
      } else {
        await upsertSystemSetting('admin_access_code_hash', hashPassword(adminCode));
      }
    }

    const [hasMentorCode, hasAdminCode] = await Promise.all([
      hasRoleAccessCodeConfigured('mentor'),
      hasRoleAccessCodeConfigured('admin'),
    ]);
    res.json({ ok: true, hasMentorCode, hasAdminCode });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui kode akses.');
  }
});

// --- Admin Only: Platform Vouchers ---
adminRouter.get('/api/admin/vouchers', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: vouchers.id,
        code: vouchers.code,
        scope: vouchers.scope,
        store_id: vouchers.store_id,
        owner_user_id: vouchers.owner_user_id,
        title: vouchers.title,
        discount_type: vouchers.discount_type,
        discount_value: vouchers.discount_value,
        min_purchase: vouchers.min_purchase,
        max_discount: vouchers.max_discount,
        quota_limit: vouchers.quota_limit,
        used_count: vouchers.used_count,
        expires_at: vouchers.expires_at,
        is_active: vouchers.is_active,
        created_at: vouchers.created_at,
        store_name: stores.name,
      })
      .from(vouchers)
      .leftJoin(stores, eq(stores.id, vouchers.store_id))
      .orderBy(desc(vouchers.created_at));
    res.json({ vouchers: rows });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat daftar voucher.');
  }
});

adminRouter.post('/api/admin/vouchers', requireAuth, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
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
    const dup = await db
      .select({ id: vouchers.id })
      .from(vouchers)
      .where(sql`LOWER(${vouchers.code}) = LOWER(${code})`)
      .limit(1);
    if (dup[0]) return res.status(409).json({ error: 'Kode voucher sudah digunakan.' });

    const inserted = await db
      .insert(vouchers)
      .values({
        id: uid('vch'),
        code,
        scope: 'platform',
        store_id: null,
        owner_user_id: req.authUser!.id,
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
    handleRouteError(res, err, 'Gagal membuat voucher platform.');
  }
});

adminRouter.put('/api/admin/vouchers/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const rows = await db.select().from(vouchers).where(eq(vouchers.id, req.params.id)).limit(1);
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
    if (discountType === 'percent' && discountValue > 100) {
      return res.status(400).json({ error: 'Diskon persentase maksimal 100%.' });
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

    res.json({ ok: true, voucher: updated[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui voucher.');
  }
});

adminRouter.delete('/api/admin/vouchers/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await db.delete(vouchers).where(eq(vouchers.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus voucher.');
  }
});

// --- Admin Only: Payment Methods & Order Verification ---
adminRouter.get('/api/admin/payment-methods', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ methods: await db.select().from(paymentMethods) });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat metode pembayaran.');
  }
});

adminRouter.post('/api/admin/payment-methods', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const providerName = cleanString(req.body?.provider_name, 80);
    const accountNumber = cleanString(req.body?.account_number, 60);
    const accountHolder = cleanString(req.body?.account_holder, 100);
    if (!providerName || !accountNumber || !accountHolder) {
      return res.status(400).json({ error: 'Nama bank/e-wallet, nomor rekening, dan nama pemilik wajib diisi.' });
    }
    const inserted = await db
      .insert(paymentMethods)
      .values({
        id: uid('pm'),
        type: cleanString(req.body?.type, 30) || 'bank_transfer',
        provider_name: providerName,
        account_number: accountNumber,
        account_holder: accountHolder,
        instructions: cleanString(req.body?.instructions, 500),
        is_active: 1,
      })
      .returning();
    res.status(201).json({ method: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambah metode pembayaran.');
  }
});

adminRouter.put('/api/admin/payment-methods/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.id, req.params.id)).limit(1);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });

    const updated = await db
      .update(paymentMethods)
      .set({
        type: cleanString(req.body?.type, 30) || existing.type,
        provider_name: cleanString(req.body?.provider_name, 80) || existing.provider_name,
        account_number: cleanString(req.body?.account_number, 60) || existing.account_number,
        account_holder: cleanString(req.body?.account_holder, 100) || existing.account_holder,
        instructions: req.body?.instructions !== undefined ? cleanString(req.body.instructions, 500) : existing.instructions,
        is_active: req.body?.is_active !== undefined ? (req.body.is_active ? 1 : 0) : existing.is_active,
      })
      .where(eq(paymentMethods.id, req.params.id))
      .returning();

    res.json({ method: updated[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui metode pembayaran.');
  }
});

adminRouter.delete('/api/admin/payment-methods/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const rows = await db
      .select({ id: paymentMethods.id })
      .from(paymentMethods)
      .where(eq(paymentMethods.id, req.params.id))
      .limit(1);
    if (!rows[0]) return res.status(404).json({ error: 'Metode pembayaran tidak ditemukan.' });

    await db.transaction(async (tx) => {
      await tx.update(orders).set({ payment_method_id: null }).where(eq(orders.payment_method_id, req.params.id));
      await tx.delete(paymentMethods).where(eq(paymentMethods.id, req.params.id));
    });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus metode pembayaran.');
  }
});

adminRouter.get('/api/admin/orders', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
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
        voucher_code: orders.voucher_code,
        discount_amount: orders.discount_amount,
        is_guest: orders.is_guest,
        notes: orders.notes,
        created_at: orders.created_at,
        updated_at: orders.updated_at,
        buyer_name: users.name,
        order_buyer_email: orders.buyer_email,
        user_email: users.email,
        order_buyer_whatsapp: orders.buyer_whatsapp,
        user_whatsapp: users.whatsapp,
        provider_name: paymentMethods.provider_name,
        sender_name: payments.sender_name,
        transfer_reference: payments.transfer_reference,
        proof_image_data: payments.proof_image_data,
        proof_note: payments.proof_note,
        submitted_at: payments.submitted_at,
        verification_note: payments.verification_note,
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.buyer_user_id))
      .leftJoin(paymentMethods, eq(paymentMethods.id, orders.payment_method_id))
      .leftJoin(payments, eq(payments.order_id, orders.id))
      .orderBy(desc(orders.created_at));

    const enriched = await Promise.all(
      rawOrders.map(async (o) => {
        const items = await db.select().from(orderItems).where(eq(orderItems.order_id, o.id));
        const { order_buyer_email, user_email, order_buyer_whatsapp, user_whatsapp, ...rest } = o;
        return {
          ...rest,
          buyer_email: order_buyer_email || user_email,
          buyer_whatsapp: order_buyer_whatsapp || user_whatsapp,
          items,
        };
      })
    );
    res.json({ orders: enriched });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat daftar pesanan.');
  }
});

adminRouter.post('/api/admin/orders/:id/verify', requireAuth, requireRole(['admin']), async (req: AuthRequest, res) => {
  const targetStatus = req.body?.status;
  const verificationNote = cleanString(req.body?.verification_note, 300);

  if (!['Paid', 'Rejected', 'Cancelled', 'Refunded'].includes(targetStatus)) {
    return res.status(400).json({ error: 'Status verifikasi tidak valid.' });
  }

  try {
    const pendingNotifs: Array<{
      userId: string;
      eventType: string;
      title: string;
      message: string;
    }> = [];

    const txInfo = await db.transaction(async (tx) => {
      const orderRows = await tx.select().from(orders).where(eq(orders.id, req.params.id)).limit(1);
      const order = orderRows[0];
      if (!order) throw new Error('Pesanan tidak ditemukan.');

      if (order.status === 'Paid' && targetStatus === 'Paid') {
        throw new Error('Pesanan sudah terverifikasi Paid sebelumnya (mencegah transaksi ganda).');
      }

      const buyerRows = await tx
        .select({ name: users.name, email: users.email, whatsapp: users.whatsapp })
        .from(users)
        .where(eq(users.id, order.buyer_user_id))
        .limit(1);
      const buyerRow = buyerRows[0];
      const effectiveBuyerEmail = order.buyer_email || buyerRow?.email || '';
      const effectiveBuyerWhatsapp = order.buyer_whatsapp || buyerRow?.whatsapp || '';

      const ts = nowIso();
      await tx.update(orders).set({ status: targetStatus, updated_at: ts }).where(eq(orders.id, order.id));
      await tx
        .update(payments)
        .set({ verified_by_user_id: req.authUser!.id, verification_note: verificationNote, verified_at: ts })
        .where(eq(payments.order_id, order.id));

      if (targetStatus === 'Paid') {
        const items = await tx.select().from(orderItems).where(eq(orderItems.order_id, order.id));

        for (const item of items) {
          if (item.item_type === 'class') {
            const clsRows = await tx
              .select({ program_id: academyClasses.program_id })
              .from(academyClasses)
              .where(eq(academyClasses.id, item.item_id))
              .limit(1);
            await tx
              .insert(enrollments)
              .values({
                id: uid('enr'),
                user_id: order.buyer_user_id,
                class_id: item.item_id,
                program_id: clsRows[0]?.program_id || null,
                order_id: order.id,
                created_at: ts,
              })
              .onConflictDoNothing();
          } else if (item.item_type === 'program') {
            const classes = await tx
              .select({ id: academyClasses.id })
              .from(academyClasses)
              .where(eq(academyClasses.program_id, item.item_id));
            for (const cl of classes) {
              await tx
                .insert(enrollments)
                .values({
                  id: uid('enr'),
                  user_id: order.buyer_user_id,
                  class_id: cl.id,
                  program_id: item.item_id,
                  order_id: order.id,
                  created_at: ts,
                })
                .onConflictDoNothing();
            }
          } else if (item.item_type === 'pro_plan') {
            const plan = PRO_PLANS[(item.item_id as ProPlanId) in PRO_PLANS ? (item.item_id as ProPlanId) : 'pro_1m'];
            const curUserRows = await tx
              .select({ pro_expires_at: users.pro_expires_at })
              .from(users)
              .where(eq(users.id, order.buyer_user_id))
              .limit(1);
            const curExp = curUserRows[0]?.pro_expires_at;
            const baseMs = curExp && Date.parse(curExp) > Date.now() ? Date.parse(curExp) : Date.now();
            const nextExpiresAt = new Date(baseMs + plan.duration_days * 24 * 60 * 60 * 1000).toISOString();

            await tx
              .update(users)
              .set({ pro_plan: plan.id, pro_expires_at: nextExpiresAt })
              .where(eq(users.id, order.buyer_user_id));

            await tx.insert(proSubscriptions).values({
              id: uid('pro'),
              user_id: order.buyer_user_id,
              plan_id: plan.id,
              plan_name: plan.name,
              price: plan.price,
              duration_days: plan.duration_days,
              order_id: order.id,
              started_at: ts,
              expires_at: nextExpiresAt,
              created_at: ts,
            });
          } else if (item.item_type === 'product') {
            await tx
              .update(products)
              .set({ sales_count: sql`${products.sales_count} + ${Number(item.quantity)}` })
              .where(eq(products.id, item.item_id));

            const subtotal = Number(item.subtotal);
            let commissionAmt = 0;

            if (item.affiliate_user_id && Number(item.affiliate_commission_pct) > 0) {
              commissionAmt = Math.round((subtotal * Number(item.affiliate_commission_pct)) / 100);
              const existingComm = await tx
                .select({ id: commissions.id })
                .from(commissions)
                .where(eq(commissions.order_item_id, item.id))
                .limit(1);
              if (!existingComm[0] && commissionAmt > 0) {
                await tx.insert(commissions).values({
                  id: uid('com'),
                  order_id: order.id,
                  order_item_id: item.id,
                  affiliate_user_id: item.affiliate_user_id,
                  seller_user_id: item.seller_user_id || '',
                  amount: commissionAmt,
                  status: 'credited',
                  created_at: ts,
                });

                await tx
                  .update(users)
                  .set({ wallet_available: sql`${users.wallet_available} + ${commissionAmt}` })
                  .where(eq(users.id, item.affiliate_user_id));

                await tx.insert(walletTransactions).values({
                  id: uid('wt'),
                  user_id: item.affiliate_user_id,
                  type: 'affiliate_commission',
                  amount: commissionAmt,
                  reference_id: order.id,
                  description: `Komisi affiliate dari pesanan ${order.order_code} (${item.title})`,
                  created_at: ts,
                });

                pendingNotifs.push({
                  userId: item.affiliate_user_id,
                  eventType: 'affiliate_commission',
                  title: 'Komisi Affiliate Tercatat',
                  message: `Komisi sebesar Rp ${commissionAmt.toLocaleString('id-ID')} dari pesanan ${order.order_code} telah masuk ke saldo tersedia Anda.`,
                });
              }
            }

            if (item.seller_user_id && item.seller_user_id !== 'usr_wdup_official') {
              const sellerRows = await tx
                .select({ pro_expires_at: users.pro_expires_at })
                .from(users)
                .where(eq(users.id, item.seller_user_id))
                .limit(1);
              const sellerIsPro = isUserProActive(sellerRows[0]?.pro_expires_at);
              const platformFee = sellerIsPro ? 0 : Math.round(subtotal * 0.05);
              const sellerNet = Math.max(0, subtotal - platformFee - commissionAmt);

              await tx
                .update(orderItems)
                .set({ platform_fee_amount: platformFee, seller_net_amount: sellerNet })
                .where(eq(orderItems.id, item.id));

              await tx
                .update(users)
                .set({ wallet_available: sql`${users.wallet_available} + ${sellerNet}` })
                .where(eq(users.id, item.seller_user_id));

              const feeNote = sellerIsPro
                ? 'Biaya transaksi 0% (Member Pro)'
                : `Potongan 5% Rp ${platformFee.toLocaleString('id-ID')}`;
              await tx.insert(walletTransactions).values({
                id: uid('wt'),
                user_id: item.seller_user_id,
                type: 'sale_income',
                amount: sellerNet,
                reference_id: order.id,
                description: `Penjualan ${item.title} (${order.order_code}) · ${feeNote}`,
                created_at: ts,
              });

              pendingNotifs.push({
                userId: item.seller_user_id,
                eventType: 'seller_order',
                title: `Pesanan Baru Terverifikasi (${order.order_code})`,
                message: `Produk "${item.title}" terjual. ${feeNote}. Pendapatan bersih Rp ${sellerNet.toLocaleString('id-ID')} masuk ke saldo toko.`,
              });
            }
          }
        }
      }

      return { order, effectiveBuyerEmail, effectiveBuyerWhatsapp };
    });

    for (const n of pendingNotifs) {
      await logNotification(n);
    }

    if (targetStatus === 'Paid') {
      await notifyAdminsAndBuyer({
        buyerUserId: txInfo.order.buyer_user_id,
        buyerEmail: txInfo.effectiveBuyerEmail,
        buyerWhatsapp: txInfo.effectiveBuyerWhatsapp,
        buyerEventType: 'payment_confirmed',
        buyerTitle: `Pembayaran ${txInfo.order.order_code} Terverifikasi (Paid)`,
        buyerMessage: `Pembayaran Anda valid! Akses kelas Academy, paket WD.UP Pro, atau produk digital pada pesanan ini telah dibuka otomatis. Salinan konfirmasi dikirim ke ${txInfo.effectiveBuyerEmail}${txInfo.effectiveBuyerWhatsapp ? ` & WA ${txInfo.effectiveBuyerWhatsapp}` : ''}.`,
        adminEventType: 'admin_order_verified',
        adminTitle: `Verifikasi Selesai (Paid): ${txInfo.order.order_code}`,
        adminMessage: `Order ${txInfo.order.order_code} (${txInfo.effectiveBuyerEmail}) telah diverifikasi Paid oleh ${req.authUser!.name}.`,
      });
    } else {
      await notifyAdminsAndBuyer({
        buyerUserId: txInfo.order.buyer_user_id,
        buyerEmail: txInfo.effectiveBuyerEmail,
        buyerWhatsapp: txInfo.effectiveBuyerWhatsapp,
        buyerEventType: 'payment_status',
        buyerTitle: `Status Pesanan ${txInfo.order.order_code}: ${targetStatus}`,
        buyerMessage: verificationNote || `Status pesanan diperbarui menjadi ${targetStatus}.`,
        adminEventType: 'admin_order_verified',
        adminTitle: `Update Status Order ${txInfo.order.order_code}: ${targetStatus}`,
        adminMessage: `Order ${txInfo.order.order_code} diubah ke ${targetStatus} oleh ${req.authUser!.name}.`,
      });
    }

    res.json({ ok: true, status: targetStatus });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memverifikasi pembayaran.' });
  }
});

// --- Admin Only: Withdrawals ---
adminRouter.get('/api/admin/withdrawals', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const rows = await db
      .select({
        id: withdrawals.id,
        user_id: withdrawals.user_id,
        amount: withdrawals.amount,
        transfer_fee: withdrawals.transfer_fee,
        net_amount: withdrawals.net_amount,
        bank_or_ewallet: withdrawals.bank_or_ewallet,
        account_number: withdrawals.account_number,
        account_holder: withdrawals.account_holder,
        status: withdrawals.status,
        admin_note: withdrawals.admin_note,
        created_at: withdrawals.created_at,
        processed_at: withdrawals.processed_at,
        user_name: users.name,
        user_email: users.email,
      })
      .from(withdrawals)
      .innerJoin(users, eq(users.id, withdrawals.user_id))
      .orderBy(desc(withdrawals.created_at));
    res.json({ withdrawals: rows });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat daftar pencairan dana.');
  }
});

adminRouter.post('/api/admin/withdrawals/:id/process', requireAuth, requireRole(['admin']), async (req, res) => {
  const status = req.body?.status;
  const adminNote = cleanString(req.body?.admin_note, 300);
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status pencairan harus Approved atau Rejected.' });
  }

  try {
    const wdInfo = await db.transaction(async (tx) => {
      const wdRows = await tx.select().from(withdrawals).where(eq(withdrawals.id, req.params.id)).limit(1);
      const wd = wdRows[0];
      if (!wd) throw new Error('Permintaan pencairan tidak ditemukan.');
      if (wd.status !== 'Pending') throw new Error('Permintaan pencairan sudah diproses sebelumnya.');

      const amount = Number(wd.amount);
      const fee = Number(wd.transfer_fee || 3000);
      const netAmount = Number(wd.net_amount || Math.max(0, amount - fee));
      const ts = nowIso();

      await tx
        .update(withdrawals)
        .set({ status, admin_note: adminNote, processed_at: ts })
        .where(eq(withdrawals.id, wd.id));

      if (status === 'Approved') {
        await tx
          .update(users)
          .set({ wallet_pending: sql`GREATEST(0, ${users.wallet_pending} - ${amount})` })
          .where(eq(users.id, wd.user_id));

        await tx.insert(walletTransactions).values({
          id: uid('wt'),
          user_id: wd.user_id,
          type: 'withdrawal_paid',
          amount: 0,
          reference_id: wd.id,
          description: `Pencairan disetujui & ditransfer bersih Rp ${netAmount.toLocaleString('id-ID')} (${wd.bank_or_ewallet}, biaya Rp ${fee.toLocaleString('id-ID')})`,
          created_at: ts,
        });
      } else {
        await tx
          .update(users)
          .set({
            wallet_pending: sql`GREATEST(0, ${users.wallet_pending} - ${amount})`,
            wallet_available: sql`${users.wallet_available} + ${amount}`,
          })
          .where(eq(users.id, wd.user_id));

        await tx.insert(walletTransactions).values({
          id: uid('wt'),
          user_id: wd.user_id,
          type: 'withdrawal_rejected',
          amount,
          reference_id: wd.id,
          description: 'Pencairan ditolak, dana dikembalikan ke saldo tersedia',
          created_at: ts,
        });
      }

      return { wd, amount, fee, netAmount };
    });

    await logNotification({
      userId: wdInfo.wd.user_id,
      eventType: 'withdrawal',
      title: `Pencairan Dana ${status === 'Approved' ? 'Disetujui' : 'Ditolak'}`,
      message:
        status === 'Approved'
          ? `Dana bersih Rp ${wdInfo.netAmount.toLocaleString('id-ID')} (setelah biaya transfer Rp ${wdInfo.fee.toLocaleString('id-ID')}) telah ditransfer ke ${wdInfo.wd.bank_or_ewallet}.`
          : `Pencairan Rp ${wdInfo.amount.toLocaleString('id-ID')} ditolak (${adminNote || 'Cek detail rekening'}) dan saldo dikembalikan.`,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Gagal memproses pencairan.' });
  }
});

// --- Admin Only: Market & Stores Oversight ---
adminRouter.get('/api/admin/market-stores', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const [allStores, allProducts] = await Promise.all([
      db.select().from(stores).orderBy(desc(stores.created_at)),
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
          hidden_by_seller: products.hidden_by_seller,
          hidden_by_admin: products.hidden_by_admin,
          cta_label: products.cta_label,
          cover_shape: products.cover_shape,
          quota_limit: products.quota_limit,
          description: products.description,
          image_url: products.image_url,
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
        })
        .from(products)
        .innerJoin(stores, eq(stores.id, products.store_id))
        .orderBy(desc(products.created_at)),
    ]);
    res.json({ stores: allStores, products: allProducts });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat data toko dan produk.');
  }
});

adminRouter.put('/api/admin/products/:id/flags', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const existingRows = await db.select().from(products).where(eq(products.id, req.params.id)).limit(1);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Produk tidak ditemukan.' });

    const isFeatured =
      req.body?.is_featured !== undefined ? (req.body.is_featured ? 1 : 0) : existing.is_featured;
    const isRecommended =
      req.body?.is_recommended !== undefined ? (req.body.is_recommended ? 1 : 0) : existing.is_recommended;
    const hiddenByAdmin =
      req.body?.hidden_by_admin !== undefined ? (req.body.hidden_by_admin ? 1 : 0) : existing.hidden_by_admin;
    const status = req.body?.status !== undefined ? cleanString(req.body.status, 20) || existing.status : existing.status;

    await db
      .update(products)
      .set({ is_featured: isFeatured, is_recommended: isRecommended, hidden_by_admin: hiddenByAdmin, status })
      .where(eq(products.id, req.params.id));
    res.json({ ok: true, hidden_by_admin: hiddenByAdmin });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status produk.');
  }
});

adminRouter.put('/api/admin/stores/:id/featured', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const isFeatured = req.body?.is_featured ? 1 : 0;
    await db.update(stores).set({ is_featured: isFeatured }).where(eq(stores.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status sorotan toko.');
  }
});

// --- Admin Only: Official WD.UP Products ---
adminRouter.get('/api/admin/official-products', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const { storeId } = await ensureOfficialWdupStore();
    const raw = await db
      .select()
      .from(products)
      .where(eq(products.store_id, storeId))
      .orderBy(desc(products.created_at));
    res.json({
      storeId,
      products: raw.map(({ access_file_data, addons_json, ...p }) => ({
        ...p,
        addons: parseStoredAddons(addons_json, true),
        has_access_file: Boolean(access_file_data),
      })),
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat produk resmi WD.UP.');
  }
});

adminRouter.post('/api/admin/official-products', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { storeId, ownerUserId } = await ensureOfficialWdupStore();
    const title = cleanString(req.body?.title, 120);
    const category = cleanString(req.body?.category, 60) || 'Produk digital';
    if (category === 'Produk fisik' || req.body?.is_physical === true) {
      return res.status(400).json({ error: 'Produk fisik dinonaktifkan. Pilih kategori produk digital atau jasa.' });
    }
    const homePillar = cleanString(req.body?.home_pillar, 40) || 'Digital Career';
    const rawPricingMode = cleanString(req.body?.pricing_mode, 20);
    const pricingMode: 'fixed' | 'pwyw' | 'pwyw_min' =
      rawPricingMode === 'pwyw' || rawPricingMode === 'pwyw_min' ? rawPricingMode : 'fixed';

    let price = Math.max(0, Math.round(Number(req.body?.price || 0)));
    let minPrice = 0;
    let originalPrice: number | null = null;
    if (pricingMode === 'fixed') {
      if (price <= 0) return res.status(400).json({ error: 'Judul produk dan harga yang valid wajib diisi.' });
      if (req.body?.original_price !== undefined && req.body?.original_price !== null && req.body?.original_price !== '') {
        const parsedOrig = Math.round(Number(req.body.original_price));
        if (!Number.isFinite(parsedOrig) || parsedOrig <= 0 || price >= parsedOrig) {
          return res.status(400).json({ error: 'Harga promo harus lebih rendah dari harga awal.' });
        }
        originalPrice = parsedOrig;
      }
    } else if (pricingMode === 'pwyw_min') {
      minPrice = Math.max(1000, Math.round(Number(req.body?.min_price || 1000)));
      price = minPrice;
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

    const coverShapeRes = validateCoverShape(req.body?.cover_shape, true, 'landscape');
    const ctaRes = validateCtaLabel(req.body?.cta_label, true, 'Beli Sekarang');
    const addonsRes = sanitizeProductAddons(req.body?.addons);
    if (addonsRes.error) return res.status(400).json({ error: addonsRes.error });

    const description = cleanString(req.body?.description, 4000) || `Produk resmi WD.UP: ${title}`;
    const customLandingHtml = sanitizeCustomHtml(req.body?.custom_landing_html);
    const deliveryContent = cleanString(req.body?.delivery_content, 1000);
    const affiliateEnabled = req.body?.affiliate_enabled === false ? 0 : 1;
    const affiliateCommissionPct = Math.min(50, Math.max(0, Math.round(Number(req.body?.affiliate_commission_pct ?? 15))));
    const isFeatured = req.body?.is_featured ? 1 : 0;
    const isRecommended = req.body?.is_recommended === false ? 0 : 1;

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
        store_id: storeId,
        owner_user_id: ownerUserId,
        title,
        slug: cleanSlug(title) || productId,
        category,
        home_pillar: homePillar,
        price,
        original_price: originalPrice,
        pricing_mode: pricingMode,
        min_price: minPrice,
        addons_json: JSON.stringify(addonsRes.addons),
        cta_label: ctaRes.label,
        cover_shape: coverShapeRes.shape,
        hidden_by_seller: 0,
        hidden_by_admin: 0,
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
        is_featured: isFeatured,
        is_recommended: isRecommended,
        affiliate_enabled: affiliateEnabled,
        affiliate_commission_pct: affiliateCommissionPct,
        status: 'active',
        created_at: nowIso(),
      })
      .returning();

    const { access_file_data, addons_json, ...rest } = inserted[0];
    res.status(201).json({
      product: { ...rest, addons: parseStoredAddons(addons_json, true), has_access_file: Boolean(access_file_data) },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambah produk resmi WD.UP.');
  }
});

adminRouter.put('/api/admin/official-products/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { storeId } = await ensureOfficialWdupStore();
    const rows = await db
      .select()
      .from(products)
      .where(and(eq(products.id, req.params.id), eq(products.store_id, storeId)))
      .limit(1);
    const prod = rows[0];
    if (!prod) return res.status(404).json({ error: 'Produk resmi WD.UP tidak ditemukan.' });

    const title = cleanString(req.body?.title, 120) || prod.title;
    const category = cleanString(req.body?.category, 60) || prod.category;
    const rawPricingMode =
      req.body?.pricing_mode !== undefined ? cleanString(req.body.pricing_mode, 20) : prod.pricing_mode;
    const pricingMode: 'fixed' | 'pwyw' | 'pwyw_min' =
      rawPricingMode === 'pwyw' || rawPricingMode === 'pwyw_min' ? rawPricingMode : 'fixed';

    let price = req.body?.price !== undefined ? Math.max(0, Math.round(Number(req.body.price))) : prod.price;
    let minPrice = req.body?.min_price !== undefined ? Math.max(0, Math.round(Number(req.body.min_price))) : prod.min_price;
    let originalPrice: number | null = prod.original_price ?? null;

    if (pricingMode === 'fixed') {
      minPrice = 0;
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
    } else if (pricingMode === 'pwyw_min') {
      originalPrice = null;
      minPrice = Math.max(1000, minPrice);
      price = minPrice;
    } else {
      originalPrice = null;
      minPrice = 0;
    }

    let quotaLimit: number | null = prod.quota_limit ?? null;
    if (req.body?.quota_limit !== undefined) {
      quotaLimit =
        req.body.quota_limit === null || req.body.quota_limit === ''
          ? null
          : Math.max(1, Math.round(Number(req.body.quota_limit)));
    }

    let landingPageUrl = prod.landing_page_url || '';
    if (req.body?.landing_page_url !== undefined) {
      const rawLandingUrl = cleanString(req.body.landing_page_url, 1000);
      landingPageUrl = rawLandingUrl ? cleanHttpUrl(rawLandingUrl, 1000) : '';
      if (rawLandingUrl && !landingPageUrl) {
        return res.status(400).json({ error: 'Link landing page harus berupa URL http:// atau https:// yang valid.' });
      }
    }

    const coverRes = validateAndCleanMediaUrl(req.body?.image_url, prod.image_url, 'Gambar Sampul');
    if (coverRes.error) return res.status(400).json({ error: coverRes.error });

    const coverShape =
      req.body?.cover_shape !== undefined
        ? validateCoverShape(req.body.cover_shape, true, prod.cover_shape || 'landscape').shape
        : prod.cover_shape || 'landscape';
    const ctaLabel =
      req.body?.cta_label !== undefined
        ? validateCtaLabel(req.body.cta_label, true, prod.cta_label || 'Beli Sekarang').label
        : prod.cta_label || 'Beli Sekarang';
    let addonsJson = prod.addons_json || '[]';
    if (req.body?.addons !== undefined) {
      const addonsRes = sanitizeProductAddons(req.body.addons);
      if (addonsRes.error) return res.status(400).json({ error: addonsRes.error });
      addonsJson = JSON.stringify(addonsRes.addons);
    }

    const description =
      req.body?.description !== undefined
        ? cleanString(req.body.description, 4000) || `Produk resmi WD.UP: ${title}`
        : prod.description;
    const customLandingHtml =
      req.body?.custom_landing_html !== undefined
        ? sanitizeCustomHtml(req.body.custom_landing_html)
        : prod.custom_landing_html || '';
    const deliveryContent =
      req.body?.delivery_content !== undefined ? cleanString(req.body.delivery_content, 1000) : prod.delivery_content;
    const isFeatured = req.body?.is_featured !== undefined ? (req.body.is_featured ? 1 : 0) : prod.is_featured;
    const isRecommended = req.body?.is_recommended !== undefined ? (req.body.is_recommended ? 1 : 0) : prod.is_recommended;
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
        price,
        original_price: originalPrice,
        pricing_mode: pricingMode,
        min_price: minPrice,
        addons_json: addonsJson,
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
        is_featured: isFeatured,
        is_recommended: isRecommended,
        affiliate_enabled: affiliateEnabled,
        affiliate_commission_pct: affiliateCommissionPct,
      })
      .where(and(eq(products.id, prod.id), eq(products.store_id, storeId)))
      .returning();

    const { access_file_data, addons_json, ...rest } = updated[0];
    res.json({
      product: { ...rest, addons: parseStoredAddons(addons_json, true), has_access_file: Boolean(access_file_data) },
    });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui produk resmi.');
  }
});

adminRouter.delete('/api/admin/official-products/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const { storeId } = await ensureOfficialWdupStore();
    const deleted = await db
      .delete(products)
      .where(and(eq(products.id, req.params.id), eq(products.store_id, storeId)))
      .returning({ id: products.id });
    if (deleted.length === 0) return res.status(404).json({ error: 'Produk resmi WD.UP tidak ditemukan.' });
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus produk resmi.');
  }
});

// --- Admin Only: Modular Creator Studio Tools ---
adminRouter.get('/api/admin/creator-tools', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ tools: await db.select().from(creatorTools).orderBy(asc(creatorTools.sort_order)) });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat tools Creator Studio.');
  }
});

adminRouter.post('/api/admin/creator-tools', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const name = cleanString(req.body?.name, 80);
    const slug = cleanSlug(cleanString(req.body?.slug, 50) || name);
    const tagline = cleanString(req.body?.tagline, 200);
    const category = cleanString(req.body?.category, 60) || 'Produktivitas';
    const accentColor = cleanString(req.body?.accent_color, 30) || 'sage';
    if (!name || !slug) return res.status(400).json({ error: 'Nama tool wajib diisi.' });

    const inserted = await db
      .insert(creatorTools)
      .values({
        id: uid('tool'),
        slug,
        name,
        tagline,
        category,
        icon_name: 'Wand2',
        accent_color: accentColor,
        tool_type: 'custom_template',
        config_json: JSON.stringify({ promptLabel: cleanString(req.body?.prompt_label, 160) || 'Catatan / Hasil Kerja Anda' }),
        is_active: 1,
        sort_order: 99,
      })
      .returning();

    res.status(201).json({ tool: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambah tool Creator Studio.');
  }
});

adminRouter.put('/api/admin/creator-tools/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const isActive = req.body?.is_active ? 1 : 0;
    await db.update(creatorTools).set({ is_active: isActive }).where(eq(creatorTools.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui status tool.');
  }
});

// --- Admin Only: Notifications Config & Announcements ---
adminRouter.get('/api/admin/notifications', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    const [settingsRows, logs] = await Promise.all([
      db.select().from(systemSettings),
      db.select().from(notifications).orderBy(desc(notifications.created_at)).limit(60),
    ]);
    const settings: Record<string, string> = {};
    for (const r of settingsRows) settings[r.key] = r.value;
    res.json({ settings, logs });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat pengaturan notifikasi.');
  }
});

adminRouter.put('/api/admin/notifications/settings', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const emailActive = req.body?.email_provider_active ? '1' : '0';
    const waActive = req.body?.whatsapp_provider_active ? '1' : '0';
    await Promise.all([
      upsertSystemSetting('email_provider_active', emailActive),
      upsertSystemSetting('whatsapp_provider_active', waActive),
    ]);
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menyimpan pengaturan notifikasi.');
  }
});

adminRouter.post('/api/admin/announcements', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const title = cleanString(req.body?.title, 120);
    const message = cleanString(req.body?.message, 600);
    if (!title || !message) return res.status(400).json({ error: 'Judul dan pesan pengumuman wajib diisi.' });
    await logNotification({ userId: null, eventType: 'announcement', title, message });
    res.status(201).json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal mengirim pengumuman.');
  }
});

// --- Admin Only: WD.UP AI Knowledge Base ---
adminRouter.get('/api/admin/knowledge-base', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ entries: await db.select().from(aiKnowledgeBase).orderBy(asc(aiKnowledgeBase.topic)) });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat knowledge base AI.');
  }
});

adminRouter.post('/api/admin/knowledge-base', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const topic = cleanString(req.body?.topic, 80);
    const title = cleanString(req.body?.title, 140);
    const content = cleanString(req.body?.content, 4000);
    if (!topic || !title || !content) return res.status(400).json({ error: 'Topik, judul, dan isi wajib diisi.' });
    const inserted = await db
      .insert(aiKnowledgeBase)
      .values({ id: uid('kb'), topic, title, content, updated_at: nowIso() })
      .returning();
    res.status(201).json({ entry: inserted[0] });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menambah knowledge base AI.');
  }
});

adminRouter.put('/api/admin/knowledge-base/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const topic = cleanString(req.body?.topic, 80);
    const title = cleanString(req.body?.title, 140);
    const content = cleanString(req.body?.content, 4000);
    await db
      .update(aiKnowledgeBase)
      .set({ topic, title, content, updated_at: nowIso() })
      .where(eq(aiKnowledgeBase.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui knowledge base AI.');
  }
});

adminRouter.delete('/api/admin/knowledge-base/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    await db.delete(aiKnowledgeBase).where(eq(aiKnowledgeBase.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    handleRouteError(res, err, 'Gagal menghapus knowledge base AI.');
  }
});

// --- Admin Only: Official Site Footer & License Settings ---
adminRouter.get('/api/admin/site-footer', requireAuth, requireRole(['admin']), async (_req, res) => {
  try {
    res.json({ siteFooter: await getSiteFooter() });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memuat footer situs.');
  }
});

adminRouter.put('/api/admin/site-footer', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
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

    for (const [k, v] of Object.entries(fields)) {
      await upsertSystemSetting(k, v);
    }
    res.json({ siteFooter: await getSiteFooter() });
  } catch (err) {
    handleRouteError(res, err, 'Gagal memperbarui footer situs.');
  }
});
