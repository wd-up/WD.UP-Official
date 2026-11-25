import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { closePool, db } from '../src/db/index.ts';
import {
  academyCategories,
  academyClasses,
  academyModules,
  academyPrograms,
  aiKnowledgeBase,
  creatorTools,
  homeCmsItems,
  notifications,
  paymentMethods,
  products,
  stores,
  systemSettings,
  users,
} from '../src/db/schema.ts';

export { db };

export async function closeDatabase(): Promise<void> {
  await closePool();
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

let seedPromise: Promise<void> | null = null;

export async function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedInitialData().catch((err) => {
      seedPromise = null;
      console.error('Database seed failed:', err);
      throw new Error('Gagal menginisialisasi data platform.', { cause: err });
    });
  }
  return seedPromise;
}

export async function ensureGuestBuyerUser(): Promise<string> {
  const guestUserId = 'usr_guest_buyer';
  await db
    .insert(users)
    .values({
      id: guestUserId,
      uid: null,
      name: 'Pembeli Tamu (Pengunjung)',
      email: 'guest@wdup.internal',
      whatsapp: '',
      password_hash: 'guest_buyer_locked',
      role: 'member',
      mentor_status: 'none',
      bio: 'Akun sistem untuk transaksi pembelian langsung pengunjung tanpa registrasi.',
      created_at: nowIso(),
    })
    .onConflictDoNothing({ target: users.id });
  return guestUserId;
}

export async function ensureOfficialWdupStore(): Promise<{ storeId: string; ownerUserId: string }> {
  const ts = nowIso();
  const ownerUserId = 'usr_wdup_official';
  const storeId = 'str_wdup_official';

  await db
    .insert(users)
    .values({
      id: ownerUserId,
      uid: null,
      name: 'WD.UP Official',
      email: 'official@wdup.internal',
      whatsapp: '081100002026',
      password_hash: 'showcase_only_locked',
      role: 'member',
      mentor_status: 'none',
      bio: 'Akun resmi platform WD.UP untuk merilis produk digital dan koleksi unggulan ekosistem.',
      avatar_url: '/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png',
      created_at: ts,
    })
    .onConflictDoNothing({ target: users.id });

  await db
    .insert(stores)
    .values({
      id: storeId,
      user_id: ownerUserId,
      name: 'WD.UP Official',
      username: 'wdupofficial',
      initials: 'WD',
      logo_url: '/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png',
      banner_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
      description:
        'Toko resmi WD.UP (Women Digital Level Up) berisi produk digital kurasi resmi, template, planner, dan panduan karier perempuan digital.',
      category: 'Official Store',
      contact_whatsapp: '081100002026',
      contact_email: 'halo@wdup.com',
      social_instagram: '@wdup.official',
      social_tiktok: '@wdup.official',
      service_link: 'https://wdup.id',
      theme: 'sage',
      store_mode: 'hybrid',
      is_featured: 1,
      visitors_count: 0,
      created_at: ts,
      updated_at: ts,
    })
    .onConflictDoNothing({ target: stores.id });

  return { storeId, ownerUserId };
}

export async function logNotification(params: {
  userId: string | null;
  eventType: string;
  title: string;
  message: string;
  overrideEmail?: string;
  overrideWhatsapp?: string;
}) {
  const emailSettingRows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'email_provider_active'))
    .limit(1);
  const waSettingRows = await db
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, 'whatsapp_provider_active'))
    .limit(1);

  const emailSettingActive = emailSettingRows[0]?.value === '1';
  const waSettingActive = waSettingRows[0]?.value === '1';

  const emailWebhook = process.env.EMAIL_WEBHOOK_URL?.trim();
  const waWebhook = process.env.WHATSAPP_WEBHOOK_URL?.trim();

  let recipient:
    | { name: string; email: string; whatsapp: string; notify_email: number; notify_whatsapp: number }
    | undefined;
  if (params.userId) {
    const rows = await db
      .select({
        name: users.name,
        email: users.email,
        whatsapp: users.whatsapp,
        notify_email: users.notify_email,
        notify_whatsapp: users.notify_whatsapp,
      })
      .from(users)
      .where(eq(users.id, params.userId))
      .limit(1);
    recipient = rows[0];
  }

  const targetEmail = (params.overrideEmail || recipient?.email || '').trim();
  const targetWhatsapp = (params.overrideWhatsapp || recipient?.whatsapp || '').trim();

  const emailActive = Boolean(targetEmail) && (emailSettingActive || Boolean(emailWebhook));
  const waActive = Boolean(targetWhatsapp) && (waSettingActive || Boolean(waWebhook));

  const emailStatus = emailActive ? 'dispatched' : targetEmail ? 'auto_recorded' : 'no_email';
  const waStatus = waActive ? 'dispatched' : targetWhatsapp ? 'auto_recorded' : 'no_whatsapp';

  const id = uid('ntf');
  const createdAt = nowIso();
  await db.insert(notifications).values({
    id,
    user_id: params.userId,
    event_type: params.eventType,
    title: params.title,
    message: params.message,
    sender_email: 'notif@wdup.com',
    email_status: emailStatus,
    whatsapp_status: waStatus,
    is_read: 0,
    created_at: createdAt,
  });

  if (emailWebhook && targetEmail && (!recipient || recipient.notify_email === 1)) {
    fetch(emailWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'notif@wdup.com',
        to: targetEmail,
        name: recipient?.name || targetEmail,
        subject: params.title,
        message: params.message,
        eventType: params.eventType,
      }),
    }).catch(() => {});
  }
  if (waWebhook && targetWhatsapp && (!recipient || recipient.notify_whatsapp === 1 || Boolean(params.overrideWhatsapp))) {
    fetch(waWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: targetWhatsapp,
        name: recipient?.name || targetEmail || 'Pengguna WD.UP',
        title: params.title,
        message: params.message,
        eventType: params.eventType,
      }),
    }).catch(() => {});
  }

  return { id, emailStatus, waStatus, targetEmail, targetWhatsapp, createdAt };
}

