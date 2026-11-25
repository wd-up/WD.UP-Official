export type MainTab = 'home' | 'academy' | 'market' | 'account';

export type AccountSubView =
  | 'overview'
  | 'profile'
  | 'store'
  | 'learning'
  | 'activity'
  | 'wallet'
  | 'mentor'
  | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  whatsapp: string;
  role: 'member' | 'editor' | 'mentor' | 'admin';
  mentor_status?: 'none' | 'pending' | 'approved' | 'rejected';
  editor_permissions: string[];
  bio: string;
  avatar_url: string;
  notify_email: number;
  notify_whatsapp: number;
  wallet_available: number;
  wallet_pending: number;
  pro_plan?: string;
  pro_expires_at?: string | null;
  is_pro?: boolean;
  created_at: string;
}

export interface ProPlan {
  id: 'pro_1m' | 'pro_3m' | 'pro_6m' | string;
  name: string;
  price: number;
  duration_days: number;
  badge: string;
  highlight: string;
}

export interface ProBenefit {
  title: string;
  desc: string;
}

export interface Store {
  id: string;
  user_id: string;
  name: string;
  username: string;
  initials: string;
  logo_url: string;
  banner_url: string;
  description: string;
  category: string;
  contact_whatsapp: string;
  contact_email: string;
  social_instagram: string;
  social_tiktok: string;
  social_youtube?: string;
  social_twitter?: string;
  social_shopee?: string;
  social_website?: string;
  landing_page_url?: string;
  custom_landing_html?: string;
  service_link: string;
  theme: 'warm-cream' | 'sage' | 'coral' | 'butter' | 'lavender' | string;
  store_mode: 'own' | 'affiliate' | 'hybrid' | string;
  is_featured: number;
  is_pro?: boolean;
  visitors_count: number;
  own_products_count?: number;
  affiliate_products_count?: number;
  created_at: string;
  updated_at: string;
}

export const MARKET_CATEGORIES = [
  'Semua',
  'E-book dan Webbook',
  'Template',
  'Planner dan Journal',
  'Worksheet',
  'Spreadsheet',
  'Printable',
  'Produk digital',
  'Jasa profesional',
  'Digital resources',
] as const;

export const HOME_PILLARS = ['Self Love', 'Self Growth', 'Self Development', 'Digital Career'] as const;

export type ProductPricingMode = 'fixed' | 'pwyw' | 'pwyw_min';

export interface ProductAddon {
  id: string;
  title: string;
  link?: string;
  price: number;
}

export type ProductCoverShape =
  | 'landscape'
  | 'square'
  | 'portrait'
  | 'wide'
  | 'rounded_arch'
  | 'circle';

export const PRODUCT_COVER_SHAPES: Array<{
  id: ProductCoverShape;
  label: string;
  desc: string;
  proOnly: boolean;
}> = [
  { id: 'landscape', label: 'Persegi Panjang (16:10)', desc: 'Rasio standar rapi & serbaguna', proOnly: false },
  { id: 'square', label: 'Kotak (1:1)', desc: 'Tampilan simetris seperti feed', proOnly: false },
  { id: 'portrait', label: 'Vertikal Editorial (4:5)', desc: 'Cover tinggi untuk e-book & planner', proOnly: true },
  { id: 'wide', label: 'Sinematik Lebar (16:9)', desc: 'Tampilan layar lebar modern', proOnly: true },
  { id: 'rounded_arch', label: 'Arch Elegan', desc: 'Bingkai lengkungan butik eksklusif', proOnly: true },
  { id: 'circle', label: 'Lingkaran Fokus', desc: 'Bingkai bulat estetik & standout', proOnly: true },
];

export const PRODUCT_CTA_PRESETS = [
  'Beli Sekarang',
  'Dapatkan Sekarang',
  'Akses Sekarang',
  'Ambil Sekarang',
] as const;

export interface Product {
  id: string;
  store_id: string;
  owner_user_id: string;
  title: string;
  slug: string;
  category: string;
  home_pillar: string;
  price: number;
  original_price?: number | null;
  pricing_mode?: ProductPricingMode | string;
  min_price?: number;
  addons?: ProductAddon[];
  hidden_by_seller?: number;
  hidden_by_admin?: number;
  cta_label?: string;
  cover_shape?: ProductCoverShape | string;
  quota_limit?: number | null;
  landing_page_url?: string;
  custom_landing_html?: string;
  description: string;
  image_url: string;
  delivery_content?: string;
  access_type?: 'link' | 'pdf' | 'image' | 'video' | string;
  access_url?: string;
  access_file_name?: string;
  has_access_file?: boolean;
  hasAccess?: boolean;
  is_physical: number;
  is_featured: number;
  is_recommended: number;
  is_pro_seller?: boolean;
  affiliate_enabled: number;
  affiliate_commission_pct: number;
  clicks_count: number;
  sales_count: number;
  status: string;
  created_at: string;
  store_name?: string;
  store_username?: string;
  store_initials?: string;
  store_logo?: string;
  store_whatsapp?: string;
  store_description?: string;
  owner_store_name?: string;
  owner_store_username?: string;
  referral_code?: string;
}

export interface ExternalAffiliateItem {
  id: string;
  store_id: string;
  title: string;
  category: string;
  price: number;
  original_price?: number | null;
  description: string;
  image_url: string;
  affiliate_url: string;
  clicks_count: number;
  created_at: string;
}

