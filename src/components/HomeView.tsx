import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Briefcase,
  Check,
  ChevronRight,
  Code2,
  Crown,
  ExternalLink,
  Globe,
  Mail,
  MapPin,
  Phone,
  Search,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
  Users,
} from 'lucide-react';
import { apiFetch, formatRupiah } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { HomeCmsItem, Product, SiteFooterInfo, Store } from '../types/wdup';
import { SafeImage } from './SafeImage';
import { SandboxedLandingModal } from './SandboxedLandingModal';
import { ProductPurchaseModal } from './ProductPurchaseModal';
import {
  getCoverShapeClasses,
  getProductCtaLabel,
  getProductPriceSummary,
  productNeedsPurchaseModal,
} from '../lib/productUtils';

interface HomeData {
  banners: HomeCmsItem[];
  lifestyleCategories: HomeCmsItem[];
  featuredProducts: Product[];
  latestProducts: Product[];
  recommendedProducts: Product[];
  totalProductsCount?: number;
  featuredStores: Store[];
  opportunities: HomeCmsItem[];
  communities: HomeCmsItem[];
  affiliateInfo: HomeCmsItem[];
  userEngagementIds: string[];
  siteFooter?: SiteFooterInfo;
  searchResults: {
    products: Product[];
    classes: Array<{ id: string; title: string; description: string; price: number; cover_url: string; mentor_name: string; category_name: string }>;
    stores: Store[];
  } | null;
}

