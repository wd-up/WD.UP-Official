import React, { useMemo, useState } from 'react';
import { Check, Gift, ShoppingBag, Sparkles, X } from 'lucide-react';
import { formatRupiah } from '../lib/api';
import { getCoverShapeClasses, getProductCtaLabel } from '../lib/productUtils';
import type { Product, ProductAddon } from '../types/wdup';
import { SafeImage } from './SafeImage';

interface ProductPurchaseModalProps {
  product: Product;
  affiliateUsername?: string;
  onClose: () => void;
  onConfirmAdd: (payload: {
    unitPrice: number;
    customPrice?: number;
    selectedAddons: ProductAddon[];
    openDrawer: boolean;
  }) => void;
}

export function ProductPurchaseModal({
  product,
  onClose,
  onConfirmAdd,
}: ProductPurchaseModalProps) {
  const isPwyw = product.pricing_mode === 'pwyw' || product.pricing_mode === 'pwyw_min';
  const minPrice =
    product.pricing_mode === 'pwyw_min'
      ? Math.max(1000, Number(product.min_price || product.price || 1000))
      : 1000;
  const initialCustom = isPwyw
    ? Math.max(minPrice, Number(product.price || minPrice))
    : Number(product.price || 0);

  const [customPriceInput, setCustomPriceInput] = useState<string>(String(initialCustom));
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);
  const [error, setError] = useState('');

  const addons = product.addons || [];
  const selectedAddons = useMemo(
    () => addons.filter((a) => selectedAddonIds.includes(a.id)),
    [addons, selectedAddonIds]
  );
  const addonsTotal = useMemo(
    () => selectedAddons.reduce((sum, a) => sum + Number(a.price || 0), 0),
    [selectedAddons]
  );

  const parsedBasePrice = isPwyw
    ? Math.max(0, Math.round(Number(customPriceInput || 0)))
    : Number(product.price || 0);
  const totalUnitPrice = parsedBasePrice + addonsTotal;

  const toggleAddon = (id: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = (openDrawer: boolean) => {
    if (isPwyw) {
      if (!Number.isFinite(parsedBasePrice) || parsedBasePrice < minPrice) {
        setError(`Nominal bayar suka-suka minimal ${formatRupiah(minPrice)}.`);
        return;
      }
    }
    setError('');
    onConfirmAdd({
      unitPrice: totalUnitPrice,
      customPrice: isPwyw ? parsedBasePrice : undefined,
      selectedAddons,
      openDrawer,
    });
    onClose();
  };

  const quickPresets = isPwyw
    ? Array.from(new Set([minPrice, Math.max(minPrice, 25000), Math.max(minPrice, 50000), Math.max(minPrice, 100000)]))
        .sort((a, b) => a - b)
        .slice(0, 4)
    : [];

  const coverClasses = getCoverShapeClasses(product.cover_shape);

  return (
    <div className="fixed inset-0 z-50 bg-[#3D2C24]/55 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-[#FAF6F0] rounded-3xl border border-[#3D2C24]/15 shadow-2xl overflow-hidden my-8">
        <div className="px-5 py-4 bg-white border-b border-[#3D2C24]/10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#527362]">
              {isPwyw ? 'Bayar Suka-Suka' : 'Pilih Opsi Produk'}
            </p>
            <h3 className="font-display text-base font-semibold text-[#3D2C24] truncate">
              {product.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-[#F2EAE0] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Tutup"
          >
            <X className="w-4 h-4 text-[#3D2C24]" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {product.image_url && (
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-white border border-[#3D2C24]/10">
              <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#F2EAE0] shrink-0">
                <SafeImage src={product.image_url} alt={product.title} className={coverClasses.image} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#3D2C24] line-clamp-2">{product.title}</p>
                <p className="text-[11px] text-[#6E5A50] mt-0.5">{product.category}</p>
              </div>
            </div>
          )}

          {isPwyw ? (
            <div className="p-4 rounded-2xl bg-white border border-[#3D2C24]/12 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold text-[#3D2C24] flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-[#E07A5F]" />
                  <span>Masukkan Nominal Pilihan Anda (Rp)</span>
                </label>
                <span className="text-[11px] font-mono text-[#6E5A50]">
                  Min. {formatRupiah(minPrice)}
                </span>
              </div>
              <input
                type="number"
                min={minPrice}
                step={1000}
                value={customPriceInput}
                onChange={(e) => {
                  setCustomPriceInput(e.target.value);
                  setError('');
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#FAF6F0] border border-[#3D2C24]/20 font-mono text-base font-bold text-[#3D2C24] focus:outline-none focus:ring-2 focus:ring-[#6B8E7B]"
                placeholder={String(minPrice)}
              />
              {quickPresets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {quickPresets.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setCustomPriceInput(String(amt));
                        setError('');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-semibold cursor-pointer border transition-colors ${
                        parsedBasePrice === amt
                          ? 'bg-[#3D2C24] text-[#FAF6F0] border-[#3D2C24]'
                          : 'bg-[#FAF6F0] text-[#3D2C24] border-[#3D2C24]/15 hover:bg-[#F2EAE0]'
                      }`}
                    >
                      {formatRupiah(amt)}
                    </button>
                  ))}
                </div>
              )}
              {error && <p className="text-xs text-[#E07A5F] font-medium">{error}</p>}
            </div>
          ) : (
            <div className="p-3.5 rounded-2xl bg-white border border-[#3D2C24]/10 flex items-center justify-between text-xs">
              <span className="text-[#6E5A50] font-medium">Harga Produk Utama</span>
              <span className="font-mono font-bold text-sm text-[#3D2C24]">{formatRupiah(product.price)}</span>
            </div>
          )}

          {addons.length > 0 && (
            <div className="p-4 rounded-2xl bg-white border border-[#3D2C24]/12 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#3D2C24]">
                <Sparkles className="w-4 h-4 text-[#6B8E7B]" />
                <span>Add-On Produk Opsional ({addons.length})</span>
              </div>
              <p className="text-[11px] text-[#6E5A50]">
                Centang add-on tambahan yang ingin Anda sertakan. Link akses add-on terbuka otomatis setelah pembayaran Paid.
              </p>
              <div className="space-y-2">
                {addons.map((addon) => {
                  const checked = selectedAddonIds.includes(addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => toggleAddon(addon.id)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#EFF5F1] border-[#6B8E7B] text-[#3D2C24]'
                          : 'bg-[#FAF6F0] border-[#3D2C24]/12 text-[#3D2C24] hover:bg-[#F2EAE0]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 border ${
                            checked
                              ? 'bg-[#6B8E7B] border-[#6B8E7B] text-white'
                              : 'bg-white border-[#3D2C24]/25'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <span className="text-xs font-semibold truncate">{addon.title}</span>
                      </div>
                      <span className="text-xs font-mono font-bold text-[#527362] shrink-0">
                        {addon.price > 0 ? `+${formatRupiah(addon.price)}` : 'Gratis'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="p-3.5 rounded-2xl bg-[#3D2C24] text-[#FAF6F0] flex items-center justify-between">
            <div>
              <p className="text-[11px] text-[#FAF6F0]/75">Total per item</p>
              <p className="font-mono text-lg font-bold">{formatRupiah(totalUnitPrice)}</p>
            </div>
            {selectedAddons.length > 0 && (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-white/15 text-[#F3C669] font-semibold">
                +{selectedAddons.length} Add-On
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => handleSubmit(false)}
              className="py-2.5 px-3 rounded-xl bg-white border border-[#3D2C24]/20 hover:bg-[#F2EAE0] text-[#3D2C24] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>+ Keranjang</span>
            </button>
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              className="py-2.5 px-3 rounded-xl bg-[#6B8E7B] hover:bg-[#527362] text-white text-xs font-semibold cursor-pointer"
            >
              {getProductCtaLabel(product)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
