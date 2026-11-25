import { relations } from 'drizzle-orm';
import { integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  uid: text('uid').unique(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  whatsapp: text('whatsapp').notNull().default(''),
  password_hash: text('password_hash').notNull().default('firebase_auth'),
  role: text('role').notNull().default('member'),
  mentor_status: text('mentor_status').notNull().default('none'),
  editor_permissions: text('editor_permissions').notNull().default('[]'),
  bio: text('bio').notNull().default(''),
  avatar_url: text('avatar_url').notNull().default(''),
  notify_email: integer('notify_email').notNull().default(1),
  notify_whatsapp: integer('notify_whatsapp').notNull().default(1),
  wallet_available: integer('wallet_available').notNull().default(0),
  wallet_pending: integer('wallet_pending').notNull().default(0),
  pro_plan: text('pro_plan').notNull().default(''),
  pro_expires_at: text('pro_expires_at'),
  created_at: text('created_at').notNull(),
});

export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const stores = pgTable('stores', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull().unique(),
  username: text('username').notNull().unique(),
  initials: text('initials').notNull(),
  logo_url: text('logo_url').notNull().default(''),
  banner_url: text('banner_url').notNull().default(''),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default('Digital Creator'),
  contact_whatsapp: text('contact_whatsapp').notNull().default(''),
  contact_email: text('contact_email').notNull().default(''),
  social_instagram: text('social_instagram').notNull().default(''),
  social_tiktok: text('social_tiktok').notNull().default(''),
  social_youtube: text('social_youtube').notNull().default(''),
  social_twitter: text('social_twitter').notNull().default(''),
  social_shopee: text('social_shopee').notNull().default(''),
  social_website: text('social_website').notNull().default(''),
  landing_page_url: text('landing_page_url').notNull().default(''),
  custom_landing_html: text('custom_landing_html').notNull().default(''),
  service_link: text('service_link').notNull().default(''),
  theme: text('theme').notNull().default('warm-cream'),
  store_mode: text('store_mode').notNull().default('hybrid'),
  is_featured: integer('is_featured').notNull().default(0),
  visitors_count: integer('visitors_count').notNull().default(0),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const products = pgTable('products', {
  id: text('id').primaryKey(),
  store_id: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  owner_user_id: text('owner_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  slug: text('slug').notNull(),
  category: text('category').notNull(),
  home_pillar: text('home_pillar').notNull().default('Digital Career'),
  price: integer('price').notNull(),
  original_price: integer('original_price'),
  quota_limit: integer('quota_limit'),
  landing_page_url: text('landing_page_url').notNull().default(''),
  custom_landing_html: text('custom_landing_html').notNull().default(''),
  display_style: text('display_style').notNull().default('classic'),
  pricing_mode: text('pricing_mode').notNull().default('fixed'),
  min_price: integer('min_price').notNull().default(0),
  addons_json: text('addons_json').notNull().default('[]'),
  hidden_by_seller: integer('hidden_by_seller').notNull().default(0),
  hidden_by_admin: integer('hidden_by_admin').notNull().default(0),
  cta_label: text('cta_label').notNull().default('Beli Sekarang'),
  cover_shape: text('cover_shape').notNull().default('landscape'),
  description: text('description').notNull(),
  image_url: text('image_url').notNull(),
  delivery_content: text('delivery_content').notNull().default(''),
  access_type: text('access_type').notNull().default('link'),
  access_url: text('access_url').notNull().default(''),
  access_file_data: text('access_file_data').notNull().default(''),
  access_file_name: text('access_file_name').notNull().default(''),
  is_physical: integer('is_physical').notNull().default(0),
  is_featured: integer('is_featured').notNull().default(0),
  is_recommended: integer('is_recommended').notNull().default(0),
  affiliate_enabled: integer('affiliate_enabled').notNull().default(1),
  affiliate_commission_pct: integer('affiliate_commission_pct').notNull().default(15),
  clicks_count: integer('clicks_count').notNull().default(0),
  sales_count: integer('sales_count').notNull().default(0),
  status: text('status').notNull().default('active'),
  created_at: text('created_at').notNull(),
});

export const affiliateProducts = pgTable(
  'affiliate_products',
  {
    id: text('id').primaryKey(),
    store_id: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    affiliate_user_id: text('affiliate_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    product_id: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    referral_code: text('referral_code').notNull(),
    clicks_count: integer('clicks_count').notNull().default(0),
    created_at: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_affiliate_products_store_product').on(table.store_id, table.product_id)]
);

export const affiliateClicks = pgTable('affiliate_clicks', {
  id: text('id').primaryKey(),
  affiliate_user_id: text('affiliate_user_id').notNull(),
  store_id: text('store_id').notNull(),
  product_id: text('product_id'),
  created_at: text('created_at').notNull(),
});

export const storeVisits = pgTable('store_visits', {
  id: text('id').primaryKey(),
  store_id: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  visitor_user_id: text('visitor_user_id'),
  created_at: text('created_at').notNull(),
});

export const storeExternalAffiliates = pgTable('store_external_affiliates', {
  id: text('id').primaryKey(),
  store_id: text('store_id')
    .notNull()
    .references(() => stores.id, { onDelete: 'cascade' }),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  category: text('category').notNull().default('Produk digital'),
  price: integer('price').notNull().default(0),
  original_price: integer('original_price'),
  description: text('description').notNull().default(''),
  image_url: text('image_url').notNull().default(''),
  affiliate_url: text('affiliate_url').notNull(),
  display_style: text('display_style').notNull().default('classic'),
  clicks_count: integer('clicks_count').notNull().default(0),
  created_at: text('created_at').notNull(),
});

export const academyCategories = pgTable('academy_categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull(),
  accent_color: text('accent_color').notNull(),
  sort_order: integer('sort_order').notNull().default(0),
});

export const academyPrograms = pgTable('academy_programs', {
  id: text('id').primaryKey(),
  category_id: text('category_id')
    .notNull()
    .references(() => academyCategories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  topic: text('topic').notNull(),
  goal: text('goal').notNull(),
  level: text('level').notNull(),
  bundle_price: integer('bundle_price').notNull(),
  description: text('description').notNull(),
  cover_url: text('cover_url').notNull(),
});

export const academyClasses = pgTable('academy_classes', {
  id: text('id').primaryKey(),
  program_id: text('program_id')
    .notNull()
    .references(() => academyPrograms.id, { onDelete: 'cascade' }),
  category_id: text('category_id')
    .notNull()
    .references(() => academyCategories.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  objectives: text('objectives').notNull().default('[]'),
  mentor_name: text('mentor_name').notNull(),
  price: integer('price').notNull(),
  cover_url: text('cover_url').notNull(),
  pdf_guide_title: text('pdf_guide_title').notNull(),
  pdf_guide_content: text('pdf_guide_content').notNull(),
  group_link: text('group_link').notNull().default(''),
  group_duration_note: text('group_duration_note').notNull().default(''),
  certificate_available: integer('certificate_available').notNull().default(1),
  created_at: text('created_at').notNull(),
});

export const academyModules = pgTable('academy_modules', {
  id: text('id').primaryKey(),
  class_id: text('class_id')
    .notNull()
    .references(() => academyClasses.id, { onDelete: 'cascade' }),
  sort_order: integer('sort_order').notNull(),
  title: text('title').notNull(),
  duration_minutes: integer('duration_minutes').notNull().default(15),
  video_title: text('video_title').notNull(),
  video_summary: text('video_summary').notNull(),
  video_script_captions: text('video_script_captions').notNull().default('[]'),
  text_material: text('text_material').notNull(),
  interactive_exercise_prompt: text('interactive_exercise_prompt').notNull(),
  interactive_exercise_choices: text('interactive_exercise_choices').notNull().default('[]'),
  worksheet_prompt: text('worksheet_prompt').notNull(),
  assignment_prompt: text('assignment_prompt').notNull(),
  quiz_questions: text('quiz_questions').notNull().default('[]'),
});

export const enrollments = pgTable(
  'enrollments',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    class_id: text('class_id')
      .notNull()
      .references(() => academyClasses.id, { onDelete: 'cascade' }),
    program_id: text('program_id'),
    order_id: text('order_id'),
    progress_pct: integer('progress_pct').notNull().default(0),
    completed_modules: text('completed_modules').notNull().default('[]'),
    certificate_code: text('certificate_code'),
    completed_at: text('completed_at'),
    created_at: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_enrollments_user_class').on(table.user_id, table.class_id)]
);

export const worksheetsAssignments = pgTable(
  'worksheets_assignments',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    class_id: text('class_id')
      .notNull()
      .references(() => academyClasses.id, { onDelete: 'cascade' }),
    module_id: text('module_id')
      .notNull()
      .references(() => academyModules.id, { onDelete: 'cascade' }),
    worksheet_answer: text('worksheet_answer').notNull().default(''),
    worksheet_status: text('worksheet_status').notNull().default('draft'),
    assignment_answer: text('assignment_answer').notNull().default(''),
    assignment_link: text('assignment_link').notNull().default(''),
    assignment_status: text('assignment_status').notNull().default('not_started'),
    exercise_completed: integer('exercise_completed').notNull().default(0),
    quiz_score: integer('quiz_score'),
    quiz_answers: text('quiz_answers').notNull().default('[]'),
    grade: integer('grade'),
    mentor_feedback: text('mentor_feedback').notNull().default(''),
    feedback_history: text('feedback_history').notNull().default('[]'),
    updated_at: text('updated_at').notNull(),
  },
  (table) => [uniqueIndex('idx_wa_user_module').on(table.user_id, table.module_id)]
);

export const paymentMethods = pgTable('payment_methods', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  provider_name: text('provider_name').notNull(),
  account_number: text('account_number').notNull(),
  account_holder: text('account_holder').notNull(),
  instructions: text('instructions').notNull(),
  is_active: integer('is_active').notNull().default(1),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  order_code: text('order_code').notNull().unique(),
  buyer_user_id: text('buyer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  payment_method_id: text('payment_method_id').references(() => paymentMethods.id),
  total_amount: integer('total_amount').notNull(),
  status: text('status').notNull().default('Pending Payment'),
  gateway_provider: text('gateway_provider').notNull().default('manual'),
  gateway_reference: text('gateway_reference').notNull().default(''),
  buyer_email: text('buyer_email').notNull().default(''),
  buyer_whatsapp: text('buyer_whatsapp').notNull().default(''),
  voucher_code: text('voucher_code').notNull().default(''),
  discount_amount: integer('discount_amount').notNull().default(0),
  is_guest: integer('is_guest').notNull().default(0),
  buyer_name: text('buyer_name').notNull().default(''),
  guest_visitor_id: text('guest_visitor_id').notNull().default(''),
  guest_access_token: text('guest_access_token').notNull().default(''),
  notes: text('notes').notNull().default(''),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const orderItems = pgTable('order_items', {
  id: text('id').primaryKey(),
  order_id: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  item_type: text('item_type').notNull(),
  item_id: text('item_id').notNull(),
  title: text('title').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unit_price: integer('unit_price').notNull(),
  subtotal: integer('subtotal').notNull(),
  seller_user_id: text('seller_user_id'),
  store_id: text('store_id'),
  affiliate_user_id: text('affiliate_user_id'),
  affiliate_commission_pct: integer('affiliate_commission_pct').notNull().default(0),
  platform_fee_amount: integer('platform_fee_amount').notNull().default(0),
  seller_net_amount: integer('seller_net_amount').notNull().default(0),
  selected_addons_json: text('selected_addons_json').notNull().default('[]'),
});

export const payments = pgTable('payments', {
  id: text('id').primaryKey(),
  order_id: text('order_id')
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: 'cascade' }),
  payer_user_id: text('payer_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  sender_name: text('sender_name').notNull().default(''),
  transfer_reference: text('transfer_reference').notNull().default(''),
  proof_image_data: text('proof_image_data').notNull().default(''),
  proof_note: text('proof_note').notNull().default(''),
  verified_by_user_id: text('verified_by_user_id'),
  verification_note: text('verification_note').notNull().default(''),
  submitted_at: text('submitted_at'),
  verified_at: text('verified_at'),
});

export const commissions = pgTable('commissions', {
  id: text('id').primaryKey(),
  order_id: text('order_id')
    .notNull()
    .references(() => orders.id, { onDelete: 'cascade' }),
  order_item_id: text('order_item_id')
    .notNull()
    .unique()
    .references(() => orderItems.id, { onDelete: 'cascade' }),
  affiliate_user_id: text('affiliate_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  seller_user_id: text('seller_user_id').notNull(),
  amount: integer('amount').notNull(),
  status: text('status').notNull().default('credited'),
  created_at: text('created_at').notNull(),
});

export const walletTransactions = pgTable('wallet_transactions', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  amount: integer('amount').notNull(),
  reference_id: text('reference_id').notNull().default(''),
  description: text('description').notNull(),
  created_at: text('created_at').notNull(),
});

export const withdrawals = pgTable('withdrawals', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  amount: integer('amount').notNull(),
  transfer_fee: integer('transfer_fee').notNull().default(3000),
  net_amount: integer('net_amount').notNull().default(0),
  bank_or_ewallet: text('bank_or_ewallet').notNull(),
  account_number: text('account_number').notNull(),
  account_holder: text('account_holder').notNull(),
  status: text('status').notNull().default('Pending'),
  admin_note: text('admin_note').notNull().default(''),
  created_at: text('created_at').notNull(),
  processed_at: text('processed_at'),
});

export const homeCmsItems = pgTable('home_cms_items', {
  id: text('id').primaryKey(),
  section_type: text('section_type').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  body: text('body').notNull().default(''),
  image_url: text('image_url').notNull().default(''),
  media_type: text('media_type').notNull().default('image'),
  media_url: text('media_url').notNull().default(''),
  link_url: text('link_url').notNull().default(''),
  cta_label: text('cta_label').notNull().default(''),
  cta_target: text('cta_target').notNull().default(''),
  accent_color: text('accent_color').notNull().default('sage'),
  icon_name: text('icon_name').notNull().default(''),
  sort_order: integer('sort_order').notNull().default(0),
  is_active: integer('is_active').notNull().default(1),
});

export const userEngagements = pgTable(
  'user_engagements',
  {
    id: text('id').primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cms_item_id: text('cms_item_id')
      .notNull()
      .references(() => homeCmsItems.id, { onDelete: 'cascade' }),
    engagement_type: text('engagement_type').notNull(),
    note: text('note').notNull().default(''),
    created_at: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_user_engagements_user_cms').on(table.user_id, table.cms_item_id)]
);

export const guestEngagements = pgTable(
  'guest_engagements',
  {
    id: text('id').primaryKey(),
    visitor_id: text('visitor_id').notNull(),
    cms_item_id: text('cms_item_id')
      .notNull()
      .references(() => homeCmsItems.id, { onDelete: 'cascade' }),
    engagement_type: text('engagement_type').notNull(),
    note: text('note').notNull().default(''),
    created_at: text('created_at').notNull(),
  },
  (table) => [uniqueIndex('idx_guest_engagements_vis_cms').on(table.visitor_id, table.cms_item_id)]
);

export const creatorTools = pgTable('creator_tools', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  tagline: text('tagline').notNull(),
  category: text('category').notNull(),
  icon_name: text('icon_name').notNull(),
  accent_color: text('accent_color').notNull(),
  tool_type: text('tool_type').notNull(),
  config_json: text('config_json').notNull().default('{}'),
  is_active: integer('is_active').notNull().default(1),
  sort_order: integer('sort_order').notNull().default(0),
});

export const creatorStudioEntries = pgTable('creator_studio_entries', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tool_slug: text('tool_slug').notNull(),
  title: text('title').notNull(),
  payload_json: text('payload_json').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  user_id: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
  event_type: text('event_type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  sender_email: text('sender_email').notNull().default('notif@wdup.com'),
  email_status: text('email_status').notNull().default('queued_no_provider'),
  whatsapp_status: text('whatsapp_status').notNull().default('queued_no_provider'),
  is_read: integer('is_read').notNull().default(0),
  created_at: text('created_at').notNull(),
});

export const aiKnowledgeBase = pgTable('ai_knowledge_base', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  updated_at: text('updated_at').notNull(),
});

export const userSessions = pgTable('user_sessions', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  token_hash: text('token_hash').notNull().unique(),
  created_at: text('created_at').notNull(),
  last_used_at: text('last_used_at').notNull(),
});

export const vouchers = pgTable('vouchers', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(),
  scope: text('scope').notNull().default('platform'),
  store_id: text('store_id').references(() => stores.id, { onDelete: 'cascade' }),
  owner_user_id: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default(''),
  discount_type: text('discount_type').notNull().default('fixed'),
  discount_value: integer('discount_value').notNull(),
  min_purchase: integer('min_purchase').notNull().default(0),
  max_discount: integer('max_discount'),
  quota_limit: integer('quota_limit'),
  used_count: integer('used_count').notNull().default(0),
  expires_at: text('expires_at'),
  is_active: integer('is_active').notNull().default(1),
  created_at: text('created_at').notNull(),
});

export const proSubscriptions = pgTable('pro_subscriptions', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan_id: text('plan_id').notNull(),
  plan_name: text('plan_name').notNull(),
  price: integer('price').notNull(),
  duration_days: integer('duration_days').notNull(),
  order_id: text('order_id'),
  started_at: text('started_at').notNull(),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull(),
});