async function seedInitialData() {
  const settingsDefaults: Array<[string, string]> = [
    ['email_provider_active', '0'],
    ['whatsapp_provider_active', '0'],
    ['sender_email', 'notif@wdup.com'],
    ['platform_fee_percent', '5'],
    ['footer_license_title', 'Lisensi Resmi Platform Ekosistem Digital Perempuan WD.UP'],
    ['footer_license_number', 'WDUP-ID-2026-001 · Terdaftar Resmi'],
    ['footer_copyright', '© 2026 WD.UP — Women Digital Level Up. Seluruh hak cipta dilindungi.'],
    ['footer_email', 'halo@wdup.com'],
    ['footer_whatsapp', '+62 811-0000-2026'],
    ['footer_address', 'Jakarta, Indonesia'],
    ['footer_instagram', 'https://instagram.com/wdup.official'],
    ['footer_tiktok', 'https://tiktok.com/@wdup.official'],
    ['footer_youtube', 'https://youtube.com/@wdup.official'],
    ['footer_website', 'https://wdup.id'],
  ];

  await db
    .insert(systemSettings)
    .values(settingsDefaults.map(([key, value]) => ({ key, value })))
    .onConflictDoNothing({ target: systemSettings.key });

  await ensureGuestBuyerUser();
  await ensureOfficialWdupStore();

  const pmCountRes = await db.select({ c: sql<number>`count(*)::int` }).from(paymentMethods);
  if ((pmCountRes[0]?.c || 0) === 0) {
    await db
      .insert(paymentMethods)
      .values([
        {
          id: 'pm_bca',
          type: 'bank_transfer',
          provider_name: 'Bank BCA',
          account_number: '8830-4412-90',
          account_holder: 'PT Women Digital Level Up',
          instructions:
            'Transfer sesuai nominal total pesanan beserta 3 digit kode unik jika ada. Simpan bukti transfer lalu unggah pada halaman detail pesanan.',
          is_active: 1,
        },
        {
          id: 'pm_mandiri',
          type: 'bank_transfer',
          provider_name: 'Bank Mandiri',
          account_number: '131-00-9823411-5',
          account_holder: 'PT Women Digital Level Up',
          instructions:
            'Lakukan transfer antarbank/Livin ke rekening Mandiri di atas, lalu unggah screenshot bukti berhasil untuk verifikasi admin.',
          is_active: 1,
        },
        {
          id: 'pm_gopay',
          type: 'e_wallet',
          provider_name: 'GoPay / QRIS Merchant',
          account_number: '0812-8800-4412',
          account_holder: 'WD.UP Official Store',
          instructions:
            'Kirim pembayaran e-wallet ke nomor terdaftar atas nama WD.UP Official Store, kemudian unggah bukti transaksi.',
          is_active: 1,
        },
      ])
      .onConflictDoNothing({ target: paymentMethods.id });
  }

  // Seed partner showcases & products if only official store exists or fewer than 2 stores exist
  const storeCountRes = await db.select({ c: sql<number>`count(*)::int` }).from(stores);
  if ((storeCountRes[0]?.c || 0) <= 1) {
    const ts = nowIso();
    const lockedHash = 'showcase_only_locked';

    await db
      .insert(users)
      .values([
        {
          id: 'usr_partner_nara',
          uid: null,
          name: 'Nara Studio',
          email: 'partner.nara@wdup.internal',
          whatsapp: '081290001101',
          password_hash: lockedHash,
          role: 'member',
          bio: 'Desainer template produktivitas dan journal digital perempuan.',
          avatar_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg',
          created_at: ts,
        },
        {
          id: 'usr_partner_karsa',
          uid: null,
          name: 'Karsa Kreatif',
          email: 'partner.karsa@wdup.internal',
          whatsapp: '081290001102',
          password_hash: lockedHash,
          role: 'member',
          bio: 'Spesialis e-book strategi konten, brand kit, dan spreadsheet bisnis UMKM perempuan.',
          avatar_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          created_at: ts,
        },
      ])
      .onConflictDoNothing({ target: users.id });

    await db
      .insert(stores)
      .values([
        {
          id: 'str_nara',
          user_id: 'usr_partner_nara',
          name: 'Nara Mindful Studio',
          username: 'naramindful',
          initials: 'NM',
          logo_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg',
          banner_url: '/src/assets/images/market_planner_product_1795359344571.jpg',
          description:
            'Koleksi planner, digital journal, dan worksheet reflektif untuk menata fokus kerja dan self-growth harian.',
          category: 'Planner & Self Growth',
          contact_whatsapp: '081290001101',
          contact_email: 'nara@wdup.com',
          social_instagram: '@naramindful.id',
          social_tiktok: '@naramindful',
          service_link: 'https://wdup.com/jasa/nara-notion-setup',
          theme: 'sage',
          store_mode: 'hybrid',
          is_featured: 1,
          visitors_count: 0,
          created_at: ts,
          updated_at: ts,
        },
        {
          id: 'str_karsa',
          user_id: 'usr_partner_karsa',
          name: 'Karsa Digital Lab',
          username: 'karsadigital',
          initials: 'KD',
          logo_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          banner_url: '/src/assets/images/market_ebook_product_1795359344962.jpg',
          description:
            'Playbook creator, spreadsheet keuangan bisnis, serta template branding siap pakai untuk perempuan pebisnis digital.',
          category: 'Digital Career & Business',
          contact_whatsapp: '081290001102',
          contact_email: 'karsa@wdup.com',
          social_instagram: '@karsadigital.id',
          social_tiktok: '@karsalab',
          service_link: 'https://wdup.com/jasa/karsa-brand-audit',
          theme: 'warm-cream',
          store_mode: 'hybrid',
          is_featured: 1,
          visitors_count: 0,
          created_at: ts,
          updated_at: ts,
        },
      ])
      .onConflictDoNothing({ target: stores.id });

    await db
      .insert(products)
      .values([
        {
          id: 'prd_ebook_blueprint',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: 'E-Book The Digital Growth Blueprint',
          slug: 'digital-growth-blueprint',
          category: 'E-book dan Webbook',
          home_pillar: 'Digital Career',
          price: 149000,
          description:
            'Panduan lengkap membangun personal brand, monetisasi konten, dan produk digital pertama dari nol hingga konsisten menghasilkan.',
          image_url: '/src/assets/images/market_ebook_product_1795359344962.jpg',
          delivery_content:
            'Akses Webbook & Unduh PDF Lengkap (124 halaman) + Bonus Checklist Peluncuran Produk Digital. Kode Lisensi: WDUP-DGB-2026.',
          is_physical: 0,
          is_featured: 1,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 20,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_planner_clarity',
          store_id: 'str_nara',
          owner_user_id: 'usr_partner_nara',
          title: 'Mindful Career & Daily Planner 2026',
          slug: 'mindful-career-planner',
          category: 'Planner dan Journal',
          home_pillar: 'Self Growth',
          price: 119000,
          description:
            'Digital planner interaktif untuk iPad/tablet & Notion dengan template refleksi mingguan, target karier, dan pelacak energi harian.',
          image_url: '/src/assets/images/market_planner_product_1795359344571.jpg',
          delivery_content:
            'Paket Unduhan GoodNotes PDF Hyperlinked + Duplikasi Workspace Notion Mindful Planner 2026.',
          is_physical: 0,
          is_featured: 1,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 25,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_template_carousel',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: 'Creator Brand & Carousel Template Kit',
          slug: 'creator-carousel-kit',
          category: 'Template',
          home_pillar: 'Digital Career',
          price: 95000,
          description:
            '45+ template carousel edukasi, media kit rate card, dan pitch deck kolaborasi brand yang mudah disesuaikan.',
          image_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          delivery_content: 'Tautan Duplikasi Canva Pro & Free + Panduan Tipografi & Palet Warna Editorial.',
          is_physical: 0,
          is_featured: 1,
          is_recommended: 0,
          affiliate_enabled: 1,
          affiliate_commission_pct: 20,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_worksheet_selflove',
          store_id: 'str_nara',
          owner_user_id: 'usr_partner_nara',
          title: 'Self-Love & Boundaries Reflection Worksheet',
          slug: 'self-love-worksheet',
          category: 'Worksheet',
          home_pillar: 'Self Love',
          price: 69000,
          description:
            '30 lembar latihan terstruktur untuk membangun batasan sehat, mengenali nilai diri, dan meredakan burnout pekerja kreatif.',
          image_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg',
          delivery_content: 'File PDF Interaktif (Fillable A4 & Letter) + Panduan Audio Refleksi 15 Menit.',
          is_physical: 0,
          is_featured: 0,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 20,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_spreadsheet_cashflow',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: 'Spreadsheet Keuangan Creator & Affiliate',
          slug: 'spreadsheet-creator-cashflow',
          category: 'Spreadsheet',
          home_pillar: 'Digital Career',
          price: 125000,
          description:
            'Dashboard arus kas otomatis untuk melacak pemasukan produk digital, komisi affiliate, pajak, dan dana darurat.',
          image_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
          delivery_content: 'Tautan Google Sheets Template Otomatis + Video Tutorial Setup 10 Menit.',
          is_physical: 0,
          is_featured: 1,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 15,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_printable_affirmation',
          store_id: 'str_nara',
          owner_user_id: 'usr_partner_nara',
          title: 'Printable Desk Affirmation & Habit Cards',
          slug: 'printable-affirmation-cards',
          category: 'Printable',
          home_pillar: 'Self Love',
          price: 55000,
          description:
            'Set kartu afirmasi pagi dan pelacak kebiasaan siap cetak ukuran A5 dengan ilustrasi minimalis warna sage & cream.',
          image_url: '/src/assets/images/market_planner_product_1795359344571.jpg',
          delivery_content: 'File Siap Cetak CMYK High-Res PDF (24 Kartu Afirmasi + Tracker Bulanan).',
          is_physical: 0,
          is_featured: 0,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 20,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_digital_audiokit',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: 'Digital Product Launch Automation Kit',
          slug: 'launch-automation-kit',
          category: 'Produk digital',
          home_pillar: 'Self Development',
          price: 175000,
          description:
            'Kumpulan SOP peluncuran produk digital, skrip email welcome, dan kalender konten pra-peluncuran 14 hari.',
          image_url: '/src/assets/images/market_ebook_product_1795359344962.jpg',
          delivery_content: 'Bundle Dokumen SOP Peluncuran, 12 Template Email Copywriting, dan Kalender Trello/Notion.',
          is_physical: 0,
          is_featured: 0,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 18,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_jasa_brandaudit',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: 'Jasa 1-on-1 Audit Personal Brand & Bio IG',
          slug: 'jasa-audit-brand',
          category: 'Jasa profesional',
          home_pillar: 'Self Development',
          price: 299000,
          description:
            'Sesi review mendalam 60 menit untuk merapikan positioning, bio media sosial, dan struktur produk unggulan Anda.',
          image_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
          delivery_content:
            'Jadwalkan sesi konsultasi Anda melalui tautan kalender resmi Karsa Digital Lab setelah pembayaran terverifikasi.',
          is_physical: 0,
          is_featured: 0,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 10,
          status: 'active',
          created_at: ts,
        },
        {
          id: 'prd_resources_prompts',
          store_id: 'str_karsa',
          owner_user_id: 'usr_partner_karsa',
          title: '150+ AI Prompt & Script Bank untuk Creator',
          slug: 'ai-prompt-creator-bank',
          category: 'Digital resources',
          home_pillar: 'Digital Career',
          price: 89000,
          description:
            'Pustaka prompt siap pakai untuk riset audiens, penulisan hook video pendek, dan skrip promosi produk affiliate.',
          image_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          delivery_content: 'Akses Database Digital Resources (150+ Prompt Terkurasi & Terstruktur per Niche).',
          is_physical: 0,
          is_featured: 0,
          is_recommended: 1,
          affiliate_enabled: 1,
          affiliate_commission_pct: 25,
          status: 'active',
          created_at: ts,
        },
      ])
      .onConflictDoNothing({ target: products.id });
  }

  const catCountRes = await db.select({ c: sql<number>`count(*)::int` }).from(academyCategories);
  if ((catCountRes[0]?.c || 0) === 0) {
    const ts = nowIso();
    await db
      .insert(academyCategories)
      .values([
        { id: 'cat_creator', name: 'Content Creator Academy', slug: 'content-creator', description: 'Kuasai storytelling, produksi video pendek, dan monetisasi kreator yang autentik.', accent_color: 'coral', sort_order: 1 },
        { id: 'cat_digiprod', name: 'Digital Product Academy', slug: 'digital-product', description: 'Rancang, validasi, dan luncurkan e-book, template, serta kelas digital pertamamu.', accent_color: 'sage', sort_order: 2 },
        { id: 'cat_affiliate', name: 'Affiliate Academy', slug: 'affiliate', description: 'Strategi review jujur, funnel konten, dan konversi link referral berulang.', accent_color: 'butter', sort_order: 3 },
        { id: 'cat_branding', name: 'Personal Branding Academy', slug: 'personal-branding', description: 'Bangun reputasi profesional, positioning unik, dan daya tarik audiens.', accent_color: 'lavender', sort_order: 4 },
        { id: 'cat_aiskill', name: 'AI & Digital Skill Academy', slug: 'ai-digital-skill', description: 'Manfaatkan AI workflow, automasi, dan tools produktivitas modern.', accent_color: 'sage', sort_order: 5 },
        { id: 'cat_business', name: 'Digital Business Academy', slug: 'digital-business', description: 'Kelola keuangan bisnis digital, operasional toko, dan skalabilitas tim.', accent_color: 'coral', sort_order: 6 },
      ])
      .onConflictDoNothing({ target: academyCategories.id });

    await db
      .insert(academyPrograms)
      .values([
        {
          id: 'prog_creator_found',
          category_id: 'cat_creator',
          title: 'Creator Storytelling & Short-Form Mastery',
          topic: 'Konten Video & Narasi',
          goal: 'Membangun audiens organik dan portofolio kolaborasi brand dalam 30 hari',
          level: 'Beginner',
          bundle_price: 349000,
          description: 'Program belajar lengkap dari pencarian niche, penulisan hook 3 detik pertama, produksi visual hangat, hingga rate card profesional.',
          cover_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        },
        {
          id: 'prog_digiprod_launch',
          category_id: 'cat_digiprod',
          title: 'Zero to First Digital Product',
          topic: 'Produk Digital & Monetisasi',
          goal: 'Merilis e-book, planner, atau template siap jual di WD.UP Market',
          level: 'Intermediate',
          bundle_price: 399000,
          description: 'Bimbingan step-by-step menentukan ide produk yang laku, mendesain aset digital bernilai tinggi, dan strategi peluncuran.',
          cover_url: '/src/assets/images/market_planner_product_1795359344571.jpg',
        },
        {
          id: 'prog_affiliate_pro',
          category_id: 'cat_affiliate',
          title: 'Ethical Affiliate Conversion System',
          topic: 'Pemasaran Afiliasi',
          goal: 'Menghasilkan komisi rutin melalui rekomendasi produk terkurasi',
          level: 'Beginner',
          bundle_price: 249000,
          description: 'Pelajari cara memilih produk berkonversi tinggi, membangun toko affiliate tanpa stok barang, dan membaca data klik.',
          cover_url: '/src/assets/images/market_ebook_product_1795359344962.jpg',
        },
        {
          id: 'prog_branding_core',
          category_id: 'cat_branding',
          title: 'Authentic Feminine Brand Positioning',
          topic: 'Personal Branding',
          goal: 'Memiliki identitas suara, estetika visual, dan penawaran jasa yang jelas',
          level: 'Beginner',
          bundle_price: 279000,
          description: 'Menyelaraskan nilai diri, cerita perjalanan, dan positioning profesional agar audiens langsung percaya.',
          cover_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        },
        {
          id: 'prog_ai_workflow',
          category_id: 'cat_aiskill',
          title: 'AI Workflow for Women Digital Creators',
          topic: 'Produktivitas & AI',
          goal: 'Memangkas waktu riset dan produksi konten hingga 60% dengan AI',
          level: 'Intermediate',
          bundle_price: 319000,
          description: 'Praktik langsung membuat prompt library, riset tren, dan sistem kerja otomatis dengan tetap menjaga sentuhan manusia.',
          cover_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        },
        {
          id: 'prog_biz_scale',
          category_id: 'cat_business',
          title: 'Sustainable Digital Business Blueprint',
          topic: 'Manajemen Bisnis Digital',
          goal: 'Mengatur arus kas, harga produk, dan retensi pelanggan jangka panjang',
          level: 'Advanced',
          bundle_price: 449000,
          description: 'Fondasi bisnis digital sehat bagi pemilik toko dan kreator agar profitabel tanpa kelelahan.',
          cover_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        },
      ])
      .onConflictDoNothing({ target: academyPrograms.id });

    await db
      .insert(academyClasses)
      .values([
        {
          id: 'cls_creator_101',
          program_id: 'prog_creator_found',
          category_id: 'cat_creator',
          title: 'Storytelling & Hook 3 Detik untuk Konten Edukasi',
          description: 'Pelajari anatomi video pendek yang membuat audiens berhenti scrolling, merasa terhubung, dan menyimpan konten Anda.',
          objectives: JSON.stringify([
            'Merumuskan 3 pilar konten berbasis keahlian dan empati audiens',
            'Menulis 10 variasi hook pembuka yang tidak clickbait namun memicu rasa ingin tahu',
            'Menyusun alur visual dan pacing editing untuk video 30–60 detik',
          ]),
          mentor_name: 'Nadira Kusuma',
          price: 189000,
          cover_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          pdf_guide_title: 'Handbook Storytelling & 30 Template Hook WD.UP (PDF)',
          pdf_guide_content: 'BAB 1: Prinsip Hook Empatik.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
        {
          id: 'cls_digiprod_101',
          program_id: 'prog_digiprod_launch',
          category_id: 'cat_digiprod',
          title: 'Merancang Template & E-Book Siap Jual',
          description: 'Ubah pengetahuan dan sistem kerjamu menjadi produk digital rapi yang bisa dijual berulang kali di WD.UP Market.',
          objectives: JSON.stringify([
            'Memilih format produk digital paling sesuai (E-book, Planner, Worksheet, atau Template)',
            'Menentukan struktur isi yang langsung menyelesaikan masalah pembeli',
            'Menetapkan harga dan menyiapkan halaman produk yang meyakinkan',
          ]),
          mentor_name: 'Sekar Ayuningtyas',
          price: 219000,
          cover_url: '/src/assets/images/market_planner_product_1795359344571.jpg',
          pdf_guide_title: 'Checklist Validasi & Produksi Produk Digital (PDF)',
          pdf_guide_content: 'LANGKAH VALIDASI PRODUK DIGITAL.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
        {
          id: 'cls_affiliate_101',
          program_id: 'prog_affiliate_pro',
          category_id: 'cat_affiliate',
          title: 'Membangun Toko Affiliate & Konversi Tanpa Stok',
          description: 'Cara kurasi produk terbaik di WD.UP Market, membuat review jujur, dan mengoptimalkan link referral untuk komisi konsisten.',
          objectives: JSON.stringify([
            'Memilih produk affiliate dengan komisi dan relevansi audiens terbaik',
            'Menata Toko Affiliate sendiri di My Store WD.UP',
            'Membuat konten soft-selling berbasis studi kasus penggunaan',
          ]),
          mentor_name: 'Rania Pratiwi',
          price: 149000,
          cover_url: '/src/assets/images/market_ebook_product_1795359344962.jpg',
          pdf_guide_title: 'Playbook Affiliate Etis WD.UP (PDF)',
          pdf_guide_content: 'STRATEGI KURASI PRODUK AFFILIATE.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
        {
          id: 'cls_branding_101',
          program_id: 'prog_branding_core',
          category_id: 'cat_branding',
          title: 'Positioning & Identitas Visual Personal Brand',
          description: 'Temukan suara khas dan pesan inti yang membedakan dirimu di tengah ramainya kreator digital.',
          objectives: JSON.stringify([
            'Menyusun Brand Positioning Statement satu kalimat yang kuat',
            'Menentukan palet warna, gaya bahasa, dan mood visual yang konsisten',
            'Menerjemahkan personal brand ke bio dan penawaran jasa',
          ]),
          mentor_name: 'Larasati Putri',
          price: 169000,
          cover_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
          pdf_guide_title: 'Workbook Identitas Personal Brand (PDF)',
          pdf_guide_content: 'FORMULA POSITIONING PERSONAL BRAND.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
        {
          id: 'cls_ai_101',
          program_id: 'prog_ai_workflow',
          category_id: 'cat_aiskill',
          title: 'AI Content & Research Assistant untuk Kreator',
          description: 'Gunakan AI secara strategis untuk riset ide, menyusun kerangka e-book, dan mempercepat produksi konten harian.',
          objectives: JSON.stringify([
            'Menulis prompt kontekstual dengan tone suara personal Anda',
            'Membangun bank ide 30 hari konten dalam 20 menit',
            'Melakukan kurasi dan penyuntingan manusia agar konten tetap hangat',
          ]),
          mentor_name: 'Tania Wijaya',
          price: 179000,
          cover_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg',
          pdf_guide_title: 'Panduan Prompt Engineering Kreatif (PDF)',
          pdf_guide_content: 'KERANGKA PROMPT R.O.L.E.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
        {
          id: 'cls_biz_101',
          program_id: 'prog_biz_scale',
          category_id: 'cat_business',
          title: 'Arus Kas, Pricing & Skalabilitas Toko Digital',
          description: 'Kelola pemasukan toko, komisi affiliate, biaya operasional, dan strategi bundling agar bisnis digital tumbuh sehat.',
          objectives: JSON.stringify([
            'Memisahkan keuangan pribadi dan kas bisnis digital',
            'Menghitung margin bersih setelah komisi affiliate',
            'Merancang tangga produk (freebie, entry product, flagship class)',
          ]),
          mentor_name: 'Dinda Maharani',
          price: 229000,
          cover_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg',
          pdf_guide_title: 'Template Kalkulasi Harga & Profit Margin (PDF)',
          pdf_guide_content: 'RUMUS PRICING PRODUK DIGITAL SEHAT.',
          group_duration_note: 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif',
          certificate_available: 1,
          created_at: ts,
        },
      ])
      .onConflictDoNothing({ target: academyClasses.id });

    await db
      .insert(academyModules)
      .values([
        {
          id: 'mod_creator_1',
          class_id: 'cls_creator_101',
          sort_order: 1,
          title: 'Modul 1: Menemukan Pilar Konten & Empati Audiens',
          duration_minutes: 18,
          video_title: 'Video Pembelajaran 1 — Fondasi Pilar Konten Autentik',
          video_summary: 'Membahas cara memetakan irisan antara keahlian pribadi, topik yang disukai, dan kebutuhan nyata audiens perempuan digital.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Mengapa Konsistensi Butuh Pilar', text: 'Tanpa 3 pilar konten yang jelas, kreator mudah kehabisan ide di minggu ketiga.' },
            { time: '04:30', heading: 'Rumus Irisan Keahlian & Masalah', text: 'Gabungkan pengalaman nyata Anda dengan pertanyaan yang paling sering muncul di komentar.' },
            { time: '11:15', heading: 'Studi Kasus Konten Edukasi', text: 'Mengubah catatan harian menjadi serial konten mingguan yang dinantikan.' },
          ]),
          text_material: 'Pilar konten adalah tiga sampai empat tema utama yang menjadi identitas akun Anda. Dengan membatasi tema utama, algoritma dan audiens manusia sama-sama lebih cepat memahami nilai yang Anda tawarkan.',
          interactive_exercise_prompt: 'Manakah kombinasi pilar konten yang paling kuat untuk membangun kepercayaan sekaligus penjualan produk digital?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Hanya memposting promosi produk setiap hari tanpa konteks', isCorrect: false, feedback: 'Audiens cepat lelah jika tidak ada nilai edukasi atau cerita proses.' },
            { label: 'Kombinasi Edukasi Praktis + Cerita Proses + Studi Kasus Produk', isCorrect: true, feedback: 'Tepat! Kombinasi ini membangun otoritas, kedekatan emosional, dan konversi alami.' },
            { label: 'Mengikuti semua tren viral acak tanpa kaitan dengan niche', isCorrect: false, feedback: 'Views mungkin naik sesaat, tetapi audiens tidak relevan dengan produk Anda.' },
          ]),
          worksheet_prompt: 'Tuliskan 3 pilar konten utama Anda beserta 2 contoh ide judul untuk masing-masing pilar:',
          assignment_prompt: 'Buat 1 naskah konten pendek (durasi 30-45 detik) berdasarkan salah satu pilar Anda dan tempelkan naskah atau tautan drafnya di bawah:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Berapa jumlah pilar konten ideal agar audiens mudah mengingat topik utama akun Anda?', options: ['1 topik saja setiap tahun', '3 hingga 4 pilar yang saling berkaitan', '15 topik acak setiap minggu'], correctIndex: 1 },
            { id: 'q2', question: 'Apa fungsi utama konten "Cerita Proses / Behind the Scenes"?', options: ['Membangun kedekatan manusiawi dan kepercayaan', 'Menggantikan fungsi halaman checkout', 'Menghindari membuat materi edukasi'], correctIndex: 0 },
            { id: 'q3', question: 'Dari mana ide pilar konten yang paling relevan dengan pembeli berasal?', options: ['Dari pertanyaan nyata yang sering ditanyakan audiens', 'Menyalin akun topik lain tanpa riset', 'Mengarang istilah rumit'], correctIndex: 0 },
            { id: 'q4', question: 'Kombinasi tiga tipe konten yang seimbang dalam satu minggu adalah...', options: ['Promosi setiap hari tanpa jeda', 'Edukasi Praktis, Cerita Proses, dan Rekomendasi Produk/Studi Kasus', 'Hanya repost video viral tanpa narasi'], correctIndex: 1 },
            { id: 'q5', question: 'Apa tanda sebuah pilar konten sudah cukup spesifik?', options: ['Audiens langsung tahu masalah apa yang Anda bantu selesaikan', 'Semua orang dari anak kecil hingga lansia menjadi target utama', 'Tidak pernah menyebut solusi digital sama sekali'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_creator_2',
          class_id: 'cls_creator_101',
          sort_order: 2,
          title: 'Modul 2: Teknik Hook 3 Detik & Alur Visual',
          duration_minutes: 22,
          video_title: 'Video Pembelajaran 2 — Meracik Kalimat Pembuka yang Menghentikan Scroll',
          video_summary: 'Praktik menulis hook berbasis rasa ingin tahu, visual kontras, dan call-to-action yang elegan.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Psikologi 3 Detik Pertama', text: 'Audiens memutuskan lanjut menonton dari kombinasi teks layar dan intonasi suara pertama.' },
            { time: '08:10', heading: '5 Pola Hook Anti-Clickbait', text: 'Gunakan pola "Kesalahan Halus", "Cara Sederhana", dan "Sebelum Kamu Mulai".' },
          ]),
          text_material: 'Hook yang efektif tidak perlu berlebihan atau menakut-nakuti. Fokuslah pada relevansi instan: sebutkan siapa yang terbantu dan masalah apa yang diselesaikan dalam satu kalimat pendek maksimal 9 kata di layar.',
          interactive_exercise_prompt: 'Pilih contoh kalimat hook yang paling tepat untuk audiens perempuan yang ingin mulai membuat produk digital:',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Cara mengubah catatan kerjamu jadi template siap jual minggu ini', isCorrect: true, feedback: 'Spesifik, relevan, realistis, dan langsung menyebut manfaat.' },
            { label: 'Rahasia cepat kaya dalam semalam tanpa kerja apa pun', isCorrect: false, feedback: 'Klaim tidak realistis menurunkan kredibilitas jangka panjang.' },
          ]),
          worksheet_prompt: 'Tulis 5 variasi hook 3 detik untuk niche Anda menggunakan pola "Kesalahan Halus" dan "Langkah Praktis":',
          assignment_prompt: 'Pilih 1 hook terbaik Anda, lalu susun storyboard 4 adegan (0-3s, 3-15s, 15-35s, 35-45s):',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Mengapa panjang teks hook di layar sebaiknya maksimal 7–9 kata?', options: ['Agar terbaca seketika dalam 2 detik pertama', 'Karena aplikasi melarang kalimat panjang', 'Supaya tidak perlu menambahkan suara'], correctIndex: 0 },
            { id: 'q2', question: 'Berapa detik krusial pertama bagi penonton memutuskan bertahan atau menggeser video?', options: ['3 detik pertama', '30 detik terakhir', 'Menit ke-5'], correctIndex: 0 },
            { id: 'q3', question: 'Pola hook manakah yang membangun kepercayaan tanpa kesan berlebihan?', options: ['Janji hasil instan tanpa usaha', 'Pola "Kesalahan Halus" atau "Langkah Sederhana" yang realistis', 'Judul clickbait yang tidak sesuai isi video'], correctIndex: 1 },
            { id: 'q4', question: 'Apa elemen penutup (CTA) yang paling ramah untuk video edukasi?', options: ['Mengajak audiens menyimpan postingan atau mencoba worksheet/tautan bio', 'Memaksa membeli tanpa penjelasan manfaat', 'Mengakhiri video mendadak di tengah kalimat'], correctIndex: 0 },
            { id: 'q5', question: 'Komponen storyboard 4 beat yang terstruktur terdiri dari...', options: ['Hook, Konteks Masalah, Langkah Praktis, dan CTA', 'Intro panjang 20 detik lalu selesai', 'Hanya musik latar tanpa teks atau narasi'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_digiprod_1',
          class_id: 'cls_digiprod_101',
          sort_order: 1,
          title: 'Modul 1: Validasi Ide & Struktur Produk Digital Bernilai',
          duration_minutes: 20,
          video_title: 'Video Pembelajaran — Menemukan Ide Produk yang Dicari Pembeli',
          video_summary: 'Belajar memetakan masalah spesifik pembeli dan memilih format produk digital tercepat untuk diluncurkan.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Produk Digital Bukan Sekadar File', text: 'Pembeli membayar untuk penghematan waktu dan kejelasan langkah.' },
          ]),
          text_material: 'Produk digital yang laris menyelesaikan satu transisi spesifik: dari bingung menjadi punya sistem kerja yang rapi.',
          interactive_exercise_prompt: 'Apa faktor terpenting yang membuat sebuah template atau worksheet layak dibeli?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Jumlah halaman harus lebih dari 200 halaman', isCorrect: false, feedback: 'Kualitas dan kepraktisan jauh lebih bernilai daripada ketebalan semata.' },
            { label: 'Langsung siap pakai dan memangkas waktu kerja pembeli', isCorrect: true, feedback: 'Benar! Kecepatan implementasi adalah nilai utama produk digital.' },
          ]),
          worksheet_prompt: 'Tuliskan konsep produk digital pertama Anda (Nama produk, target pembeli, dan masalah yang diselesaikan):',
          assignment_prompt: 'Buat daftar isi/outline lengkap 5 bagian utama untuk produk digital Anda:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Mengapa panduan penggunaan 1 halaman penting disertakan di produk digital?', options: ['Membantu pembeli langsung mempraktikkan produk tanpa bingung', 'Hanya untuk menambah ukuran file', 'Syarat wajib mencetak buku'], correctIndex: 0 },
            { id: 'q2', question: 'Apa nilai utama yang dibayar pembeli dari sebuah template atau planner digital?', options: ['Penghematan waktu dan kejelasan sistem kerja', 'Ketebalan file ratusan megabyte', 'Desain rumit yang sulit diedit'], correctIndex: 0 },
            { id: 'q3', question: 'Langkah validasi awal yang paling aman sebelum rilis produk massal adalah...', options: ['Menguji konsep/draf kepada 5 calon pengguna awal terlebih dahulu', 'Langsung mencetak ribuan eksemplar fisik', 'Menunggu produk sempurna selama 2 tahun'], correctIndex: 0 },
            { id: 'q4', question: 'Format mana yang paling cocok untuk pelacakan target kerja harian di tablet atau Notion?', options: ['Planner / Worksheet terstruktur', 'File audio lagu tanpa teks', 'Poster ukuran baliho'], correctIndex: 0 },
            { id: 'q5', question: 'Apa yang harus disiapkan agar pembeli puas setelah checkout di WD.UP Market?', options: ['Tautan akses atau file produk yang jelas, aktif, dan mudah diakses', 'Halaman kosong tanpa instruksi', 'Menyuruh pembeli menebak sendiri isi produk'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_affiliate_1',
          class_id: 'cls_affiliate_101',
          sort_order: 1,
          title: 'Modul 1: Kurasi Produk & Etika Rekomendasi Affiliate',
          duration_minutes: 16,
          video_title: 'Video Pembelajaran — Strategi Affiliate Berbasis Kepercayaan',
          video_summary: 'Memahami alur link referral WD.UP, pemilihan produk berkonversi, dan cara menjaga kepercayaan audiens.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Cara Kerja Ekosistem Affiliate WD.UP', text: 'Pilih produk di Katalog Affiliate, tambahkan ke My Store, bagikan link referral unik Anda.' },
          ]),
          text_material: 'Penghasilan affiliate yang berkelanjutan lahir dari kurasi yang jujur.',
          interactive_exercise_prompt: 'Bagaimana cara sistem WD.UP mencatat komisi affiliate agar aman dan akurat?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Otomatis dicatat saat link referral diklik dan transaksi terverifikasi Paid', isCorrect: true, feedback: 'Benar! Komisi hanya dicatat dan masuk saldo setelah pembayaran terverifikasi valid.' },
            { label: 'Dicatat manual di kolom komentar postingan', isCorrect: false, feedback: 'Sistem mencatat klik dan transaksi secara otomatis di database.' },
          ]),
          worksheet_prompt: 'Pilih 3 produk dari WD.UP Market yang ingin Anda promosikan dan tuliskan alasan kecocokannya dengan audiens Anda:',
          assignment_prompt: 'Tulis 1 caption promosi soft-selling untuk salah satu produk affiliate pilihan Anda:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Kapan komisi affiliate resmi dikreditkan ke saldo wallet?', options: ['Saat pembeli baru memasukkan barang ke keranjang', 'Setelah pembayaran pesanan terverifikasi Paid oleh admin', 'Sebelum link referral dibagikan'], correctIndex: 1 },
            { id: 'q2', question: 'Berapa jumlah produk utama yang disarankan dikurasi pemula agar fokus rekomendasi tetap kuat?', options: ['5 hingga 8 produk yang selaras dengan kebutuhan audiens', '500 produk acak sekaligus tanpa ulasan', '0 produk'], correctIndex: 0 },
            { id: 'q3', question: 'Mengapa review jujur lebih efektif menghasilkan pembelian berulang?', options: ['Audiens percaya karena Anda menjelaskan manfaat nyata & siapa yang cocok memakainya', 'Karena menyembunyikan fungsi produk', 'Supaya tidak perlu membagikan tautan'], correctIndex: 0 },
            { id: 'q4', question: 'Di mana pemilik akun WD.UP dapat menata produk affiliate miliknya menjadi etalase rapi?', options: ['Di My Store WD.UP lengkap dengan halaman profil & landing page toko', 'Di menu pengunduhan PDF', 'Tidak tersedia etalase'], correctIndex: 0 },
            { id: 'q5', question: 'Apa fungsi tautan referral unik pada program affiliate WD.UP?', options: ['Mencatat klik dan memastikan komisi masuk akurat ke akun affiliate', 'Menghapus nama pemilik toko asli dari sistem', 'Membatasi pembeli hanya dari satu kota'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_branding_1',
          class_id: 'cls_branding_101',
          sort_order: 1,
          title: 'Modul 1: Positioning Statement & Suara Brand',
          duration_minutes: 18,
          video_title: 'Video Pembelajaran — Merumuskan Identitas Brand yang Mengesankan',
          video_summary: 'Langkah praktis menyusun bio, tone suara, dan diferensiasi personal brand.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Positioning dalam 10 Detik', text: 'Pengunjung profil harus langsung paham apa keahlian dan penawaran Anda.' },
          ]),
          text_material: 'Personal brand bukan tentang menjadi sempurna, melainkan tentang konsistensi nilai dan kejelasan pesan.',
          interactive_exercise_prompt: 'Elemen mana yang wajib ada dalam bio personal brand yang efektif?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Siapa yang Anda bantu, hasil apa yang ditawarkan, dan tautan langkah berikutnya', isCorrect: true, feedback: 'Tepat! Kejelasan manfaat dan CTA membuat pengunjung bertindak.' },
            { label: 'Kumpulan kutipan motivasi acak tanpa menyebut bidang keahlian', isCorrect: false, feedback: 'Audiens sulit memahami layanan atau produk apa yang Anda tawarkan.' },
          ]),
          worksheet_prompt: 'Tuliskan Brand Positioning Statement Anda dengan format: Saya membantu [siapa] mencapai [apa] melalui [bagaimana]:',
          assignment_prompt: 'Perbarui draf bio profil dan deskripsi toko WD.UP Anda sesuai positioning baru:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Apa tujuan utama personal branding di era digital?', options: ['Membangun kepercayaan dan reputasi yang relevan dengan karya/bisnis Anda', 'Meniru gaya orang lain sepenuhnya', 'Mengumpulkan pengikut tanpa interaksi'], correctIndex: 0 },
            { id: 'q2', question: 'Elemen inti dalam satu kalimat Brand Positioning Statement adalah...', options: ['Audiens spesifik, hasil nyata yang dicapai, dan pendekatan unik Anda', 'Daftar harga acak tanpa konteks', 'Kutipan umum tanpa kaitan profesi'], correctIndex: 0 },
            { id: 'q3', question: 'Mengapa konsistensi palet warna dan gaya bahasa penting bagi kreator?', options: ['Membantu audiens mengenali karya Anda dalam sekali lihat', 'Mengurangi jangkauan organik', 'Hanya dibutuhkan perusahaan raksasa'], correctIndex: 0 },
            { id: 'q4', question: 'Bagian terpenting pada bio profil media sosial bisnis digital adalah...', options: ['Kejelasan keahlian serta tautan menuju produk, kelas, atau layanan Anda', 'Mengosongkan kolom tautan sepenuhnya', 'Menulis sandi akun di bio'], correctIndex: 0 },
            { id: 'q5', question: 'Bagaimana cara menyelaraskan nilai diri dengan penawaran jasa atau produk digital?', options: ['Menjawab masalah nyata audiens berdasarkan keahlian autentik yang Anda tekuni', 'Mengubah tema setiap dua hari sekali', 'Menghindari bercerita tentang proses belajar'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_ai_1',
          class_id: 'cls_ai_101',
          sort_order: 1,
          title: 'Modul 1: Prompting Terstruktur untuk Kreator',
          duration_minutes: 15,
          video_title: 'Video Pembelajaran — Kolaborasi Manusia & AI',
          video_summary: 'Cara memberi konteks brand agar output AI terdengar natural dan siap pakai.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Jangan Hanya Beri Perintah Satu Baris', text: 'Sertakan peran, target pembaca, gaya bahasa, dan tujuan akhir.' },
          ]),
          text_material: 'AI bekerja paling baik sebagai rekan brainstorming dan penyusun draf pertama.',
          interactive_exercise_prompt: 'Apa langkah wajib setelah mendapatkan draf konten dari AI?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Menambahkan pengalaman pribadi, verifikasi fakta, dan menyelaraskan suara brand', isCorrect: true, feedback: 'Tepat! Sentuhan manusia membuat konten autentik dan dipercaya.' },
            { label: 'Langsung menyalin mentah tanpa membaca ulang', isCorrect: false, feedback: 'Draf AI perlu disesuaikan dengan konteks nyata dan gaya bahasa Anda.' },
          ]),
          worksheet_prompt: 'Catat 3 prompt andalan yang paling membantu workflow harian Anda:',
          assignment_prompt: 'Gunakan AI Creator Studio WD.UP untuk membuat 1 draf konten, lalu tulis versi hasil suntingan pribadi Anda:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Informasi apa yang membuat hasil prompt AI jauh lebih akurat?', options: ['Konteks audiens, tujuan konten, dan gaya bahasa yang diinginkan', 'Menulis huruf kapital seluruhnya', 'Menghapus semua detail topik'], correctIndex: 0 },
            { id: 'q2', question: 'Dalam kerangka prompt R.O.L.E, huruf "R" berarti...', options: ['Role — peran spesifik yang dijalankan asisten', 'Random — hasil acak tanpa arah', 'Repeat — mengulang kalimat yang sama'], correctIndex: 0 },
            { id: 'q3', question: 'Langkah wajib setelah menerima draf naskah atau kerangka dari AI adalah...', options: ['Menyunting dengan suara personal, pengalaman nyata, dan verifikasi fakta', 'Langsung mempublikasikan tanpa dibaca', 'Menghapus seluruh struktur intinya'], correctIndex: 0 },
            { id: 'q4', question: 'Untuk aktivitas apa AI Creator paling efektif membantu kreator harian?', options: ['Riset ide, penyusunan kerangka e-book, variasi hook, dan draf caption', 'Menggantikan empati dan interaksi tulus dengan komunitas', 'Menentukan harga tanpa riset pembeli'], correctIndex: 0 },
            { id: 'q5', question: 'Apa risiko jika konten kreator 100% menyalin output AI tanpa kurasi manusia?', options: ['Tulisan terasa generik dan kehilangan ciri khas personal brand Anda', 'Kecepatan riset menurun', 'Terlalu banyak cerita pengalaman pribadi'], correctIndex: 0 },
          ]),
        },
        {
          id: 'mod_biz_1',
          class_id: 'cls_biz_101',
          sort_order: 1,
          title: 'Modul 1: Manajemen Arus Kas & Tangga Produk Digital',
          duration_minutes: 20,
          video_title: 'Video Pembelajaran — Menjaga Profitabilitas Toko Digital',
          video_summary: 'Memahami alokasi komisi affiliate, penetapan harga bertingkat, dan pengelolaan saldo.',
          video_script_captions: JSON.stringify([
            { time: '00:00', heading: 'Value Ladder untuk Toko Perempuan Digital', text: 'Kombinasikan produk entry Rp 50rb-an, kelas inti, dan layanan konsultasi.' },
          ]),
          text_material: 'Bisnis digital yang sehat tidak bergantung pada satu produk saja.',
          interactive_exercise_prompt: 'Mengapa penting menyisihkan persentase margin untuk program affiliate seller?',
          interactive_exercise_choices: JSON.stringify([
            { label: 'Karena affiliate memperluas jangkauan pembeli baru dengan biaya akuisisi terukur', isCorrect: true, feedback: 'Betul! Komisi hanya dibayarkan ketika penjualan berhasil terjadi.' },
            { label: 'Agar harga produk bisa dinaikkan tanpa nilai tambah', isCorrect: false, feedback: 'Nilai produk harus tetap sepadan dengan harganya.' },
          ]),
          worksheet_prompt: 'Susun rancangan 3 tingkatan produk (Entry, Core, Premium) untuk toko digital Anda:',
          assignment_prompt: 'Hitung simulasi harga jual, komisi affiliate 15%, dan profit bersih per 10 penjualan:',
          quiz_questions: JSON.stringify([
            { id: 'q1', question: 'Apa keuntungan sistem komisi affiliate berbasis penjualan terverifikasi?', options: ['Biaya promosi hanya keluar saat penjualan benar-benar terjadi', 'Mengurangi transparansi laporan penjualan', 'Menghapus kebutuhan kualitas produk'], correctIndex: 0 },
            { id: 'q2', question: 'Mengapa kas pribadi dan arus kas bisnis digital sebaiknya dipisahkan?', options: ['Agar mudah mengevaluasi profit bersih, biaya operasional, dan dana pengembangan', 'Supaya tidak bisa melihat total pemasukan', 'Hanya berlaku untuk produk fisik'], correctIndex: 0 },
            { id: 'q3', question: 'Apa yang dimaksud dengan Value Ladder (Tangga Produk)?', options: ['Susunan produk bertingkat dari entry terjangkau, produk inti, hingga pendampingan premium', 'Menjual satu produk saja dengan harga berubah tiap jam', 'Memberi diskon 100% sepanjang tahun'], correctIndex: 0 },
            { id: 'q4', question: 'Komponen utama dalam menghitung harga jual produk digital yang sehat meliputi...', options: ['Biaya produksi/tools, alokasi komisi/potongan platform, dan margin keuntungan', 'Sekadar menebak angka termurah di pasar', 'Mengabaikan biaya transaksi dan penarikan dana'], correctIndex: 0 },
            { id: 'q5', question: 'Cara paling efektif menjaga retensi pelanggan setelah pembelian pertama adalah...', options: ['Menyediakan kualitas produk yang rapi, akses mudah, serta produk lanjutan yang relevan', 'Tidak membalas pesan pembeli sama sekali', 'Mempersulit akses link unduhan'], correctIndex: 0 },
          ]),
        },
      ])
      .onConflictDoNothing({ target: academyModules.id });
  }

  const cmsCountRes = await db.select({ c: sql<number>`count(*)::int` }).from(homeCmsItems);
  if ((cmsCountRes[0]?.c || 0) === 0) {
    await db
      .insert(homeCmsItems)
      .values([
        { id: 'cms_banner_main', section_type: 'banner', title: 'Belajar, Berkarya, dan Tumbuh Bersama Ekosistem Digital Perempuan', subtitle: 'WD.UP — Women Digital Level Up', body: 'Satu akun terintegrasi untuk menguasai skill digital di Academy, membangun toko produk digital & affiliate di Market, hingga berkarya dengan Creator Studio.', image_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg', cta_label: 'Mulai di Academy', cta_target: 'academy', accent_color: 'sage', icon_name: '', sort_order: 1, is_active: 1 },
        { id: 'cms_banner_market', section_type: 'banner', title: 'Luncurkan Produk Digital & Toko Affiliate Pertamamu', subtitle: 'WD.UP Market & My Store', body: 'Jual e-book, template, planner, jasa profesional, atau kurasi produk seller WD.UP dengan komisi affiliate hingga 25%.', image_url: '/src/assets/images/market_planner_product_1795359344571.jpg', cta_label: 'Jelajahi Market', cta_target: 'market', accent_color: 'coral', icon_name: '', sort_order: 2, is_active: 1 },
        { id: 'cms_cat_selflove', section_type: 'lifestyle_category', title: 'Self Love', subtitle: 'Kesadaran diri & batas sehat', body: 'Jurnal syukur, afirmasi harian, dan panduan menjaga keseimbangan energi perempuan berkarya.', image_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg', cta_label: 'Lihat Koleksi', cta_target: 'Self Love', accent_color: 'lavender', icon_name: 'Heart', sort_order: 1, is_active: 1 },
        { id: 'cms_cat_selfgrowth', section_type: 'lifestyle_category', title: 'Self Growth', subtitle: 'Kebiasaan & kejelasan tujuan', body: 'Planner produktivitas, sistem evaluasi mingguan, dan kelas pengembangan pola pikir bertumbuh.', image_url: '/src/assets/images/market_planner_product_1795359344571.jpg', cta_label: 'Lihat Koleksi', cta_target: 'Self Growth', accent_color: 'sage', icon_name: 'TrendingUp', sort_order: 2, is_active: 1 },
        { id: 'cms_cat_selfdev', section_type: 'lifestyle_category', title: 'Self Development', subtitle: 'Keterampilan & keahlian baru', body: 'Pelatihan komunikasi, personal branding, dan penguasaan tools AI untuk daya saing modern.', image_url: '/src/assets/images/market_ebook_product_1795359344962.jpg', cta_label: 'Lihat Koleksi', cta_target: 'Self Development', accent_color: 'butter', icon_name: 'Sparkles', sort_order: 3, is_active: 1 },
        { id: 'cms_cat_digicareer', section_type: 'lifestyle_category', title: 'Digital Career', subtitle: 'Karier kreator & bisnis digital', body: 'Blueprint content creator, katalog produk digital, manajemen toko, dan penghasilan affiliate.', image_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg', cta_label: 'Lihat Koleksi', cta_target: 'Digital Career', accent_color: 'coral', icon_name: 'Briefcase', sort_order: 4, is_active: 1 },
        { id: 'cms_opp_ugc', section_type: 'opportunity', title: 'Open Collaboration: UGC Creator Wellness & Stationery Q4', subtitle: 'Brand Partner WD.UP · Fee + Komisi 20%', body: 'Dicari 15 perempuan kreator untuk membuat 2 video ulasan autentik mengenai planner & digital journaling. Terbuka untuk mikro-kreator.', image_url: '/src/assets/images/academy_creator_cover_1795359345645.jpg', cta_label: 'Daftar Opportunity', cta_target: 'opportunity', accent_color: 'coral', icon_name: '', sort_order: 1, is_active: 1 },
        { id: 'cms_opp_mentor', section_type: 'opportunity', title: 'Panggilan Kontributor Template & E-Book WD.UP Market', subtitle: 'Seller Incubator · Akses Sorotan Toko Unggulan', body: 'Buka tokomu di My Store dan rilis minimal 1 produk digital orisinal bulan ini untuk berkesempatan tampil di beranda utama.', image_url: '/src/assets/images/market_ebook_product_1795359344962.jpg', cta_label: 'Ikuti Program', cta_target: 'opportunity', accent_color: 'sage', icon_name: '', sort_order: 2, is_active: 1 },
        { id: 'cms_comm_creators', section_type: 'community', title: 'WD.UP Creators & Digital Sellers Circle', subtitle: 'Ruang Diskusi Mingguan · Kolaborasi & Review Karya', body: 'Komunitas saling dukung bagi content creator dan pemilik toko digital perempuan untuk berbagi insight algoritma, feedback produk, dan partner kolaborasi.', image_url: '/src/assets/images/hero_wdup_banner_1795359344577.jpg', cta_label: 'Gabung Community', cta_target: 'community', accent_color: 'sage', icon_name: '', sort_order: 1, is_active: 1 },
        { id: 'cms_comm_reset', section_type: 'community', title: 'The Good Reset & Mindful Growth Club', subtitle: 'Check-in Kebiasaan Sehat & Self-Love', body: 'Lingkar refleksi rutin setiap Minggu malam untuk merapikan niat pekan baru, berbagi jurnal syukur, dan menjaga ritme kerja tanpa burnout.', image_url: '/src/assets/images/store_studio_avatar_1795359343952.jpg', cta_label: 'Gabung Community', cta_target: 'community', accent_color: 'lavender', icon_name: '', sort_order: 2, is_active: 1 },
        { id: 'cms_aff_info', section_type: 'affiliate_info', title: 'Belum Punya Produk Sendiri? Mulai Hasilkan Komisi dari Ekosistem Affiliate WD.UP', subtitle: 'Komisi Transparan 10% – 25% · Toko Affiliate Gratis', body: 'Pilih produk unggulan dari seller WD.UP, tambahkan ke landing page tokomu dalam satu klik, bagikan tautan referral unik, dan pantau klik serta komisi terverifikasi langsung dari My Store & My Wallet.', image_url: '/src/assets/images/market_planner_product_1795359344571.jpg', cta_label: 'Buka Katalog Affiliate', cta_target: 'affiliate', accent_color: 'butter', icon_name: '', sort_order: 1, is_active: 1 },
      ])
      .onConflictDoNothing({ target: homeCmsItems.id });
  }

  const toolCountRes = await db.select({ c: sql<number>`count(*)::int` }).from(creatorTools);
  if ((toolCountRes[0]?.c || 0) === 0) {
    await db
      .insert(creatorTools)
      .values([
        { id: 'tool_ai_creator', slug: 'ai-creator-wdup', name: 'AI Creator WD.UP', tagline: 'Generator ide konten, hook 3 detik, skrip video, dan copywriting produk digital.', category: 'AI & Konten', icon_name: 'Sparkles', accent_color: 'coral', tool_type: 'ai_creator', config_json: JSON.stringify({ modes: ['Hook & Skrip Video', 'Outline Produk Digital', 'Caption Affiliate Soft-Selling', 'Kalender Konten 7 Hari'] }), is_active: 1, sort_order: 1 },
        { id: 'tool_content_tools', slug: 'content-creator-tools', name: 'Content Creator Tools', tagline: 'Perencana konten mingguan, bank hook, dan status produksi dari ide hingga tayang.', category: 'Produksi Konten', icon_name: 'Clapperboard', accent_color: 'sage', tool_type: 'content_planner', config_json: JSON.stringify({ platforms: ['Instagram Reels', 'TikTok', 'YouTube Shorts', 'Threads / Carousel'] }), is_active: 1, sort_order: 2 },
        { id: 'tool_journaling', slug: 'digital-journaling-tools', name: 'Digital Journaling Tools', tagline: 'Ruang menulis refleksi harian, rasa syukur, dan kejelasan prioritas diri.', category: 'Self Love & Growth', icon_name: 'BookHeart', accent_color: 'lavender', tool_type: 'digital_journal', config_json: JSON.stringify({ prompts: ['3 hal yang aku syukuri hari ini', 'Satu batasan sehat yang kujaga hari ini', 'Langkah kecil menuju target digitalku'] }), is_active: 1, sort_order: 3 },
        { id: 'tool_good_reset', slug: 'the-good-reset', name: 'The Good Reset', tagline: 'Pelacak kebiasaan sehat, detoks digital, fokus kerja tenang, dan check-in energi.', category: 'Mindful Productivity', icon_name: 'Leaf', accent_color: 'butter', tool_type: 'good_reset', config_json: JSON.stringify({ habits: ['Tidur cukup 7-8 jam', '30 menit tanpa layar setelah bangun', 'Fokus deep work 60 menit', 'Minum air 2L & bergerak 20 menit'] }), is_active: 1, sort_order: 4 },
        { id: 'tool_social_tracker', slug: 'social-media-tracker', name: 'Social Media Tracker', tagline: 'Catat pertumbuhan pengikut, jangkauan, interaksi, dan konversi link dari tiap platform.', category: 'Analytics Kreator', icon_name: 'BarChart3', accent_color: 'sage', tool_type: 'social_tracker', config_json: JSON.stringify({ metrics: ['Followers', 'Reach / Views', 'Engagement Rate (%)', 'Link Clicks'] }), is_active: 1, sort_order: 5 },
      ])
      .onConflictDoNothing({ target: creatorTools.id });
  }

  const ts = nowIso();
  await db
    .insert(aiKnowledgeBase)
    .values([
      { id: 'kb_overview', topic: 'Ekosistem & Navigasi', title: 'Mengenal WD.UP dan 4 Menu Utama', content: 'WD.UP (Women Digital Level Up) adalah ekosistem digital perempuan untuk belajar, membangun karier sebagai content creator, membuat produk digital, berjualan, dan mengikuti program affiliate dengan satu akun terintegrasi.', updated_at: ts },
      { id: 'kb_payment', topic: 'Cara Belanja & Pembayaran', title: 'Alur Pembelian Kelas dan Produk di WD.UP', content: 'Untuk membeli produk Market atau kelas Academy, klik Beli Sekarang atau masukkan ke keranjang lalu tekan Checkout. Pilih metode pembayaran transfer bank atau e-wallet yang tampil di layar untuk mendapatkan kode pesanan.', updated_at: ts },
      { id: 'kb_store_affiliate', topic: 'My Store & Program Affiliate', title: 'Cara Membuka Toko dan Menjadi Affiliate', content: 'Anda dapat membuat toko sendiri melalui My Account -> My Store meskipun belum memiliki produk sendiri.', updated_at: ts },
      { id: 'kb_academy', topic: 'WD.UP Academy & Sertifikat', title: 'Cara Belajar di WD.UP Academy', content: 'Pilih kategori akademi, program belajar, atau kelas satuan di menu WD.UP ACADEMY.', updated_at: ts },
      { id: 'kb_wallet_notif', topic: 'Creator Studio, Wallet & Bantuan', title: 'Menggunakan Creator Studio, My Wallet, dan Menghubungi Tim', content: 'Di My Account -> My Creator Studio tersedia tools seperti AI Creator WD.UP, Content Creator Tools, Digital Journaling Tools, The Good Reset, dan Social Media Tracker.', updated_at: ts },
    ])
    .onConflictDoNothing({ target: aiKnowledgeBase.id });
}
