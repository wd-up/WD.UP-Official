import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Code2,
  Copy,
  Crown,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  Link2,
  Lock,
  Plus,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
  Upload,
  Video,
  Wallet,
  Wand2,
  X,
} from 'lucide-react';
import { apiFetch, formatDateTimeId, formatRupiah } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import {
  MARKET_CATEGORIES,
  PRODUCT_COVER_SHAPES,
  PRODUCT_CTA_PRESETS,
  type ExternalAffiliateItem,
  type Product,
  type ProductAddon,
  type ProductCoverShape,
  type ProductPricingMode,
  type Store,
  type VoucherItem,
} from '../types/wdup';
import { SOCIAL_PLATFORM_META, SocialPlatformLogo } from './SocialBrandIcons';
import { FormattedDescription, SandboxedHtmlFrame, SandboxedLandingModal } from './SandboxedLandingModal';
import { SafeImage } from './SafeImage';
import {
  buildLandingImageSnippet,
  compressImageFile,
  isSaveableMediaOrEmpty,
  isValidCompleteHttpUrl,
} from '../lib/imageUtils';
import { getCoverShapeClasses, getProductCtaLabel, getProductPriceSummary } from '../lib/productUtils';

interface DailyAnalyticsPoint {
  date: string;
  label: string;
  shortLabel: string;
  grossRevenue: number;
  platformFee?: number;
  sellerNetIncome: number;
  affiliateCommission: number;
  accumulatedBalance: number;
  ordersCount: number;
  unitsSold: number;
  visits: number;
}

interface WeeklyAnalyticsPoint {
  week: string;
  label: string;
  dateRange: string;
  grossRevenue: number;
  platformFee?: number;
  sellerNetIncome: number;
  affiliateCommission: number;
  accumulatedBalance: number;
  ordersCount: number;
  unitsSold: number;
  visits: number;
}

interface MyStoreResponse {
  store: Store | null;
  is_pro?: boolean;
  platform_fee_pct?: number;
  ownProducts?: Product[];
  affiliateProducts?: Array<{
    affiliate_listing_id: string;
    referral_code: string;
    affiliate_clicks: number;
    id: string;
    title: string;
    category: string;
    price: number;
    original_price?: number | null;
    image_url: string;
    affiliate_commission_pct: number;
    owner_store_name: string;
    owner_store_username: string;
  }>;
  externalAffiliates?: ExternalAffiliateItem[];
  vouchers?: VoucherItem[];
  storeOrders?: Array<{
    order_item_id: string;
    title: string;
    quantity: number;
    subtotal: number;
    platform_fee_amount?: number;
    seller_net_amount?: number;
    order_code: string;
    status: string;
    created_at: string;
    buyer_name: string;
    seller_user_id: string;
    affiliate_user_id: string;
  }>;
  analytics?: {
    period: string;
    totalVisitors: number;
    periodVisits: number;
    productClicks: number;
    paidOrders: number;
    unitsSold: number;
    grossRevenue: number;
    affiliateCommission: number;
    topProducts: Array<{
      id: string;
      title: string;
      price: number;
      original_price?: number | null;
      quota_limit?: number | null;
      sales_count: number;
      clicks_count: number;
    }>;
    last30d?: {
      rangeLabel: string;
      grossRevenue: number;
      platformFee?: number;
      sellerNetIncome: number;
      affiliateCommission: number;
      accumulatedBalance: number;
      paidOrders: number;
      unitsSold: number;
      visits: number;
    };
    dailyBreakdown30d?: DailyAnalyticsPoint[];
    weeklyBreakdown1m?: WeeklyAnalyticsPoint[];
    lifetime?: {
      grossRevenue: number;
      platformFee?: number;
      sellerNetIncome: number;
      affiliateCommission: number;
      accumulatedBalance: number;
      paidOrders: number;
      unitsSold: number;
      visitors: number;
      productClicks: number;
      walletAvailable: number;
      walletPending: number;
    };
  };
}

interface AffiliateCatalogItem {
  id: string;
  title: string;
  category: string;
  price: number;
  original_price?: number | null;
  description: string;
  image_url: string;
  affiliate_commission_pct: number;
  sales_count: number;
  owner_store_name: string;
  owner_store_username: string;
  inMyStore: boolean;
  isOwnProduct: boolean;
}

type AccessType = 'link' | 'pdf' | 'image' | 'video';

interface ProductFormState {
  title: string;
  category: string;
  pricing_mode: ProductPricingMode;
  base_price: number;
  min_price: number;
  has_promo: boolean;
  promo_price: number;
  quota_limit: string;
  landing_page_url: string;
  custom_landing_html: string;
  cta_label: string;
  custom_cta_mode: boolean;
  cover_shape: ProductCoverShape;
  addons: ProductAddon[];
  description: string;
  delivery_content: string;
  access_type: AccessType;
  access_url: string;
  access_file_data: string;
  access_file_name: string;
  affiliate_enabled: boolean;
  affiliate_commission_pct: number;
  image_url: string;
}

const STARTER_STORE_HTML = `<section style="padding:28px 20px;background:linear-gradient(135deg,#FAF6F0,#EFF5F1);border-radius:16px;text-align:center;">
  <span style="display:inline-block;padding:4px 10px;background:#3D2C24;color:#F3C669;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:.06em;">TOKO RESMI WD.UP</span>
  <h1 style="margin:12px 0 6px;font-size:24px;color:#3D2C24;">Selamat Datang di Ruang Karya Digital</h1>
  <p style="max-width:520px;margin:0 auto 16px;font-size:14px;color:#6E5A50;">Temukan template produktivitas, e-book terkurasi, dan resource siap pakai untuk level-up karier digital Anda.</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;max-width:560px;margin:0 auto;">
    <div style="padding:12px;background:#fff;border-radius:12px;border:1px solid rgba(61,44,36,.12);">
      <strong style="font-size:13px;color:#527362;">Akses Instan</strong>
      <p style="margin:4px 0 0;font-size:12px;color:#6E5A50;">File otomatis terbuka setelah verifikasi pembayaran.</p>
    </div>
    <div style="padding:12px;background:#fff;border-radius:12px;border:1px solid rgba(61,44,36,.12);">
      <strong style="font-size:13px;color:#E07A5F;">Kualitas Terkurasi</strong>
      <p style="margin:4px 0 0;font-size:12px;color:#6E5A50;">Dirancang praktis untuk creator & digital entrepreneur.</p>
    </div>
  </div>
</section>`;

const STARTER_PRODUCT_HTML = `<div style="padding:22px;background:#FAF6F0;border-radius:14px;border:1px solid rgba(61,44,36,.12);">
  <p style="margin:0;font-size:11px;font-weight:700;color:#527362;text-transform:uppercase;">Highlights Produk</p>
  <h2 style="margin:6px 0 10px;font-size:20px;color:#3D2C24;">Kenapa Wajib Punya Produk Ini?</h2>
  <ul style="margin:0;padding-left:18px;font-size:13px;color:#3D2C24;line-height:1.7;">
    <li>Langsung bisa dipakai hari ini tanpa setup rumit.</li>
    <li>Dilengkapi panduan langkah demi langkah.</li>
    <li>Akses selamanya langsung dari akun WD.UP Anda.</li>
  </ul>
</div>`;

const emptyProductForm = (): ProductFormState => ({
  title: '',
  category: MARKET_CATEGORIES[1] as string,
  pricing_mode: 'fixed',
  base_price: 129000,
  min_price: 25000,
  has_promo: false,
  promo_price: 99000,
  quota_limit: '',
  landing_page_url: '',
  custom_landing_html: '',
  cta_label: 'Beli Sekarang',
  custom_cta_mode: false,
  cover_shape: 'landscape',
  addons: [],
  description: '',
  delivery_content: '',
  access_type: 'link',
  access_url: '',
  access_file_data: '',
  access_file_name: '',
  affiliate_enabled: true,
  affiliate_commission_pct: 15,
  image_url: '',
});

const AI_CREATOR_MODES = [
  'Deskripsi Produk Menjual',
  'Ide Judul & Tagline',
  'Poin Manfaat & Highlight',
  'Copy Promosi & CTA',
] as const;