export const passwordResets = pgTable('password_resets', {
  id: text('id').primaryKey(),
  user_id: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  otp_hash: text('otp_hash').notNull(),
  reset_token_hash: text('reset_token_hash').notNull().default(''),
  attempts: integer('attempts').notNull().default(0),
  expires_at: text('expires_at').notNull(),
  used_at: text('used_at'),
  created_at: text('created_at').notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  store: one(stores, {
    fields: [users.id],
    references: [stores.user_id],
  }),
  orders: many(orders),
  enrollments: many(enrollments),
  notifications: many(notifications),
}));

export const storesRelations = relations(stores, ({ one, many }) => ({
  owner: one(users, {
    fields: [stores.user_id],
    references: [users.id],
  }),
  products: many(products),
  vouchers: many(vouchers),
}));

export const productsRelations = relations(products, ({ one }) => ({
  store: one(stores, {
    fields: [products.store_id],
    references: [stores.id],
  }),
  owner: one(users, {
    fields: [products.owner_user_id],
    references: [users.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  buyer: one(users, {
    fields: [orders.buyer_user_id],
    references: [users.id],
  }),
  items: many(orderItems),
  payment: one(payments, {
    fields: [orders.id],
    references: [payments.order_id],
  }),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.order_id],
    references: [orders.id],
  }),
}));
