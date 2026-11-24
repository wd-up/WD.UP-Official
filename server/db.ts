import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'wdup.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('wal_autocheckpoint = 50');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

export function closeDatabase(): void {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {
    // ignore checkpoint error on shutdown
  }
  try {
    db.close();
  } catch {
    // ignore close error on shutdown
  }
}

export function uid(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      whatsapp TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor', 'mentor', 'admin')),
      mentor_status TEXT NOT NULL DEFAULT 'none',
      editor_permissions TEXT NOT NULL DEFAULT '[]',
      bio TEXT NOT NULL DEFAULT '',
      avatar_url TEXT NOT NULL DEFAULT '',
      notify_email INTEGER NOT NULL DEFAULT 1,
      notify_whatsapp INTEGER NOT NULL DEFAULT 1,
      wallet_available INTEGER NOT NULL DEFAULT 0,
      wallet_pending INTEGER NOT NULL DEFAULT 0,
      pro_plan TEXT NOT NULL DEFAULT '',
      pro_expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      initials TEXT NOT NULL,
      logo_url TEXT NOT NULL DEFAULT '',
      banner_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'Digital Creator',
      contact_whatsapp TEXT NOT NULL DEFAULT '',
      contact_email TEXT NOT NULL DEFAULT '',
      social_instagram TEXT NOT NULL DEFAULT '',
      social_tiktok TEXT NOT NULL DEFAULT '',
      service_link TEXT NOT NULL DEFAULT '',
      theme TEXT NOT NULL DEFAULT 'warm-cream',
      store_mode TEXT NOT NULL DEFAULT 'hybrid',
      is_featured INTEGER NOT NULL DEFAULT 0,
      visitors_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      category TEXT NOT NULL,
      home_pillar TEXT NOT NULL DEFAULT 'Digital Career',
      price INTEGER NOT NULL,
      description TEXT NOT NULL,
      image_url TEXT NOT NULL,
      delivery_content TEXT NOT NULL DEFAULT '',
      is_physical INTEGER NOT NULL DEFAULT 0,
      is_featured INTEGER NOT NULL DEFAULT 0,
      is_recommended INTEGER NOT NULL DEFAULT 0,
      affiliate_enabled INTEGER NOT NULL DEFAULT 1,
      affiliate_commission_pct INTEGER NOT NULL DEFAULT 15,
      clicks_count INTEGER NOT NULL DEFAULT 0,
      sales_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS affiliate_products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      affiliate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      referral_code TEXT NOT NULL,
      clicks_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(store_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS affiliate_clicks (
      id TEXT PRIMARY KEY,
      affiliate_user_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      product_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS store_visits (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      visitor_user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academy_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS academy_programs (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES academy_categories(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      goal TEXT NOT NULL,
      level TEXT NOT NULL,
      bundle_price INTEGER NOT NULL,
      description TEXT NOT NULL,
      cover_url TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academy_classes (
      id TEXT PRIMARY KEY,
      program_id TEXT NOT NULL REFERENCES academy_programs(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES academy_categories(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      objectives TEXT NOT NULL DEFAULT '[]',
      mentor_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      cover_url TEXT NOT NULL,
      pdf_guide_title TEXT NOT NULL,
      pdf_guide_content TEXT NOT NULL,
      group_link TEXT NOT NULL DEFAULT '',
      group_duration_note TEXT NOT NULL DEFAULT '',
      certificate_available INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS academy_modules (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES academy_classes(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL,
      title TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 15,
      video_title TEXT NOT NULL,
      video_summary TEXT NOT NULL,
      video_script_captions TEXT NOT NULL DEFAULT '[]',
      text_material TEXT NOT NULL,
      interactive_exercise_prompt TEXT NOT NULL,
      interactive_exercise_choices TEXT NOT NULL DEFAULT '[]',
      worksheet_prompt TEXT NOT NULL,
      assignment_prompt TEXT NOT NULL,
      quiz_questions TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES academy_classes(id) ON DELETE CASCADE,
      program_id TEXT,
      order_id TEXT,
      progress_pct INTEGER NOT NULL DEFAULT 0,
      completed_modules TEXT NOT NULL DEFAULT '[]',
      certificate_code TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, class_id)
    );

    CREATE TABLE IF NOT EXISTS worksheets_assignments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES academy_classes(id) ON DELETE CASCADE,
      module_id TEXT NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
      worksheet_answer TEXT NOT NULL DEFAULT '',
      worksheet_status TEXT NOT NULL DEFAULT 'draft',
      assignment_answer TEXT NOT NULL DEFAULT '',
      assignment_link TEXT NOT NULL DEFAULT '',
      assignment_status TEXT NOT NULL DEFAULT 'not_started',
      exercise_completed INTEGER NOT NULL DEFAULT 0,
      quiz_score INTEGER,
      quiz_answers TEXT NOT NULL DEFAULT '[]',
      grade INTEGER,
      mentor_feedback TEXT NOT NULL DEFAULT '',
      feedback_history TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      provider_name TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      instructions TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_code TEXT NOT NULL UNIQUE,
      buyer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payment_method_id TEXT REFERENCES payment_methods(id),
      total_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending Payment',
      gateway_provider TEXT NOT NULL DEFAULT 'manual',
      gateway_reference TEXT NOT NULL DEFAULT '',
      buyer_email TEXT NOT NULL DEFAULT '',
      buyer_whatsapp TEXT NOT NULL DEFAULT '',
      voucher_code TEXT NOT NULL DEFAULT '',
      discount_amount INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL,
      item_id TEXT NOT NULL,
      title TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      seller_user_id TEXT,
      store_id TEXT,
      affiliate_user_id TEXT,
      affiliate_commission_pct INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      payer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_name TEXT NOT NULL DEFAULT '',
      transfer_reference TEXT NOT NULL DEFAULT '',
      proof_image_data TEXT NOT NULL DEFAULT '',
      proof_note TEXT NOT NULL DEFAULT '',
      verified_by_user_id TEXT,
      verification_note TEXT NOT NULL DEFAULT '',
      submitted_at TEXT,
      verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS commissions (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
      affiliate_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'credited',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      reference_id TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      bank_or_ewallet TEXT NOT NULL,
      account_number TEXT NOT NULL,
      account_holder TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      admin_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      processed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS home_cms_items (
      id TEXT PRIMARY KEY,
      section_type TEXT NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      media_type TEXT NOT NULL DEFAULT 'image',
      media_url TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      cta_label TEXT NOT NULL DEFAULT '',
      cta_target TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT 'sage',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_engagements (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      cms_item_id TEXT NOT NULL REFERENCES home_cms_items(id) ON DELETE CASCADE,
      engagement_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, cms_item_id)
    );

    CREATE TABLE IF NOT EXISTS guest_engagements (
      id TEXT PRIMARY KEY,
      visitor_id TEXT NOT NULL,
      cms_item_id TEXT NOT NULL REFERENCES home_cms_items(id) ON DELETE CASCADE,
      engagement_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(visitor_id, cms_item_id)
    );

    CREATE TABLE IF NOT EXISTS creator_tools (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      category TEXT NOT NULL,
      icon_name TEXT NOT NULL,
      accent_color TEXT NOT NULL,
      tool_type TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS creator_studio_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tool_slug TEXT NOT NULL,
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      sender_email TEXT NOT NULL DEFAULT 'notif@wdup.com',
      email_status TEXT NOT NULL DEFAULT 'queued_no_provider',
      whatsapp_status TEXT NOT NULL DEFAULT 'queued_no_provider',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_knowledge_base (
      id TEXT PRIMARY KEY,
      topic TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      last_used_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
  `);

  // Safe idempotent migrations for existing SQLite databases
  const productCols = (db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!productCols.includes('access_type')) {
    db.exec(`ALTER TABLE products ADD COLUMN access_type TEXT NOT NULL DEFAULT 'link'`);
  }
  if (!productCols.includes('access_url')) {
    db.exec(`ALTER TABLE products ADD COLUMN access_url TEXT NOT NULL DEFAULT ''`);
  }
  if (!productCols.includes('access_file_data')) {
    db.exec(`ALTER TABLE products ADD COLUMN access_file_data TEXT NOT NULL DEFAULT ''`);
  }
  if (!productCols.includes('access_file_name')) {
    db.exec(`ALTER TABLE products ADD COLUMN access_file_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!productCols.includes('original_price')) {
    db.exec(`ALTER TABLE products ADD COLUMN original_price INTEGER`);
  }
  if (!productCols.includes('quota_limit')) {
    db.exec(`ALTER TABLE products ADD COLUMN quota_limit INTEGER`);
  }
  if (!productCols.includes('landing_page_url')) {
    db.exec(`ALTER TABLE products ADD COLUMN landing_page_url TEXT NOT NULL DEFAULT ''`);
  }
  if (!productCols.includes('display_style')) {
    db.exec(`ALTER TABLE products ADD COLUMN display_style TEXT NOT NULL DEFAULT 'classic'`);
  }

  // Archive legacy physical products (removed from active storefront/market)
  db.exec(`UPDATE products SET status = 'archived' WHERE is_physical = 1 OR category = 'Produk fisik'`);

  const cmsCols = (db.prepare(`PRAGMA table_info(home_cms_items)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!cmsCols.includes('icon_name')) {
    db.exec(`ALTER TABLE home_cms_items ADD COLUMN icon_name TEXT NOT NULL DEFAULT ''`);
    db.prepare(`UPDATE home_cms_items SET icon_name = 'Heart' WHERE id = 'cms_cat_selflove'`).run();
    db.prepare(`UPDATE home_cms_items SET icon_name = 'TrendingUp' WHERE id = 'cms_cat_selfgrowth'`).run();
    db.prepare(`UPDATE home_cms_items SET icon_name = 'Sparkles' WHERE id = 'cms_cat_selfdev'`).run();
    db.prepare(`UPDATE home_cms_items SET icon_name = 'Briefcase' WHERE id = 'cms_cat_digicareer'`).run();
  }

  if (!cmsCols.includes('media_type')) {
    db.exec(`ALTER TABLE home_cms_items ADD COLUMN media_type TEXT NOT NULL DEFAULT 'image'`);
  }
  if (!cmsCols.includes('media_url')) {
    db.exec(`ALTER TABLE home_cms_items ADD COLUMN media_url TEXT NOT NULL DEFAULT ''`);
  }
  if (!cmsCols.includes('link_url')) {
    db.exec(`ALTER TABLE home_cms_items ADD COLUMN link_url TEXT NOT NULL DEFAULT ''`);
  }

  // User Pro membership & Mentor migrations (including CHECK constraint upgrade to allow 'mentor')
  const userCols = (db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!userCols.includes('pro_plan')) {
    db.exec(`ALTER TABLE users ADD COLUMN pro_plan TEXT NOT NULL DEFAULT ''`);
  }
  if (!userCols.includes('pro_expires_at')) {
    db.exec(`ALTER TABLE users ADD COLUMN pro_expires_at TEXT`);
  }
  if (!userCols.includes('mentor_status')) {
    db.exec(`ALTER TABLE users ADD COLUMN mentor_status TEXT NOT NULL DEFAULT 'none'`);
  }

  const usersSchemaSql =
    (
      db
        .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'`)
        .get() as { sql: string } | undefined
    )?.sql || '';
  if (usersSchemaSql && !usersSchemaSql.includes(`'mentor'`)) {
    db.pragma('foreign_keys = OFF');
    try {
      const migrateUsers = db.transaction(() => {
        db.exec(`
          CREATE TABLE users_new (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            whatsapp TEXT NOT NULL DEFAULT '',
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'editor', 'mentor', 'admin')),
            mentor_status TEXT NOT NULL DEFAULT 'none',
            editor_permissions TEXT NOT NULL DEFAULT '[]',
            bio TEXT NOT NULL DEFAULT '',
            avatar_url TEXT NOT NULL DEFAULT '',
            notify_email INTEGER NOT NULL DEFAULT 1,
            notify_whatsapp INTEGER NOT NULL DEFAULT 1,
            wallet_available INTEGER NOT NULL DEFAULT 0,
            wallet_pending INTEGER NOT NULL DEFAULT 0,
            pro_plan TEXT NOT NULL DEFAULT '',
            pro_expires_at TEXT,
            created_at TEXT NOT NULL
          );
          INSERT INTO users_new (
            id, name, email, whatsapp, password_hash, role, mentor_status, editor_permissions,
            bio, avatar_url, notify_email, notify_whatsapp, wallet_available, wallet_pending,
            pro_plan, pro_expires_at, created_at
          )
          SELECT
            id, name, email, whatsapp, password_hash, role,
            COALESCE(mentor_status, 'none'),
            COALESCE(editor_permissions, '[]'),
            COALESCE(bio, ''),
            COALESCE(avatar_url, ''),
            COALESCE(notify_email, 1),
            COALESCE(notify_whatsapp, 1),
            COALESCE(wallet_available, 0),
            COALESCE(wallet_pending, 0),
            COALESCE(pro_plan, ''),
            pro_expires_at,
            created_at
          FROM users;
          DROP TABLE users;
          ALTER TABLE users_new RENAME TO users;
        `);
      });
      migrateUsers();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  // Academy class active community group link & duration note migrations
  const classCols = (db.prepare(`PRAGMA table_info(academy_classes)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!classCols.includes('group_link')) {
    db.exec(`ALTER TABLE academy_classes ADD COLUMN group_link TEXT NOT NULL DEFAULT ''`);
  }
  if (!classCols.includes('group_duration_note')) {
    db.exec(`ALTER TABLE academy_classes ADD COLUMN group_duration_note TEXT NOT NULL DEFAULT ''`);
  }

  // Store customization & landing page migrations
  const storeCols = (db.prepare(`PRAGMA table_info(stores)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!storeCols.includes('social_youtube')) {
    db.exec(`ALTER TABLE stores ADD COLUMN social_youtube TEXT NOT NULL DEFAULT ''`);
  }
  if (!storeCols.includes('social_twitter')) {
    db.exec(`ALTER TABLE stores ADD COLUMN social_twitter TEXT NOT NULL DEFAULT ''`);
  }
  if (!storeCols.includes('social_shopee')) {
    db.exec(`ALTER TABLE stores ADD COLUMN social_shopee TEXT NOT NULL DEFAULT ''`);
  }
  if (!storeCols.includes('social_website')) {
    db.exec(`ALTER TABLE stores ADD COLUMN social_website TEXT NOT NULL DEFAULT ''`);
  }
  if (!storeCols.includes('landing_page_url')) {
    db.exec(`ALTER TABLE stores ADD COLUMN landing_page_url TEXT NOT NULL DEFAULT ''`);
  }
  if (!storeCols.includes('custom_landing_html')) {
    db.exec(`ALTER TABLE stores ADD COLUMN custom_landing_html TEXT NOT NULL DEFAULT ''`);
  }

  // Product custom coding landing page migration
  if (!productCols.includes('custom_landing_html')) {
    db.exec(`ALTER TABLE products ADD COLUMN custom_landing_html TEXT NOT NULL DEFAULT ''`);
  }

  // Orders & Order Items voucher/buyer email/whatsapp/platform fee migrations
  const orderCols = (db.prepare(`PRAGMA table_info(orders)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!orderCols.includes('buyer_email')) {
    db.exec(`ALTER TABLE orders ADD COLUMN buyer_email TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderCols.includes('buyer_whatsapp')) {
    db.exec(`ALTER TABLE orders ADD COLUMN buyer_whatsapp TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderCols.includes('voucher_code')) {
    db.exec(`ALTER TABLE orders ADD COLUMN voucher_code TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderCols.includes('discount_amount')) {
    db.exec(`ALTER TABLE orders ADD COLUMN discount_amount INTEGER NOT NULL DEFAULT 0`);
  }
  if (!orderCols.includes('is_guest')) {
    db.exec(`ALTER TABLE orders ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0`);
  }
  if (!orderCols.includes('buyer_name')) {
    db.exec(`ALTER TABLE orders ADD COLUMN buyer_name TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderCols.includes('guest_visitor_id')) {
    db.exec(`ALTER TABLE orders ADD COLUMN guest_visitor_id TEXT NOT NULL DEFAULT ''`);
  }
  if (!orderCols.includes('guest_access_token')) {
    db.exec(`ALTER TABLE orders ADD COLUMN guest_access_token TEXT NOT NULL DEFAULT ''`);
  }

  const orderItemCols = (db.prepare(`PRAGMA table_info(order_items)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!orderItemCols.includes('platform_fee_amount')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN platform_fee_amount INTEGER NOT NULL DEFAULT 0`);
  }
  if (!orderItemCols.includes('seller_net_amount')) {
    db.exec(`ALTER TABLE order_items ADD COLUMN seller_net_amount INTEGER NOT NULL DEFAULT 0`);
  }

  // Withdrawals transfer fee & net amount migrations
  const wdCols = (db.prepare(`PRAGMA table_info(withdrawals)`).all() as Array<{ name: string }>).map((c) => c.name);
  if (!wdCols.includes('transfer_fee')) {
    db.exec(`ALTER TABLE withdrawals ADD COLUMN transfer_fee INTEGER NOT NULL DEFAULT 3000`);
  }
  if (!wdCols.includes('net_amount')) {
    db.exec(`ALTER TABLE withdrawals ADD COLUMN net_amount INTEGER NOT NULL DEFAULT 0`);
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS store_external_affiliates (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Produk digital',
      price INTEGER NOT NULL DEFAULT 0,
      original_price INTEGER,
      description TEXT NOT NULL DEFAULT '',
      image_url TEXT NOT NULL DEFAULT '',
      affiliate_url TEXT NOT NULL,
      display_style TEXT NOT NULL DEFAULT 'classic',
      clicks_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE COLLATE NOCASE,
      scope TEXT NOT NULL DEFAULT 'platform' CHECK (scope IN ('platform', 'store')),
      store_id TEXT REFERENCES stores(id) ON DELETE CASCADE,
      owner_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('fixed', 'percent')),
      discount_value INTEGER NOT NULL,
      min_purchase INTEGER NOT NULL DEFAULT 0,
      max_discount INTEGER,
      quota_limit INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pro_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      price INTEGER NOT NULL,
      duration_days INTEGER NOT NULL,
      order_id TEXT,
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      reset_token_hash TEXT NOT NULL DEFAULT '',
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  ensureGuestBuyerUser();
  seedInitialData();
}

export function ensureGuestBuyerUser(): string {
  const guestUserId = 'usr_guest_buyer';
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, whatsapp, password_hash, role, mentor_status, bio, created_at)
     VALUES (?, 'Pembeli Tamu (Pengunjung)', 'guest@wdup.internal', '', 'guest_buyer_locked', 'member', 'none', 'Akun sistem untuk transaksi pembelian langsung pengunjung tanpa registrasi.', ?)`
  ).run(guestUserId, nowIso());
  return guestUserId;
}

export function ensureOfficialWdupStore(): { storeId: string; ownerUserId: string } {
  const ts = nowIso();
  const ownerUserId = 'usr_wdup_official';
  const storeId = 'str_wdup_official';
  db.prepare(
    `INSERT OR IGNORE INTO users (id, name, email, whatsapp, password_hash, role, mentor_status, bio, avatar_url, created_at)
     VALUES (?, 'WD.UP Official', 'official@wdup.internal', '081100002026', 'showcase_only_locked', 'member', 'none', 'Akun resmi platform WD.UP untuk merilis produk digital dan koleksi unggulan ekosistem.', '/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png', ?)`
  ).run(ownerUserId, ts);

  db.prepare(
    `INSERT OR IGNORE INTO stores (
       id, user_id, name, username, initials, logo_url, banner_url, description, category,
       contact_whatsapp, contact_email, social_instagram, social_tiktok, service_link,
       theme, store_mode, is_featured, visitors_count, created_at, updated_at
     ) VALUES (
       ?, ?, 'WD.UP Official', 'wdupofficial', 'WD',
       '/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png',
       '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
       'Toko resmi WD.UP (Women Digital Level Up) berisi produk digital kurasi resmi, template, planner, dan panduan karier perempuan digital.',
       'Official Store',
       '081100002026', 'halo@wdup.com', '@wdup.official', '@wdup.official', 'https://wdup.id',
       'sage', 'hybrid', 1, 0, ?, ?
     )`
  ).run(storeId, ownerUserId, ts, ts);

  return { storeId, ownerUserId };
}

export function logNotification(params: {
  userId: string | null;
  eventType: string;
  title: string;
  message: string;
  overrideEmail?: string;
  overrideWhatsapp?: string;
}) {
  const emailSettingActive =
    (db.prepare(`SELECT value FROM system_settings WHERE key = 'email_provider_active'`).get() as { value: string } | undefined)
      ?.value === '1';
  const waSettingActive =
    (db.prepare(`SELECT value FROM system_settings WHERE key = 'whatsapp_provider_active'`).get() as { value: string } | undefined)
      ?.value === '1';

  const emailWebhook = process.env.EMAIL_WEBHOOK_URL?.trim();
  const waWebhook = process.env.WHATSAPP_WEBHOOK_URL?.trim();

  const recipient = params.userId
    ? (db
        .prepare(`SELECT name, email, whatsapp, notify_email, notify_whatsapp FROM users WHERE id = ?`)
        .get(params.userId) as
        | { name: string; email: string; whatsapp: string; notify_email: number; notify_whatsapp: number }
        | undefined)
    : undefined;

  const targetEmail = (params.overrideEmail || recipient?.email || '').trim();
  const targetWhatsapp = (params.overrideWhatsapp || recipient?.whatsapp || '').trim();

  const emailActive = Boolean(targetEmail) && (emailSettingActive || Boolean(emailWebhook));
  const waActive = Boolean(targetWhatsapp) && (waSettingActive || Boolean(waWebhook));

  const emailStatus = emailActive ? 'dispatched' : targetEmail ? 'auto_recorded' : 'no_email';
  const waStatus = waActive ? 'dispatched' : targetWhatsapp ? 'auto_recorded' : 'no_whatsapp';

  const id = uid('ntf');
  const createdAt = nowIso();
  db.prepare(
    `INSERT INTO notifications (id, user_id, event_type, title, message, sender_email, email_status, whatsapp_status, is_read, created_at)
     VALUES (?, ?, ?, ?, ?, 'notif@wdup.com', ?, ?, 0, ?)`
  ).run(id, params.userId, params.eventType, params.title, params.message, emailStatus, waStatus, createdAt);

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

function seedInitialData() {
  const settingsDefaults: Array<[string, string]> = [
    ['email_provider_active', '0'],
    ['whatsapp_provider_active', '0'],
    ['sender_email', 'notif@wdup.com'],
    ['platform_fee_percent', '5'],
  ];
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of settingsDefaults) insertSetting.run(k, v);

  // Seed payment methods if empty
  const pmCount = (db.prepare(`SELECT COUNT(*) as c FROM payment_methods`).get() as { c: number }).c;
  if (pmCount === 0) {
    const insPm = db.prepare(
      `INSERT INTO payment_methods (id, type, provider_name, account_number, account_holder, instructions, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)`
    );
    insPm.run(
      'pm_bca',
      'bank_transfer',
      'Bank BCA',
      '8830-4412-90',
      'PT Women Digital Level Up',
      'Transfer sesuai nominal total pesanan beserta 3 digit kode unik jika ada. Simpan bukti transfer lalu unggah pada halaman detail pesanan.'
    );
    insPm.run(
      'pm_mandiri',
      'bank_transfer',
      'Bank Mandiri',
      '131-00-9823411-5',
      'PT Women Digital Level Up',
      'Lakukan transfer antarbank/Livin ke rekening Mandiri di atas, lalu unggah screenshot bukti berhasil untuk verifikasi admin.'
    );
    insPm.run(
      'pm_gopay',
      'e_wallet',
      'GoPay / QRIS Merchant',
      '0812-8800-4412',
      'WD.UP Official Store',
      'Kirim pembayaran e-wallet ke nomor terdaftar atas nama WD.UP Official Store, kemudian unggah bukti transaksi.'
    );
  }

  // Seed curated creator partner profiles & official store (non-login creator showcase records)
  // Note: unreachable random password hashes are ONLY on non-interactive catalog partner showcases;
  // real users register via /api/auth/register or claim first admin via /api/auth/claim-admin.
  const storeCount = (db.prepare(`SELECT COUNT(*) as c FROM stores`).get() as { c: number }).c;
  if (storeCount === 0) {
    const ts = nowIso();
    const lockedHash = 'showcase_only_locked';
    const insUser = db.prepare(
      `INSERT INTO users (id, name, email, whatsapp, password_hash, role, bio, avatar_url, created_at) VALUES (?, ?, ?, ?, ?, 'member', ?, ?, ?)`
    );
    insUser.run(
      'usr_partner_nara',
      'Nara Studio',
      'partner.nara@wdup.internal',
      '081290001101',
      lockedHash,
      'Desainer template produktivitas dan journal digital perempuan.',
      '/src/assets/images/store_studio_avatar_1795359343952.jpg',
      ts
    );
    insUser.run(
      'usr_partner_karsa',
      'Karsa Kreatif',
      'partner.karsa@wdup.internal',
      '081290001102',
      lockedHash,
      'Spesialis e-book strategi konten, brand kit, dan spreadsheet bisnis UMKM perempuan.',
      '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      ts
    );

    const insStore = db.prepare(
      `INSERT INTO stores (id, user_id, name, username, initials, logo_url, banner_url, description, category, contact_whatsapp, contact_email, social_instagram, social_tiktok, service_link, theme, store_mode, is_featured, visitors_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'hybrid', 1, 0, ?, ?)`
    );
    insStore.run(
      'str_nara',
      'usr_partner_nara',
      'Nara Mindful Studio',
      'naramindful',
      'NM',
      '/src/assets/images/store_studio_avatar_1795359343952.jpg',
      '/src/assets/images/market_planner_product_1795359344571.jpg',
      'Koleksi planner, digital journal, dan worksheet reflektif untuk menata fokus kerja dan self-growth harian.',
      'Planner & Self Growth',
      '081290001101',
      'nara@wdup.com',
      '@naramindful.id',
      '@naramindful',
      'https://wdup.com/jasa/nara-notion-setup',
      'sage',
      ts,
      ts
    );
    insStore.run(
      'str_karsa',
      'usr_partner_karsa',
      'Karsa Digital Lab',
      'karsadigital',
      'KD',
      '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      '/src/assets/images/market_ebook_product_1795359344962.jpg',
      'Playbook creator, spreadsheet keuangan bisnis, serta template branding siap pakai untuk perempuan pebisnis digital.',
      'Digital Career & Business',
      '081290001102',
      'karsa@wdup.com',
      '@karsadigital.id',
      '@karsalab',
      'https://wdup.com/jasa/karsa-brand-audit',
      'warm-cream',
      ts,
      ts
    );

    // Seed 10 products covering all 10 Market categories
    const insProd = db.prepare(
      `INSERT INTO products (id, store_id, owner_user_id, title, slug, category, home_pillar, price, description, image_url, delivery_content, is_physical, is_featured, is_recommended, affiliate_enabled, affiliate_commission_pct, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    );

    const seededProducts = [
      [
        'prd_ebook_blueprint',
        'str_karsa',
        'usr_partner_karsa',
        'E-Book The Digital Growth Blueprint',
        'digital-growth-blueprint',
        'E-book dan Webbook',
        'Digital Career',
        149000,
        'Panduan lengkap membangun personal brand, monetisasi konten, dan produk digital pertama dari nol hingga konsisten menghasilkan.',
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
        'Akses Webbook & Unduh PDF Lengkap (124 halaman) + Bonus Checklist Peluncuran Produk Digital. Kode Lisensi: WDUP-DGB-2026.',
        0,
        1,
        1,
        20,
      ],
      [
        'prd_planner_clarity',
        'str_nara',
        'usr_partner_nara',
        'Mindful Career & Daily Planner 2026',
        'mindful-career-planner',
        'Planner dan Journal',
        'Self Growth',
        119000,
        'Digital planner interaktif untuk iPad/tablet & Notion dengan template refleksi mingguan, target karier, dan pelacak energi harian.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'Paket Unduhan GoodNotes PDF Hyperlinked + Duplikasi Workspace Notion Mindful Planner 2026.',
        0,
        1,
        1,
        25,
      ],
      [
        'prd_template_carousel',
        'str_karsa',
        'usr_partner_karsa',
        'Creator Brand & Carousel Template Kit',
        'creator-carousel-kit',
        'Template',
        'Digital Career',
        95000,
        '45+ template carousel edukasi, media kit rate card, dan pitch deck kolaborasi brand yang mudah disesuaikan.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Tautan Duplikasi Canva Pro & Free + Panduan Tipografi & Palet Warna Editorial.',
        0,
        1,
        0,
        20,
      ],
      [
        'prd_worksheet_selflove',
        'str_nara',
        'usr_partner_nara',
        'Self-Love & Boundaries Reflection Worksheet',
        'self-love-worksheet',
        'Worksheet',
        'Self Love',
        69000,
        '30 lembar latihan terstruktur untuk membangun batasan sehat, mengenali nilai diri, dan meredakan burnout pekerja kreatif.',
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        'File PDF Interaktif (Fillable A4 & Letter) + Panduan Audio Refleksi 15 Menit.',
        0,
        0,
        1,
        20,
      ],
      [
        'prd_spreadsheet_cashflow',
        'str_karsa',
        'usr_partner_karsa',
        'Spreadsheet Keuangan Creator & Affiliate',
        'spreadsheet-creator-cashflow',
        'Spreadsheet',
        'Digital Career',
        125000,
        'Dashboard arus kas otomatis untuk melacak pemasukan produk digital, komisi affiliate, pajak, dan dana darurat.',
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        'Tautan Google Sheets Template Otomatis + Video Tutorial Setup 10 Menit.',
        0,
        1,
        1,
        15,
      ],
      [
        'prd_printable_affirmation',
        'str_nara',
        'usr_partner_nara',
        'Printable Desk Affirmation & Habit Cards',
        'printable-affirmation-cards',
        'Printable',
        'Self Love',
        55000,
        'Set kartu afirmasi pagi dan pelacak kebiasaan siap cetak ukuran A5 dengan ilustrasi minimalis warna sage & cream.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'File Siap Cetak CMYK High-Res PDF (24 Kartu Afirmasi + Tracker Bulanan).',
        0,
        0,
        1,
        20,
      ],
      [
        'prd_digital_audiokit',
        'str_karsa',
        'usr_partner_karsa',
        'Digital Product Launch Automation Kit',
        'launch-automation-kit',
        'Produk digital',
        'Self Development',
        175000,
        'Kumpulan SOP peluncuran produk digital, skrip email welcome, dan kalender konten pra-peluncuran 14 hari.',
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
        'Bundle Dokumen SOP Peluncuran, 12 Template Email Copywriting, dan Kalender Trello/Notion.',
        0,
        0,
        1,
        18,
      ],
      [
        'prd_fisik_linenjournal',
        'str_nara',
        'usr_partner_nara',
        'Linen Hardcover Gratitude Journal (Fisik)',
        'linen-gratitude-journal',
        'Produk fisik',
        'Self Love',
        189000,
        'Buku jurnal fisik bersampul linen sage green 180 halaman kertas bookpaper 100gsm bebas tembus tinta.',
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        'Pesanan Produk Fisik Terverifikasi — Tim Nara Mindful Studio akan menghubungi WhatsApp Anda untuk resi pengiriman.',
        1,
        1,
        0,
        12,
      ],
      [
        'prd_jasa_brandaudit',
        'str_karsa',
        'usr_partner_karsa',
        'Jasa 1-on-1 Audit Personal Brand & Bio IG',
        'jasa-audit-brand',
        'Jasa profesional',
        'Self Development',
        299000,
        'Sesi review mendalam 60 menit untuk merapikan positioning, bio media sosial, dan struktur produk unggulan Anda.',
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        'Jadwalkan sesi konsultasi Anda melalui tautan kalender resmi Karsa Digital Lab setelah pembayaran terverifikasi.',
        0,
        0,
        1,
        10,
      ],
      [
        'prd_resources_prompts',
        'str_karsa',
        'usr_partner_karsa',
        '150+ AI Prompt & Script Bank untuk Creator',
        'ai-prompt-creator-bank',
        'Digital resources',
        'Digital Career',
        89000,
        'Pustaka prompt siap pakai untuk riset audiens, penulisan hook video pendek, dan skrip promosi produk affiliate.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Akses Database Digital Resources (150+ Prompt Terkurasi & Terstruktur per Niche).',
        0,
        0,
        1,
        25,
      ],
    ] as const;

    for (const p of seededProducts) {
      insProd.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[9], p[10], p[11], p[12], p[13], p[14], ts);
    }
  }

  // Seed 6 Academy Categories, Programs, Classes, Modules
  const catCount = (db.prepare(`SELECT COUNT(*) as c FROM academy_categories`).get() as { c: number }).c;
  if (catCount === 0) {
    const ts = nowIso();
    const insCat = db.prepare(
      `INSERT INTO academy_categories (id, name, slug, description, accent_color, sort_order) VALUES (?, ?, ?, ?, ?, ?)`
    );
    const categories = [
      ['cat_creator', 'Content Creator Academy', 'content-creator', 'Kuasai storytelling, produksi video pendek, dan monetisasi kreator yang autentik.', 'coral', 1],
      ['cat_digiprod', 'Digital Product Academy', 'digital-product', 'Rancang, validasi, dan luncurkan e-book, template, serta kelas digital pertamamu.', 'sage', 2],
      ['cat_affiliate', 'Affiliate Academy', 'affiliate', 'Strategi review jujur, funnel konten, dan konversi link referral berulang.', 'butter', 3],
      ['cat_branding', 'Personal Branding Academy', 'personal-branding', 'Bangun reputasi profesional, positioning unik, dan daya tarik audiens.', 'lavender', 4],
      ['cat_aiskill', 'AI & Digital Skill Academy', 'ai-digital-skill', 'Manfaatkan AI workflow, automasi, dan tools produktivitas modern.', 'sage', 5],
      ['cat_business', 'Digital Business Academy', 'digital-business', 'Kelola keuangan bisnis digital, operasional toko, dan skalabilitas tim.', 'coral', 6],
    ] as const;
    for (const c of categories) insCat.run(c[0], c[1], c[2], c[3], c[4], c[5]);

    const insProg = db.prepare(
      `INSERT INTO academy_programs (id, category_id, title, topic, goal, level, bundle_price, description, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const programs = [
      [
        'prog_creator_found',
        'cat_creator',
        'Creator Storytelling & Short-Form Mastery',
        'Konten Video & Narasi',
        'Membangun audiens organik dan portofolio kolaborasi brand dalam 30 hari',
        'Beginner',
        349000,
        'Program belajar lengkap dari pencarian niche, penulisan hook 3 detik pertama, produksi visual hangat, hingga rate card profesional.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      ],
      [
        'prog_digiprod_launch',
        'cat_digiprod',
        'Zero to First Digital Product',
        'Produk Digital & Monetisasi',
        'Merilis e-book, planner, atau template siap jual di WD.UP Market',
        'Intermediate',
        399000,
        'Bimbingan step-by-step menentukan ide produk yang laku, mendesain aset digital bernilai tinggi, dan strategi peluncuran.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
      ],
      [
        'prog_affiliate_pro',
        'cat_affiliate',
        'Ethical Affiliate Conversion System',
        'Pemasaran Afiliasi',
        'Menghasilkan komisi rutin melalui rekomendasi produk terkurasi',
        'Beginner',
        249000,
        'Pelajari cara memilih produk berkonversi tinggi, membangun toko affiliate tanpa stok barang, dan membaca data klik.',
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
      ],
      [
        'prog_branding_core',
        'cat_branding',
        'Authentic Feminine Brand Positioning',
        'Personal Branding',
        'Memiliki identitas suara, estetika visual, dan penawaran jasa yang jelas',
        'Beginner',
        279000,
        'Menyelaraskan nilai diri, cerita perjalanan, dan positioning profesional agar audiens langsung percaya.',
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
      ],
      [
        'prog_ai_workflow',
        'cat_aiskill',
        'AI Workflow for Women Digital Creators',
        'Produktivitas & AI',
        'Memangkas waktu riset dan produksi konten hingga 60% dengan AI',
        'Intermediate',
        319000,
        'Praktik langsung membuat prompt library, riset tren, dan sistem kerja otomatis dengan tetap menjaga sentuhan manusia.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
      ],
      [
        'prog_biz_scale',
        'cat_business',
        'Sustainable Digital Business Blueprint',
        'Manajemen Bisnis Digital',
        'Mengatur arus kas, harga produk, dan retensi pelanggan jangka panjang',
        'Advanced',
        449000,
        'Fondasi bisnis digital sehat bagi pemilik toko dan kreator agar profitabel tanpa kelelahan.',
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
      ],
    ] as const;
    for (const p of programs) insProg.run(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8]);

    const insCls = db.prepare(
      `INSERT INTO academy_classes (id, program_id, category_id, title, description, objectives, mentor_name, price, cover_url, pdf_guide_title, pdf_guide_content, certificate_available, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const classes = [
      [
        'cls_creator_101',
        'prog_creator_found',
        'cat_creator',
        'Storytelling & Hook 3 Detik untuk Konten Edukasi',
        'Pelajari anatomi video pendek yang membuat audiens berhenti scrolling, merasa terhubung, dan menyimpan konten Anda.',
        JSON.stringify([
          'Merumuskan 3 pilar konten berbasis keahlian dan empati audiens',
          'Menulis 10 variasi hook pembuka yang tidak clickbait namun memicu rasa ingin tahu',
          'Menyusun alur visual dan pacing editing untuk video 30–60 detik',
        ]),
        'Nadira Kusuma',
        189000,
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Handbook Storytelling & 30 Template Hook WD.UP (PDF)',
        'BAB 1: Prinsip Hook Empatik.\n1. Mulai dari masalah spesifik yang dirasakan audiens hari ini.\n2. Gunakan kontras sebelum-sesudah yang realistis.\n3. Hindari klaim berlebihan; tunjukkan proses nyata.\n\nBAB 2: Struktur 4-Beat Video Edukasi:\n- Beat 1 (0-3 detik): Hook visual & pertanyaan kunci\n- Beat 2 (3-15 detik): Konteks singkat mengapa hal ini penting\n- Beat 3 (15-40 detik): 3 langkah praktis yang bisa langsung dicoba\n- Beat 4 (40-55 detik): Ajakan menyimpan atau mencoba worksheet.',
      ],
      [
        'cls_digiprod_101',
        'prog_digiprod_launch',
        'cat_digiprod',
        'Merancang Template & E-Book Siap Jual',
        'Ubah pengetahuan dan sistem kerjamu menjadi produk digital rapi yang bisa dijual berulang kali di WD.UP Market.',
        JSON.stringify([
          'Memilih format produk digital paling sesuai (E-book, Planner, Worksheet, atau Template)',
          'Menentukan struktur isi yang langsung menyelesaikan masalah pembeli',
          'Menetapkan harga dan menyiapkan halaman produk yang meyakinkan',
        ]),
        'Sekar Ayuningtyas',
        219000,
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'Checklist Validasi & Produksi Produk Digital (PDF)',
        'LANGKAH VALIDASI PRODUK DIGITAL:\n1. Identifikasi 1 masalah berulang yang sering ditanyakan audiens.\n2. Buat solusi ringkas dalam format terstruktur (PDF interaktif / Template / Spreadsheet).\n3. Uji coba kepada 5 calon pengguna awal sebelum rilis massal.\n4. Lengkapi dengan panduan penggunaan 1 halaman.',
      ],
      [
        'cls_affiliate_101',
        'prog_affiliate_pro',
        'cat_affiliate',
        'Membangun Toko Affiliate & Konversi Tanpa Stok',
        'Cara kurasi produk terbaik di WD.UP Market, membuat review jujur, dan mengoptimalkan link referral untuk komisi konsisten.',
        JSON.stringify([
          'Memilih produk affiliate dengan komisi dan relevansi audiens terbaik',
          'Menata Toko Affiliate sendiri di My Store WD.UP',
          'Membuat konten soft-selling berbasis studi kasus penggunaan',
        ]),
        'Rania Pratiwi',
        149000,
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
        'Playbook Affiliate Etis WD.UP (PDF)',
        'STRATEGI KURASI PRODUK AFFILIATE:\n- Pilih maksimal 5-8 produk utama yang benar-benar selaras dengan profil audiensmu.\n- Jelaskan untuk siapa produk tersebut cocok dan apa hasil nyatanya.\n- Arahkan audiens ke Landing Page Toko Affiliate milikmu agar mereka mudah menjelajah semua rekomendasi.',
      ],
      [
        'cls_branding_101',
        'prog_branding_core',
        'cat_branding',
        'Positioning & Identitas Visual Personal Brand',
        'Temukan suara khas dan pesan inti yang membedakan dirimu di tengah ramainya kreator digital.',
        JSON.stringify([
          'Menyusun Brand Positioning Statement satu kalimat yang kuat',
          'Menentukan palet warna, gaya bahasa, dan mood visual yang konsisten',
          'Menerjemahkan personal brand ke bio dan penawaran jasa',
        ]),
        'Larasati Putri',
        169000,
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        'Workbook Identitas Personal Brand (PDF)',
        'FORMULA POSITIONING PERSONAL BRAND:\n"Saya membantu [Siapa Audiens Spesifik] mencapai [Hasil Nyata] melalui [Metode/Keunikan Anda] tanpa [Hambatan Terbesar Mereka]."',
      ],
      [
        'cls_ai_101',
        'prog_ai_workflow',
        'cat_aiskill',
        'AI Content & Research Assistant untuk Kreator',
        'Gunakan AI secara strategis untuk riset ide, menyusun kerangka e-book, dan mempercepat produksi konten harian.',
        JSON.stringify([
          'Menulis prompt kontekstual dengan tone suara personal Anda',
          'Membangun bank ide 30 hari konten dalam 20 menit',
          'Melakukan kurasi dan penyuntingan manusia agar konten tetap hangat',
        ]),
        'Tania Wijaya',
        179000,
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Panduan Prompt Engineering Kreatif (PDF)',
        'KERANGKA PROMPT R.O.L.E:\n- Role: Peran spesifik asisten\n- Objective: Output yang dibutuhkan\n- Limit/Tone: Gaya bahasa hangat, feminin, profesional\n- Example: Contoh kalimat pembuka agar hasil AI selaras.',
      ],
      [
        'cls_biz_101',
        'prog_biz_scale',
        'cat_business',
        'Arus Kas, Pricing & Skalabilitas Toko Digital',
        'Kelola pemasukan toko, komisi affiliate, biaya operasional, dan strategi bundling agar bisnis digital tumbuh sehat.',
        JSON.stringify([
          'Memisahkan keuangan pribadi dan kas bisnis digital',
          'Menghitung margin bersih setelah komisi affiliate',
          'Merancang tangga produk (freebie, entry product, flagship class)',
        ]),
        'Dinda Maharani',
        229000,
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        'Template Kalkulasi Harga & Profit Margin (PDF)',
        'RUMUS PRICING PRODUK DIGITAL SEHAT:\nHarga Jual = (Biaya Produksi & Tools / Target Penjualan Awal) + Alokasi Komisi Affiliate (10-25%) + Margin Pertumbuhan Bisnis.',
      ],
    ] as const;
    for (const cl of classes) insCls.run(cl[0], cl[1], cl[2], cl[3], cl[4], cl[5], cl[6], cl[7], cl[8], cl[9], cl[10], ts);

    const insMod = db.prepare(
      `INSERT INTO academy_modules (id, class_id, sort_order, title, duration_minutes, video_title, video_summary, video_script_captions, text_material, interactive_exercise_prompt, interactive_exercise_choices, worksheet_prompt, assignment_prompt, quiz_questions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const modulesSeed = [
      [
        'mod_creator_1',
        'cls_creator_101',
        1,
        'Modul 1: Menemukan Pilar Konten & Empati Audiens',
        18,
        'Video Pembelajaran 1 — Fondasi Pilar Konten Autentik',
        'Membahas cara memetakan irisan antara keahlian pribadi, topik yang disukai, dan kebutuhan nyata audiens perempuan digital.',
        JSON.stringify([
          { time: '00:00', heading: 'Mengapa Konsistensi Butuh Pilar', text: 'Tanpa 3 pilar konten yang jelas, kreator mudah kehabisan ide di minggu ketiga.' },
          { time: '04:30', heading: 'Rumus Irisan Keahlian & Masalah', text: 'Gabungkan pengalaman nyata Anda dengan pertanyaan yang paling sering muncul di komentar.' },
          { time: '11:15', heading: 'Studi Kasus Konten Edukasi', text: 'Mengubah catatan harian menjadi serial konten mingguan yang dinantikan.' },
        ]),
        'Pilar konten adalah tiga sampai empat tema utama yang menjadi identitas akun Anda. Dengan membatasi tema utama, algoritma dan audiens manusia sama-sama lebih cepat memahami nilai yang Anda tawarkan. Mulailah dengan membagi pilar menjadi: (1) Edukasi Praktis, (2) Cerita Proses/Refleksi, dan (3) Rekomendasi Tools atau Produk.',
        'Manakah kombinasi pilar konten yang paling kuat untuk membangun kepercayaan sekaligus penjualan produk digital?',
        JSON.stringify([
          { label: 'Hanya memposting promosi produk setiap hari tanpa konteks', isCorrect: false, feedback: 'Audiens cepat lelah jika tidak ada nilai edukasi atau cerita proses.' },
          { label: 'Kombinasi Edukasi Praktis + Cerita Proses + Studi Kasus Produk', isCorrect: true, feedback: 'Tepat! Kombinasi ini membangun otoritas, kedekatan emosional, dan konversi alami.' },
          { label: 'Mengikuti semua tren viral acak tanpa kaitan dengan niche', isCorrect: false, feedback: 'Views mungkin naik sesaat, tetapi audiens tidak relevan dengan produk Anda.' },
        ]),
        'Tuliskan 3 pilar konten utama Anda beserta 2 contoh ide judul untuk masing-masing pilar:',
        'Buat 1 naskah konten pendek (durasi 30-45 detik) berdasarkan salah satu pilar Anda dan tempelkan naskah atau tautan drafnya di bawah:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Berapa jumlah pilar konten ideal agar audiens mudah mengingat topik utama akun Anda?',
            options: ['1 topik saja setiap tahun', '3 hingga 4 pilar yang saling berkaitan', '15 topik acak setiap minggu'],
            correctIndex: 1,
          },
          {
            id: 'q2',
            question: 'Apa fungsi utama konten "Cerita Proses / Behind the Scenes"?',
            options: ['Membangun kedekatan manusiawi dan kepercayaan', 'Menggantikan fungsi halaman checkout', 'Menghindari membuat materi edukasi'],
            correctIndex: 0,
          },
        ]),
      ],
      [
        'mod_creator_2',
        'cls_creator_101',
        2,
        'Modul 2: Teknik Hook 3 Detik & Alur Visual',
        22,
        'Video Pembelajaran 2 — Meracik Kalimat Pembuka yang Menghentikan Scroll',
        'Praktik menulis hook berbasis rasa ingin tahu, visual kontras, dan call-to-action yang elegan.',
        JSON.stringify([
          { time: '00:00', heading: 'Psikologi 3 Detik Pertama', text: 'Audiens memutuskan lanjut menonton dari kombinasi teks layar dan intonasi suara pertama.' },
          { time: '08:10', heading: '5 Pola Hook Anti-Clickbait', text: 'Gunakan pola "Kesalahan Halus", "Cara Sederhana", dan "Sebelum Kamu Mulai".' },
          { time: '16:40', heading: 'Penutup dengan CTA Lembut', text: 'Arahkan audiens menyimpan postingan atau mengecek link di bio toko Anda.' },
        ]),
        'Hook yang efektif tidak perlu berlebihan atau menakut-nakuti. Fokuslah pada relevansi instan: sebutkan siapa yang terbantu dan masalah apa yang diselesaikan dalam satu kalimat pendek maksimal 9 kata di layar.',
        'Pilih contoh kalimat hook yang paling tepat untuk audiens perempuan yang ingin mulai membuat produk digital:',
        JSON.stringify([
          { label: 'Cara mengubah catatan kerjamu jadi template siap jual minggu ini', isCorrect: true, feedback: 'Spesifik, relevan, realistis, dan langsung menyebut manfaat.' },
          { label: 'Rahasia cepat kaya dalam semalam tanpa kerja apa pun', isCorrect: false, feedback: 'Klaim tidak realistis menurunkan kredibilitas jangka panjang.' },
          { label: 'Halo semuanya selamat pagi apa kabar hari ini', isCorrect: false, feedback: 'Terlalu lambat; penonton keburu berpindah sebelum masuk ke inti topik.' },
        ]),
        'Tulis 5 variasi hook 3 detik untuk niche Anda menggunakan pola "Kesalahan Halus" dan "Langkah Praktis":',
        'Pilih 1 hook terbaik Anda, lalu susun storyboard 4 adegan (0-3s, 3-15s, 15-35s, 35-45s):',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Mengapa panjang teks hook di layar sebaiknya maksimal 7–9 kata?',
            options: ['Agar terbaca seketika dalam 2 detik pertama', 'Karena aplikasi melarang kalimat panjang', 'Supaya tidak perlu menambahkan suara'],
            correctIndex: 0,
          },
        ]),
      ],
      [
        'mod_digiprod_1',
        'cls_digiprod_101',
        1,
        'Modul 1: Validasi Ide & Struktur Produk Digital Bernilai',
        20,
        'Video Pembelajaran — Menemukan Ide Produk yang Dicari Pembeli',
        'Belajar memetakan masalah spesifik pembeli dan memilih format produk digital tercepat untuk diluncurkan.',
        JSON.stringify([
          { time: '00:00', heading: 'Produk Digital Bukan Sekadar File', text: 'Pembeli membayar untuk penghematan waktu dan kejelasan langkah.' },
          { time: '07:20', heading: 'Matriks Format Produk', text: 'Kapan memilih E-book, Worksheet, Planner, atau Template.' },
        ]),
        'Produk digital yang laris menyelesaikan satu transisi spesifik: dari bingung menjadi punya sistem kerja yang rapi. Sebelum mendesain sampul, pastikan Anda menuliskan hasil akhir apa yang langsung bisa dipakai pembeli dalam 15 menit setelah mengunduh.',
        'Apa faktor terpenting yang membuat sebuah template atau worksheet layak dibeli?',
        JSON.stringify([
          { label: 'Jumlah halaman harus lebih dari 200 halaman', isCorrect: false, feedback: 'Kualitas dan kepraktisan jauh lebih bernilai daripada ketebalan semata.' },
          { label: 'Langsung siap pakai dan memangkas waktu kerja pembeli', isCorrect: true, feedback: 'Benar! Kecepatan implementasi adalah nilai utama produk digital.' },
        ]),
        'Tuliskan konsep produk digital pertama Anda (Nama produk, target pembeli, dan masalah yang diselesaikan):',
        'Buat daftar isi/outline lengkap 5 bagian utama untuk produk digital Anda:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Mengapa panduan penggunaan 1 halaman penting disertakan di produk digital?',
            options: ['Membantu pembeli langsung mempraktikkan produk tanpa bingung', 'Hanya untuk menambah ukuran file', 'Syarat wajib mencetak buku'],
            correctIndex: 0,
          },
        ]),
      ],
      [
        'mod_affiliate_1',
        'cls_affiliate_101',
        1,
        'Modul 1: Kurasi Produk & Etika Rekomendasi Affiliate',
        16,
        'Video Pembelajaran — Strategi Affiliate Berbasis Kepercayaan',
        'Memahami alur link referral WD.UP, pemilihan produk berkonversi, dan cara menjaga kepercayaan audiens.',
        JSON.stringify([
          { time: '00:00', heading: 'Cara Kerja Ekosistem Affiliate WD.UP', text: 'Pilih produk di Katalog Affiliate, tambahkan ke My Store, bagikan link referral unik Anda.' },
          { time: '06:45', heading: 'Review Jujur yang Mengonversi', text: 'Tunjukkan fitur nyata dan siapa yang paling cocok menggunakannya.' },
        ]),
        'Penghasilan affiliate yang berkelanjutan lahir dari kurasi yang jujur. Di WD.UP Market, Anda dapat menggabungkan produk digital Anda sendiri dengan produk pilihan seller lain di satu landing page toko yang rapi.',
        'Bagaimana cara sistem WD.UP mencatat komisi affiliate agar aman dan akurat?',
        JSON.stringify([
          { label: 'Otomatis dicatat saat link referral diklik dan transaksi terverifikasi Paid', isCorrect: true, feedback: 'Benar! Komisi hanya dicatat dan masuk saldo setelah pembayaran terverifikasi valid.' },
          { label: 'Dicatat manual di kolom komentar postingan', isCorrect: false, feedback: 'Sistem mencatat klik dan transaksi secara otomatis di database.' },
        ]),
        'Pilih 3 produk dari WD.UP Market yang ingin Anda promosikan dan tuliskan alasan kecocokannya dengan audiens Anda:',
        'Tulis 1 caption promosi soft-selling untuk salah satu produk affiliate pilihan Anda:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Kapan komisi affiliate resmi dikreditkan ke saldo wallet?',
            options: ['Saat pembeli baru memasukkan barang ke keranjang', 'Setelah pembayaran pesanan terverifikasi Paid oleh admin', 'Sebelum link referral dibagikan'],
            correctIndex: 1,
          },
        ]),
      ],
      [
        'mod_branding_1',
        'cls_branding_101',
        1,
        'Modul 1: Positioning Statement & Suara Brand',
        18,
        'Video Pembelajaran — Merumuskan Identitas Brand yang Mengesankan',
        'Langkah praktis menyusun bio, tone suara, dan diferensiasi personal brand.',
        JSON.stringify([
          { time: '00:00', heading: 'Positioning dalam 10 Detik', text: 'Pengunjung profil harus langsung paham apa keahlian dan penawaran Anda.' },
        ]),
        'Personal brand bukan tentang menjadi sempurna, melainkan tentang konsistensi nilai dan kejelasan pesan. Gunakan satu kalimat positioning di setiap bio media sosial dan landing page toko Anda.',
        'Elemen mana yang wajib ada dalam bio personal brand yang efektif?',
        JSON.stringify([
          { label: 'Siapa yang Anda bantu, hasil apa yang ditawarkan, dan tautan langkah berikutnya', isCorrect: true, feedback: 'Tepat! Kejelasan manfaat dan CTA membuat pengunjung bertindak.' },
          { label: 'Kumpulan kutipan motivasi acak tanpa menyebut bidang keahlian', isCorrect: false, feedback: 'Audiens sulit memahami layanan atau produk apa yang Anda tawarkan.' },
        ]),
        'Tuliskan Brand Positioning Statement Anda dengan format: Saya membantu [siapa] mencapai [apa] melalui [bagaimana]:',
        'Perbarui draf bio profil dan deskripsi toko WD.UP Anda sesuai positioning baru:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Apa tujuan utama personal branding di era digital?',
            options: ['Membangun kepercayaan dan reputasi yang relevan dengan karya/bisnis Anda', 'Meniru gaya orang lain sepenuhnya', 'Mengumpulkan pengikut tanpa interaksi'],
            correctIndex: 0,
          },
        ]),
      ],
      [
        'mod_ai_1',
        'cls_ai_101',
        1,
        'Modul 1: Prompting Terstruktur untuk Kreator',
        15,
        'Video Pembelajaran — Kolaborasi Manusia & AI',
        'Cara memberi konteks brand agar output AI terdengar natural dan siap pakai.',
        JSON.stringify([
          { time: '00:00', heading: 'Jangan Hanya Beri Perintah Satu Baris', text: 'Sertakan peran, target pembaca, gaya bahasa, dan tujuan akhir.' },
        ]),
        'AI bekerja paling baik sebagai rekan brainstorming dan penyusun draf pertama. Gunakan AI Creator di WD.UP Creator Studio untuk menyusun kerangka konten, lalu poles dengan cerita dan pengalaman pribadi Anda.',
        'Apa langkah wajib setelah mendapatkan draf konten dari AI?',
        JSON.stringify([
          { label: 'Menambahkan pengalaman pribadi, verifikasi fakta, dan menyelaraskan suara brand', isCorrect: true, feedback: 'Tepat! Sentuhan manusia membuat konten autentik dan dipercaya.' },
          { label: 'Langsung menyalin mentah tanpa membaca ulang', isCorrect: false, feedback: 'Draf AI perlu disesuaikan dengan konteks nyata dan gaya bahasa Anda.' },
        ]),
        'Catat 3 prompt andalan yang paling membantu workflow harian Anda:',
        'Gunakan AI Creator Studio WD.UP untuk membuat 1 draf konten, lalu tulis versi hasil suntingan pribadi Anda:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Informasi apa yang membuat hasil prompt AI jauh lebih akurat?',
            options: ['Konteks audiens, tujuan konten, dan gaya bahasa yang diinginkan', 'Menulis huruf kapital seluruhnya', 'Menghapus semua detail topik'],
            correctIndex: 0,
          },
        ]),
      ],
      [
        'mod_biz_1',
        'cls_biz_101',
        1,
        'Modul 1: Manajemen Arus Kas & Tangga Produk Digital',
        20,
        'Video Pembelajaran — Menjaga Profitabilitas Toko Digital',
        'Memahami alokasi komisi affiliate, penetapan harga bertingkat, dan pengelolaan saldo.',
        JSON.stringify([
          { time: '00:00', heading: 'Value Ladder untuk Toko Perempuan Digital', text: 'Kombinasikan produk entry Rp 50rb-an, kelas inti, dan layanan konsultasi.' },
        ]),
        'Bisnis digital yang sehat tidak bergantung pada satu produk saja. Buat tangga penawaran mulai dari worksheet terjangkau, planner/template inti, hingga jasa atau program pendampingan.',
        'Mengapa penting menyisihkan persentase margin untuk program affiliate seller?',
        JSON.stringify([
          { label: 'Karena affiliate memperluas jangkauan pembeli baru dengan biaya akuisisi terukur', isCorrect: true, feedback: 'Betul! Komisi hanya dibayarkan ketika penjualan berhasil terjadi.' },
          { label: 'Agar harga produk bisa dinaikkan tanpa nilai tambah', isCorrect: false, feedback: 'Nilai produk harus tetap sepadan dengan harganya.' },
        ]),
        'Susun rancangan 3 tingkatan produk (Entry, Core, Premium) untuk toko digital Anda:',
        'Hitung simulasi harga jual, komisi affiliate 15%, dan profit bersih per 10 penjualan:',
        JSON.stringify([
          {
            id: 'q1',
            question: 'Apa keuntungan sistem komisi affiliate berbasis penjualan terverifikasi?',
            options: ['Biaya promosi hanya keluar saat penjualan benar-benar terjadi', 'Mengurangi transparansi laporan penjualan', 'Menghapus kebutuhan kualitas produk'],
            correctIndex: 0,
          },
        ]),
      ],
    ] as const;

    for (const m of modulesSeed) {
      insMod.run(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13]);
    }
  }

  // Seed Home CMS Items (banners, 4 lifestyle categories, opportunities, communities, affiliate info)
  const cmsCount = (db.prepare(`SELECT COUNT(*) as c FROM home_cms_items`).get() as { c: number }).c;
  if (cmsCount === 0) {
    const insCms = db.prepare(
      `INSERT INTO home_cms_items (id, section_type, title, subtitle, body, image_url, cta_label, cta_target, accent_color, sort_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
    );
    const items = [
      [
        'cms_banner_main',
        'banner',
        'Belajar, Berkarya, dan Tumbuh Bersama Ekosistem Digital Perempuan',
        'WD.UP — Women Digital Level Up',
        'Satu akun terintegrasi untuk menguasai skill digital di Academy, membangun toko produk digital & affiliate di Market, hingga berkarya dengan Creator Studio.',
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        'Mulai di Academy',
        'academy',
        'sage',
        1,
      ],
      [
        'cms_banner_market',
        'banner',
        'Luncurkan Produk Digital & Toko Affiliate Pertamamu',
        'WD.UP Market & My Store',
        'Jual e-book, template, planner, jasa profesional, atau kurasi produk seller WD.UP dengan komisi affiliate hingga 25%.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'Jelajahi Market',
        'market',
        'coral',
        2,
      ],
      [
        'cms_cat_selflove',
        'lifestyle_category',
        'Self Love',
        'Kesadaran diri & batas sehat',
        'Jurnal syukur, afirmasi harian, dan panduan menjaga keseimbangan energi perempuan berkarya.',
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        'Lihat Koleksi',
        'Self Love',
        'lavender',
        1,
      ],
      [
        'cms_cat_selfgrowth',
        'lifestyle_category',
        'Self Growth',
        'Kebiasaan & kejelasan tujuan',
        'Planner produktivitas, sistem evaluasi mingguan, dan kelas pengembangan pola pikir bertumbuh.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'Lihat Koleksi',
        'Self Growth',
        'sage',
        2,
      ],
      [
        'cms_cat_selfdev',
        'lifestyle_category',
        'Self Development',
        'Keterampilan & keahlian baru',
        'Pelatihan komunikasi, personal branding, dan penguasaan tools AI untuk daya saing modern.',
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
        'Lihat Koleksi',
        'Self Development',
        'butter',
        3,
      ],
      [
        'cms_cat_digicareer',
        'lifestyle_category',
        'Digital Career',
        'Karier kreator & bisnis digital',
        'Blueprint content creator, katalog produk digital, manajemen toko, dan penghasilan affiliate.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Lihat Koleksi',
        'Digital Career',
        'coral',
        4,
      ],
      [
        'cms_opp_ugc',
        'opportunity',
        'Open Collaboration: UGC Creator Wellness & Stationery Q4',
        'Brand Partner WD.UP · Fee + Komisi 20%',
        'Dicari 15 perempuan kreator untuk membuat 2 video ulasan autentik mengenai planner & digital journaling. Terbuka untuk mikro-kreator.',
        '/src/assets/images/academy_creator_cover_1795359345645.jpg',
        'Daftar Opportunity',
        'opportunity',
        'coral',
        1,
      ],
      [
        'cms_opp_mentor',
        'opportunity',
        'Panggilan Kontributor Template & E-Book WD.UP Market',
        'Seller Incubator · Akses Sorotan Toko Unggulan',
        'Buka tokomu di My Store dan rilis minimal 1 produk digital orisinal bulan ini untuk berkesempatan tampil di beranda utama.',
        '/src/assets/images/market_ebook_product_1795359344962.jpg',
        'Ikuti Program',
        'opportunity',
        'sage',
        2,
      ],
      [
        'cms_comm_creators',
        'community',
        'WD.UP Creators & Digital Sellers Circle',
        'Ruang Diskusi Mingguan · Kolaborasi & Review Karya',
        'Komunitas saling dukung bagi content creator dan pemilik toko digital perempuan untuk berbagi insight algoritma, feedback produk, dan partner kolaborasi.',
        '/src/assets/images/hero_wdup_banner_1795359344577.jpg',
        'Gabung Community',
        'community',
        'sage',
        1,
      ],
      [
        'cms_comm_reset',
        'community',
        'The Good Reset & Mindful Growth Club',
        'Check-in Kebiasaan Sehat & Self-Love',
        'Lingkar refleksi rutin setiap Minggu malam untuk merapikan niat pekan baru, berbagi jurnal syukur, dan menjaga ritme kerja tanpa burnout.',
        '/src/assets/images/store_studio_avatar_1795359343952.jpg',
        'Gabung Community',
        'community',
        'lavender',
        2,
      ],
      [
        'cms_aff_info',
        'affiliate_info',
        'Belum Punya Produk Sendiri? Mulai Hasilkan Komisi dari Ekosistem Affiliate WD.UP',
        'Komisi Transparan 10% – 25% · Toko Affiliate Gratis',
        'Pilih produk unggulan dari seller WD.UP, tambahkan ke landing page tokomu dalam satu klik, bagikan tautan referral unik, dan pantau klik serta komisi terverifikasi langsung dari My Store & My Wallet.',
        '/src/assets/images/market_planner_product_1795359344571.jpg',
        'Buka Katalog Affiliate',
        'affiliate',
        'butter',
        1,
      ],
    ] as const;

    for (const item of items) {
      insCms.run(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[7], item[8], item[9]);
    }
  }

  // Seed Modular Creator Studio Tools
  const toolCount = (db.prepare(`SELECT COUNT(*) as c FROM creator_tools`).get() as { c: number }).c;
  if (toolCount === 0) {
    const insTool = db.prepare(
      `INSERT INTO creator_tools (id, slug, name, tagline, category, icon_name, accent_color, tool_type, config_json, is_active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
    );
    const tools = [
      [
        'tool_ai_creator',
        'ai-creator-wdup',
        'AI Creator WD.UP',
        'Generator ide konten, hook 3 detik, skrip video, dan copywriting produk digital.',
        'AI & Konten',
        'Sparkles',
        'coral',
        'ai_creator',
        JSON.stringify({ modes: ['Hook & Skrip Video', 'Outline Produk Digital', 'Caption Affiliate Soft-Selling', 'Kalender Konten 7 Hari'] }),
        1,
      ],
      [
        'tool_content_tools',
        'content-creator-tools',
        'Content Creator Tools',
        'Perencana konten mingguan, bank hook, dan status produksi dari ide hingga tayang.',
        'Produksi Konten',
        'Clapperboard',
        'sage',
        'content_planner',
        JSON.stringify({ platforms: ['Instagram Reels', 'TikTok', 'YouTube Shorts', 'Threads / Carousel'] }),
        2,
      ],
      [
        'tool_journaling',
        'digital-journaling-tools',
        'Digital Journaling Tools',
        'Ruang menulis refleksi harian, rasa syukur, dan kejelasan prioritas diri.',
        'Self Love & Growth',
        'BookHeart',
        'lavender',
        'digital_journal',
        JSON.stringify({ prompts: ['3 hal yang aku syukuri hari ini', 'Satu batasan sehat yang kujaga hari ini', 'Langkah kecil menuju target digitalku'] }),
        3,
      ],
      [
        'tool_good_reset',
        'the-good-reset',
        'The Good Reset',
        'Pelacak kebiasaan sehat, detoks digital, fokus kerja tenang, dan check-in energi.',
        'Mindful Productivity',
        'Leaf',
        'butter',
        'good_reset',
        JSON.stringify({ habits: ['Tidur cukup 7-8 jam', '30 menit tanpa layar setelah bangun', 'Fokus deep work 60 menit', 'Minum air 2L & bergerak 20 menit'] }),
        4,
      ],
      [
        'tool_social_tracker',
        'social-media-tracker',
        'Social Media Tracker',
        'Catat pertumbuhan pengikut, jangkauan, interaksi, dan konversi link dari tiap platform.',
        'Analytics Kreator',
        'BarChart3',
        'sage',
        'social_tracker',
        JSON.stringify({ metrics: ['Followers', 'Reach / Views', 'Engagement Rate (%)', 'Link Clicks'] }),
        5,
      ],
    ] as const;
    for (const t of tools) insTool.run(t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9]);
  }

  // Ensure Official WD.UP Store is always provisioned
  ensureOfficialWdupStore();

  // Ensure every seeded academy module has at least 5 quiz questions (idempotent upgrade for existing DBs)
  const defaultQuizPool: Record<string, Array<{ id: string; question: string; options: string[]; correctIndex: number }>> = {
    mod_creator_1: [
      { id: 'q1', question: 'Berapa jumlah pilar konten ideal agar audiens mudah mengingat topik utama akun Anda?', options: ['1 topik saja setiap tahun', '3 hingga 4 pilar yang saling berkaitan', '15 topik acak setiap minggu'], correctIndex: 1 },
      { id: 'q2', question: 'Apa fungsi utama konten "Cerita Proses / Behind the Scenes"?', options: ['Membangun kedekatan manusiawi dan kepercayaan', 'Menggantikan fungsi halaman checkout', 'Menghindari membuat materi edukasi'], correctIndex: 0 },
      { id: 'q3', question: 'Dari mana ide pilar konten yang paling relevan dengan pembeli berasal?', options: ['Dari pertanyaan nyata yang sering ditanyakan audiens', 'Menyalin akun topik lain tanpa riset', 'Mengarang istilah rumit'], correctIndex: 0 },
      { id: 'q4', question: 'Kombinasi tiga tipe konten yang seimbang dalam satu minggu adalah...', options: ['Promosi setiap hari tanpa jeda', 'Edukasi Praktis, Cerita Proses, dan Rekomendasi Produk/Studi Kasus', 'Hanya repost video viral tanpa narasi'], correctIndex: 1 },
      { id: 'q5', question: 'Apa tanda sebuah pilar konten sudah cukup spesifik?', options: ['Audiens langsung tahu masalah apa yang Anda bantu selesaikan', 'Semua orang dari anak kecil hingga lansia menjadi target utama', 'Tidak pernah menyebut solusi digital sama sekali'], correctIndex: 0 },
    ],
    mod_creator_2: [
      { id: 'q1', question: 'Mengapa panjang teks hook di layar sebaiknya maksimal 7–9 kata?', options: ['Agar terbaca seketika dalam 2 detik pertama', 'Karena aplikasi melarang kalimat panjang', 'Supaya tidak perlu menambahkan suara'], correctIndex: 0 },
      { id: 'q2', question: 'Berapa detik krusial pertama bagi penonton memutuskan bertahan atau menggeser video?', options: ['3 detik pertama', '30 detik terakhir', 'Menit ke-5'], correctIndex: 0 },
      { id: 'q3', question: 'Pola hook manakah yang membangun kepercayaan tanpa kesan berlebihan?', options: ['Janji hasil instan tanpa usaha', 'Pola "Kesalahan Halus" atau "Langkah Sederhana" yang realistis', 'Judul clickbait yang tidak sesuai isi video'], correctIndex: 1 },
      { id: 'q4', question: 'Apa elemen penutup (CTA) yang paling ramah untuk video edukasi?', options: ['Mengajak audiens menyimpan postingan atau mencoba worksheet/tautan bio', 'Memaksa membeli tanpa penjelasan manfaat', 'Mengakhiri video mendadak di tengah kalimat'], correctIndex: 0 },
      { id: 'q5', question: 'Komponen storyboard 4 beat yang terstruktur terdiri dari...', options: ['Hook, Konteks Masalah, Langkah Praktis, dan CTA', 'Intro panjang 20 detik lalu selesai', 'Hanya musik latar tanpa teks atau narasi'], correctIndex: 0 },
    ],
    mod_digiprod_1: [
      { id: 'q1', question: 'Mengapa panduan penggunaan 1 halaman penting disertakan di produk digital?', options: ['Membantu pembeli langsung mempraktikkan produk tanpa bingung', 'Hanya untuk menambah ukuran file', 'Syarat wajib mencetak buku'], correctIndex: 0 },
      { id: 'q2', question: 'Apa nilai utama yang dibayar pembeli dari sebuah template atau planner digital?', options: ['Penghematan waktu dan kejelasan sistem kerja', 'Ketebalan file ratusan megabyte', 'Desain rumit yang sulit diedit'], correctIndex: 0 },
      { id: 'q3', question: 'Langkah validasi awal yang paling aman sebelum rilis produk massal adalah...', options: ['Menguji konsep/draf kepada 5 calon pengguna awal terlebih dahulu', 'Langsung mencetak ribuan eksemplar fisik', 'Menunggu produk sempurna selama 2 tahun'], correctIndex: 0 },
      { id: 'q4', question: 'Format mana yang paling cocok untuk pelacakan target kerja harian di tablet atau Notion?', options: ['Planner / Worksheet terstruktur', 'File audio lagu tanpa teks', 'Poster ukuran baliho'], correctIndex: 0 },
      { id: 'q5', question: 'Apa yang harus disiapkan agar pembeli puas setelah checkout di WD.UP Market?', options: ['Tautan akses atau file produk yang jelas, aktif, dan mudah diakses', 'Halaman kosong tanpa instruksi', 'Menyuruh pembeli menebak sendiri isi produk'], correctIndex: 0 },
    ],
    mod_affiliate_1: [
      { id: 'q1', question: 'Kapan komisi affiliate resmi dikreditkan ke saldo wallet?', options: ['Saat pembeli baru memasukkan barang ke keranjang', 'Setelah pembayaran pesanan terverifikasi Paid oleh admin', 'Sebelum link referral dibagikan'], correctIndex: 1 },
      { id: 'q2', question: 'Berapa jumlah produk utama yang disarankan dikurasi pemula agar fokus rekomendasi tetap kuat?', options: ['5 hingga 8 produk yang selaras dengan kebutuhan audiens', '500 produk acak sekaligus tanpa ulasan', '0 produk'], correctIndex: 0 },
      { id: 'q3', question: 'Mengapa review jujur lebih efektif menghasilkan pembelian berulang?', options: ['Audiens percaya karena Anda menjelaskan manfaat nyata & siapa yang cocok memakainya', 'Karena menyembunyikan fungsi produk', 'Supaya tidak perlu membagikan tautan'], correctIndex: 0 },
      { id: 'q4', question: 'Di mana pemilik akun WD.UP dapat menata produk affiliate miliknya menjadi etalase rapi?', options: ['Di My Store WD.UP lengkap dengan halaman profil & landing page toko', 'Di menu pengunduhan PDF', 'Tidak tersedia etalase'], correctIndex: 0 },
      { id: 'q5', question: 'Apa fungsi tautan referral unik pada program affiliate WD.UP?', options: ['Mencatat klik dan memastikan komisi masuk akurat ke akun affiliate', 'Menghapus nama pemilik toko asli dari sistem', 'Membatasi pembeli hanya dari satu kota'], correctIndex: 0 },
    ],
    mod_branding_1: [
      { id: 'q1', question: 'Apa tujuan utama personal branding di era digital?', options: ['Membangun kepercayaan dan reputasi yang relevan dengan karya/bisnis Anda', 'Meniru gaya orang lain sepenuhnya', 'Mengumpulkan pengikut tanpa interaksi'], correctIndex: 0 },
      { id: 'q2', question: 'Elemen inti dalam satu kalimat Brand Positioning Statement adalah...', options: ['Audiens spesifik, hasil nyata yang dicapai, dan pendekatan unik Anda', 'Daftar harga acak tanpa konteks', 'Kutipan umum tanpa kaitan profesi'], correctIndex: 0 },
      { id: 'q3', question: 'Mengapa konsistensi palet warna dan gaya bahasa penting bagi kreator?', options: ['Membantu audiens mengenali karya Anda dalam sekali lihat', 'Mengurangi jangkauan organik', 'Hanya dibutuhkan perusahaan raksasa'], correctIndex: 0 },
      { id: 'q4', question: 'Bagian terpenting pada bio profil media sosial bisnis digital adalah...', options: ['Kejelasan keahlian serta tautan menuju produk, kelas, atau layanan Anda', 'Mengosongkan kolom tautan sepenuhnya', 'Menulis sandi akun di bio'], correctIndex: 0 },
      { id: 'q5', question: 'Bagaimana cara menyelaraskan nilai diri dengan penawaran jasa atau produk digital?', options: ['Menjawab masalah nyata audiens berdasarkan keahlian autentik yang Anda tekuni', 'Mengubah tema setiap dua hari sekali', 'Menghindari bercerita tentang proses belajar'], correctIndex: 0 },
    ],
    mod_ai_1: [
      { id: 'q1', question: 'Informasi apa yang membuat hasil prompt AI jauh lebih akurat?', options: ['Konteks audiens, tujuan konten, dan gaya bahasa yang diinginkan', 'Menulis huruf kapital seluruhnya', 'Menghapus semua detail topik'], correctIndex: 0 },
      { id: 'q2', question: 'Dalam kerangka prompt R.O.L.E, huruf "R" berarti...', options: ['Role — peran spesifik yang dijalankan asisten', 'Random — hasil acak tanpa arah', 'Repeat — mengulang kalimat yang sama'], correctIndex: 0 },
      { id: 'q3', question: 'Langkah wajib setelah menerima draf naskah atau kerangka dari AI adalah...', options: ['Menyunting dengan suara personal, pengalaman nyata, dan verifikasi fakta', 'Langsung mempublikasikan tanpa dibaca', 'Menghapus seluruh struktur intinya'], correctIndex: 0 },
      { id: 'q4', question: 'Untuk aktivitas apa AI Creator paling efektif membantu kreator harian?', options: ['Riset ide, penyusunan kerangka e-book, variasi hook, dan draf caption', 'Menggantikan empati dan interaksi tulus dengan komunitas', 'Menentukan harga tanpa riset pembeli'], correctIndex: 0 },
      { id: 'q5', question: 'Apa risiko jika konten kreator 100% menyalin output AI tanpa kurasi manusia?', options: ['Tulisan terasa generik dan kehilangan ciri khas personal brand Anda', 'Kecepatan riset menurun', 'Terlalu banyak cerita pengalaman pribadi'], correctIndex: 0 },
    ],
    mod_biz_1: [
      { id: 'q1', question: 'Apa keuntungan sistem komisi affiliate berbasis penjualan terverifikasi?', options: ['Biaya promosi hanya keluar saat penjualan benar-benar terjadi', 'Mengurangi transparansi laporan penjualan', 'Menghapus kebutuhan kualitas produk'], correctIndex: 0 },
      { id: 'q2', question: 'Mengapa kas pribadi dan arus kas bisnis digital sebaiknya dipisahkan?', options: ['Agar mudah mengevaluasi profit bersih, biaya operasional, dan dana pengembangan', 'Supaya tidak bisa melihat total pemasukan', 'Hanya berlaku untuk produk fisik'], correctIndex: 0 },
      { id: 'q3', question: 'Apa yang dimaksud dengan Value Ladder (Tangga Produk)?', options: ['Susunan produk bertingkat dari entry terjangkau, produk inti, hingga pendampingan premium', 'Menjual satu produk saja dengan harga berubah tiap jam', 'Memberi diskon 100% sepanjang tahun'], correctIndex: 0 },
      { id: 'q4', question: 'Komponen utama dalam menghitung harga jual produk digital yang sehat meliputi...', options: ['Biaya produksi/tools, alokasi komisi/potongan platform, dan margin keuntungan', 'Sekadar menebak angka termurah di pasar', 'Mengabaikan biaya transaksi dan penarikan dana'], correctIndex: 0 },
      { id: 'q5', question: 'Cara paling efektif menjaga retensi pelanggan setelah pembelian pertama adalah...', options: ['Menyediakan kualitas produk yang rapi, akses mudah, serta produk lanjutan yang relevan', 'Tidak membalas pesan pembeli sama sekali', 'Mempersulit akses link unduhan'], correctIndex: 0 },
    ],
  };

  const existingModules = db.prepare(`SELECT id, quiz_questions FROM academy_modules`).all() as Array<{
    id: string;
    quiz_questions: string;
  }>;
  const updModQuiz = db.prepare(`UPDATE academy_modules SET quiz_questions = ? WHERE id = ?`);
  for (const mod of existingModules) {
    let parsed: unknown[] = [];
    try {
      const p = JSON.parse(mod.quiz_questions || '[]');
      if (Array.isArray(p)) parsed = p;
    } catch {
      parsed = [];
    }
    if (parsed.length < 5 && defaultQuizPool[mod.id]) {
      updModQuiz.run(JSON.stringify(defaultQuizPool[mod.id]), mod.id);
    }
  }

  // Ensure default group duration note on seeded classes if empty
  db.prepare(
    `UPDATE academy_classes
     SET group_duration_note = 'Akses grup belajar & diskusi selama 6 bulan masa pendampingan aktif'
     WHERE group_duration_note = ''`
  ).run();

  // Seed Default Official Footer & License Settings if missing
  const footerDefaults: Record<string, string> = {
    footer_license_title: 'Lisensi Resmi Platform Ekosistem Digital Perempuan WD.UP',
    footer_license_number: 'WDUP-ID-2026-001 · Terdaftar Resmi',
    footer_copyright: '© 2026 WD.UP — Women Digital Level Up. Seluruh hak cipta dilindungi.',
    footer_email: 'halo@wdup.com',
    footer_whatsapp: '+62 811-0000-2026',
    footer_address: 'Jakarta, Indonesia',
    footer_instagram: 'https://instagram.com/wdup.official',
    footer_tiktok: 'https://tiktok.com/@wdup.official',
    footer_youtube: 'https://youtube.com/@wdup.official',
    footer_website: 'https://wdup.id',
  };
  const insSetting = db.prepare(`INSERT OR IGNORE INTO system_settings (key, value) VALUES (?, ?)`);
  for (const [k, v] of Object.entries(footerDefaults)) {
    insSetting.run(k, v);
  }

  // Seed or Refresh Official WD.UP AI Public Guide Knowledge Base (User-facing only, no internal details, uses "Tim WD.UP")
  const ts = nowIso();
  const publicKbs = [
    [
      'kb_overview',
      'Ekosistem & Navigasi',
      'Mengenal WD.UP dan 4 Menu Utama',
      'WD.UP (Women Digital Level Up) adalah ekosistem digital perempuan untuk belajar, membangun karier sebagai content creator, membuat produk digital, berjualan, dan mengikuti program affiliate dengan satu akun terintegrasi. Navigasi utama memiliki 4 menu: (1) WD.UP HOME untuk melihat promo, pilar pengembangan (Self Love, Self Growth, Self Development, Digital Career), produk kurasi, toko unggulan, Opportunity, dan Community; (2) WD.UP ACADEMY untuk belajar terstruktur lewat video materi, teks pembelajaran, worksheet autosave, pengumpulan tugas dengan tautan aktif, quiz pemahaman, grup belajar kelas, feedback mentor, dan sertifikat; (3) WD.UP MARKET untuk menjelajahi e-book, template, planner, worksheet, spreadsheet, printable, produk digital, dan jasa profesional; serta (4) MY ACCOUNT sebagai pusat profil, My Store, My Learning, My Creator Studio, My Activity, dan My Wallet.',
    ],
    [
      'kb_payment',
      'Cara Belanja & Pembayaran',
      'Alur Pembelian Kelas dan Produk di WD.UP',
      'Untuk membeli produk Market atau kelas Academy, klik Beli Sekarang atau masukkan ke keranjang lalu tekan Checkout. Pilih metode pembayaran transfer bank atau e-wallet yang tampil di layar untuk mendapatkan kode pesanan. Setelah melakukan transfer, unggah bukti pembayaran Anda di laci checkout atau di My Account -> My Activity. Tim WD.UP akan memeriksa bukti pembayaran Anda; setelah berstatus Paid, akses kelas di My Learning atau link/file produk digital langsung terbuka otomatis.',
    ],
    [
      'kb_store_affiliate',
      'My Store & Program Affiliate',
      'Cara Membuka Toko dan Menjadi Affiliate',
      'Anda dapat membuat toko sendiri melalui My Account -> My Store meskipun belum memiliki produk sendiri. Cukup pilih nama toko dan username toko yang unik, lalu sesuaikan profil, tema, dan kontak toko Anda. Anda dapat mengunggah produk digital lengkap dengan link/file akses dan kode landing page, atau memilih produk affiliate terkurasi untuk dipajang di halaman toko Anda.',
    ],
    [
      'kb_academy',
      'WD.UP Academy & Sertifikat',
      'Cara Belajar di WD.UP Academy',
      'Pilih kategori akademi, program belajar, atau kelas satuan di menu WD.UP ACADEMY. Setelah transaksi selesai, buka materi lewat My Learning atau ruang kelas. Anda bisa menonton video pembelajaran langsung di web, membaca ringkasan materi, mengerjakan worksheet yang tersimpan otomatis (autosave), mengumpulkan tugas lengkap dengan tautan aktif, menjawab quiz pemahaman minimal 5 soal dari mentor, serta bergabung ke grup belajar aktif kelas sesuai durasi pendampingan. Sertifikat penyelesaian tersedia setelah seluruh modul kelas diselesaikan.',
    ],
    [
      'kb_wallet_notif',
      'Creator Studio, Wallet & Bantuan',
      'Menggunakan Creator Studio, My Wallet, dan Menghubungi Tim',
      'Di My Account -> My Creator Studio tersedia tools seperti AI Creator WD.UP, Content Creator Tools, Digital Journaling Tools, The Good Reset, dan Social Media Tracker untuk mendukung produktivitas harian Anda. Saldo pendapatan penjualan produk dan komisi affiliate dapat dipantau dan diajukan pencairannya melalui My Wallet (minimal penarikan Rp 50.000 dengan biaya transfer Rp 3.000). Notifikasi transaksi dikirim ke lonceng notifikasi akun serta Email dan WhatsApp yang tertera. Jika butuh bantuan lebih lanjut, silakan hubungi Tim WD.UP melalui kontak resmi di bagian bawah halaman WD.UP Home.',
    ],
  ] as const;

  const upsertDefaultKb = db.prepare(
    `INSERT INTO ai_knowledge_base (id, topic, title, content, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       topic = excluded.topic,
       title = excluded.title,
       content = excluded.content,
       updated_at = excluded.updated_at`
  );
  for (const k of publicKbs) {
    upsertDefaultKb.run(k[0], k[1], k[2], k[3], ts);
  }
}