export function StoreBuilderView() {
  const { user, openPublicStore, notifyCatalogUpdated, setAccountSubView, toast } = useAuth();
  const [data, setData] = useState<MyStoreResponse | null>(null);
  const [subTab, setSubTab] = useState<'dashboard' | 'products' | 'affiliate' | 'vouchers' | 'orders' | 'customize'>(
    'dashboard'
  );
  const [chartMetric, setChartMetric] = useState<'balance' | 'orders' | 'visits'>('balance');
  const [chartGranularity, setChartGranularity] = useState<'daily' | 'weekly'>('daily');
  const [hideBalance, setHideBalance] = useState(false);
  const [loading, setLoading] = useState(true);

  // Create Store Form State
  const [createForm, setCreateForm] = useState({
    name: '',
    username: '',
    initials: '',
    description: '',
    category: 'Digital Creator',
    store_mode: 'hybrid',
    contact_whatsapp: user?.whatsapp || '',
    contact_email: user?.email || '',
    social_instagram: '',
    social_tiktok: '',
    theme: 'warm-cream',
  });
  const [availability, setAvailability] = useState<{
    nameAvailable: boolean;
    usernameAvailable: boolean;
    sanitizedUsername: string;
  }>({ nameAvailable: true, usernameAvailable: true, sanitizedUsername: '' });
  const [creating, setCreating] = useState(false);

  // Customization Autosave Form
  const [editStore, setEditStore] = useState<Partial<Store>>({});
  const editStoreRef = useRef<Partial<Store>>({});
  const [autosaveNote, setAutosaveNote] = useState('');
  const [savingStoreCustom, setSavingStoreCustom] = useState(false);
  const [mediaQuotaError, setMediaQuotaError] = useState<{ banner?: string; logo?: string }>({});
  const [showStoreCodePreview, setShowStoreCodePreview] = useState(true);
  const [storeHtmlImgUrl, setStoreHtmlImgUrl] = useState('');
  const [prodHtmlImgUrl, setProdHtmlImgUrl] = useState('');
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Product Form (Create / Edit)
  const [newProd, setNewProd] = useState<ProductFormState>(emptyProductForm());
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [coverQuotaError, setCoverQuotaError] = useState('');
  const [showProdCodeEditor, setShowProdCodeEditor] = useState(false);
  const [prodPreviewModal, setProdPreviewModal] = useState(false);
  const [togglingVisibilityId, setTogglingVisibilityId] = useState<string | null>(null);

  // AI Creator WD.UP (Pro Seller Only, embedded inside Product Form)
  const [showAiCreator, setShowAiCreator] = useState(false);
  const [aiMode, setAiMode] = useState<string>(AI_CREATOR_MODES[0]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiOutput, setAiOutput] = useState('');

  // Affiliate Catalog & Seller External Affiliate Form
  const [affCatalog, setAffCatalog] = useState<AffiliateCatalogItem[]>([]);
  const [extAffForm, setExtAffForm] = useState({
    title: '',
    category: MARKET_CATEGORIES[1] as string,
    price: 99000,
    original_price: '',
    image_url: '',
    affiliate_url: '',
    description: '',
  });
  const [savingExtAff, setSavingExtAff] = useState(false);

  // Store Voucher Form
  const [editingVoucherId, setEditingVoucherId] = useState<string | null>(null);
  const [voucherForm, setVoucherForm] = useState({
    code: '',
    title: '',
    discount_type: 'fixed' as 'fixed' | 'percent',
    discount_value: 15000,
    min_purchase: 0,
    max_discount: '',
    quota_limit: '',
    expires_at: '',
  });
  const [savingVoucher, setSavingVoucher] = useState(false);

  const loadMyStore = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<MyStoreResponse>('/api/my-store?period=monthly');
      setData(res);
      if (res.store) {
        editStoreRef.current = res.store;
        setEditStore(res.store);
      }
      const affRes = await apiFetch<{ catalog: AffiliateCatalogItem[] }>('/api/affiliate/catalog');
      setAffCatalog(affRes.catalog || []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;
    loadMyStore();
  }, [user?.id]);

  // Real-time uniqueness check during creation
  useEffect(() => {
    if (!createForm.name && !createForm.username) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{
          nameAvailable: boolean;
          usernameAvailable: boolean;
          sanitizedUsername: string;
        }>(
          `/api/my-store/check-availability?name=${encodeURIComponent(createForm.name)}&username=${encodeURIComponent(
            createForm.username
          )}`
        );
        setAvailability(res);
      } catch {
        // ignore
      }
    }, 300);
    return () => clearTimeout(t);
  }, [createForm.name, createForm.username]);

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!availability.nameAvailable || !availability.usernameAvailable) {
      toast('Nama toko atau username sudah digunakan. Pilih yang lain.', 'coral');
      return;
    }
    setCreating(true);
    try {
      await apiFetch('/api/my-store', {
        method: 'POST',
        body: JSON.stringify(createForm),
      });
      toast('Toko berhasil dibuat dan landing page siap dikunjungi!', 'sage');
      await loadMyStore();
      notifyCatalogUpdated();
      setSubTab('dashboard');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal membuat toko.', 'coral');
    } finally {
      setCreating(false);
    }
  };

  const persistStoreDraft = async (draft: Partial<Store>, showSuccessToast = false) => {
    const hasPartialUrl =
      !isSaveableMediaOrEmpty(draft.banner_url) ||
      !isSaveableMediaOrEmpty(draft.logo_url) ||
      (Boolean(draft.landing_page_url?.trim()) && !isValidCompleteHttpUrl(draft.landing_page_url || ''));

    if (!showSuccessToast && hasPartialUrl) {
      setAutosaveNote('Lanjutkan mengetik URL lengkap (https://...) lalu klik Simpan');
      return;
    }

    if (showSuccessToast) {
      setSavingStoreCustom(true);
    }
    setAutosaveNote('Menyimpan perubahan...');
    try {
      const res = await apiFetch<{ store: Store }>('/api/my-store', {
        method: 'PUT',
        body: JSON.stringify(draft),
      });
      setData((prev) => (prev ? { ...prev, store: res.store } : prev));
      editStoreRef.current = res.store;
      setEditStore(res.store);
      setAutosaveNote('Tersimpan');
      notifyCatalogUpdated();
      if (showSuccessToast) {
        toast('Kustomisasi toko & landing page berhasil disimpan!', 'sage');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan perubahan.';
      setAutosaveNote(msg);
      if (showSuccessToast) {
        toast(msg, 'coral');
      }
    } finally {
      if (showSuccessToast) {
        setSavingStoreCustom(false);
      }
    }
  };

  const handleEditStoreField = (patch: Partial<Store>, saveImmediately = false) => {
    const merged = { ...editStoreRef.current, ...patch };
    editStoreRef.current = merged;
    setEditStore(merged);
    if (autosaveRef.current) clearTimeout(autosaveRef.current);

    if (saveImmediately) {
      void persistStoreDraft(merged, false);
      return;
    }

    setAutosaveNote('Menyimpan perubahan...');
    autosaveRef.current = setTimeout(() => {
      void persistStoreDraft(editStoreRef.current, false);
    }, 650);
  };

  const handleStoreImageUpload = async (kind: 'banner' | 'logo', e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setMediaQuotaError((prev) => ({ ...prev, [kind]: undefined }));
    setAutosaveNote(`Memproses ${kind === 'banner' ? 'banner' : 'logo'}...`);
    try {
      const compressedDataUrl = await compressImageFile(
        file,
        kind === 'banner'
          ? { maxWidth: 1440, maxHeight: 720, quality: 0.82 }
          : { maxWidth: 512, maxHeight: 512, quality: 0.85 }
      );
      if (kind === 'banner') {
        handleEditStoreField({ banner_url: compressedDataUrl }, true);
      } else {
        handleEditStoreField({ logo_url: compressedDataUrl }, true);
      }
      toast(`${kind === 'banner' ? 'Banner' : 'Logo'} toko berhasil diunggah & disimpan.`, 'sage');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : `Gagal memproses gambar ${kind}. Silakan tempel Link URL gambar (https://...).`;
      setMediaQuotaError((prev) => ({ ...prev, [kind]: msg }));
      setAutosaveNote(msg);
      toast(msg, 'coral');
    }
  };

  const handleInsertLandingHtmlImageUpload = async (
    target: 'store' | 'product',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 960,
        maxHeight: 960,
        quality: 0.82,
        maxDataUrlLength: 260_000,
      });
      const snippet = buildLandingImageSnippet(compressed, file.name.replace(/\.[^.]+$/, '') || 'Gambar Landing');
      if (target === 'store') {
        const nextHtml = `${editStoreRef.current.custom_landing_html || ''}${snippet}`.trimStart();
        setShowStoreCodePreview(true);
        handleEditStoreField({ custom_landing_html: nextHtml }, true);
      } else {
        setShowProdCodeEditor(true);
        setNewProd((prev) => ({
          ...prev,
          custom_landing_html: `${prev.custom_landing_html || ''}${snippet}`.trimStart(),
        }));
      }
      toast('Gambar berhasil disisipkan ke kode landing page!', 'sage');
    } catch (err) {
      toast(
        err instanceof Error
          ? err.message
          : 'Gagal menyisipkan gambar. Coba gunakan Link URL gambar (https://...).',
        'coral'
      );
    }
  };

  const handleInsertLandingHtmlImageUrl = (target: 'store' | 'product') => {
    const raw = (target === 'store' ? storeHtmlImgUrl : prodHtmlImgUrl).trim();
    if (!isValidCompleteHttpUrl(raw)) {
      toast('Masukkan link gambar lengkap diawali http:// atau https://', 'coral');
      return;
    }
    const snippet = buildLandingImageSnippet(raw, 'Gambar Landing');
    if (target === 'store') {
      const nextHtml = `${editStoreRef.current.custom_landing_html || ''}${snippet}`.trimStart();
      setStoreHtmlImgUrl('');
      setShowStoreCodePreview(true);
      handleEditStoreField({ custom_landing_html: nextHtml }, true);
    } else {
      setProdHtmlImgUrl('');
      setShowProdCodeEditor(true);
      setNewProd((prev) => ({
        ...prev,
        custom_landing_html: `${prev.custom_landing_html || ''}${snippet}`.trimStart(),
      }));
    }
    toast('Link gambar disisipkan ke landing page!', 'sage');
  };

  const handleProductCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    setCoverQuotaError('');
    try {
      const compressed = await compressImageFile(file, {
        maxWidth: 960,
        maxHeight: 960,
        quality: 0.82,
      });
      setNewProd((prev) => ({ ...prev, image_url: compressed }));
      toast('Gambar sampul produk siap diterbitkan.', 'sage');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Gagal memproses gambar sampul. Tempel Link URL gambar atau klik "Tanpa Gambar".';
      setCoverQuotaError(msg);
      toast(msg, 'coral');
    }
  };

  const handleAccessFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      toast('Ukuran file akses maksimal 10 MB. Gunakan Link URL untuk file yang lebih besar.', 'coral');
      e.target.value = '';
      return;
    }
    const detectedType: AccessType =
      file.type === 'application/pdf'
        ? 'pdf'
        : file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('video/')
        ? 'video'
        : newProd.access_type;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setNewProd((prev) => ({
          ...prev,
          access_type: detectedType,
          access_file_data: reader.result as string,
          access_file_name: file.name,
        }));
        toast(`File "${file.name}" siap dilampirkan sebagai akses produk.`, 'sage');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.title.trim()) {
      toast('Judul produk wajib diisi.', 'coral');
      return;
    }
    if (newProd.pricing_mode === 'fixed') {
      if (newProd.base_price < 1000) {
        toast('Harga produk minimal Rp 1.000.', 'coral');
        return;
      }
      if (newProd.has_promo && (newProd.promo_price <= 0 || newProd.promo_price >= newProd.base_price)) {
        toast('Harga promo harus lebih rendah dari harga awal dan lebih dari 0.', 'coral');
        return;
      }
    } else if (newProd.pricing_mode === 'pwyw_min') {
      if (newProd.min_price < 1000) {
        toast('Nominal minimal Bayar Suka-Suka minimal Rp 1.000.', 'coral');
        return;
      }
    }
    if (
      !newProd.access_url.trim() &&
      !newProd.access_file_data &&
      !newProd.delivery_content.trim() &&
      !newProd.access_file_name
    ) {
      toast('Isi minimal salah satu akses produk (Link URL / File / Catatan Akses) untuk pembeli.', 'coral');
      return;
    }

    const cleanedAddons = newProd.addons
      .map((a, idx) => ({
        id: a.id || `addon_${Date.now()}_${idx}`,
        title: a.title.trim(),
        link: (a.link || '').trim(),
        price: Math.max(0, Math.round(Number(a.price) || 0)),
      }))
      .filter((a) => a.title.length > 0);

    setSavingProduct(true);
    try {
      const effectivePrice =
        newProd.pricing_mode === 'fixed'
          ? newProd.has_promo
            ? newProd.promo_price
            : newProd.base_price
          : newProd.pricing_mode === 'pwyw_min'
          ? newProd.min_price
          : 0;
      const originalPrice =
        newProd.pricing_mode === 'fixed' && newProd.has_promo ? newProd.base_price : null;
      const parsedQuota = newProd.quota_limit.trim() === '' ? null : Number(newProd.quota_limit.trim());

      const payload: Record<string, unknown> = {
        title: newProd.title.trim(),
        category: newProd.category,
        pricing_mode: newProd.pricing_mode,
        price: effectivePrice,
        min_price: newProd.pricing_mode === 'pwyw_min' ? newProd.min_price : 0,
        original_price: originalPrice,
        quota_limit: parsedQuota,
        landing_page_url: newProd.landing_page_url.trim(),
        custom_landing_html: newProd.custom_landing_html,
        cta_label: newProd.cta_label.trim() || 'Beli Sekarang',
        cover_shape: newProd.cover_shape,
        addons: cleanedAddons,
        description: newProd.description.trim() || `${newProd.title.trim()} — akses digital instan.`,
        delivery_content: newProd.delivery_content.trim(),
        access_type: newProd.access_type,
        access_url: newProd.access_url.trim(),
        affiliate_enabled: newProd.affiliate_enabled,
        affiliate_commission_pct: newProd.affiliate_commission_pct,
        image_url: newProd.image_url.trim(),
      };
      if (newProd.access_file_data) {
        payload.access_file_data = newProd.access_file_data;
        payload.access_file_name = newProd.access_file_name;
      }

      if (editingProductId) {
        await apiFetch(`/api/my-store/products/${editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast('Perubahan produk tersinkronisasi & berhasil disimpan!', 'sage');
      } else {
        await apiFetch('/api/my-store/products', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast('Produk baru berhasil diterbitkan & sinkron ke Toko serta WD.UP Market!', 'sage');
      }
      setEditingProductId(null);
      setNewProd(emptyProductForm());
      setCoverQuotaError('');
      setAiOutput('');
      await loadMyStore();
      notifyCatalogUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan produk.', 'coral');
    } finally {
      setSavingProduct(false);
    }
  };

  const startEditProduct = (p: Product) => {
    const mode: ProductPricingMode =
      p.pricing_mode === 'pwyw' || p.pricing_mode === 'pwyw_min' ? p.pricing_mode : 'fixed';
    const hasPromo = mode === 'fixed' && Boolean(p.original_price && p.original_price > p.price);
    const ctaVal = p.cta_label?.trim() || 'Beli Sekarang';
    const isPresetCta = (PRODUCT_CTA_PRESETS as readonly string[]).includes(ctaVal);
    setEditingProductId(p.id);
    setCoverQuotaError('');
    setShowProdCodeEditor(Boolean(p.custom_landing_html?.trim()));
    setNewProd({
      title: p.title,
      category: MARKET_CATEGORIES.includes(p.category as (typeof MARKET_CATEGORIES)[number])
        ? p.category
        : (MARKET_CATEGORIES[1] as string),
      pricing_mode: mode,
      base_price: mode === 'fixed' ? (hasPromo ? Number(p.original_price) : Math.max(1000, p.price)) : 129000,
      min_price: mode === 'pwyw_min' ? Math.max(1000, p.min_price || p.price || 25000) : 25000,
      has_promo: hasPromo,
      promo_price: hasPromo ? p.price : Math.max(1000, Math.round(Math.max(1000, p.price) * 0.8)),
      quota_limit: p.quota_limit !== null && p.quota_limit !== undefined ? String(p.quota_limit) : '',
      landing_page_url: p.landing_page_url || '',
      custom_landing_html: p.custom_landing_html || '',
      cta_label: ctaVal,
      custom_cta_mode: !isPresetCta,
      cover_shape: (PRODUCT_COVER_SHAPES.some((s) => s.id === p.cover_shape)
        ? p.cover_shape
        : 'landscape') as ProductCoverShape,
      addons: (p.addons || []).map((a) => ({
        id: a.id,
        title: a.title,
        link: a.link || '',
        price: a.price,
      })),
      description: p.description,
      delivery_content: p.delivery_content || '',
      access_type: (p.access_type as AccessType) || 'link',
      access_url: p.access_url || '',
      access_file_data: '',
      access_file_name: p.access_file_name || '',
      affiliate_enabled: Boolean(p.affiliate_enabled),
      affiliate_commission_pct: p.affiliate_commission_pct,
      image_url: p.image_url || '',
    });
    window.scrollTo({ top: 120, behavior: 'smooth' });
  };

  const handleToggleProductVisibility = async (p: Product) => {
    setTogglingVisibilityId(p.id);
    try {
      const nextHidden = p.hidden_by_seller ? 0 : 1;
      await apiFetch(`/api/my-store/products/${p.id}/visibility`, {
        method: 'PUT',
        body: JSON.stringify({ hidden_by_seller: nextHidden }),
      });
      toast(
        nextHidden
          ? 'Produk disembunyikan dari etalase & WD.UP Market.'
          : 'Produk ditampilkan kembali di etalase & WD.UP Market.',
        'sage'
      );
      await loadMyStore();
      notifyCatalogUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal mengubah visibilitas produk.', 'coral');
    } finally {
      setTogglingVisibilityId(null);
    }
  };

  const handleRunAiCreator = async () => {
    const promptText =
      aiPrompt.trim() ||
      `Produk digital "${newProd.title.trim() || 'Produk Baru'}" kategori ${newProd.category}`;
    setAiLoading(true);
    try {
      const res = await apiFetch<{ output: string }>('/api/creator-studio/ai-generate', {
        method: 'POST',
        body: JSON.stringify({
          mode: aiMode,
          prompt: promptText,
          productTitle: newProd.title.trim(),
          productCategory: newProd.category,
        }),
      });
      setAiOutput(res.output || '');
      toast('Ide AI Creator WD.UP berhasil dibuat!', 'sage');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menjalankan AI Creator.', 'coral');
    } finally {
      setAiLoading(false);
    }
  };

  const handleAddAddonRow = () => {
    setNewProd((prev) => ({
      ...prev,
      addons: [
        ...prev.addons,
        { id: `addon_${Date.now()}_${prev.addons.length}`, title: '', link: '', price: 25000 },
      ],
    }));
  };

  const handleUpdateAddonRow = (idx: number, patch: Partial<ProductAddon>) => {
    setNewProd((prev) => ({
      ...prev,
      addons: prev.addons.map((item, i) => (i === idx ? { ...item, ...patch } : item)),
    }));
  };

  const handleRemoveAddonRow = (idx: number) => {
    setNewProd((prev) => ({
      ...prev,
      addons: prev.addons.filter((_, i) => i !== idx),
    }));
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      await apiFetch(`/api/my-store/products/${id}`, { method: 'DELETE' });
      if (editingProductId === id) {
        setEditingProductId(null);
        setNewProd(emptyProductForm());
      }
      toast('Produk dihapus dari toko.', 'brown');
      await loadMyStore();
      notifyCatalogUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menghapus produk.', 'coral');
    }
  };

  const handleAddAffiliateProduct = async (productId: string) => {
    try {
      await apiFetch('/api/affiliate/store-items', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId }),
      });
      toast('Produk ditambahkan dan tampil menyatu di toko Anda!', 'sage');
      await loadMyStore();
      notifyCatalogUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menambahkan produk affiliate.', 'coral');
    }
  };

  const handleRemoveAffiliateProduct = async (productId: string) => {
    try {
      await apiFetch(`/api/affiliate/store-items/${productId}`, { method: 'DELETE' });
      toast('Produk affiliate dihapus dari toko Anda.', 'brown');
      await loadMyStore();
      notifyCatalogUpdated();
    } catch {
      // ignore
    }
  };

  const handleAddExternalAffiliate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingExtAff(true);
    try {
      await apiFetch('/api/my-store/external-affiliates', {
        method: 'POST',
        body: JSON.stringify({
          ...extAffForm,
          original_price: extAffForm.original_price ? Number(extAffForm.original_price) : null,
        }),
      });
      toast('Produk affiliate eksternal ditambahkan ke etalase toko Anda!', 'sage');
      setExtAffForm({
        title: '',
        category: MARKET_CATEGORIES[1] as string,
        price: 99000,
        original_price: '',
        image_url: '',
        affiliate_url: '',
        description: '',
      });
      await loadMyStore();
      notifyCatalogUpdated();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menambah link affiliate.', 'coral');
    } finally {
      setSavingExtAff(false);
    }
  };

  const handleDeleteExternalAffiliate = async (id: string) => {
    try {
      await apiFetch(`/api/my-store/external-affiliates/${id}`, { method: 'DELETE' });
      toast('Produk affiliate eksternal dihapus.', 'brown');
      await loadMyStore();
      notifyCatalogUpdated();
    } catch {
      // ignore
    }
  };

  const handleCreateVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingVoucher(true);
    try {
      const payload = {
        code: voucherForm.code,
        title: voucherForm.title,
        discount_type: voucherForm.discount_type,
        discount_value: Number(voucherForm.discount_value),
        min_purchase: Number(voucherForm.min_purchase || 0),
        max_discount: voucherForm.max_discount ? Number(voucherForm.max_discount) : null,
        quota_limit: voucherForm.quota_limit ? Number(voucherForm.quota_limit) : null,
        expires_at: voucherForm.expires_at ? voucherForm.expires_at : null,
      };
      if (editingVoucherId) {
        await apiFetch(`/api/my-store/vouchers/${editingVoucherId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast(`Voucher toko "${voucherForm.code.toUpperCase()}" berhasil diperbarui!`, 'sage');
      } else {
        await apiFetch('/api/my-store/vouchers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast(`Voucher toko "${voucherForm.code.toUpperCase()}" berhasil diterbitkan!`, 'sage');
      }
      setEditingVoucherId(null);
      setVoucherForm({
        code: '',
        title: '',
        discount_type: 'fixed',
        discount_value: 15000,
        min_purchase: 0,
        max_discount: '',
        quota_limit: '',
        expires_at: '',
      });
      await loadMyStore();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal menyimpan voucher toko.', 'coral');
    } finally {
      setSavingVoucher(false);
    }
  };

  const appendDescSnippet = (snippet: string) => {
    setNewProd((prev) => ({
      ...prev,
      description: prev.description ? `${prev.description}\n${snippet}` : snippet,
    }));
  };

  if (loading && !data) {
    return <div className="h-56 rounded-2xl bg-[#F2EAE0] animate-pulse" />;
  }

  // ==========================================
  // STORE CREATION FORM (IF USER HAS NO STORE YET)
  // ==========================================
  if (!data?.store) {
    return (
      <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-5 sm:p-6 space-y-5">
        <div className="space-y-1">
          <h2 className="font-display text-xl font-semibold text-[#3D2C24]">Buat Toko Anda di WD.UP</h2>
          <p className="text-xs sm:text-sm text-[#6E5A50]">
            Anda dapat membuat toko sekarang meskipun belum memiliki produk pribadi — pilih mode Jual Produk Sendiri,
            Toko Affiliate, atau Gabungan keduanya.
          </p>
        </div>

        <form onSubmit={handleCreateStore} className="grid sm:grid-cols-2 gap-3.5">
          <div className="sm:col-span-2 grid sm:grid-cols-3 gap-2.5">
            {[
              { id: 'own', title: 'Own Product Store', desc: 'Jual produk digital & jasa profesional buatan sendiri.' },
              { id: 'affiliate', title: 'Affiliate Store', desc: 'Promosikan produk pilihan dengan etalase toko Anda.' },
              { id: 'hybrid', title: 'Hybrid (Keduanya)', desc: 'Gabungkan produk sendiri & affiliate sekaligus.' },
            ].map((m) => (
              <label
                key={m.id}
                className={`p-3 rounded-xl border cursor-pointer ${
                  createForm.store_mode === m.id ? 'border-[#6B8E7B] bg-[#6B8E7B]/10' : 'border-[#3D2C24]/12'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="store_mode"
                    checked={createForm.store_mode === m.id}
                    onChange={() => setCreateForm({ ...createForm, store_mode: m.id })}
                    className="accent-[#527362]"
                  />
                  <span className="text-xs font-semibold text-[#3D2C24]">{m.title}</span>
                </div>
                <p className="text-[11px] text-[#6E5A50] mt-1">{m.desc}</p>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Nama Toko (Unik)</label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="Contoh: Studio Kreatif Alya"
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
            {createForm.name && !availability.nameAvailable && (
              <p className="text-[11px] text-[#E07A5F] mt-1 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Nama toko sudah dipakai. Silakan pilih nama lain.</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Username Toko (Unik · URL Toko)</label>
            <input
              type="text"
              required
              value={createForm.username}
              onChange={(e) =>
                setCreateForm({ ...createForm, username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })
              }
              placeholder="studioalya"
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
            />
            <p className="text-[11px] text-[#6E5A50] mt-1">
              URL Toko: /?store={createForm.username || 'username'}
            </p>
            {createForm.username && !availability.usernameAvailable && (
              <p className="text-[11px] text-[#E07A5F] mt-0.5 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Username toko sudah dipakai. Pilih username lain.</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Inisial Toko (2–3 Huruf)</label>
            <input
              type="text"
              maxLength={3}
              value={createForm.initials}
              onChange={(e) => setCreateForm({ ...createForm, initials: e.target.value.toUpperCase() })}
              placeholder="SA"
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs uppercase"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Kategori Toko</label>
            <input
              type="text"
              value={createForm.category}
              onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
              placeholder="Planner, E-book & Affiliate"
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Deskripsi Toko</label>
            <textarea
              rows={2}
              value={createForm.description}
              onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
              placeholder="Ceritakan produk dan nilai yang ditawarkan toko Anda..."
              className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">WhatsApp Bisnis</label>
            <input
              type="text"
              value={createForm.contact_whatsapp}
              onChange={(e) => setCreateForm({ ...createForm, contact_whatsapp: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3D2C24] mb-1">Instagram / TikTok</label>
            <input
              type="text"
              value={createForm.social_instagram}
              onChange={(e) => setCreateForm({ ...createForm, social_instagram: e.target.value })}
              placeholder="@username"
              className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
            />
          </div>

          <div className="sm:col-span-2 flex justify-end pt-1">
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {creating ? 'Membuat Toko...' : 'Buat Toko & Aktifkan Landing Page'}
            </button>
          </div>
        </form>
      </div>
    );
  }

  const store = data.store;
  const isProSeller = Boolean(data.is_pro ?? store.is_pro ?? user?.is_pro ?? user?.role === 'admin');
  const formatMoney = (val: number) => (hideBalance ? 'Rp ••••••' : formatRupiah(val));
  const analytics = data.analytics;
  const daily30d = analytics?.dailyBreakdown30d || [];
  const weekly1m = analytics?.weeklyBreakdown1m || [];
  const last30d = analytics?.last30d;
  const lifetime = analytics?.lifetime;

  const activeSeries = chartGranularity === 'daily' ? daily30d : weekly1m;
  const maxChartVal = Math.max(
    1,
    ...activeSeries.map((pt) =>
      chartMetric === 'balance' ? pt.accumulatedBalance : chartMetric === 'orders' ? pt.ordersCount : pt.visits
    )
  );

  const accessTypeOptions: Array<{
    id: AccessType;
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
    accept: string;
    placeholder: string;
  }> = [
    {
      id: 'link',
      label: 'Link URL',
      Icon: Link2,
      accept: '',
      placeholder: 'https://notion.so/... atau https://drive.google.com/...',
    },
    {
      id: 'pdf',
      label: 'PDF',
      Icon: FileText,
      accept: 'application/pdf',
      placeholder: 'https://.../ebook.pdf (atau unggah PDF di bawah)',
    },
    {
      id: 'image',
      label: 'Gambar',
      Icon: ImageIcon,
      accept: 'image/*',
      placeholder: 'https://.../desain.png (atau unggah gambar di bawah)',
    },
    {
      id: 'video',
      label: 'Video',
      Icon: Video,
      accept: 'video/*',
      placeholder: 'https://youtu.be/... atau unggah video MP4 di bawah',
    },
  ];
  const currentAccessMeta =
    accessTypeOptions.find((o) => o.id === newProd.access_type) || accessTypeOptions[0];

  const promoDiscountPct =
    newProd.has_promo && newProd.base_price > 0 && newProd.promo_price > 0 && newProd.promo_price < newProd.base_price
      ? Math.round(((newProd.base_price - newProd.promo_price) / newProd.base_price) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* Compact Store Identity Header + Pro Fee Status */}
      <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#6B8E7B]/20 flex items-center justify-center font-display text-base font-bold text-[#3D2C24] shrink-0">
            {store.logo_url ? (
              <SafeImage src={store.logo_url} alt={store.name} className="w-full h-full object-cover" fallbackLabel={store.initials} />
            ) : (
              store.initials
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="font-display text-base sm:text-lg font-semibold text-[#3D2C24] leading-tight truncate">
                {store.name}
              </h2>
              {isProSeller ? (
                <span className="px-2 py-0.5 rounded-md bg-[#3D2C24] text-[#F3C669] text-[10px] font-bold inline-flex items-center gap-1 shrink-0">
                  <Crown className="w-3 h-3" />
                  <span>PRO · 0% FEE</span>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setAccountSubView('overview')}
                  className="px-2 py-0.5 rounded-md bg-[#3D2C24] hover:bg-[#2A1D17] text-[#F3C669] text-[10px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                >
                  <Crown className="w-3 h-3" />
                  <span>Upgrade PRO</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-[#6E5A50] truncate">
              @{store.username} · {store.category} · Mode: {store.store_mode}
            </p>
          </div>
        </div>
        <button
          onClick={() => openPublicStore(store.username)}
          className="px-3.5 py-2 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer self-start sm:self-auto shrink-0"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Lihat Store Landing Page</span>
        </button>
      </div>

      {/* Store Sub-Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'dashboard', label: 'Analisa 1 Bulan' },
          { id: 'products', label: `Produk (${data.ownProducts?.length || 0})` },
          {
            id: 'affiliate',
            label: `Affiliate (${(data.affiliateProducts?.length || 0) + (data.externalAffiliates?.length || 0)})`,
          },
          { id: 'vouchers', label: `Voucher (${data.vouchers?.length || 0})` },
          { id: 'orders', label: `Pesanan (${data.storeOrders?.length || 0})` },
          { id: 'customize', label: 'Kustomisasi & Landing' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap cursor-pointer ${
              subTab === t.id ? 'bg-[#3D2C24] text-[#FAF6F0]' : 'bg-white text-[#6E5A50] border border-[#3D2C24]/10'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 1. COMPACT 1-MONTH ANALYTICS & SMALL INCOME CARDS WITH HIDE BALANCE TOGGLE */}
      {subTab === 'dashboard' && analytics && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold text-[#6E5A50]">
              Ringkasan Saldo & Analisa 1 Bulan
            </p>
            <button
              type="button"
              onClick={() => setHideBalance((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/12 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#FAF6F0]"
            >
              {hideBalance ? (
                <Eye className="w-3.5 h-3.5 text-[#527362]" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-[#6E5A50]" />
              )}
              <span>{hideBalance ? 'Tampilkan Saldo' : 'Sembunyikan Saldo'}</span>
            </button>
          </div>

          {/* Compact Income KPI Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-xl bg-[#EFF5F1] border border-[#6B8E7B]/30 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold text-[#527362]">Penghasilan 1 Bln</span>
                <TrendingUp className="w-3 h-3 text-[#527362] shrink-0" />
              </div>
              <p className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#3D2C24] leading-tight">
                {formatMoney(last30d?.accumulatedBalance || 0)}
              </p>
              <div className="pt-1 border-t border-[#6B8E7B]/20 flex items-center justify-between text-[9px] text-[#3D2C24]/75 font-mono tabular-nums gap-1">
                <span className="truncate">Net {formatMoney(last30d?.sellerNetIncome || 0)}</span>
                <span className="truncate">Aff {formatMoney(last30d?.affiliateCommission || 0)}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold text-[#FAF6F0]/80">Lifetime</span>
                <Sparkles className="w-3 h-3 text-[#F3C669] shrink-0" />
              </div>
              <p className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#F3C669] leading-tight">
                {formatMoney(lifetime?.accumulatedBalance || 0)}
              </p>
              <div className="pt-1 border-t border-[#FAF6F0]/15 flex items-center justify-between text-[9px] text-[#FAF6F0]/80 font-mono tabular-nums gap-1">
                <span>{lifetime?.paidOrders || 0} Order</span>
                <span className="truncate">{lifetime?.unitsSold || 0} Unit</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#FDF8EC] border border-[#F3C669]/50 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold text-[#8A6112]">Saldo Wallet</span>
                <Wallet className="w-3 h-3 text-[#8A6112] shrink-0" />
              </div>
              <p className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#3D2C24] leading-tight">
                {formatMoney(lifetime?.walletAvailable || 0)}
              </p>
              <div className="pt-1 border-t border-[#F3C669]/30 flex items-center justify-between text-[9px] text-[#6E5A50] font-mono tabular-nums gap-1">
                <span className="truncate">Tahan {formatMoney(lifetime?.walletPending || 0)}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-white border border-[#3D2C24]/12 flex flex-col justify-between gap-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[10px] font-semibold text-[#6E5A50]">Performa 30 Hari</span>
                <BarChart3 className="w-3 h-3 text-[#E07A5F] shrink-0" />
              </div>
              <p className="font-mono tabular-nums text-sm sm:text-base font-bold text-[#3D2C24] leading-tight">
                {last30d?.paidOrders || 0} Order · {last30d?.unitsSold || 0} Unit
              </p>
              <div className="pt-1 border-t border-[#3D2C24]/10 flex items-center justify-between text-[9px] text-[#6E5A50] font-mono tabular-nums gap-1">
                <span>{last30d?.visits || 0} Kunjungan</span>
                {isProSeller && <span className="font-bold text-[#527362]">PRO 0%</span>}
              </div>
            </div>
          </div>

          {/* Interactive Last 1 Month Chart + Weekly Summary Table */}
          <div className="grid lg:grid-cols-12 gap-3.5 items-start">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-[#3D2C24]/10 p-3.5 sm:p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24] flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-[#527362]" />
                    <span>Grafik Analisa 1 Bulan Terakhir</span>
                  </h3>
                  <p className="text-[10px] text-[#6E5A50]">
                    Periode: {last30d?.rangeLabel || '30 Hari Terakhir'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="flex gap-1 p-0.5 bg-[#FAF6F0] border border-[#3D2C24]/10 rounded-lg">
                    {(
                      [
                        { id: 'daily', label: 'Harian' },
                        { id: 'weekly', label: '4 Pekan' },
                      ] as const
                    ).map((g) => (
                      <button
                        key={g.id}
                        onClick={() => setChartGranularity(g.id)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold cursor-pointer ${
                          chartGranularity === g.id ? 'bg-[#3D2C24] text-[#FAF6F0]' : 'text-[#6E5A50]'
                        }`}
                      >
                        {g.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1 p-0.5 bg-[#F2EAE0] rounded-lg">
                    {(
                      [
                        { id: 'balance', label: 'Penghasilan' },
                        { id: 'orders', label: 'Order' },
                        { id: 'visits', label: 'Kunjungan' },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setChartMetric(m.id)}
                        className={`px-2 py-1 rounded-md text-[10px] font-semibold cursor-pointer ${
                          chartMetric === m.id ? 'bg-white text-[#3D2C24]' : 'text-[#6E5A50]'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 1-Month Bar Visualization */}
              {chartGranularity === 'daily' ? (
                <div className="space-y-1.5">
                  <div className="flex gap-0.5 sm:gap-1 items-end h-36 pt-3 border-b border-[#3D2C24]/10 pb-2">
                    {daily30d.map((d) => {
                      const val =
                        chartMetric === 'balance'
                          ? d.accumulatedBalance
                          : chartMetric === 'orders'
                          ? d.ordersCount
                          : d.visits;
                      const heightPct = val > 0 ? Math.max(10, Math.round((val / maxChartVal) * 100)) : 5;
                      const netShare =
                        chartMetric === 'balance' && val > 0 ? Math.round((d.sellerNetIncome / val) * 100) : 100;
                      return (
                        <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center h-full justify-end">
                          <div
                            className="w-full rounded-t bg-[#F2EAE0] flex flex-col justify-end overflow-hidden transition-all"
                            style={{ height: `${heightPct}%` }}
                            title={`${d.label}: ${chartMetric === 'balance' ? formatMoney(val) : `${val}`}`}
                          >
                            {chartMetric === 'balance' ? (
                              <>
                                <div className="w-full bg-[#E07A5F]" style={{ height: `${100 - netShare}%` }} />
                                <div className="w-full bg-[#6B8E7B]" style={{ height: `${netShare}%` }} />
                              </>
                            ) : (
                              <div className="w-full h-full bg-[#6B8E7B]" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-[#6E5A50] px-0.5">
                    <span>{daily30d[0]?.label || ''}</span>
                    <span>{daily30d[Math.floor(daily30d.length / 3)]?.label || ''}</span>
                    <span>{daily30d[Math.floor((daily30d.length * 2) / 3)]?.label || ''}</span>
                    <span>{daily30d[daily30d.length - 1]?.label || ''}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-3 items-end h-36 pt-3 border-b border-[#3D2C24]/10 pb-2">
                  {weekly1m.map((w) => {
                    const val =
                      chartMetric === 'balance'
                        ? w.accumulatedBalance
                        : chartMetric === 'orders'
                        ? w.ordersCount
                        : w.visits;
                    const heightPct = val > 0 ? Math.max(12, Math.round((val / maxChartVal) * 100)) : 5;
                    const netShare =
                      chartMetric === 'balance' && val > 0 ? Math.round((w.sellerNetIncome / val) * 100) : 100;
                    return (
                      <div key={w.week} className="flex flex-col items-center gap-1 h-full justify-end">
                        <span className="font-mono tabular-nums text-[10px] font-semibold text-[#3D2C24] text-center truncate max-w-full">
                          {chartMetric === 'balance'
                            ? hideBalance
                              ? '•••'
                              : val >= 1000
                              ? `${Math.round(val / 1000)}rb`
                              : val
                            : val}
                        </span>
                        <div
                          className="w-full max-w-[40px] rounded-t-lg overflow-hidden bg-[#F2EAE0] flex flex-col justify-end transition-all"
                          style={{ height: `${heightPct}%` }}
                          title={`${w.label} (${w.dateRange}): ${
                            chartMetric === 'balance' ? formatMoney(val) : `${val}`
                          }`}
                        >
                          {chartMetric === 'balance' ? (
                            <>
                              <div className="w-full bg-[#E07A5F]" style={{ height: `${100 - netShare}%` }} />
                              <div className="w-full bg-[#6B8E7B]" style={{ height: `${netShare}%` }} />
                            </>
                          ) : (
                            <div className="w-full h-full bg-[#6B8E7B]" />
                          )}
                        </div>
                        <div className="text-center">
                          <span className="block text-[10px] font-semibold text-[#3D2C24]">{w.label}</span>
                          <span className="block text-[9px] text-[#6E5A50] whitespace-nowrap">{w.dateRange}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {chartMetric === 'balance' && (
                <div className="flex flex-wrap items-center gap-4 text-[10px] text-[#6E5A50]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#6B8E7B]" />
                    <span>Produk Bersih</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-[#E07A5F]" />
                    <span>Komisi Affiliate</span>
                  </span>
                </div>
              )}

              {/* Compact 4-Week Breakdown Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] text-left">
                  <thead>
                    <tr className="border-b border-[#3D2C24]/10 text-[#6E5A50]">
                      <th className="py-1.5 pr-2 font-semibold">Periode</th>
                      <th className="py-1.5 px-1.5 font-semibold text-right">Net Produk</th>
                      <th className="py-1.5 px-1.5 font-semibold text-right">Fee</th>
                      <th className="py-1.5 px-1.5 font-semibold text-right">Aff</th>
                      <th className="py-1.5 pl-1.5 font-semibold text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3D2C24]/8">
                    {weekly1m.map((w) => (
                      <tr key={w.week}>
                        <td className="py-1.5 pr-2">
                          <span className="font-medium text-[#3D2C24]">{w.label}</span>
                          <span className="text-[10px] text-[#6E5A50] ml-1">{w.dateRange}</span>
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#3D2C24]">
                          {formatMoney(w.sellerNetIncome)}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#6E5A50]">
                          {formatMoney(w.platformFee || 0)}
                        </td>
                        <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#E07A5F]">
                          {formatMoney(w.affiliateCommission)}
                        </td>
                        <td className="py-1.5 pl-1.5 text-right font-mono tabular-nums font-semibold text-[#527362]">
                          {formatMoney(w.accumulatedBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#3D2C24]/15 bg-[#EFF5F1]/60 font-semibold">
                      <td className="py-1.5 pr-2 text-[#527362]">1 Bulan</td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums">
                        {formatMoney(last30d?.sellerNetIncome || 0)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#6E5A50]">
                        {formatMoney(last30d?.platformFee || 0)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#E07A5F]">
                        {formatMoney(last30d?.affiliateCommission || 0)}
                      </td>
                      <td className="py-1.5 pl-1.5 text-right font-mono tabular-nums text-[#527362]">
                        {formatMoney(last30d?.accumulatedBalance || 0)}
                      </td>
                    </tr>
                    <tr className="border-t border-[#3D2C24]/15 bg-[#FAF6F0] font-semibold">
                      <td className="py-1.5 pr-2 text-[#3D2C24]">Lifetime</td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums">
                        {formatMoney(lifetime?.sellerNetIncome || 0)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#6E5A50]">
                        {formatMoney(lifetime?.platformFee || 0)}
                      </td>
                      <td className="py-1.5 px-1.5 text-right font-mono tabular-nums text-[#E07A5F]">
                        {formatMoney(lifetime?.affiliateCommission || 0)}
                      </td>
                      <td className="py-1.5 pl-1.5 text-right font-mono tabular-nums text-[#3D2C24]">
                        {formatMoney(lifetime?.accumulatedBalance || 0)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Right Column: Compact Income Summary & Top Products */}
            <div className="lg:col-span-5 space-y-3">
              <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-3 space-y-2">
                <h4 className="text-xs font-semibold text-[#3D2C24] flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-[#527362]" />
                  <span>Ringkasan Omzet</span>
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-[#FAF6F0]">
                    <p className="text-[10px] text-[#6E5A50]">Omzet 1 Bulan</p>
                    <p className="font-mono tabular-nums text-xs font-bold text-[#3D2C24] mt-0.5">
                      {formatMoney(last30d?.grossRevenue || 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-[#FAF6F0]">
                    <p className="text-[10px] text-[#6E5A50]">Omzet Lifetime</p>
                    <p className="font-mono tabular-nums text-xs font-bold text-[#3D2C24] mt-0.5">
                      {formatMoney(lifetime?.grossRevenue || 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-[#EFF5F1]">
                    <p className="text-[10px] text-[#527362]">Biaya Layanan</p>
                    <p className="font-mono tabular-nums text-xs font-bold text-[#527362] mt-0.5">
                      {isProSeller ? '0% (WD.UP PRO)' : formatMoney(lifetime?.platformFee || 0)}
                    </p>
                  </div>
                  <div className="p-2 rounded-xl bg-[#FDF8EC]">
                    <p className="text-[10px] text-[#8A6112]">Komisi Aff Lifetime</p>
                    <p className="font-mono tabular-nums text-xs font-bold text-[#8A6112] mt-0.5">
                      {formatMoney(lifetime?.affiliateCommission || 0)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-3.5 space-y-2">
                <h4 className="text-xs font-semibold text-[#3D2C24]">Produk Terlaris Toko</h4>
                {(analytics.topProducts || []).length === 0 ? (
                  <p className="text-xs text-[#6E5A50]">Belum ada produk sendiri yang diterbitkan.</p>
                ) : (
                  <div className="divide-y divide-[#3D2C24]/10">
                    {analytics.topProducts.map((tp) => (
                      <div key={tp.id} className="py-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="font-medium text-[#3D2C24] truncate">{tp.title}</span>
                        <span className="font-mono tabular-nums text-[10px] text-[#6E5A50] shrink-0">
                          {tp.sales_count} terjual · {tp.clicks_count} klik
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. OWN PRODUCT MANAGEMENT */}
      {subTab === 'products' && (
        <div className="grid lg:grid-cols-12 gap-5 items-start">
          <form
            onSubmit={handleSaveProduct}
            className="lg:col-span-5 bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-[#3D2C24] flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-[#527362]" />
                <span>{editingProductId ? 'Edit Produk & Akses' : 'Tambah Produk Baru'}</span>
              </h3>
              {editingProductId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingProductId(null);
                    setNewProd(emptyProductForm());
                    setCoverQuotaError('');
                  }}
                  className="text-[11px] font-semibold text-[#E07A5F] inline-flex items-center gap-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Batal Edit</span>
                </button>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-[#6E5A50] mb-1">Judul Produk / Jasa *</label>
              <input
                type="text"
                required
                value={newProd.title}
                onChange={(e) => setNewProd({ ...newProd, title: e.target.value })}
                placeholder="Contoh: Template Notion Content Planner 2026"
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] text-[#6E5A50] mb-1">Kategori Produk</label>
              <select
                value={newProd.category}
                onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                className="w-full px-2.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              >
                {MARKET_CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* AI Creator WD.UP — Khusus Seller PRO */}
            <div className="p-3 rounded-xl bg-gradient-to-br from-[#3D2C24] to-[#2B1F19] text-[#FAF6F0] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Wand2 className="w-3.5 h-3.5 text-[#F3C669]" />
                  <span className="text-[11px] font-bold">AI Creator WD.UP</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#F3C669] text-[#3D2C24] text-[9px] font-bold inline-flex items-center gap-0.5">
                    <Crown className="w-2.5 h-2.5" />
                    <span>PRO</span>
                  </span>
                </div>
                {isProSeller ? (
                  <button
                    type="button"
                    onClick={() => setShowAiCreator((v) => !v)}
                    className="text-[10px] font-semibold text-[#F3C669] hover:underline cursor-pointer"
                  >
                    {showAiCreator ? 'Tutup AI' : 'Buka AI Creator'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAccountSubView('overview')}
                    className="px-2 py-0.5 rounded-md bg-[#F3C669] text-[#3D2C24] text-[10px] font-bold cursor-pointer"
                  >
                    Aktifkan PRO
                  </button>
                )}
              </div>

              {!isProSeller ? (
                <p className="text-[10px] text-[#FAF6F0]/80 leading-relaxed flex items-start gap-1.5">
                  <Lock className="w-3 h-3 text-[#F3C669] shrink-0 mt-0.5" />
                  <span>
                    Susun judul menarik, deskripsi produk menjual, poin manfaat, hingga copy promosi otomatis dengan AI Creator khusus Seller WD.UP Pro.
                  </span>
                </p>
              ) : showAiCreator ? (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap gap-1">
                    {AI_CREATOR_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAiMode(m)}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold cursor-pointer ${
                          aiMode === m
                            ? 'bg-[#F3C669] text-[#3D2C24]'
                            : 'bg-white/10 text-[#FAF6F0]/85 hover:bg-white/15'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Topik / target pembeli (kosong = pakai judul produk)"
                      className="flex-1 px-2.5 py-1.5 rounded-lg bg-white/10 border border-white/15 text-[11px] text-white placeholder:text-white/50"
                    />
                    <button
                      type="button"
                      disabled={aiLoading}
                      onClick={() => void handleRunAiCreator()}
                      className="px-3 py-1.5 rounded-lg bg-[#F3C669] hover:bg-[#eab853] text-[#3D2C24] text-[11px] font-bold cursor-pointer disabled:opacity-60 whitespace-nowrap"
                    >
                      {aiLoading ? 'Menulis...' : 'Buat Ide'}
                    </button>
                  </div>
                  {aiOutput && (
                    <div className="p-2.5 rounded-lg bg-white/10 border border-white/15 space-y-2">
                      <pre className="whitespace-pre-wrap font-sans text-[11px] text-[#FAF6F0]/95 leading-relaxed max-h-40 overflow-y-auto">
                        {aiOutput}
                      </pre>
                      <div className="flex flex-wrap gap-1.5 pt-1 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => {
                            setNewProd((prev) => ({ ...prev, description: aiOutput }));
                            toast('Hasil AI diterapkan ke Deskripsi Produk.', 'sage');
                          }}
                          className="px-2 py-1 rounded-md bg-[#6B8E7B] text-white text-[10px] font-semibold cursor-pointer"
                        >
                          Pakai di Deskripsi
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const firstLine =
                              aiOutput
                                .split('\n')
                                .map((l) => l.replace(/^[\d.*#\-\s]+/, '').trim())
                                .find((l) => l.length > 3) || '';
                            if (firstLine) {
                              setNewProd((prev) => ({ ...prev, title: firstLine.slice(0, 120) }));
                              toast('Baris pertama diterapkan ke Judul Produk.', 'sage');
                            }
                          }}
                          className="px-2 py-1 rounded-md bg-white/15 text-[#FAF6F0] text-[10px] font-semibold cursor-pointer"
                        >
                          Jadikan Judul
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[10px] text-[#FAF6F0]/75">
                  Klik &ldquo;Buka AI Creator&rdquo; untuk membuat judul, deskripsi menjual, dan copy promosi produk.
                </p>
              )}
            </div>

            {/* Pengaturan Harga: Harga Tetap / Bayar Suka-Suka / Bayar Suka-Suka Min (PRO) */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2.5">
              <span className="block text-[11px] font-semibold text-[#3D2C24]">Skema Harga Produk *</span>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  type="button"
                  onClick={() => setNewProd((prev) => ({ ...prev, pricing_mode: 'fixed' }))}
                  className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                    newProd.pricing_mode === 'fixed'
                      ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                      : 'bg-white text-[#3D2C24] border-[#3D2C24]/12'
                  }`}
                >
                  <p className="text-[10px] font-bold leading-tight">Harga Tetap</p>
                  <p className={`text-[9px] mt-0.5 ${newProd.pricing_mode === 'fixed' ? 'text-white/75' : 'text-[#6E5A50]'}`}>
                    Nominal pasti
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setNewProd((prev) => ({ ...prev, pricing_mode: 'pwyw', has_promo: false }))}
                  className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                    newProd.pricing_mode === 'pwyw'
                      ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                      : 'bg-white text-[#3D2C24] border-[#3D2C24]/12'
                  }`}
                >
                  <p className="text-[10px] font-bold leading-tight">Bayar Suka-Suka</p>
                  <p className={`text-[9px] mt-0.5 ${newProd.pricing_mode === 'pwyw' ? 'text-white/75' : 'text-[#6E5A50]'}`}>
                    Bebas nominal
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isProSeller) {
                      toast('Bayar Suka-Suka dengan Minimal Harga adalah fitur eksklusif Seller WD.UP Pro.', 'coral');
                      return;
                    }
                    setNewProd((prev) => ({ ...prev, pricing_mode: 'pwyw_min', has_promo: false }));
                  }}
                  className={`p-2 rounded-lg border text-left transition-colors cursor-pointer ${
                    newProd.pricing_mode === 'pwyw_min'
                      ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                      : 'bg-white text-[#3D2C24] border-[#3D2C24]/12'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-[10px] font-bold leading-tight">Suka-Suka Min.</p>
                    <Crown className="w-3 h-3 text-[#E07A5F] shrink-0" />
                  </div>
                  <p className={`text-[9px] mt-0.5 ${newProd.pricing_mode === 'pwyw_min' ? 'text-white/75' : 'text-[#6E5A50]'}`}>
                    PRO · Ada batas min
                  </p>
                </button>
              </div>

              {newProd.pricing_mode === 'fixed' && (
                <>
                  <div className="flex items-center justify-end">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#E07A5F] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newProd.has_promo}
                        onChange={(e) =>
                          setNewProd((prev) => ({
                            ...prev,
                            has_promo: e.target.checked,
                            promo_price:
                              e.target.checked && prev.promo_price >= prev.base_price
                                ? Math.max(1000, Math.round(prev.base_price * 0.8))
                                : prev.promo_price,
                          }))
                        }
                        className="accent-[#E07A5F]"
                      />
                      <span>Aktifkan Harga Promo</span>
                    </label>
                  </div>

                  <div className={`grid ${newProd.has_promo ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
                    <div>
                      <label className="block text-[10px] text-[#6E5A50] mb-1">
                        {newProd.has_promo ? 'Harga Awal (Coret) Rp' : 'Harga Jual (Rp)'}
                      </label>
                      <input
                        type="number"
                        min={1000}
                        required
                        value={newProd.base_price}
                        onChange={(e) => setNewProd({ ...newProd, base_price: Number(e.target.value) })}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-mono"
                      />
                    </div>
                    {newProd.has_promo && (
                      <div>
                        <label className="block text-[10px] text-[#E07A5F] font-semibold mb-1">Harga Promo (Rp)</label>
                        <input
                          type="number"
                          min={1000}
                          required
                          value={newProd.promo_price}
                          onChange={(e) => setNewProd({ ...newProd, promo_price: Number(e.target.value) })}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-[#E07A5F]/40 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                  {newProd.has_promo && (
                    <p className="text-[10px] text-[#527362] font-medium">
                      {promoDiscountPct > 0
                        ? `Diskon ${promoDiscountPct}% · Pembeli membayar ${formatRupiah(newProd.promo_price)}`
                        : 'Masukkan harga promo lebih rendah dari harga awal.'}
                    </p>
                  )}
                </>
              )}

              {newProd.pricing_mode === 'pwyw' && (
                <p className="text-[11px] text-[#527362] bg-[#EFF5F1] rounded-lg px-2.5 py-2">
                  Pembeli dapat memasukkan nominal pembayaran bebas sesuai keinginan saat checkout (minimal sistem Rp 1.000).
                </p>
              )}

              {newProd.pricing_mode === 'pwyw_min' && (
                <div className="space-y-1">
                  <label className="block text-[10px] font-semibold text-[#3D2C24]">
                    Nominal Minimal Pembayaran (Rp) *
                  </label>
                  <input
                    type="number"
                    min={1000}
                    required
                    value={newProd.min_price}
                    onChange={(e) => setNewProd({ ...newProd, min_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#6B8E7B] text-xs font-mono"
                  />
                  <p className="text-[10px] text-[#6E5A50]">
                    Pembeli dapat membayar minimal {formatRupiah(newProd.min_price || 1000)} atau lebih sesuai apresiasi.
                  </p>
                </div>
              )}
            </div>

            {/* Add-On Produk (Judul, Link, Harga saja) */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="block text-[11px] font-semibold text-[#3D2C24]">Add-On Produk (Opsional)</span>
                  <p className="text-[9.5px] text-[#6E5A50]">
                    Tambahan berbayar yang bisa dicentang pembeli (Judul, Link Akses, Harga).
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddAddonRow}
                  className="px-2.5 py-1 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add-On</span>
                </button>
              </div>
              {newProd.addons.length > 0 && (
                <div className="space-y-2">
                  {newProd.addons.map((addon, idx) => (
                    <div
                      key={addon.id}
                      className="p-2.5 rounded-xl bg-white border border-[#3D2C24]/10 space-y-1.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={addon.title}
                          onChange={(e) => handleUpdateAddonRow(idx, { title: e.target.value })}
                          placeholder="Judul Add-On (mis. Template Bonus Canva)"
                          className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveAddonRow(idx)}
                          className="p-1.5 rounded-lg text-[#E07A5F] hover:bg-[#E07A5F]/10 cursor-pointer"
                          aria-label="Hapus add-on"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-12 gap-1.5">
                        <input
                          type="url"
                          value={addon.link || ''}
                          onChange={(e) => handleUpdateAddonRow(idx, { link: e.target.value })}
                          placeholder="Link Akses (https://...)"
                          className="col-span-7 px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-[11px]"
                        />
                        <input
                          type="number"
                          min={0}
                          value={addon.price}
                          onChange={(e) => handleUpdateAddonRow(idx, { price: Number(e.target.value) })}
                          placeholder="Harga Rp"
                          className="col-span-5 px-2.5 py-1.5 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-[11px] font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Kuota Batas & Komisi Affiliate */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-[#6E5A50] mb-1">Kuota Batas (Opsional)</label>
                <input
                  type="number"
                  min={1}
                  value={newProd.quota_limit}
                  onChange={(e) => setNewProd({ ...newProd, quota_limit: e.target.value })}
                  placeholder="Tanpa batas"
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#6E5A50] mb-1">Komisi Affiliate (%)</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={newProd.affiliate_commission_pct}
                  onChange={(e) => setNewProd({ ...newProd, affiliate_commission_pct: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
            </div>

            {/* Cover Image + Bentuk Cover (dengan pilihan PRO) */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-[#3D2C24]">
                  Gambar Sampul & Bentuk Cover
                </label>
                <div className="flex items-center gap-2.5">
                  <label className="text-[11px] font-semibold text-[#527362] cursor-pointer hover:underline">
                    Unggah Gambar
                    <input type="file" accept="image/*" onChange={handleProductCoverUpload} className="hidden" />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setNewProd((prev) => ({ ...prev, image_url: '' }));
                      setCoverQuotaError('');
                    }}
                    className="text-[11px] font-semibold text-[#6E5A50] hover:text-[#3D2C24] underline cursor-pointer"
                  >
                    Tanpa Gambar
                  </button>
                </div>
              </div>
              {newProd.image_url && (
                <div className="flex items-center gap-3 p-2 rounded-lg bg-white border border-[#3D2C24]/10">
                  <div className="w-16 shrink-0 flex items-center justify-center">
                    {(() => {
                      const cover = getCoverShapeClasses(newProd.cover_shape);
                      return (
                        <div className={`w-full ${cover.wrapper}`}>
                          <SafeImage src={newProd.image_url} alt="Sampul Produk" className={cover.image} />
                        </div>
                      );
                    })()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-[#527362]">
                      {newProd.image_url.startsWith('data:') ? 'Gambar sampul terpasang' : 'Link gambar sampul aktif'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewProd((prev) => ({ ...prev, image_url: '' }));
                        setCoverQuotaError('');
                      }}
                      className="text-[10px] font-semibold text-[#E07A5F] hover:underline cursor-pointer"
                    >
                      Hapus Gambar Sampul
                    </button>
                  </div>
                </div>
              )}
              {coverQuotaError && (
                <div className="p-2 rounded-lg bg-[#FDECEC] border border-[#E07A5F]/40 text-[10px] text-[#9A3412] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#E07A5F]" />
                  <span>{coverQuotaError}</span>
                </div>
              )}
              <input
                type="url"
                value={newProd.image_url.startsWith('data:') ? '' : newProd.image_url}
                onChange={(e) => {
                  setCoverQuotaError('');
                  setNewProd({ ...newProd, image_url: e.target.value });
                }}
                placeholder={
                  newProd.image_url.startsWith('data:')
                    ? 'Atau tempel URL baru untuk mengganti (https://...)'
                    : 'Kosongkan untuk produk tanpa gambar, atau tempel https://... link gambar'
                }
                className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#3D2C24]/15 text-[11px]"
              />

              {/* Pilihan Bentuk Cover */}
              <div className="space-y-1 pt-1">
                <span className="block text-[10px] font-semibold text-[#6E5A50]">Bentuk Cover</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {PRODUCT_COVER_SHAPES.map((shape) => {
                    const active = newProd.cover_shape === shape.id;
                    const locked = shape.proOnly && !isProSeller;
                    return (
                      <button
                        key={shape.id}
                        type="button"
                        onClick={() => {
                          if (locked) {
                            toast(`Bentuk cover "${shape.label}" eksklusif untuk Seller WD.UP Pro.`, 'coral');
                            return;
                          }
                          setNewProd((prev) => ({ ...prev, cover_shape: shape.id }));
                        }}
                        className={`p-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                            : locked
                            ? 'bg-white/60 text-[#6E5A50] border-[#3D2C24]/10'
                            : 'bg-white text-[#3D2C24] border-[#3D2C24]/12 hover:border-[#6B8E7B]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold truncate">{shape.label}</span>
                          {shape.proOnly && (
                            <span
                              className={`px-1 py-0.5 rounded text-[8px] font-bold inline-flex items-center gap-0.5 shrink-0 ${
                                active ? 'bg-[#F3C669] text-[#3D2C24]' : 'bg-[#3D2C24] text-[#F3C669]'
                              }`}
                            >
                              <Crown className="w-2 h-2" />
                              <span>PRO</span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Pilihan Teks Tombol Beli (Preset + Edit Sendiri PRO) */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2">
              <span className="block text-[11px] font-semibold text-[#3D2C24]">Teks Tombol Beli</span>
              <div className="flex flex-wrap gap-1.5">
                {PRODUCT_CTA_PRESETS.map((preset) => {
                  const active = !newProd.custom_cta_mode && newProd.cta_label === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() =>
                        setNewProd((prev) => ({ ...prev, custom_cta_mode: false, cta_label: preset }))
                      }
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                        active
                          ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                          : 'bg-white text-[#3D2C24] border-[#3D2C24]/15 hover:border-[#6B8E7B]'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    if (!isProSeller) {
                      toast('Teks tombol beli kustom (edit sendiri) adalah fitur eksklusif Seller WD.UP Pro.', 'coral');
                      return;
                    }
                    setNewProd((prev) => ({ ...prev, custom_cta_mode: true }));
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border inline-flex items-center gap-1 cursor-pointer ${
                    newProd.custom_cta_mode
                      ? 'bg-[#3D2C24] text-[#F3C669] border-[#3D2C24]'
                      : 'bg-white text-[#3D2C24] border-[#3D2C24]/15'
                  }`}
                >
                  <Crown className="w-2.5 h-2.5 text-[#E07A5F]" />
                  <span>Edit Sendiri (PRO)</span>
                </button>
              </div>
              {newProd.custom_cta_mode && isProSeller && (
                <input
                  type="text"
                  maxLength={32}
                  value={newProd.cta_label}
                  onChange={(e) => setNewProd({ ...newProd, cta_label: e.target.value })}
                  placeholder="Contoh: Miliki Sekarang / Checkout Kilat"
                  className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#6B8E7B] text-xs"
                />
              )}
            </div>

            {/* Custom Formatted Description */}
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <label className="text-[11px] font-semibold text-[#3D2C24]">
                  Deskripsi Kustom Produk (Opsional)
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => appendDescSnippet('**Sorotan Utama**')}
                    className="px-1.5 py-0.5 rounded bg-[#F2EAE0] text-[10px] font-semibold text-[#3D2C24] cursor-pointer"
                  >
                    + Tebal
                  </button>
                  <button
                    type="button"
                    onClick={() => appendDescSnippet('- Poin keunggulan produk')}
                    className="px-1.5 py-0.5 rounded bg-[#F2EAE0] text-[10px] font-semibold text-[#3D2C24] cursor-pointer"
                  >
                    + Poin
                  </button>
                </div>
              </div>
              <textarea
                rows={3}
                value={newProd.description}
                onChange={(e) => setNewProd({ ...newProd, description: e.target.value })}
                placeholder="Bisa kosong saat input cepat. Gunakan **teks tebal** dan - poin untuk deskripsi terstruktur..."
                className="w-full p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>

            {/* Landing Page Link & Custom HTML/CSS Coding Editor per Produk (PRO) */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5 text-[#527362]" />
                  <span>Landing Page & Coding Produk</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (!isProSeller) {
                      toast('Editor Coding HTML/CSS Landing Page adalah fitur eksklusif Seller WD.UP Pro.', 'coral');
                      return;
                    }
                    setShowProdCodeEditor((v) => !v);
                  }}
                  className="text-[10px] font-semibold text-[#527362] hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Crown className="w-3 h-3 text-[#E07A5F]" />
                  <span>{showProdCodeEditor && isProSeller ? 'Tutup Editor HTML' : '+ Code HTML/CSS (PRO)'}</span>
                </button>
              </div>
              <input
                type="url"
                value={newProd.landing_page_url}
                onChange={(e) => setNewProd({ ...newProd, landing_page_url: e.target.value })}
                placeholder="Link Landing Page Eksternal (https://... Opsional)"
                className="w-full px-3 py-1.5 rounded-xl bg-white border border-[#3D2C24]/15 text-xs"
              />
              {showProdCodeEditor && isProSeller && (
                <div className="space-y-2 pt-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setNewProd((prev) => ({
                          ...prev,
                          custom_landing_html: STARTER_PRODUCT_HTML,
                        }))
                      }
                      className="text-[10px] font-semibold text-[#527362] hover:underline cursor-pointer"
                    >
                      + Sisipkan Template HTML
                    </button>
                    <label className="text-[10px] font-semibold text-[#3D2C24] bg-white border border-[#3D2C24]/15 px-2 py-0.5 rounded-md inline-flex items-center gap-1 cursor-pointer hover:bg-[#F2EAE0]">
                      <ImageIcon className="w-3 h-3 text-[#527362]" />
                      <span>+ Upload Gambar ke HTML</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleInsertLandingHtmlImageUpload('product', e)}
                        className="hidden"
                      />
                    </label>
                    {newProd.custom_landing_html.trim() && (
                      <button
                        type="button"
                        onClick={() => setProdPreviewModal(true)}
                        className="text-[10px] font-semibold text-[#E07A5F] inline-flex items-center gap-1 hover:underline cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Pratinjau</span>
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="url"
                      value={prodHtmlImgUrl}
                      onChange={(e) => setProdHtmlImgUrl(e.target.value)}
                      placeholder="Atau sisipkan link gambar (https://...)"
                      className="flex-1 px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[10px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleInsertLandingHtmlImageUrl('product')}
                      className="px-2 py-1 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[10px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      Sisipkan Link
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={newProd.custom_landing_html}
                    onChange={(e) => setNewProd({ ...newProd, custom_landing_html: e.target.value })}
                    placeholder="<section><h2>Penawaran Spesial...</h2></section>"
                    className="w-full p-2 rounded-xl bg-white border border-[#3D2C24]/15 text-[11px] font-mono"
                  />
                </div>
              )}
            </div>

            {/* Akses Produk: Link / PDF / Gambar / Video */}
            <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2.5">
              <label className="block text-[11px] font-semibold text-[#3D2C24]">
                Link / File Akses Produk (PDF, Gambar, Video, Link) *
              </label>

              <div className="grid grid-cols-4 gap-1 p-1 bg-white rounded-lg border border-[#3D2C24]/10">
                {accessTypeOptions.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setNewProd((prev) => ({ ...prev, access_type: id }))}
                    className={`py-1.5 px-1.5 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1 cursor-pointer ${
                      newProd.access_type === id ? 'bg-[#3D2C24] text-[#FAF6F0]' : 'text-[#6E5A50]'
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[10px] text-[#6E5A50] mb-1">
                  Link Akses ({currentAccessMeta.label} Eksternal — atau unggah file di bawah)
                </label>
                <input
                  type="url"
                  value={newProd.access_url}
                  onChange={(e) => setNewProd({ ...newProd, access_url: e.target.value })}
                  placeholder={currentAccessMeta.placeholder}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-xs"
                />
              </div>

              {newProd.access_type !== 'link' && (
                <div className="space-y-1">
                  <label className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-dashed border-[#3D2C24]/25 bg-white cursor-pointer hover:bg-[#F2EAE0]/50 text-[11px] font-medium text-[#3D2C24]">
                    <Upload className="w-3.5 h-3.5 text-[#527362]" />
                    <span className="truncate">
                      {newProd.access_file_name
                        ? `Terpilih: ${newProd.access_file_name}`
                        : `Unggah File ${currentAccessMeta.label} (maks 10 MB)`}
                    </span>
                    <input
                      type="file"
                      accept={currentAccessMeta.accept}
                      onChange={handleAccessFileUpload}
                      className="hidden"
                    />
                  </label>
                  {(newProd.access_file_data || newProd.access_file_name) && (
                    <button
                      type="button"
                      onClick={() => setNewProd((prev) => ({ ...prev, access_file_data: '', access_file_name: '' }))}
                      className="text-[10px] text-[#E07A5F] hover:underline cursor-pointer"
                    >
                      Hapus lampiran file
                    </button>
                  )}
                </div>
              )}

              <textarea
                rows={2}
                value={newProd.delivery_content}
                onChange={(e) => setNewProd({ ...newProd, delivery_content: e.target.value })}
                placeholder="Catatan akses tambahan (misal kode lisensi / instruksi penggunaan setelah Paid)"
                className="w-full p-2 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px]"
              />
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newProd.affiliate_enabled}
                  onChange={(e) => setNewProd({ ...newProd, affiliate_enabled: e.target.checked })}
                />
                <span>Buka Program Affiliate</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingProduct}
              className="w-full py-2.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              {savingProduct ? (
                <span>Menyinkronkan & Menerbitkan...</span>
              ) : editingProductId ? (
                <span>Simpan & Sinkronkan Produk</span>
              ) : (
                <span>Terbitkan Produk</span>
              )}
            </button>
          </form>

          <div className="lg:col-span-7 space-y-2.5">
            {(data.ownProducts || []).length === 0 ? (
              <div className="p-6 text-center bg-white rounded-2xl border border-[#3D2C24]/10 text-xs text-[#6E5A50]">
                Belum ada produk sendiri. Anda dapat menerbitkan produk cepat (Judul + Harga + Akses saja tanpa gambar)
                atau menambah produk di tab Affiliate.
              </div>
            ) : (
              (data.ownProducts || []).map((p) => {
                const priceInfo = getProductPriceSummary(p);
                const cover = getCoverShapeClasses(p.cover_shape);
                const remaining =
                  p.quota_limit !== null && p.quota_limit !== undefined
                    ? Math.max(0, p.quota_limit - (p.sales_count || 0))
                    : null;
                const isHiddenSeller = Number(p.hidden_by_seller || 0) === 1;
                const isHiddenAdmin = Number(p.hidden_by_admin || 0) === 1;
                const addonsCount = p.addons?.length || 0;
                return (
                  <div
                    key={p.id}
                    className={`p-3.5 rounded-2xl bg-white border flex items-start justify-between gap-3 ${
                      isHiddenAdmin || isHiddenSeller
                        ? 'border-[#E07A5F]/40 bg-[#FAF6F0]/60'
                        : 'border-[#3D2C24]/10'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      {p.image_url && (
                        <div className="w-14 shrink-0">
                          <div className={`w-full ${cover.wrapper}`}>
                            <SafeImage src={p.image_url} alt={p.title} className={cover.image} />
                          </div>
                        </div>
                      )}
                      <div className="min-w-0 space-y-0.5 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[10px] text-[#6E5A50]">
                            {p.category} · Akses {(p.access_type || 'link').toUpperCase()} ·{' '}
                            {p.affiliate_enabled ? `Affiliate ${p.affiliate_commission_pct}%` : 'Non-Affiliate'}
                          </p>
                          {isHiddenSeller && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FDF8EC] border border-[#F3C669] text-[9px] font-bold text-[#8A6112]">
                              Disembunyikan Anda
                            </span>
                          )}
                          {isHiddenAdmin && (
                            <span className="px-1.5 py-0.5 rounded bg-[#FDECEC] border border-[#E07A5F]/40 text-[9px] font-bold text-[#9A3412]">
                              Disembunyikan WD.UP
                            </span>
                          )}
                        </div>
                        <h4 className="text-xs sm:text-sm font-semibold text-[#3D2C24] truncate">{p.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {!priceInfo.isPwyw && priceInfo.secondary && (
                            <span className="font-mono line-through text-[#6E5A50]">{priceInfo.secondary}</span>
                          )}
                          <span className="font-mono font-bold text-[#527362]">{priceInfo.primary}</span>
                          {priceInfo.isPwyw && priceInfo.secondary && (
                            <span className="text-[10px] text-[#6E5A50]">({priceInfo.secondary})</span>
                          )}
                          {addonsCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-[#EFF5F1] text-[10px] font-semibold text-[#527362]">
                              +{addonsCount} Add-On
                            </span>
                          )}
                          <span className="text-[10px] text-[#6E5A50]">
                            Tombol: &ldquo;{getProductCtaLabel(p)}&rdquo;
                          </span>
                        </div>
                        <p className="text-[10px] text-[#6E5A50]">
                          {p.sales_count} terjual ·{' '}
                          {remaining === null ? 'Kuota tanpa batas' : `Sisa kuota ${remaining}/${p.quota_limit}`}
                        </p>
                        {p.description && <FormattedDescription text={p.description} />}
                        {p.landing_page_url && /^https?:\/\//i.test(p.landing_page_url) && (
                          <a
                            href={p.landing_page_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#527362] hover:underline pt-0.5"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span className="truncate max-w-xs">{p.landing_page_url}</span>
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={togglingVisibilityId === p.id}
                        onClick={() => void handleToggleProductVisibility(p)}
                        className={`p-2 rounded-lg cursor-pointer ${
                          isHiddenSeller
                            ? 'text-[#8A6112] bg-[#FDF8EC] hover:bg-[#F3C669]/30'
                            : 'text-[#6E5A50] hover:bg-[#FAF6F0]'
                        }`}
                        aria-label={isHiddenSeller ? 'Tampilkan produk' : 'Sembunyikan produk'}
                        title={isHiddenSeller ? 'Tampilkan kembali ke publik' : 'Sembunyikan dari publik'}
                      >
                        {isHiddenSeller ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => startEditProduct(p)}
                        className="p-2 rounded-lg text-[#527362] hover:bg-[#6B8E7B]/10 cursor-pointer"
                        aria-label="Edit produk"
                        title="Edit produk & akses"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="p-2 rounded-lg text-[#E07A5F] hover:bg-[#E07A5F]/10 cursor-pointer"
                        aria-label="Hapus produk"
                        title="Hapus produk"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 3. AFFILIATE ECOSYSTEM (OWN EXTERNAL LINKS + WD.UP CATALOG SEAMLESSLY DISPLAYED ON STORE) */}
      {subTab === 'affiliate' && (
        <div className="space-y-4">
          {/* Form Tambah Produk Affiliate Link Sendiri */}
          <form
            onSubmit={handleAddExternalAffiliate}
            className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-3"
          >
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24]">
                Tambah Produk Affiliate Sendiri (Link Eksternal)
              </h3>
              <p className="text-[11px] text-[#6E5A50]">
                Produk ini akan tampil menyatu di etalase toko Anda tanpa label affiliate agar terlihat seperti katalog toko Anda sendiri.
              </p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                required
                placeholder="Nama Produk Affiliate *"
                value={extAffForm.title}
                onChange={(e) => setExtAffForm({ ...extAffForm, title: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <select
                value={extAffForm.category}
                onChange={(e) => setExtAffForm({ ...extAffForm, category: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              >
                {MARKET_CATEGORIES.filter((c) => c !== 'Semua').map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                required
                placeholder="Harga Tampil (Rp) *"
                value={extAffForm.price}
                onChange={(e) => setExtAffForm({ ...extAffForm, price: Number(e.target.value) })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
              />
              <input
                type="url"
                required
                placeholder="Link Affiliate (https://shopee.co.id/... atau link lainnya) *"
                value={extAffForm.affiliate_url}
                onChange={(e) => setExtAffForm({ ...extAffForm, affiliate_url: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs sm:col-span-2"
              />
              <input
                type="url"
                placeholder="Link Gambar Produk (Opsional)"
                value={extAffForm.image_url}
                onChange={(e) => setExtAffForm({ ...extAffForm, image_url: e.target.value })}
                className="px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Deskripsi singkat produk..."
                value={extAffForm.description}
                onChange={(e) => setExtAffForm({ ...extAffForm, description: e.target.value })}
                className="flex-1 px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
              <button
                type="submit"
                disabled={savingExtAff}
                className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                {savingExtAff ? 'Menyimpan...' : '+ Tambahkan ke Etalase Toko'}
              </button>
            </div>
          </form>

          {/* List External Affiliates Added by Seller */}
          {(data.externalAffiliates || []).length > 0 && (
            <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-2.5">
              <h3 className="text-xs font-semibold text-[#3D2C24]">
                Daftar Link Affiliate Sendiri ({data.externalAffiliates?.length})
              </h3>
              <div className="space-y-2">
                {data.externalAffiliates?.map((ea) => (
                  <div
                    key={ea.id}
                    className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 flex items-center justify-between gap-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#3D2C24] truncate">{ea.title}</p>
                      <p className="text-[10px] text-[#527362] font-mono">
                        {formatRupiah(ea.price)} · {ea.clicks_count} klik
                      </p>
                      <p className="text-[10px] text-[#6E5A50] truncate max-w-md">{ea.affiliate_url}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteExternalAffiliate(ea.id)}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#E07A5F] hover:bg-[#E07A5F]/10 cursor-pointer"
                    >
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Internal WD.UP Affiliate Items (Seamlessly shown on Storefront) */}
          <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#3D2C24]">Produk WD.UP di Toko Anda</h3>
            {(data.affiliateProducts || []).length === 0 ? (
              <p className="text-xs text-[#6E5A50]">
                Pilih produk di Katalog WD.UP di bawah untuk tampil langsung di toko Anda layaknya produk Anda sendiri.
              </p>
            ) : (
              <div className="space-y-2">
                {data.affiliateProducts?.map((ap) => {
                  const refUrl = `${window.location.origin}/?store=${store.username}&ref=${ap.referral_code}`;
                  return (
                    <div
                      key={ap.affiliate_listing_id}
                      className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-[10px] text-[#527362] font-medium">
                          Komisi {ap.affiliate_commission_pct}% · {ap.affiliate_clicks} klik · Tampil menyatu di etalase
                        </p>
                        <p className="text-xs font-semibold text-[#3D2C24] truncate">{ap.title}</p>
                        <p className="text-[10px] text-[#6E5A50] font-mono truncate max-w-md">{refUrl}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            navigator.clipboard?.writeText(refUrl);
                            toast('Link referral affiliate disalin!', 'sage');
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Salin</span>
                        </button>
                        <button
                          onClick={() => handleRemoveAffiliateProduct(ap.id)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#E07A5F] hover:bg-[#E07A5F]/10 cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-[#3D2C24]">Katalog Affiliate WD.UP Market</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {affCatalog
                .filter((item) => !item.isOwnProduct)
                .map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 rounded-2xl bg-white border border-[#3D2C24]/10 flex flex-col justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold text-[#E07A5F]">
                        Komisi {item.affiliate_commission_pct}% · {item.category}
                      </p>
                      <h4 className="text-xs font-semibold text-[#3D2C24] line-clamp-2">{item.title}</h4>
                      <p className="text-[11px] text-[#6E5A50] line-clamp-2">{item.description}</p>
                    </div>
                    <div className="pt-2 border-t border-[#3D2C24]/10 flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-[#3D2C24]">
                        {formatRupiah(item.price)}
                      </span>
                      {item.inMyStore ? (
                        <span className="text-[11px] font-semibold text-[#527362] inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Di Toko</span>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleAddAffiliateProduct(item.id)}
                          className="px-2.5 py-1 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer"
                        >
                          + Jual di Toko
                        </button>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. STORE VOUCHERS (PRO EXCLUSIVE CREATION) */}
      {subTab === 'vouchers' && (
        <div className="grid lg:grid-cols-12 gap-4 items-start">
          {!isProSeller ? (
            <div className="lg:col-span-5 rounded-2xl bg-gradient-to-br from-[#3D2C24] to-[#2B1F19] text-[#FAF6F0] p-5 space-y-3">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#F3C669]">
                <Crown className="w-4 h-4" />
                <span>FITUR SELLER WD.UP PRO</span>
              </div>
              <h3 className="font-display text-base font-semibold">Voucher Promo Toko</h3>
              <p className="text-xs text-[#FAF6F0]/80 leading-relaxed">
                Buat kode voucher diskon nominal maupun persentase khusus produk toko Anda untuk mendongkrak konversi penjualan.
              </p>
              <button
                type="button"
                onClick={() => setAccountSubView('overview')}
                className="w-full py-2.5 rounded-xl bg-[#F3C669] hover:bg-[#eab853] text-[#3D2C24] text-xs font-bold cursor-pointer"
              >
                Aktifkan WD.UP Pro Sekarang
              </button>
            </div>
          ) : (
          <form
            onSubmit={handleCreateVoucher}
            className="lg:col-span-5 bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-[#E07A5F]" />
                <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24]">
                  {editingVoucherId ? 'Edit Voucher Promo Toko' : 'Buat Voucher Promo Toko'}
                </h3>
              </div>
              {editingVoucherId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingVoucherId(null);
                    setVoucherForm({
                      code: '',
                      title: '',
                      discount_type: 'fixed',
                      discount_value: 15000,
                      min_purchase: 0,
                      max_discount: '',
                      quota_limit: '',
                      expires_at: '',
                    });
                  }}
                  className="text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Kode Voucher *</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Kode unik huruf/angka yang diketik pembeli di keranjang.</p>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingVoucherId)}
                  value={voucherForm.code}
                  onChange={(e) =>
                    setVoucherForm({ ...voucherForm, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') })
                  }
                  placeholder="PROMO20"
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono uppercase disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Judul Promo *</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Nama singkat promo yang muncul saat voucher diterapkan.</p>
                <input
                  type="text"
                  value={voucherForm.title}
                  onChange={(e) => setVoucherForm({ ...voucherForm, title: e.target.value })}
                  placeholder="Diskon Spesial Akhir Bulan"
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Tipe Potongan</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Pilih potongan Rupiah langsung atau Persentase (%).</p>
                <select
                  value={voucherForm.discount_type}
                  onChange={(e) =>
                    setVoucherForm({ ...voucherForm, discount_type: e.target.value as 'fixed' | 'percent' })
                  }
                  className="w-full px-2.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                >
                  <option value="fixed">Nominal Tetap (Rp)</option>
                  <option value="percent">Persentase (%)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">
                  {voucherForm.discount_type === 'percent' ? 'Besar Diskon (%)' : 'Nominal Potongan (Rp)'}
                </label>
                <p className="text-[9px] text-[#6E5A50] mb-1">
                  {voucherForm.discount_type === 'percent' ? 'Rentang 1% s.d. 90%.' : 'Besar potongan rupiah per transaksi.'}
                </p>
                <input
                  type="number"
                  min={1}
                  max={voucherForm.discount_type === 'percent' ? 90 : undefined}
                  required
                  value={voucherForm.discount_value}
                  onChange={(e) => setVoucherForm({ ...voucherForm, discount_value: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Minimal Belanja (Rp)</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Isi 0 jika berlaku tanpa syarat minimal belanja.</p>
                <input
                  type="number"
                  min={0}
                  value={voucherForm.min_purchase}
                  onChange={(e) => setVoucherForm({ ...voucherForm, min_purchase: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Maks. Potongan (Opsional)</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Batas diskon rupiah (berguna untuk voucher %).</p>
                <input
                  type="number"
                  min={1000}
                  placeholder="Tanpa batas"
                  value={voucherForm.max_discount}
                  onChange={(e) => setVoucherForm({ ...voucherForm, max_discount: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Kuota Pemakaian</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Jumlah klaim maksimal. Kosongkan jika bebas.</p>
                <input
                  type="number"
                  min={1}
                  placeholder="Tanpa batas"
                  value={voucherForm.quota_limit}
                  onChange={(e) => setVoucherForm({ ...voucherForm, quota_limit: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-[#3D2C24] mb-0.5">Masa Berlaku (Expired)</label>
                <p className="text-[9px] text-[#6E5A50] mb-1">Tanggal berakhir otomatis voucher. Kosong = selamanya.</p>
                <input
                  type="date"
                  value={voucherForm.expires_at}
                  onChange={(e) => setVoucherForm({ ...voucherForm, expires_at: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={savingVoucher}
              className="w-full py-2.5 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {savingVoucher
                ? 'Menyimpan...'
                : editingVoucherId
                ? 'Simpan Perubahan Voucher Toko'
                : 'Terbitkan Voucher Toko'}
            </button>
          </form>
          )}

          <div className="lg:col-span-7 bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-2.5">
            <h3 className="text-xs font-semibold text-[#3D2C24]">Daftar Voucher Toko Anda</h3>
            {(data.vouchers || []).length === 0 ? (
              <p className="text-xs text-[#6E5A50]">
                Belum ada voucher toko. Voucher toko berlaku khusus untuk pembelian produk dari toko Anda.
              </p>
            ) : (
              <div className="space-y-2">
                {data.vouchers?.map((v) => {
                  const isExpired = Boolean(v.expires_at && new Date(v.expires_at) <= new Date());
                  return (
                    <div
                      key={v.id}
                      className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-mono font-bold text-[#3D2C24]">
                            {v.code} ·{' '}
                            <span className="font-sans font-semibold text-[#E07A5F]">
                              {v.discount_type === 'percent'
                                ? `${v.discount_value}%`
                                : formatRupiah(v.discount_value)}
                            </span>
                          </p>
                          {isExpired && (
                            <span className="px-1.5 py-0.5 rounded bg-[#E07A5F]/20 text-[#E07A5F] text-[10px] font-bold">
                              Kadaluwarsa
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6E5A50]">
                          {v.title} · Min {formatRupiah(v.min_purchase)} · Terpakai {v.used_count}
                          {v.quota_limit ? `/${v.quota_limit}` : ''}
                          {v.expires_at ? ` · Berlaku s.d. ${v.expires_at.slice(0, 10)}` : ' · Tanpa batas waktu'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isProSeller && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingVoucherId(v.id);
                                setVoucherForm({
                                  code: v.code,
                                  title: v.title || '',
                                  discount_type: v.discount_type === 'percent' ? 'percent' : 'fixed',
                                  discount_value: v.discount_value,
                                  min_purchase: v.min_purchase || 0,
                                  max_discount: v.max_discount ? String(v.max_discount) : '',
                                  quota_limit: v.quota_limit ? String(v.quota_limit) : '',
                                  expires_at: v.expires_at ? v.expires_at.slice(0, 10) : '',
                                });
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiFetch(`/api/my-store/vouchers/${v.id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify({ is_active: !v.is_active }),
                                  });
                                  loadMyStore();
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Gagal memperbarui voucher.', 'coral');
                                }
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                                v.is_active ? 'bg-[#6B8E7B] text-white' : 'bg-white border border-[#3D2C24]/15 text-[#6E5A50]'
                              }`}
                            >
                              {v.is_active ? 'Aktif' : 'Nonaktif'}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/my-store/vouchers/${v.id}`, { method: 'DELETE' });
                            if (editingVoucherId === v.id) setEditingVoucherId(null);
                            loadMyStore();
                          }}
                          className="px-2 py-1 rounded-lg text-[11px] font-semibold text-[#E07A5F] cursor-pointer"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. STORE ORDERS (WITH PLATFORM FEE & NET PAYOUT TRANSPARENCY) */}
      {subTab === 'orders' && (
        <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 space-y-2.5">
          <h3 className="text-xs font-semibold text-[#3D2C24]">Pesanan Produk & Affiliate Toko Anda</h3>
          {(data.storeOrders || []).length === 0 ? (
            <p className="text-xs text-[#6E5A50]">Belum ada transaksi masuk untuk toko ini.</p>
          ) : (
            <div className="divide-y divide-[#3D2C24]/10">
              {data.storeOrders?.map((so) => (
                <div key={so.order_item_id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
                  <div>
                    <p className="font-mono font-semibold text-[#3D2C24]">
                      {so.order_code} · <span className="font-sans">{so.title}</span>
                    </p>
                    <p className="text-[11px] text-[#6E5A50]">
                      Pembeli: {so.buyer_name} · {formatDateTimeId(so.created_at)} ·{' '}
                      {so.affiliate_user_id === user?.id ? 'Via Affiliate Toko Anda' : 'Produk Toko Anda'}
                    </p>
                  </div>
                  <div className="text-left sm:text-right space-y-0.5">
                    <div className="flex sm:justify-end items-center gap-2.5">
                      <span className="font-mono font-bold text-[#3D2C24]">{formatRupiah(so.subtotal)}</span>
                      <span className="font-semibold text-[#527362]">{so.status}</span>
                    </div>
                    {so.seller_user_id === user?.id && (
                      <p className="text-[10px] font-mono text-[#6E5A50]">
                        Potongan: {formatRupiah(so.platform_fee_amount || 0)} · Bersih:{' '}
                        <span className="font-semibold text-[#527362]">
                          {formatRupiah(so.seller_net_amount ?? so.subtotal)}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. STORE CUSTOMIZATION: UPLOAD BANNER/LOGO, SOCIAL LOGOS & CUSTOM HTML LANDING EDITOR */}
      {subTab === 'customize' && (
        <div className="bg-white rounded-2xl border border-[#3D2C24]/10 p-4 sm:p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24]">
                Kustomisasi Toko, Logo Platform Sosmed & Landing Page Coding
              </h3>
              <p className="text-[11px] text-[#6E5A50]">
                Unggah gambar otomatis dikompresi agar ringan, atau tempel URL gambar langsung.
              </p>
            </div>
            <div className="flex items-center gap-2.5">
              {autosaveNote && (
                <span
                  className={`text-[11px] font-medium ${
                    autosaveNote.toLowerCase().includes('gagal') || autosaveNote.toLowerCase().includes('harus')
                      ? 'text-[#E07A5F]'
                      : 'text-[#527362]'
                  }`}
                >
                  {autosaveNote}
                </span>
              )}
              <button
                type="button"
                disabled={savingStoreCustom}
                onClick={() => void persistStoreDraft(editStoreRef.current, true)}
                className="px-3 py-1.5 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingStoreCustom ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>

          {/* Upload Banner & Logo Seller */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-[#3D2C24]">Banner Toko</label>
                <div className="flex items-center gap-2.5">
                  {editStore.banner_url && (
                    <button
                      type="button"
                      onClick={() => {
                        setMediaQuotaError((prev) => ({ ...prev, banner: undefined }));
                        handleEditStoreField({ banner_url: '' }, true);
                      }}
                      className="text-[11px] font-semibold text-[#E07A5F] hover:underline cursor-pointer"
                    >
                      Hapus
                    </button>
                  )}
                  <label className="text-[11px] font-semibold text-[#527362] cursor-pointer hover:underline">
                    Unggah Banner
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleStoreImageUpload('banner', e)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              {editStore.banner_url && (
                <div className="h-20 rounded-lg overflow-hidden border border-[#3D2C24]/10 bg-white">
                  <SafeImage
                    src={editStore.banner_url}
                    alt="Preview Banner"
                    className="w-full h-full object-cover"
                    fallbackLabel="Preview Banner"
                  />
                </div>
              )}
              {editStore.banner_url?.startsWith('data:') && (
                <p className="text-[10px] font-medium text-[#527362]">
                  Banner terunggah & aktif. Klik Hapus atau tempel URL baru di bawah untuk mengganti.
                </p>
              )}
              {mediaQuotaError.banner && (
                <p className="text-[10px] text-[#E07A5F] font-medium">{mediaQuotaError.banner}</p>
              )}
              <input
                type="url"
                value={editStore.banner_url?.startsWith('data:') ? '' : editStore.banner_url || ''}
                onChange={(e) => {
                  setMediaQuotaError((prev) => ({ ...prev, banner: undefined }));
                  handleEditStoreField({ banner_url: e.target.value });
                }}
                placeholder={
                  editStore.banner_url?.startsWith('data:')
                    ? 'Tempel URL banner baru untuk mengganti (https://...)'
                    : 'Atau tempel URL banner (https://...)'
                }
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px]"
              />
            </div>

            <div className="p-3.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/10 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-[11px] font-semibold text-[#3D2C24]">Logo Seller / Toko</label>
                <div className="flex items-center gap-2.5">
                  {editStore.logo_url && (
                    <button
                      type="button"
                      onClick={() => {
                        setMediaQuotaError((prev) => ({ ...prev, logo: undefined }));
                        handleEditStoreField({ logo_url: '' }, true);
                      }}
                      className="text-[11px] font-semibold text-[#E07A5F] hover:underline cursor-pointer"
                    >
                      Hapus
                    </button>
                  )}
                  <label className="text-[11px] font-semibold text-[#527362] cursor-pointer hover:underline">
                    Unggah Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => void handleStoreImageUpload('logo', e)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-xl overflow-hidden bg-white border border-[#3D2C24]/12 flex items-center justify-center font-display font-bold text-[#3D2C24] shrink-0">
                  {editStore.logo_url ? (
                    <SafeImage
                      src={editStore.logo_url}
                      alt="Logo Toko"
                      className="w-full h-full object-cover"
                      fallbackLabel={store.initials}
                    />
                  ) : (
                    store.initials
                  )}
                </div>
                <div className="flex-1 space-y-1">
                  <input
                    type="url"
                    value={editStore.logo_url?.startsWith('data:') ? '' : editStore.logo_url || ''}
                    onChange={(e) => {
                      setMediaQuotaError((prev) => ({ ...prev, logo: undefined }));
                      handleEditStoreField({ logo_url: e.target.value });
                    }}
                    placeholder={
                      editStore.logo_url?.startsWith('data:')
                        ? 'Tempel URL logo baru untuk mengganti (https://...)'
                        : 'Atau tempel URL logo (https://...)'
                    }
                    className="w-full px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px]"
                  />
                  {editStore.logo_url?.startsWith('data:') && (
                    <p className="text-[10px] font-medium text-[#527362]">
                      Logo terunggah & aktif.
                    </p>
                  )}
                  {mediaQuotaError.logo && (
                    <p className="text-[10px] text-[#E07A5F] font-medium">{mediaQuotaError.logo}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Core Identity Fields */}
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Nama Toko</label>
              <input
                type="text"
                value={editStore.name || ''}
                onChange={(e) => handleEditStoreField({ name: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Username Toko</label>
              <input
                type="text"
                value={editStore.username || ''}
                onChange={(e) =>
                  handleEditStoreField({ username: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })
                }
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Tema Toko</label>
              <select
                value={editStore.theme || 'warm-cream'}
                onChange={(e) => handleEditStoreField({ theme: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              >
                <option value="warm-cream">Warm Cream (Klasik)</option>
                <option value="sage">Sage Green (Tenang)</option>
                <option value="coral">Soft Coral (Hangat)</option>
                <option value="butter">Butter Yellow (Cerah)</option>
                <option value="lavender">Lavender (Mindful)</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Kategori Toko</label>
              <input
                type="text"
                value={editStore.category || ''}
                onChange={(e) => handleEditStoreField({ category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Deskripsi Toko</label>
              <textarea
                rows={2}
                value={editStore.description || ''}
                onChange={(e) => handleEditStoreField({ description: e.target.value })}
                className="w-full p-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">WhatsApp Kontak</label>
              <input
                type="text"
                value={editStore.contact_whatsapp || ''}
                onChange={(e) => handleEditStoreField({ contact_whatsapp: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">Link Jasa / Konsultasi</label>
              <input
                type="url"
                value={editStore.service_link || ''}
                onChange={(e) => handleEditStoreField({ service_link: e.target.value })}
                placeholder="https://..."
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>
          </div>

          {/* Social Media Links with Platform Logos */}
          <div className="pt-2 border-t border-[#3D2C24]/10 space-y-2.5">
            <h4 className="text-xs font-semibold text-[#3D2C24]">Link Sosial Media Seller (Ditampilkan dengan Logo Platform)</h4>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {SOCIAL_PLATFORM_META.map((meta) => (
                <div key={meta.id} className="space-y-1">
                  <label className="flex items-center gap-1.5 text-[11px] font-semibold text-[#3D2C24]">
                    <SocialPlatformLogo platform={meta.id} className="w-3.5 h-3.5" />
                    <span>{meta.label}</span>
                  </label>
                  <input
                    type="text"
                    value={editStore[meta.field] || ''}
                    onChange={(e) => handleEditStoreField({ [meta.field]: e.target.value })}
                    placeholder={meta.placeholder}
                    className="w-full px-3 py-1.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Editor Kustom & Akses Coding Landing Page Toko */}
          <div className="pt-2 border-t border-[#3D2C24]/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-semibold text-[#3D2C24] inline-flex items-center gap-1.5">
                  <Code2 className="w-4 h-4 text-[#527362]" />
                  <span>Landing Page & Editor Coding HTML/CSS Toko</span>
                  <span className="px-1.5 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[9px] font-bold inline-flex items-center gap-0.5">
                    <Crown className="w-2.5 h-2.5" />
                    <span>PRO</span>
                  </span>
                </h4>
                <p className="text-[11px] text-[#6E5A50]">
                  Pasang link landing page eksternal, atau tulis kode HTML/CSS kustom (khusus Seller WD.UP Pro).
                </p>
              </div>
              {isProSeller && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowStoreCodePreview(true);
                      handleEditStoreField({ custom_landing_html: STARTER_STORE_HTML }, true);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#EFF5F1] text-[#527362] text-[11px] font-semibold cursor-pointer"
                  >
                    + Template Starter HTML/CSS
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowStoreCodePreview((v) => !v)}
                    className="px-2.5 py-1 rounded-lg bg-[#FAF6F0] border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eye className="w-3 h-3" />
                    <span>{showStoreCodePreview ? 'Sembunyikan Preview' : 'Lihat Preview'}</span>
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">
                Link Landing Page Eksternal Toko (Opsional)
              </label>
              <input
                type="url"
                value={editStore.landing_page_url || ''}
                onChange={(e) => handleEditStoreField({ landing_page_url: e.target.value })}
                placeholder="https://tokoanda.com/promo"
                className="w-full px-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-xs"
              />
            </div>

            {!isProSeller ? (
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#3D2C24] to-[#2B1F19] text-[#FAF6F0] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-[#F3C669] inline-flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Editor Coding HTML/CSS Khusus Seller WD.UP Pro</span>
                  </p>
                  <p className="text-[11px] text-[#FAF6F0]/80">
                    Desain landing page toko interaktif dengan kode HTML/CSS kustom dan sisipan gambar langsung.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAccountSubView('overview')}
                  className="px-3.5 py-2 rounded-xl bg-[#F3C669] hover:bg-[#eab853] text-[#3D2C24] text-xs font-bold shrink-0 cursor-pointer self-start sm:self-auto"
                >
                  Aktifkan WD.UP Pro
                </button>
              </div>
            ) : (
              <>
                {/* Sisipkan Gambar ke Kode Landing Page */}
                <div className="p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-[#527362]" />
                      <span>Sisipkan Gambar ke Landing Page</span>
                    </span>
                    <label className="px-2.5 py-1 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                      <Upload className="w-3 h-3" />
                      <span>Unggah Gambar</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => void handleInsertLandingHtmlImageUpload('store', e)}
                        className="hidden"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      value={storeHtmlImgUrl}
                      onChange={(e) => setStoreHtmlImgUrl(e.target.value)}
                      placeholder="Atau tempel Link URL gambar (https://...)"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => handleInsertLandingHtmlImageUrl('store')}
                      className="px-3 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      + Sisipkan Link Gambar
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[#3D2C24] mb-1">
                    Kode HTML / CSS Landing Page Kustom (Terisolasi Aman)
                  </label>
                  <textarea
                    rows={6}
                    value={editStore.custom_landing_html || ''}
                    onChange={(e) => handleEditStoreField({ custom_landing_html: e.target.value })}
                    placeholder="<section style='padding:24px;'><h1>Selamat Datang</h1></section>"
                    className="w-full p-3 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/15 text-[11px] font-mono"
                  />
                </div>

                {showStoreCodePreview && Boolean(editStore.custom_landing_html?.trim()) && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#527362]">Pratinjau Live Landing Page Toko:</p>
                    <SandboxedHtmlFrame
                      html={editStore.custom_landing_html || ''}
                      title="Pratinjau Landing Page Toko"
                      heightClass="h-64"
                    />
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-[#3D2C24]/10">
              <span className="text-[11px] text-[#6E5A50]">
                Status: <strong className="text-[#3D2C24]">{autosaveNote || 'Siap disimpan'}</strong>
              </span>
              <button
                type="button"
                disabled={savingStoreCustom}
                onClick={() => void persistStoreDraft(editStoreRef.current, true)}
                className="px-4 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {savingStoreCustom ? 'Menyimpan...' : 'Simpan Kustomisasi Toko'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SandboxedLandingModal
        open={prodPreviewModal}
        onClose={() => setProdPreviewModal(false)}
        title={`Pratinjau Landing: ${newProd.title || 'Produk Baru'}`}
        html={newProd.custom_landing_html}
        externalUrl={newProd.landing_page_url}
      />
    </div>
  );
}
