import React, { useEffect, useState } from 'react';
import { Code2, Crown, ExternalLink, Lock, Search, ShoppingBag, ShoppingCart, Store as StoreIcon, X } from 'lucide-react';
import { apiFetch, formatRupiah } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { MARKET_CATEGORIES, type Product } from '../types/wdup';
import { SafeImage } from './SafeImage';
import { ProductAccessViewer } from './ProductAccessViewer';
import { FormattedDescription, SandboxedLandingModal } from './SandboxedLandingModal';
import { ProductPurchaseModal } from './ProductPurchaseModal';
import {
  getCoverShapeClasses,
  getProductCtaLabel,
  getProductPriceSummary,
  productNeedsPurchaseModal,
} from '../lib/productUtils';

function getRemainingQuota(p: Product): number | null {
  if (p.quota_limit === null || p.quota_limit === undefined) return null;
  return Math.max(0, p.quota_limit - (p.sales_count || 0));
}

function getPromoPercent(p: Product): number | null {
  if (p.pricing_mode && p.pricing_mode !== 'fixed') return null;
  if (!p.original_price || p.original_price <= p.price) return null;
  return Math.max(1, Math.round(((p.original_price - p.price) / p.original_price) * 100));
}

export function MarketView() {
  const {
    user,
    marketFilterPillar,
    setMarketFilterPillar,
    openPublicStore,
    addToCart,
    setActiveTab,
    setAccountSubView,
    setAuthModalOpen,
    catalogVersion,
    toast,
  } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('latest');
  const [loading, setLoading] = useState(true);
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [landingPreview, setLandingPreview] = useState<{ title: string; html?: string; url?: string } | null>(null);
  const [purchaseModalProduct, setPurchaseModalProduct] = useState<Product | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory !== 'Semua') params.set('category', selectedCategory);
      if (marketFilterPillar !== 'Semua') params.set('pillar', marketFilterPillar);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());
      params.set('sort', sortBy);

      const res = await apiFetch<{ products: Product[] }>(`/api/market/products?${params.toString()}`);
      setProducts(res.products || []);
    } catch {
      // handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(loadProducts, 200);
    return () => clearTimeout(t);
  }, [selectedCategory, marketFilterPillar, searchQuery, sortBy, catalogVersion]);

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await apiFetch<{ product: Product }>(`/api/market/products/${id}`);
      setDetailProduct(res.product);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Gagal memuat detail produk.', 'coral');
    } finally {
      setLoadingDetail(false);
    }
  };

  const toCartItem = (p: Product) => ({
    item_type: 'product' as const,
    item_id: p.id,
    title: p.title,
    price: p.price,
    quantity: 1,
    image_url: p.image_url,
    meta: `${p.category} · ${p.store_name || 'WD.UP Store'}`,
  });

  const handleProductAction = (p: Product, openDrawer: boolean) => {
    if (productNeedsPurchaseModal(p)) {
      setPurchaseModalProduct(p);
      return;
    }
    addToCart(toCartItem(p), openDrawer);
  };

  const detailQuota = detailProduct ? getRemainingQuota(detailProduct) : null;
  const detailSoldOut = detailQuota !== null && detailQuota <= 0;
  const detailPromoPct = detailProduct ? getPromoPercent(detailProduct) : null;
  const detailPriceSummary = detailProduct ? getProductPriceSummary(detailProduct) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 space-y-4 pb-24 md:pb-10">
      {/* Compact Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-semibold text-[#3D2C24]">WD.UP Market</h1>
          <p className="text-xs text-[#6E5A50]">
            E-book, template, planner, worksheet, produk digital, dan jasa profesional.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!user) {
                setAuthModalOpen(true);
                return;
              }
              setActiveTab('account');
              setAccountSubView('activity');
            }}
            className="px-3 py-1.5 rounded-xl bg-white border border-[#3D2C24]/15 text-[11px] font-semibold text-[#3D2C24] hover:bg-[#F2EAE0] cursor-pointer whitespace-nowrap"
          >
            Riwayat & Akses
          </button>
          <button
            onClick={() => {
              setActiveTab('account');
              setAccountSubView('store');
            }}
            className="px-3 py-1.5 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold cursor-pointer whitespace-nowrap"
          >
            Jual / Affiliate
          </button>
        </div>
      </div>

      {/* Compact Search & Filters */}
      <div className="space-y-2.5 bg-white p-3 rounded-2xl border border-[#3D2C24]/10">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[#6E5A50] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari e-book, planner, template, jasa, atau toko..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 text-xs focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
            />
          </div>
          <div className="flex gap-2">
            {marketFilterPillar !== 'Semua' && (
              <button
                onClick={() => setMarketFilterPillar('Semua')}
                className="px-2.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 text-[11px] font-semibold text-[#527362] cursor-pointer whitespace-nowrap"
              >
                Pilar: {marketFilterPillar} ×
              </button>
            )}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Urutkan produk"
              className="flex-1 sm:flex-none px-2.5 py-2 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/12 text-[11px] font-semibold text-[#3D2C24]"
            >
              <option value="latest">Terbaru</option>
              <option value="popular">Terlaris</option>
              <option value="price_asc">Harga Terendah</option>
              <option value="price_desc">Harga Tertinggi</option>
            </select>
          </div>
        </div>

        {/* Digital Market Category Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {MARKET_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#3D2C24] text-[#FAF6F0]'
                  : 'bg-[#FAF6F0] text-[#6E5A50] hover:text-[#3D2C24]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Compact 2–4 Column Product Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <div key={n} className="h-56 rounded-2xl bg-[#F2EAE0] animate-pulse" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-2xl border border-[#3D2C24]/10 space-y-2">
          <ShoppingBag className="w-8 h-8 text-[#6E5A50]/50 mx-auto" />
          <p className="text-xs font-semibold text-[#3D2C24]">Belum ada produk untuk filter ini</p>
          <button
            onClick={() => {
              setSelectedCategory('Semua');
              setMarketFilterPillar('Semua');
              setSearchQuery('');
            }}
            className="text-xs font-semibold text-[#527362] underline cursor-pointer"
          >
            Reset Filter
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {products.map((p) => {
            const cover = getCoverShapeClasses(p.cover_shape);
            const priceSummary = getProductPriceSummary(p);
            const remaining = getRemainingQuota(p);
            const isSoldOut = remaining !== null && remaining <= 0;
            const promoPct = getPromoPercent(p);
            const hasLandingUrl = Boolean(p.landing_page_url && /^https?:\/\//i.test(p.landing_page_url));
            const hasLandingHtml = Boolean(p.custom_landing_html && p.custom_landing_html.trim());
            const addonsCount = p.addons?.length || 0;

            return (
              <article
                key={p.id}
                className="rounded-2xl border border-[#3D2C24]/10 bg-white overflow-hidden flex flex-col justify-between hover:-translate-y-0.5 transition-transform"
              >
                <div>
                  {p.image_url ? (
                    <button
                      onClick={() => openDetail(p.id)}
                      className="w-full text-left cursor-pointer focus-visible:outline-none relative block"
                    >
                      <div className={cover.wrapper}>
                        <SafeImage src={p.image_url} alt={p.title} className={cover.image} />
                      </div>
                    </button>
                  ) : (
                    <button
                      onClick={() => openDetail(p.id)}
                      className="w-full text-left px-3 pt-3 pb-1 cursor-pointer block"
                    >
                      <div className="px-2.5 py-2 rounded-xl bg-[#F2EAE0]/70 border border-[#3D2C24]/10 flex items-center justify-between text-[10px] font-semibold text-[#527362]">
                        <span className="truncate">{p.category}</span>
                        <span className="font-mono uppercase">{p.access_type || 'LINK'}</span>
                      </div>
                    </button>
                  )}

                  <div className="p-2.5 sm:p-3 space-y-1">
                    <div className="flex items-center justify-between gap-1 text-[10px] text-[#6E5A50]">
                      <span className="truncate">{p.category}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.is_pro_seller && (
                          <span className="px-1.5 py-0.5 rounded bg-[#3D2C24] text-[#F3C669] text-[9px] font-bold inline-flex items-center gap-0.5">
                            <Crown className="w-2.5 h-2.5" />
                            <span>PRO</span>
                          </span>
                        )}
                        <span className="uppercase font-mono">{p.access_type || 'Link'}</span>
                      </div>
                    </div>
                    <button onClick={() => openDetail(p.id)} className="text-left cursor-pointer block w-full">
                      <h2 className="text-xs sm:text-[13px] font-semibold text-[#3D2C24] hover:text-[#527362] transition-colors line-clamp-2 leading-snug">
                        {p.title}
                      </h2>
                    </button>
                    <div className="flex items-center justify-between gap-1 text-[10px] pt-0.5">
                      <div className="flex items-center gap-1 min-w-0">
                        <StoreIcon className="w-3 h-3 text-[#527362] shrink-0" />
                        <button
                          onClick={() => p.store_username && openPublicStore(p.store_username)}
                          className="font-medium text-[#527362] hover:underline truncate cursor-pointer"
                        >
                          {p.store_name}
                        </button>
                      </div>
                      {(hasLandingHtml || hasLandingUrl) && (
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
                  </div>
                </div>

                <div className="px-2.5 sm:px-3 pb-2.5 pt-2 border-t border-[#3D2C24]/8 space-y-2">
                  <div className="flex items-end justify-between gap-1">
                    <div className="min-w-0">
                      {!priceSummary.isPwyw && promoPct !== null && p.original_price && (
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono tabular-nums text-[10px] text-[#6E5A50] line-through">
                            {formatRupiah(p.original_price)}
                          </span>
                          <span className="text-[9px] font-semibold text-[#E07A5F]">Hemat {promoPct}%</span>
                        </div>
                      )}
                      {priceSummary.isPwyw && priceSummary.secondary && (
                        <p className="text-[9px] font-semibold text-[#527362]">{priceSummary.secondary}</p>
                      )}
                      <p className="font-mono tabular-nums text-xs sm:text-sm font-bold text-[#3D2C24]">
                        {priceSummary.primary}
                      </p>
                      {addonsCount > 0 && (
                        <p className="text-[9px] font-semibold text-[#527362]">+{addonsCount} Add-On tersedia</p>
                      )}
                    </div>
                    <p
                      className={`text-[10px] shrink-0 ${
                        isSoldOut ? 'font-semibold text-[#E07A5F]' : 'text-[#6E5A50]'
                      }`}
                    >
                      {remaining !== null
                        ? isSoldOut
                          ? 'Kuota Habis'
                          : `Sisa ${remaining}`
                        : `${p.sales_count} terjual`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleProductAction(p, false)}
                      disabled={isSoldOut}
                      className="p-1.5 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Tambah ke Keranjang"
                      aria-label="Tambah ke Keranjang"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleProductAction(p, true)}
                      disabled={isSoldOut}
                      className="flex-1 py-1.5 px-2.5 rounded-lg bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer disabled:bg-[#6E5A50]/40 disabled:cursor-not-allowed truncate"
                    >
                      {isSoldOut ? 'Kuota Habis' : getProductCtaLabel(p)}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Product Detail Modal */}
      {(detailProduct || loadingDetail) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#3D2C24]/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-[#FAF6F0] rounded-2xl border border-[#3D2C24]/15 shadow-2xl overflow-hidden max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#3D2C24]/10 bg-white">
              <span className="text-xs font-semibold text-[#527362]">
                {detailProduct?.category || 'Memuat produk...'}
              </span>
              <button
                onClick={() => setDetailProduct(null)}
                className="w-8 h-8 rounded-full hover:bg-[#F2EAE0] flex items-center justify-center cursor-pointer"
                aria-label="Tutup detail"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {loadingDetail && !detailProduct ? (
              <div className="p-8 text-center text-xs text-[#6E5A50]">Memuat detail produk...</div>
            ) : detailProduct ? (
              <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className={detailProduct.image_url ? 'grid sm:grid-cols-2 gap-4 items-start' : 'space-y-3'}>
                  {detailProduct.image_url && (() => {
                    const detailCover = getCoverShapeClasses(detailProduct.cover_shape);
                    return (
                      <div className={`${detailCover.wrapper} rounded-xl`}>
                        <SafeImage
                          src={detailProduct.image_url}
                          alt={detailProduct.title}
                          className={detailCover.image}
                        />
                      </div>
                    );
                  })()}
                  <div className="space-y-2">
                    <h2 className="font-display text-lg font-semibold text-[#3D2C24] leading-snug">
                      {detailProduct.title}
                    </h2>
                    <div>
                      {detailPriceSummary && !detailPriceSummary.isPwyw && detailPromoPct !== null && detailProduct.original_price && (
                        <div className="flex items-center gap-2">
                          <span className="font-mono tabular-nums text-xs text-[#6E5A50] line-through">
                            {formatRupiah(detailProduct.original_price)}
                          </span>
                          <span className="text-[11px] font-semibold text-[#E07A5F]">Hemat {detailPromoPct}%</span>
                        </div>
                      )}
                      {detailPriceSummary?.isPwyw && detailPriceSummary.secondary && (
                        <p className="text-[11px] font-semibold text-[#527362]">{detailPriceSummary.secondary}</p>
                      )}
                      <p className="font-mono tabular-nums text-lg font-bold text-[#3D2C24]">
                        {detailPriceSummary ? detailPriceSummary.primary : formatRupiah(detailProduct.price)}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#6E5A50]">
                      Akses {(detailProduct.access_type || 'link').toUpperCase()} ·{' '}
                      {detailQuota !== null
                        ? detailSoldOut
                          ? 'Kuota Habis'
                          : `Kuota tersisa ${detailQuota}`
                        : `${detailProduct.sales_count} terjual`}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {detailProduct.custom_landing_html && (
                        <button
                          type="button"
                          onClick={() =>
                            setLandingPreview({
                              title: detailProduct.title,
                              html: detailProduct.custom_landing_html,
                              url: detailProduct.landing_page_url,
                            })
                          }
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#3D2C24] text-[#FAF6F0] text-[11px] font-semibold cursor-pointer"
                        >
                          <Code2 className="w-3 h-3 text-[#F3C669]" />
                          <span>Buka Landing Page Produk</span>
                        </button>
                      )}
                      {detailProduct.landing_page_url && /^https?:\/\//i.test(detailProduct.landing_page_url) && (
                        <a
                          href={detailProduct.landing_page_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[11px] font-semibold text-[#3D2C24]"
                        >
                          <ExternalLink className="w-3 h-3 text-[#527362]" />
                          <span>Tautan Landing Eksternal</span>
                        </a>
                      )}
                    </div>
                    <div className="p-2.5 rounded-xl bg-white border border-[#3D2C24]/10 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#3D2C24] truncate">{detailProduct.store_name}</p>
                        <p className="text-[10px] text-[#6E5A50] truncate">@{detailProduct.store_username}</p>
                      </div>
                      <button
                        onClick={() => {
                          setDetailProduct(null);
                          if (detailProduct.store_username) openPublicStore(detailProduct.store_username);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-[#F2EAE0] text-[11px] font-semibold text-[#3D2C24] shrink-0 cursor-pointer"
                      >
                        Kunjungi
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-[#3D2C24]">Deskripsi Produk</h3>
                  <FormattedDescription text={detailProduct.description} />
                </div>

                {/* Verified Access Box */}
                {detailProduct.hasAccess &&
                (detailProduct.delivery_content || detailProduct.access_url || detailProduct.has_access_file) ? (
                  <ProductAccessViewer
                    productId={detailProduct.id}
                    accessType={detailProduct.access_type}
                    accessUrl={detailProduct.access_url}
                    accessFileName={detailProduct.access_file_name}
                    hasAccessFile={detailProduct.has_access_file}
                    deliveryContent={detailProduct.delivery_content}
                  />
                ) : (
                  <div className="p-3 rounded-xl bg-[#F2EAE0] border border-[#3D2C24]/10 flex items-start gap-2.5 text-[11px] text-[#6E5A50]">
                    <Lock className="w-4 h-4 text-[#3D2C24] shrink-0 mt-0.5" />
                    <span>
                      Tautan / file akses ({(detailProduct.access_type || 'link').toUpperCase()}) terbuka otomatis
                      setelah pembayaran Anda terverifikasi <strong className="text-[#3D2C24]">Paid</strong>.
                    </span>
                  </div>
                )}

                {detailProduct.addons && detailProduct.addons.length > 0 && (
                  <div className="p-3 rounded-xl bg-white border border-[#3D2C24]/10 space-y-1.5">
                    <p className="text-xs font-semibold text-[#3D2C24]">
                      Add-On Opsional Tersedia ({detailProduct.addons.length})
                    </p>
                    <div className="space-y-1">
                      {detailProduct.addons.map((addon) => (
                        <div key={addon.id} className="flex items-center justify-between text-[11px]">
                          <span className="text-[#3D2C24]">{addon.title}</span>
                          <span className="font-mono font-semibold text-[#527362]">
                            {addon.price > 0 ? `+${formatRupiah(addon.price)}` : 'Gratis'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => {
                      const prod = detailProduct;
                      setDetailProduct(null);
                      handleProductAction(prod, false);
                    }}
                    disabled={detailSoldOut}
                    className="px-3.5 py-2 rounded-xl bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[#3D2C24] text-xs font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    + Keranjang
                  </button>
                  <button
                    onClick={() => {
                      const prod = detailProduct;
                      setDetailProduct(null);
                      handleProductAction(prod, true);
                    }}
                    disabled={detailSoldOut}
                    className="px-4 py-2 rounded-xl bg-[#3D2C24] hover:bg-[#2A1D17] text-[#FAF6F0] text-xs font-semibold cursor-pointer disabled:bg-[#6E5A50]/40 disabled:cursor-not-allowed"
                  >
                    {detailSoldOut ? 'Kuota Habis' : getProductCtaLabel(detailProduct)}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

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
                ...toCartItem(purchaseModalProduct),
                price: unitPrice,
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