export interface VoucherItem {
  id: string;
  code: string;
  scope: 'platform' | 'store' | string;
  store_id?: string | null;
  store_name?: string | null;
  title: string;
  discount_type: 'fixed' | 'percent' | string;
  discount_value: number;
  min_purchase: number;
  max_discount?: number | null;
  quota_limit?: number | null;
  used_count: number;
  expires_at?: string | null;
  is_active: number;
  created_at: string;
}

export interface HomeCmsItem {
  id: string;
  section_type: 'banner' | 'lifestyle_category' | 'opportunity' | 'community' | 'affiliate_info' | string;
  title: string;
  subtitle: string;
  body: string;
  image_url: string;
  media_type?: 'image' | 'video' | 'link' | string;
  media_url?: string;
  link_url?: string;
  cta_label: string;
  cta_target: string;
  accent_color: string;
  icon_name?: string;
  sort_order: number;
  is_active: number;
}

export interface SiteFooterInfo {
  license_title: string;
  license_number: string;
  copyright: string;
  email: string;
  whatsapp: string;
  address: string;
  instagram: string;
  tiktok: string;
  youtube: string;
  website: string;
}

export interface AcademyCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  accent_color: string;
  sort_order: number;
}

export interface AcademyProgram {
  id: string;
  category_id: string;
  title: string;
  topic: string;
  goal: string;
  level: string;
  bundle_price: number;
  description: string;
  cover_url: string;
}

export interface AcademyClass {
  id: string;
  program_id: string;
  category_id: string;
  category_name?: string;
  program_title?: string;
  program_level?: string;
  title: string;
  description: string;
  objectives: string[];
  mentor_name: string;
  price: number;
  cover_url: string;
  pdf_guide_title: string;
  pdf_guide_content: string;
  group_link?: string;
  group_duration_note?: string;
  certificate_available: number;
  modules_count?: number;
}

export interface AcademyModule {
  id: string;
  class_id: string;
  sort_order: number;
  title: string;
  duration_minutes: number;
  video_title: string;
  video_summary: string;
  video_script_captions: Array<{ time: string; heading: string; text: string }>;
  text_material: string;
  interactive_exercise_prompt: string;
  interactive_exercise_choices: Array<{ label: string; isCorrect: boolean; feedback: string }>;
  worksheet_prompt: string;
  assignment_prompt: string;
  quiz_questions: Array<{ id: string; question: string; options: string[]; correctIndex: number }>;
}

export interface Enrollment {
  id: string;
  user_id: string;
  class_id: string;
  program_id?: string;
  order_id?: string;
  progress_pct: number;
  completed_modules: string[];
  certificate_code: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface SubmissionRecord {
  id: string;
  user_id: string;
  class_id: string;
  module_id: string;
  worksheet_answer: string;
  worksheet_status: string;
  assignment_answer: string;
  assignment_link: string;
  assignment_status: string;
  exercise_completed: number;
  quiz_score: number | null;
  quiz_answers: number[];
  grade: number | null;
  mentor_feedback: string;
  feedback_history: Array<{ at: string; by: string; status: string; note: string; grade?: number | null }>;
  updated_at: string;
}

export interface CartItem {
  item_type: 'product' | 'class' | 'program' | 'pro_plan';
  item_id: string;
  title: string;
  price: number;
  quantity: number;
  image_url: string;
  meta: string;
  affiliate_username?: string;
  custom_price?: number;
  selected_addons?: ProductAddon[];
}

export interface PaymentMethod {
  id: string;
  type: string;
  provider_name: string;
  account_number: string;
  account_holder: string;
  instructions: string;
  is_active: number;
}

export interface Order {
  id: string;
  order_code: string;
  buyer_user_id: string;
  buyer_email?: string;
  buyer_whatsapp?: string;
  voucher_code?: string;
  discount_amount?: number;
  payment_method_id: string;
  provider_name?: string;
  account_number?: string;
  account_holder?: string;
  instructions?: string;
  total_amount: number;
  status: 'Pending Payment' | 'Waiting Verification' | 'Paid' | 'Rejected' | 'Cancelled' | 'Refunded' | string;
  notes: string;
  sender_name?: string;
  transfer_reference?: string;
  proof_note?: string;
  submitted_at?: string;
  verification_note?: string;
  created_at: string;
  items: Array<{
    id: string;
    item_type: string;
    item_id: string;
    title: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    platform_fee_amount?: number;
    seller_net_amount?: number;
    delivery_content?: string;
    access_type?: 'link' | 'pdf' | 'image' | 'video' | string;
    access_url?: string;
    access_file_name?: string;
    has_access_file?: boolean;
    selected_addons?: ProductAddon[];
    image_url?: string;
    is_physical?: number;
  }>;
}

export interface CheckoutNotificationSummary {
  id: string;
  senderEmail: string;
  buyerEmail: string;
  buyerWhatsapp: string;
  emailStatus: string;
  waStatus: string;
  adminNotifiedCount?: number;
  reminderTitle: string;
  reminderMessage: string;
  whatsappShareText: string;
}

export interface CreatorTool {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  category: string;
  icon_name: string;
  accent_color: string;
  tool_type: string;
  config: Record<string, unknown>;
  is_active: number;
}

export interface CreatorStudioEntry {
  id: string;
  user_id: string;
  tool_slug: string;
  title: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  user_id: string | null;
  event_type: string;
  title: string;
  message: string;
  sender_email: string;
  email_status: string;
  whatsapp_status: string;
  is_read: number;
  created_at: string;
}