export function HomeView() {
  const {
    user,
    setActiveTab,
    setAccountSubView,
    setMarketFilterPillar,
    setSelectedClassId,
    openPublicStore,
    addToCart,
    catalogVersion,
    toast,
  } = useAuth();

  const [data, setData] = useState<HomeData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [bannerIdx, setBannerIdx] = useState(0);
  const [productShelf, setProductShelf] = useState<'featured' | 'latest' | 'recommended'>('featured');
  const [loading, setLoading] = useState(true);
  const [landingPreview, setLandingPreview] = useState<{ title: string; html?: string; url?: string } | null>(null);
  const [purchaseModalProduct, setPurchaseModalProduct] = useState<Product | null>(null);

  const loadHome = async (q = '') => {
    try {
      const res = await apiFetch<HomeData>(`/api/home${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setData(res);
    } catch {
      // handled quietly
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHome(searchQuery.trim());
  }, [user?.id, catalogVersion]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHome(searchQuery.trim());
    }, 280);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleToggleEngagement = async (cmsItemId: string) => {
    try {
      const res = await apiFetch<{ joined: boolean; isGuest?: boolean }>('/api/engagements', {
        method: 'POST',
        body: JSON.stringify({ cms_item_id: cmsItemId }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              userEngagementIds: res.joined
                ? [...prev.userEngagementIds, cmsItemId]
                : prev.userEngagementIds.filter((id) => id !== cmsItemId),
            }
          : prev
      );
      toast(
        res.joined
          ? res.isGuest
            ? 'Berhasil bergabung & tercatat untuk Anda!'
            : 'Berhasil tercatat di My Activity!'
          : 'Keikutsertaan dibatalkan.',
        'sage'
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memperbarui keikutsertaan.', 'coral');
    }
  };

  const handleBannerAction = (target: string) => {
    if (target === 'academy') setActiveTab('academy');
    else if (target === 'market') setActiveTab('market');
    else if (target === 'affiliate') {
      setActiveTab('account');
      setAccountSubView('store');
    } else {
      setActiveTab('market');
    }
  };

  const pillarTint: Record<string, string> = {
    lavender: 'bg-[#B8A9C9]/20 border-[#B8A9C9]/40',
    sage: 'bg-[#6B8E7B]/15 border-[#6B8E7B]/35',
    butter: 'bg-[#F3C669]/25 border-[#F3C669]/45',
    coral: 'bg-[#E07A5F]/15 border-[#E07A5F]/35',
  };

  if (loading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-4">
        <div className="h-10 rounded-xl bg-[#F2EAE0] animate-pulse" />
        <div className="h-44 rounded-2xl bg-[#F2EAE0] animate-pulse" />
      </div>
    );
  }

  const banners = data?.banners || [];
  const activeBanner = banners[bannerIdx % Math.max(1, banners.length)];
  const shelfProducts = (
    productShelf === 'featured'
      ? data?.featuredProducts || []
      : productShelf === 'latest'
      ? data?.latestProducts || []
      : data?.recommendedProducts || []
  ).slice(0, 4);
  const footer = data?.siteFooter;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 space-y-6 pb-24 md:pb-10">
      {/* Compact Search Bar */}
      <section className="relative">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#6E5A50] absolute left-3.5 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari kelas Academy, produk digital, template, atau toko kreator..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-[#3D2C24]/12 text-xs sm:text-sm text-[#3D2C24] placeholder:text-[#6E5A50]/70 focus:outline-none focus:ring-2 focus:ring-[#6B8E7B] shadow-sm"
          />
        </div>

        {/* Live Search Results Panel */}
        {searchQuery.trim() && data?.searchResults && (
          <div className="mt-2 p-3.5 rounded-2xl bg-white border border-[#3D2C24]/15 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#6E5A50]">Hasil untuk "{searchQuery}"</p>
              <button
                onClick={() => setSearchQuery('')}
                className="text-xs font-semibold text-[#E07A5F] cursor-pointer"
              >
                Tutup
              </button>
            </div>
            {data.searchResults.products.length === 0 &&
            data.searchResults.classes.length === 0 &&
            data.searchResults.stores.length === 0 ? (
              <p className="text-xs text-[#6E5A50]">Tidak ditemukan hasil yang cocok.</p>
            ) : (
              <div className="grid md:grid-cols-3 gap-3">
                {data.searchResults.products.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#3D2C24]">Produk Market</p>
                    {data.searchResults.products.slice(0, 4).map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setMarketFilterPillar('Semua');
                          setActiveTab('market');
                        }}
                        className="w-full text-left p-2 rounded-lg bg-[#FAF6F0] hover:bg-[#F2EAE0] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="text-xs font-medium text-[#3D2C24] truncate">{p.title}</span>
                        <span className="font-mono tabular-nums text-[11px] text-[#527362] shrink-0">
                          {getProductPriceSummary(p).primary}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {data.searchResults.classes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#3D2C24]">Kelas Academy</p>
                    {data.searchResults.classes.slice(0, 4).map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setSelectedClassId(c.id);
                          setActiveTab('academy');
                        }}
                        className="w-full text-left p-2 rounded-lg bg-[#FAF6F0] hover:bg-[#F2EAE0] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="text-xs font-medium text-[#3D2C24] truncate">{c.title}</span>
                        <span className="font-mono tabular-nums text-[11px] text-[#527362] shrink-0">
                          {formatRupiah(c.price)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {data.searchResults.stores.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold text-[#3D2C24]">Toko Kreator</p>
                    {data.searchResults.stores.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => openPublicStore(s.username)}
                        className="w-full text-left p-2 rounded-lg bg-[#FAF6F0] hover:bg-[#F2EAE0] flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <span className="text-xs font-medium text-[#3D2C24] truncate">{s.name}</span>
                        <span className="text-[11px] text-[#6E5A50] shrink-0">@{s.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Compact Promotional Hero Banner */}
      {activeBanner && (
        <section className="rounded-2xl overflow-hidden bg-white border border-[#3D2C24]/10 shadow-sm">
          <div className="grid lg:grid-cols-12 items-stretch">
            <div className="lg:col-span-7 p-4 sm:p-6 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold tracking-wide text-[#527362]">{activeBanner.subtitle}</p>
                <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24] leading-snug text-balance">
                  {activeBanner.title}
                </h1>
                <p className="text-xs sm:text-sm text-[#6E5A50] leading-relaxed max-w-xl line-clamp-2">
                  {activeBanner.body}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => handleBannerAction(activeBanner.cta_target)}
                    className="px-4 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>{activeBanner.cta_label || 'Jelajahi Sekarang'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  {activeBanner.media_type === 'link' && activeBanner.link_url && /^https?:\/\//i.test(activeBanner.link_url) && (
                    <a
                      href={activeBanner.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3.5 py-2 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <span>Buka Tautan</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
                {banners.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    {banners.map((b, idx) => (
                      <button
                        key={b.id}
                        onClick={() => setBannerIdx(idx)}
                        className={`h-2 rounded-full transition-all cursor-pointer ${
                          idx === bannerIdx % banners.length ? 'w-5 bg-[#6B8E7B]' : 'w-2 bg-[#3D2C24]/20'
                        }`}
                        aria-label={`Banner ${idx + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="lg:col-span-5 h-40 sm:h-48 lg:h-auto lg:min-h-[200px] relative bg-[#F2EAE0]">
              {activeBanner.media_type === 'video' && (activeBanner.media_url || activeBanner.image_url) ? (
                <video
                  src={activeBanner.media_url || activeBanner.image_url}
                  controls
                  playsInline
                  className="w-full h-full object-cover bg-black/90"
                />
              ) : (
                <SafeImage
                  src={activeBanner.media_url || activeBanner.image_url}
                  alt={activeBanner.title}
                  className="w-full h-full object-cover"
                />
              )}
            </div>
          </div>
        </section>
      )}

      {/* 4 Compact Pillars: Self Love, Self Growth, Self Development, Digital Career (Cover Photo / Video / Link) */}
      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Pilar Pengembangan WD.UP</h2>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {(data?.lifestyleCategories || []).map((cat) => {
            const tintClass = pillarTint[cat.accent_color] || pillarTint.sage;
            const mediaSrc = cat.media_url || cat.image_url;
            const isVideo = cat.media_type === 'video' && Boolean(mediaSrc);
            const hasLink = cat.media_type === 'link' && cat.link_url && /^https?:\/\//i.test(cat.link_url);
            return (
              <div
                key={cat.id}
                className={`rounded-xl border overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-0.5 ${tintClass}`}
              >
                {isVideo ? (
                  <video src={mediaSrc} controls playsInline className="w-full h-24 object-cover bg-black/90" />
                ) : mediaSrc ? (
                  <div className="w-full h-24 bg-[#F2EAE0] overflow-hidden">
                    <SafeImage src={mediaSrc} alt={cat.title} className="w-full h-full object-cover" />
                  </div>
                ) : null}
                <div className="p-3 flex-1 flex flex-col justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setMarketFilterPillar(cat.cta_target || cat.title);
                      setActiveTab('market');
                    }}
                    className="text-left cursor-pointer min-w-0"
                  >
                    <h3 className="font-display text-sm font-semibold text-[#3D2C24] truncate">{cat.title}</h3>
                    <p className="text-[11px] text-[#6E5A50] line-clamp-2 leading-snug mt-0.5">{cat.body}</p>
                  </button>
                  {hasLink && (
                    <a
                      href={cat.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-semibold text-[#527362] hover:underline inline-flex items-center gap-1"
                    >
                      <span>Buka Tautan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Compact 4-Column Product Shelf */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Kurasi Produk WD.UP Market</h2>
            <p className="text-xs text-[#6E5A50]">Template, e-book, planner, dan karya digital terkurasi.</p>
          </div>
          <div className="flex items-center gap-1 p-0.5 bg-[#F2EAE0] rounded-xl self-start">
            {(
              [
                { id: 'featured', label: 'Unggulan' },
                { id: 'latest', label: 'Terbaru' },
                { id: 'recommended', label: 'Rekomendasi' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setProductShelf(tab.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  productShelf === tab.id ? 'bg-white text-[#3D2C24] shadow-sm' : 'text-[#6E5A50] hover:text-[#3D2C24]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {shelfProducts.map((p) => {
            const cover = getCoverShapeClasses(p.cover_shape);
            const priceSummary = getProductPriceSummary(p);
            const addonsCount = p.addons?.length || 0;
            const remaining =
              p.quota_limit !== null && p.quota_limit !== undefined
                ? Math.max(0, p.quota_limit - (p.sales_count || 0))
                : null;
            const isSoldOut = remaining !== null && remaining <= 0;
            const promoPct =
              !priceSummary.isPwyw && p.original_price && p.original_price > p.price
                ? Math.max(1, Math.round(((p.original_price - p.price) / p.original_price) * 100))
                : null;

            const cartItem = {
              item_type: 'product' as const,
              item_id: p.id,
              title: p.title,
              price: p.price,
              quantity: 1,
              image_url: p.image_url,
              meta: `${p.category} · ${p.store_name || 'WD.UP Store'}`,
            };
            const handleAction = (openDrawer: boolean) => {
              if (productNeedsPurchaseModal(p)) {
                setPurchaseModalProduct(p);
                return;
              }
              addToCart(cartItem, openDrawer);
            };
            return (
              <article
                key={p.id}
                className="rounded-2xl border border-[#3D2C24]/10 bg-white overflow-hidden flex flex-col justify-between transition-transform hover:-translate-y-0.5"
              >
                <div>
                  {p.image_url ? (
                    <div className={cover.wrapper}>
                      <SafeImage src={p.image_url} alt={p.title} className={cover.image} />
                    </div>
                  ) : (
                    <div className="px-2.5 pt-2.5">
                      <div className="px-2.5 py-1.5 rounded-lg bg-[#F2EAE0]/70 border border-[#3D2C24]/10 flex items-center justify-between text-[10px] font-semibold text-[#527362]">
                        <span className="truncate">{p.category}</span>
                        <span className="font-mono uppercase">{p.access_type || 'LINK'}</span>
                      </div>
                    </div>
                  )}
                  <div className="p-2.5 sm:p-3 space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[10px] text-[#6E5A50]">
                      <div className="flex items-center gap-1 min-w-0 truncate">
                        {p.is_pro_seller && (
                          <span className="px-1 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[9px] font-bold shrink-0">
                            PRO
                          </span>
                        )}
                        <span className="truncate">{p.category}</span>
                        <span aria-hidden="true">·</span>
                        <button
                          onClick={() => p.store_username && openPublicStore(p.store_username)}
                          className="font-medium text-[#527362] hover:underline cursor-pointer truncate"
                        >
                          {p.store_name}
                        </button>
                      </div>
                      {((p.custom_landing_html && p.custom_landing_html.trim()) ||
                        (p.landing_page_url && /^https?:\/\//i.test(p.landing_page_url))) && (
                        <button
                          type="button"
                          onClick={() =>
                            setLandingPreview({
                              title: p.title,
                              html: p.custom_landing_html,
                              url: p.landing_page_url,
                            })
                          }
                          className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#E07A5F] hover:underline shrink-0 cursor-pointer"
                        >
                          <Code2 className="w-2.5 h-2.5" />
                          <span>Landing</span>
                        </button>
                      )}
                    </div>
                    <h3 className="text-xs sm:text-[13px] font-semibold text-[#3D2C24] line-clamp-2 leading-snug">
                      {p.title}
                    </h3>
                  </div>
                </div>
                <div className="px-2.5 sm:px-3 pb-2.5 pt-2 border-t border-[#3D2C24]/8 space-y-1.5">
                  <div className="flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      {promoPct !== null && p.original_price && (
                        <div className="flex items-center gap-1">
                          <span className="font-mono tabular-nums text-[10px] text-[#6E5A50] line-through">
                            {formatRupiah(p.original_price)}
                          </span>
                          <span className="text-[9px] font-semibold text-[#E07A5F]">Hemat {promoPct}%</span>
                        </div>
                      )}
                      {priceSummary.isPwyw && priceSummary.secondary && (
                        <p className="text-[9px] font-semibold text-[#527362]">{priceSummary.secondary}</p>
                      )}
                      <span className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#3D2C24] block">
                        {priceSummary.primary}
                      </span>
                      {addonsCount > 0 && (
                        <p className="text-[9px] font-semibold text-[#527362]">+{addonsCount} Add-On</p>
                      )}
                    </div>
                    <span className={`text-[10px] shrink-0 ${isSoldOut ? 'font-semibold text-[#E07A5F]' : 'text-[#6E5A50]'}`}>
                      {remaining !== null
                        ? isSoldOut
                          ? 'Kuota Habis'
                          : `Sisa ${remaining}`
                        : p.affiliate_enabled === 1
                        ? `Aff ${p.affiliate_commission_pct}%`
                        : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleAction(false)}
                      disabled={isSoldOut}
                      className="p-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Tambah ke Keranjang"
                      aria-label="Tambah ke Keranjang"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleAction(true)}
                      disabled={isSoldOut}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer whitespace-nowrap disabled:bg-[#6E5A50]/40 disabled:cursor-not-allowed truncate"
                    >
                      {isSoldOut ? 'Kuota Habis' : getProductCtaLabel(p)}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            onClick={() => {
              setMarketFilterPillar('Semua');
              setActiveTab('market');
            }}
            className="px-3.5 py-2 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-xs font-semibold text-[#3D2C24] inline-flex items-center gap-1 cursor-pointer"
          >
            <span>
              Lihat semua {data?.totalProductsCount ? `(${data.totalProductsCount} produk)` : ''} di WD.UP Market
            </span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>

      {/* Toko Unggulan */}
      <section className="space-y-2.5">
        <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Toko Unggulan</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(data?.featuredStores || []).map((s) => (
            <div
              key={s.id}
              className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-[#F2EAE0] shrink-0 flex items-center justify-center font-display text-sm font-bold text-[#3D2C24]">
                  {s.logo_url ? (
                    <SafeImage src={s.logo_url} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    s.initials
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24] truncate">{s.name}</h3>
                    {s.is_pro && (
                      <span className="px-1.5 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[9px] font-bold inline-flex items-center gap-0.5 shrink-0">
                        <Crown className="w-2.5 h-2.5" />
                        <span>PRO</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#6E5A50] truncate">
                    @{s.username} · {s.category}
                  </p>
                </div>
              </div>
              <button
                onClick={() => openPublicStore(s.username)}
                className="px-3 py-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[11px] font-semibold text-[#3D2C24] shrink-0 cursor-pointer"
              >
                Kunjungi
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Opportunity & Community */}
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#E07A5F]" />
            <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Opportunity</h2>
          </div>
          <div className="space-y-2.5">
            {(data?.opportunities || []).map((opp) => {
              const joined = data?.userEngagementIds.includes(opp.id);
              const mediaSrc = opp.media_url || opp.image_url;
              return (
                <div key={opp.id} className="p-3.5 rounded-xl bg-white border border-[#3D2C24]/10 space-y-2">
                  {opp.media_type === 'video' && mediaSrc ? (
                    <video src={mediaSrc} controls playsInline className="w-full h-36 rounded-lg object-cover bg-black/90" />
                  ) : mediaSrc ? (
                    <div className="w-full h-32 rounded-lg overflow-hidden bg-[#F2EAE0]">
                      <SafeImage src={mediaSrc} alt={opp.title} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <p className="text-[10px] font-medium text-[#E07A5F]">{opp.subtitle}</p>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24]">{opp.title}</h3>
                  <p className="text-[11px] text-[#6E5A50] leading-relaxed">{opp.body}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleToggleEngagement(opp.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        joined
                          ? 'bg-[#6B8E7B]/20 text-[#527362]'
                          : 'bg-[#3D2C24] text-[#FAF6F0] hover:bg-[#2A1D17]'
                      }`}
                    >
                      {joined && <Check className="w-3 h-3" />}
                      <span>{joined ? 'Terdaftar di My Activity' : opp.cta_label || 'Ikuti Opportunity'}</span>
                    </button>
                    {opp.media_type === 'link' && opp.link_url && /^https?:\/\//i.test(opp.link_url) && (
                      <a
                        href={opp.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#F2EAE0] text-[#3D2C24] text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <span>Buka Tautan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#527362]" />
            <h2 className="font-display text-lg font-semibold text-[#3D2C24]">Community</h2>
          </div>
          <div className="space-y-2.5">
            {(data?.communities || []).map((comm) => {
              const joined = data?.userEngagementIds.includes(comm.id);
              const mediaSrc = comm.media_url || comm.image_url;
              return (
                <div key={comm.id} className="p-3.5 rounded-xl bg-white border border-[#3D2C24]/10 space-y-2">
                  {comm.media_type === 'video' && mediaSrc ? (
                    <video src={mediaSrc} controls playsInline className="w-full h-36 rounded-lg object-cover bg-black/90" />
                  ) : mediaSrc ? (
                    <div className="w-full h-32 rounded-lg overflow-hidden bg-[#F2EAE0]">
                      <SafeImage src={mediaSrc} alt={comm.title} className="w-full h-full object-cover" />
                    </div>
                  ) : null}
                  <p className="text-[10px] font-medium text-[#527362]">{comm.subtitle}</p>
                  <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24]">{comm.title}</h3>
                  <p className="text-[11px] text-[#6E5A50] leading-relaxed">{comm.body}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleToggleEngagement(comm.id)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors ${
                        joined
                          ? 'bg-[#6B8E7B]/20 text-[#527362]'
                          : 'bg-[#6B8E7B] text-white hover:bg-[#527362]'
                      }`}
                    >
                      {joined && <Check className="w-3 h-3" />}
                      <span>{joined ? 'Sudah Bergabung' : comm.cta_label || 'Gabung Community'}</span>
                    </button>
                    {comm.media_type === 'link' && comm.link_url && /^https?:\/\//i.test(comm.link_url) && (
                      <a
                        href={comm.link_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-[#F2EAE0] text-[#3D2C24] text-[11px] font-semibold inline-flex items-center gap-1"
                      >
                        <span>Buka Tautan</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Compact Affiliate Information Banner */}
      {(data?.affiliateInfo || []).map((aff) => (
        <section
          key={aff.id}
          className="rounded-2xl p-4 sm:p-5 bg-[#F3C669]/25 border border-[#F3C669]/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
        >
          <div className="space-y-1 max-w-2xl">
            <p className="text-[11px] font-semibold text-[#3D2C24]/80">{aff.subtitle}</p>
            <h2 className="font-display text-lg font-semibold text-[#3D2C24]">{aff.title}</h2>
            <p className="text-xs text-[#3D2C24]/85 leading-relaxed">{aff.body}</p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <button
              onClick={() => {
                setActiveTab('account');
                setAccountSubView('store');
              }}
              className="px-3.5 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <StoreIcon className="w-3.5 h-3.5" />
              <span>{aff.cta_label || 'Buka Toko Affiliate'}</span>
            </button>
            <button
              onClick={() => setActiveTab('academy')}
              className="px-3.5 py-2 rounded-xl bg-white border border-[#3D2C24]/15 text-xs font-semibold text-[#3D2C24] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Belajar Affiliate</span>
            </button>
          </div>
        </section>
      ))}

      {/* Official Website Footer: Logo, License, Contact/Email & Social Media */}
      <footer className="mt-4 pt-6 border-t border-[#3D2C24]/12 bg-[#FCF5F1]">
        <div className="grid sm:grid-cols-2 lg:grid-cols-12 gap-5 items-start">
          {/* Logo & Official License */}
          <div className="lg:col-span-5 space-y-2.5">
            <img
              src="/assets/aistudio/file_000000009ff08207aa2f6020b9727e1d_734b5d00.png"
              alt="WD.UP — Women Digital Level Up"
              className="h-20 w-auto object-contain"
            />
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#527362]">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>{footer?.license_title || 'Lisensi Resmi Platform Ekosistem Digital Perempuan WD.UP'}</span>
              </div>
              <p className="font-mono text-[11px] text-[#3D2C24]/80">
                {footer?.license_number || 'WDUP-ID-2026-001 · Terdaftar Resmi'}
              </p>
            </div>
          </div>

          {/* Official Contact & Email */}
          <div className="lg:col-span-4 space-y-2 text-xs">
            <h3 className="font-display text-sm font-semibold text-[#3D2C24]">Kontak & Dukungan Resmi</h3>
            {footer?.email && (
              <a
                href={`mailto:${footer.email}`}
                className="flex items-center gap-2 text-[#6E5A50] hover:text-[#3D2C24]"
              >
                <Mail className="w-3.5 h-3.5 text-[#527362] shrink-0" />
                <span>{footer.email}</span>
              </a>
            )}
            {footer?.whatsapp && (
              <p className="flex items-center gap-2 text-[#6E5A50]">
                <Phone className="w-3.5 h-3.5 text-[#527362] shrink-0" />
                <span className="font-mono">{footer.whatsapp}</span>
              </p>
            )}
            {footer?.address && (
              <p className="flex items-center gap-2 text-[#6E5A50]">
                <MapPin className="w-3.5 h-3.5 text-[#527362] shrink-0" />
                <span>{footer.address}</span>
              </p>
            )}
          </div>

          {/* Official Social Media */}
          <div className="lg:col-span-3 space-y-2 text-xs">
            <h3 className="font-display text-sm font-semibold text-[#3D2C24]">Media Sosial Resmi</h3>
            <div className="flex flex-wrap gap-2">
              {footer?.instagram && (
                <a
                  href={footer.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] font-semibold inline-flex items-center gap-1"
                >
                  <span>Instagram</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {footer?.tiktok && (
                <a
                  href={footer.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] font-semibold inline-flex items-center gap-1"
                >
                  <span>TikTok</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {footer?.youtube && (
                <a
                  href={footer.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] font-semibold inline-flex items-center gap-1"
                >
                  <span>YouTube</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
              {footer?.website && (
                <a
                  href={footer.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] font-semibold inline-flex items-center gap-1"
                >
                  <Globe className="w-3 h-3" />
                  <span>Website</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-5 pt-3 border-t border-[#3D2C24]/10 text-[11px] text-[#6E5A50]">
          {footer?.copyright || '© 2026 WD.UP — Women Digital Level Up. Seluruh hak cipta dilindungi.'}
        </div>
      </footer>

      <SandboxedLandingModal
        open={Boolean(landingPreview)}
        onClose={() => setLandingPreview(null)}
        title={landingPreview?.title || 'Landing Page Produk'}
        html={landingPreview?.html}
        externalUrl={landingPreview?.url}
      />

      {purchaseModalProduct && (
        <ProductPurchaseModal
          product={purchaseModalProduct}
          onClose={() => setPurchaseModalProduct(null)}
          onConfirmAdd={({ unitPrice, customPrice, selectedAddons, openDrawer }) => {
            addToCart(
              {
                item_type: 'product',
                item_id: purchaseModalProduct.id,
                title: purchaseModalProduct.title,
                price: unitPrice,
                quantity: 1,
                image_url: purchaseModalProduct.image_url,
                meta: `${purchaseModalProduct.category} · ${purchaseModalProduct.store_name || 'WD.UP Store'}`,
                custom_price: customPrice,
                selected_addons: selectedAddons,
              },
              openDrawer
            );
          }}
        />
      )}
    </div>
  );
}
