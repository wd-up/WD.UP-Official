import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Code2,
  Copy,
  Crown,
  ExternalLink,
  Mail,
  MessageCircle,
  Share2,
  ShoppingBag,
  Store as StoreIcon,
  Tag,
} from 'lucide-react';
import { apiFetch, formatRupiah } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { ExternalAffiliateItem, Product, Store, VoucherItem } from '../types/wdup';
import { SafeImage } from './SafeImage';
import { SOCIAL_PLATFORM_META, SocialPlatformLogo, normalizeSocialUrl } from './SocialBrandIcons';
import { FormattedDescription, SandboxedHtmlFrame, SandboxedLandingModal } from './SandboxedLandingModal';
import { ProductPurchaseModal } from './ProductPurchaseModal';
import {
  getCoverShapeClasses,
  getProductCtaLabel,
  getProductPriceSummary,
  productNeedsPurchaseModal,
} from '../lib/productUtils';

type StorefrontCatalogEntry =
  | { kind: 'own'; product: Product }
  | { kind: 'aff'; product: Product }
  | { kind: 'ext'; item: ExternalAffiliateItem };

export function StorefrontView() {
  const { publicStoreUsername, closePublicStore, addToCart, catalogVersion, toast } = useAuth();
  const [store, setStore] = useState<Store | null>(null);
  const [ownProducts, setOwnProducts] = useState<Product[]>([]);
  const [affiliateProducts, setAffiliateProducts] = useState<Product[]>([]);
  const [externalAffiliates, setExternalAffiliates] = useState<ExternalAffiliateItem[]>([]);
  const [storeVouchers, setStoreVouchers] = useState<VoucherItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [loading, setLoading] = useState(true);
  const [showStoreLanding, setShowStoreLanding] = useState(false);
  const [landingPreview, setLandingPreview] = useState<{ title: string; html?: string; url?: string } | null>(null);
  const [expandedDescId, setExpandedDescId] = useState<string | null>(null);
  const [purchaseModalState, setPurchaseModalState] = useState<{ product: Product; isAffiliate: boolean } | null>(
    null
  );

  useEffect(() => {
    if (!publicStoreUsername) return;
    let active = true;
    setLoading(true);
    apiFetch<{
      store: Store;
      ownProducts: Product[];
      affiliateProducts: Product[];
      externalAffiliates?: ExternalAffiliateItem[];
      storeVouchers?: VoucherItem[];
    }>(`/api/stores/${encodeURIComponent(publicStoreUsername)}`)
      .then((res) => {
        if (!active) return;
        setStore(res.store);
        setOwnProducts(res.ownProducts || []);
        setAffiliateProducts(res.affiliateProducts || []);
        setExternalAffiliates(res.externalAffiliates || []);
        setStoreVouchers(res.storeVouchers || []);
      })
      .catch(() => {
        if (active) setStore(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publicStoreUsername, catalogVersion]);

  if (!publicStoreUsername) return null;

  const themeBg: Record<string, string> = {
    'warm-cream': 'bg-[#FAF6F0]',
    sage: 'bg-[#EFF4F0]',
    coral: 'bg-[#FDF4F1]',
    butter: 'bg-[#FDF8EC]',
    lavender: 'bg-[#F5F2F8]',
  };

  const finalizeBuyProduct = async (
    product: Product,
    isAffiliate: boolean,
    opts?: { unitPrice?: number; customPrice?: number; selectedAddons?: Product['addons']; openDrawer?: boolean }
  ) => {
    if (isAffiliate && store) {
      await apiFetch('/api/affiliate/track-click', {
        method: 'POST',
        body: JSON.stringify({ ref: store.username, product_id: product.id }),
      }).catch(() => {});
    }
    addToCart(
      {
        item_type: 'product',
        item_id: product.id,
        title: product.title,
        price: opts?.unitPrice ?? product.price,
        quantity: 1,
        image_url: product.image_url,
        meta: `${product.category} · ${store?.name || product.owner_store_name || 'WD.UP Store'}`,
        affiliate_username: isAffiliate && store ? store.username : undefined,
        custom_price: opts?.customPrice,
        selected_addons: opts?.selectedAddons,
      },
      opts?.openDrawer ?? true
    );
  };

  const handleBuyProduct = async (product: Product, isAffiliate: boolean) => {
    if (productNeedsPurchaseModal(product)) {
      setPurchaseModalState({ product, isAffiliate });
      return;
    }
    await finalizeBuyProduct(product, isAffiliate);
  };

  const handleExternalClick = (itemId: string) => {
    if (!store) return;
    apiFetch(`/api/stores/${encodeURIComponent(store.username)}/external-affiliates/${encodeURIComponent(itemId)}/click`, {
      method: 'POST',
    }).catch(() => {});
  };

  const copyStoreLink = () => {
    if (!store) return;
    const url = `${window.location.origin}/?store=${store.username}&ref=${store.username}`;
    navigator.clipboard?.writeText(url);
    toast('Tautan toko berhasil disalin!', 'sage');
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        <div className="h-48 rounded-2xl bg-[#F2EAE0] animate-pulse" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center space-y-3">
        <StoreIcon className="w-8 h-8 text-[#6E5A50] mx-auto" />
        <h2 className="font-display text-xl font-semibold text-[#3D2C24]">Toko tidak ditemukan</h2>
        <button
          onClick={closePublicStore}
          className="px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold cursor-pointer"
        >
          Kembali ke WD.UP
        </button>
      </div>
    );
  }

  // Merge own products, internal affiliate items, and seller external affiliate links seamlessly
  const unifiedCatalog: StorefrontCatalogEntry[] = [
    ...ownProducts.map((product) => ({ kind: 'own' as const, product })),
    ...affiliateProducts.map((product) => ({ kind: 'aff' as const, product })),
    ...externalAffiliates.map((item) => ({ kind: 'ext' as const, item })),
  ];

  const combinedCategories = Array.from(
    new Set([
      'Semua',
      ...unifiedCatalog.map((entry) => (entry.kind === 'ext' ? entry.item.category : entry.product.category)),
    ])
  );

  const visibleCatalog =
    selectedCategory === 'Semua'
      ? unifiedCatalog
      : unifiedCatalog.filter((entry) =>
          (entry.kind === 'ext' ? entry.item.category : entry.product.category) === selectedCategory
        );

  const socialButtons = SOCIAL_PLATFORM_META.map((meta) => {
    const raw = store[meta.field];
    const url = normalizeSocialUrl(meta.id, raw);
    return url ? { ...meta, url } : null;
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  const hasStoreLandingHtml = Boolean(store.custom_landing_html && store.custom_landing_html.trim());
  const hasStoreLandingUrl = Boolean(store.landing_page_url && /^https?:\/\//i.test(store.landing_page_url));

  return (
    <div className={`min-h-[85vh] pb-24 md:pb-10 ${themeBg[store.theme] || themeBg['warm-cream']}`}>
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <button
            onClick={closePublicStore}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#527362] hover:text-[#3D2C24] cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Kembali ke WD.UP</span>
          </button>
          <button
            onClick={copyStoreLink}
            className="px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Salin Link Toko</span>
          </button>
        </div>

        {/* Store Banner, Logo, Social Platform Logos & Profile */}
        <section className="bg-white rounded-2xl border border-[#3D2C24]/10 overflow-hidden shadow-sm">
          <div className="h-32 sm:h-44 bg-[#F2EAE0] relative">
            <SafeImage
              src={store.banner_url || '/src/assets/images/hero_wdup_banner_1795359344577.jpg'}
              alt={store.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl overflow-hidden bg-[#F2EAE0] border-2 border-white shadow-sm shrink-0 flex items-center justify-center font-display text-lg font-bold text-[#3D2C24]">
                {store.logo_url ? (
                  <SafeImage src={store.logo_url} alt={store.name} className="w-full h-full object-cover" />
                ) : (
                  store.initials
                )}
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-[11px] font-medium text-[#527362]">
                    @{store.username} · {store.category}
                  </p>
                  {store.is_pro && (
                    <span className="px-1.5 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[10px] font-bold inline-flex items-center gap-0.5">
                      <Crown className="w-2.5 h-2.5" />
                      <span>PRO</span>
                    </span>
                  )}
                </div>
                <h1 className="font-display text-xl font-semibold text-[#3D2C24] leading-tight">{store.name}</h1>
                <p className="text-xs text-[#6E5A50] max-w-2xl leading-relaxed">{store.description}</p>

                {/* Social Media Links with Platform Logos */}
                {(socialButtons.length > 0 || store.contact_whatsapp) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {socialButtons.map((sb) => (
                      <a
                        key={sb.id}
                        href={sb.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`${sb.label} ${store.name}`}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90 transition-opacity ${sb.chipColor}`}
                      >
                        <SocialPlatformLogo platform={sb.id} className="w-3.5 h-3.5 shrink-0" />
                        <span>{sb.label}</span>
                      </a>
                    ))}
                    {store.contact_whatsapp && normalizeSocialUrl('whatsapp', store.contact_whatsapp) && (
                      <a
                        href={normalizeSocialUrl('whatsapp', store.contact_whatsapp)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2 py-1 rounded-lg bg-[#E9F5EE] text-[#15803D] border border-[#BBF7D0] text-[11px] font-semibold inline-flex items-center gap-1.5 hover:opacity-90"
                      >
                        <SocialPlatformLogo platform="whatsapp" className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 shrink-0">
              {(hasStoreLandingHtml || hasStoreLandingUrl) && (
                <button
                  type="button"
                  onClick={() => {
                    if (hasStoreLandingHtml) {
                      setShowStoreLanding((v) => !v);
                    } else if (hasStoreLandingUrl) {
                      setLandingPreview({ title: `Landing Page ${store.name}`, url: store.landing_page_url });
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Code2 className="w-3 h-3 text-[#F3C669]" />
                  <span>{showStoreLanding ? 'Tutup Landing Page' : 'Lihat Landing Toko'}</span>
                </button>
              )}
              {store.service_link && /^https?:\/\//i.test(store.service_link) && (
                <a
                  href={store.service_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-[#F2EAE0] text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1"
                >
                  <span>Layanan / Jasa</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {store.contact_whatsapp && (
                <a
                  href={`https://wa.me/${store.contact_whatsapp.replace(/[^0-9]/g, '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-[#6B8E7B] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                >
                  <MessageCircle className="w-3 h-3" />
                  <span>Chat Seller</span>
                </a>
              )}
              {store.contact_email && (
                <a
                  href={`mailto:${store.contact_email}`}
                  className="px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1"
                >
                  <Mail className="w-3 h-3" />
                  <span>Email</span>
                </a>
              )}
            </div>
          </div>

          {/* Optional Custom Coded Store Landing Page */}
          {showStoreLanding && hasStoreLandingHtml && (
            <div className="px-4 sm:px-5 pb-4 pt-2 border-t border-[#3D2C24]/10 space-y-2 bg-[#FAF6F0]/60">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1.5">
                  <Code2 className="w-3.5 h-3.5 text-[#527362]" />
                  <span>Halaman Kustom Toko</span>
                </p>
                <div className="flex items-center gap-2">
                  {hasStoreLandingUrl && (
                    <a
                      href={store.landing_page_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-[#527362] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Buka Link Eksternal</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setLandingPreview({
                        title: `Landing Page ${store.name}`,
                        html: store.custom_landing_html,
                        url: store.landing_page_url,
                      })
                    }
                    className="text-[11px] font-semibold text-[#E07A5F] hover:underline cursor-pointer"
                  >
                    Perbesar
                  </button>
                </div>
              </div>
              <SandboxedHtmlFrame
                html={store.custom_landing_html || ''}
                title={`Landing Page ${store.name}`}
                heightClass="h-64 sm:h-80"
              />
            </div>
          )}
        </section>

        {/* Active Store Vouchers Strip */}
        {storeVouchers.length > 0 && (
          <section className="bg-white rounded-2xl border border-[#E07A5F]/25 p-3 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3D2C24]">
              <Tag className="w-3.5 h-3.5 text-[#E07A5F]" />
              <span>Voucher Promo Toko Tersedia</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {storeVouchers.map((v) => (
                <div
                  key={v.id}
                  className="px-3 py-2 rounded-xl bg-[#FDF4F1] border border-[#E07A5F]/30 flex items-center justify-between gap-3 shrink-0"
                >
                  <div>
                    <p className="font-mono text-xs font-bold text-[#3D2C24]">{v.code}</p>
                    <p className="text-[10px] text-[#6E5A50]">
                      {v.discount_type === 'percent' ? `Diskon ${v.discount_value}%` : `Potongan ${formatRupiah(v.discount_value)}`}
                      {v.min_purchase > 0 ? ` · Min. ${formatRupiah(v.min_purchase)}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(v.code);
                      toast(`Kode voucher "${v.code}" disalin. Masukkan saat checkout!`, 'sage');
                    }}
                    className="px-2 py-1 rounded-lg bg-white border border-[#3D2C24]/15 text-[10px] font-semibold text-[#3D2C24] inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Copy className="w-3 h-3" />
                    <span>Salin</span>
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Category Filter */}
        {combinedCategories.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
            {combinedCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat ? 'bg-[#3D2C24] text-[#FAF6F0]' : 'bg-white text-[#6E5A50]'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Unified Store Catalog (Own + Affiliate + Seller External Affiliate seamlessly presented as store items) */}
        {visibleCatalog.length > 0 ? (
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Katalog {store.name}</h2>
              <span className="text-[11px] font-mono text-[#6E5A50]">{visibleCatalog.length} produk</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {visibleCatalog.map((entry) => {
                const isExternal = entry.kind === 'ext';
                const isInternalAff = entry.kind === 'aff';
                const id = isExternal ? `ext-${entry.item.id}` : `${entry.kind}-${entry.product.id}`;
                const title = isExternal ? entry.item.title : entry.product.title;
                const category = isExternal ? entry.item.category : entry.product.category;
                const price = isExternal ? entry.item.price : entry.product.price;
                const originalPrice = isExternal ? entry.item.original_price : entry.product.original_price;
                const imageUrl = isExternal ? entry.item.image_url : entry.product.image_url;
                const description = isExternal ? entry.item.description : entry.product.description;
                const accessType = isExternal ? 'LINK' : (entry.product.access_type || 'LINK').toUpperCase();
                const quotaLimit = isExternal ? null : entry.product.quota_limit;
                const salesCount = isExternal ? 0 : entry.product.sales_count || 0;
                const landingHtml = isExternal ? '' : entry.product.custom_landing_html || '';
                const landingUrl = isExternal ? '' : entry.product.landing_page_url || '';
                const hasLanding = Boolean(
                  landingHtml.trim() || (landingUrl && /^https?:\/\//i.test(landingUrl))
                );
                const safeExtUrl =
                  isExternal && /^https?:\/\//i.test(entry.item.affiliate_url) ? entry.item.affiliate_url : '';

                const cover = getCoverShapeClasses(isExternal ? 'landscape' : entry.product.cover_shape);
                const priceSummary = isExternal ? null : getProductPriceSummary(entry.product);
                const addonsCount = isExternal ? 0 : entry.product.addons?.length || 0;

                const remaining =
                  quotaLimit !== null && quotaLimit !== undefined ? Math.max(0, quotaLimit - salesCount) : null;
                const isSoldOut = remaining !== null && remaining <= 0;
                const promoPct =
                  (!priceSummary || !priceSummary.isPwyw) && originalPrice && originalPrice > price
                    ? Math.max(1, Math.round(((originalPrice - price) / originalPrice) * 100))
                    : null;

                return (
                  <article
                    key={id}
                    className="rounded-2xl border border-[#3D2C24]/10 bg-white overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {imageUrl ? (
                        <div className={cover.wrapper}>
                          <SafeImage src={imageUrl} alt={title} className={cover.image} />
                        </div>
                      ) : (
                        <div className="px-3 pt-3 pb-1">
                          <div className="px-2.5 py-2 rounded-xl bg-[#F2EAE0]/70 border border-[#3D2C24]/10 flex items-center justify-between text-[10px] font-semibold text-[#527362]">
                            <span className="truncate">{category}</span>
                            <span className="font-mono uppercase">{accessType}</span>
                          </div>
                        </div>
                      )}
                      <div className="p-2.5 sm:p-3 space-y-1">
                        <div className="flex items-center justify-between gap-1 text-[10px] text-[#6E5A50]">
                          <span className="truncate">
                            {category} · {store.name}
                          </span>
                          {hasLanding && (
                            <button
                              type="button"
                              onClick={() =>
                                setLandingPreview({
                                  title,
                                  html: landingHtml,
                                  url: landingUrl,
                                })
                              }
                              className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#E07A5F] hover:underline shrink-0 cursor-pointer"
                            >
                              <Code2 className="w-2.5 h-2.5" />
                              <span>Landing</span>
                            </button>
                          )}
                        </div>
                        <h3 className="text-xs sm:text-[13px] font-semibold text-[#3D2C24] line-clamp-2">
                          {title}
                        </h3>
                        {description && (
                          <div className="pt-0.5">
                            {expandedDescId === id ? (
                              <div className="space-y-1">
                                <FormattedDescription text={description} />
                                <button
                                  type="button"
                                  onClick={() => setExpandedDescId(null)}
                                  className="text-[10px] font-semibold text-[#527362] hover:underline cursor-pointer"
                                >
                                  Ringkas
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setExpandedDescId(id)}
                                className="text-left text-[11px] text-[#6E5A50] line-clamp-2 hover:text-[#3D2C24] cursor-pointer"
                              >
                                {description.replace(/\*\*/g, '')}
                              </button>
                            )}
                          </div>
                        )}
                        {remaining !== null && (
                          <p className={`text-[10px] ${isSoldOut ? 'font-semibold text-[#E07A5F]' : 'text-[#6E5A50]'}`}>
                            {isSoldOut ? 'Kuota Habis' : `Kuota tersisa ${remaining}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="px-2.5 sm:px-3 pb-2.5 pt-2 border-t border-[#3D2C24]/8 flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        {promoPct !== null && originalPrice && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono tabular-nums text-[10px] text-[#6E5A50] line-through">
                              {formatRupiah(originalPrice)}
                            </span>
                            <span className="text-[9px] font-semibold text-[#E07A5F]">-{promoPct}%</span>
                          </div>
                        )}
                        {priceSummary?.isPwyw && priceSummary.secondary && (
                          <p className="text-[9px] font-semibold text-[#527362]">{priceSummary.secondary}</p>
                        )}
                        <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#3D2C24] block">
                          {priceSummary ? priceSummary.primary : price > 0 ? formatRupiah(price) : 'Lihat Penawaran'}
                        </span>
                        {addonsCount > 0 && (
                          <p className="text-[9px] font-semibold text-[#527362]">+{addonsCount} Add-On</p>
                        )}
                      </div>
                      {isExternal ? (
                        safeExtUrl ? (
                          <a
                            href={safeExtUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => handleExternalClick(entry.item.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
                          >
                            <span>Beli Produk</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : null
                      ) : (
                        <button
                          onClick={() => handleBuyProduct(entry.product, isInternalAff)}
                          disabled={isSoldOut}
                          className="px-2.5 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap disabled:bg-[#6E5A50]/40 disabled:cursor-not-allowed"
                        >
                          {isSoldOut ? 'Habis' : getProductCtaLabel(entry.product)}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <div className="p-8 text-center bg-white rounded-2xl border border-[#3D2C24]/10 space-y-2">
            <ShoppingBag className="w-7 h-7 text-[#6E5A50]/50 mx-auto" />
            <p className="text-xs font-medium text-[#3D2C24]">Toko ini belum menampilkan produk pada kategori ini.</p>
          </div>
        )}
      </div>

      <SandboxedLandingModal
        open={Boolean(landingPreview)}
        onClose={() => setLandingPreview(null)}
        title={landingPreview?.title || 'Landing Page'}
        html={landingPreview?.html}
        externalUrl={landingPreview?.url}
      />

      {purchaseModalState && (
        <ProductPurchaseModal
          product={purchaseModalState.product}
          onClose={() => setPurchaseModalState(null)}
          onConfirmAdd={({ unitPrice, customPrice, selectedAddons, openDrawer }) => {
            void finalizeBuyProduct(purchaseModalState.product, purchaseModalState.isAffiliate, {
              unitPrice,
              customPrice,
              selectedAddons,
              openDrawer,
            });
          }}
        />
      )}
    </div>
  );
}
