import type { Product, ProductCoverShape } from '../types/wdup';
import { formatRupiah } from '../lib/api';

export function getCoverShapeClasses(shape?: ProductCoverShape | string): {
  wrapper: string;
  image: string;
} {
  switch (shape) {
    case 'square':
      return {
        wrapper: 'aspect-square w-full overflow-hidden rounded-t-2xl bg-[#F2EAE0]',
        image: 'w-full h-full object-cover',
      };
    case 'portrait':
      return {
        wrapper: 'aspect-[4/5] w-full overflow-hidden rounded-t-2xl bg-[#F2EAE0]',
        image: 'w-full h-full object-cover',
      };
    case 'wide':
      return {
        wrapper: 'aspect-video w-full overflow-hidden rounded-t-2xl bg-[#F2EAE0]',
        image: 'w-full h-full object-cover',
      };
    case 'rounded_arch':
      return {
        wrapper: 'aspect-[4/5] w-full overflow-hidden px-4 pt-4 bg-[#FAF6F0] flex items-end justify-center',
        image: 'w-full h-full object-cover rounded-t-[48%] rounded-b-xl border border-[#3D2C24]/10 shadow-sm',
      };
    case 'circle':
      return {
        wrapper: 'aspect-[4/3] w-full overflow-hidden p-4 bg-[#FAF6F0] flex items-center justify-center',
        image: 'h-full aspect-square object-cover rounded-full border-2 border-white shadow-md',
      };
    case 'landscape':
    default:
      return {
        wrapper: 'aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-[#F2EAE0]',
        image: 'w-full h-full object-cover',
      };
  }
}

export function getProductPriceSummary(product: Pick<Product, 'pricing_mode' | 'price' | 'min_price' | 'original_price'>): {
  primary: string;
  secondary?: string;
  isPwyw: boolean;
} {
  if (product.pricing_mode === 'pwyw') {
    return {
      primary: 'Bayar Suka-Suka',
      secondary: product.price > 0 ? `Saran ${formatRupiah(product.price)}` : 'Mulai Rp 1.000',
      isPwyw: true,
    };
  }
  if (product.pricing_mode === 'pwyw_min') {
    const minAmt = Math.max(1000, Number(product.min_price || product.price || 1000));
    return {
      primary: `Mulai ${formatRupiah(minAmt)}`,
      secondary: 'Bayar Suka-Suka',
      isPwyw: true,
    };
  }
  return {
    primary: formatRupiah(product.price),
    secondary:
      product.original_price && product.original_price > product.price
        ? formatRupiah(product.original_price)
        : undefined,
    isPwyw: false,
  };
}

export function getProductCtaLabel(product: Pick<Product, 'cta_label'>): string {
  const lbl = (product.cta_label || '').trim();
  return lbl || 'Beli Sekarang';
}

export function productNeedsPurchaseModal(product: Pick<Product, 'pricing_mode' | 'addons'>): boolean {
  return (
    product.pricing_mode === 'pwyw' ||
    product.pricing_mode === 'pwyw_min' ||
    Boolean(product.addons && product.addons.length > 0)
  );
}
