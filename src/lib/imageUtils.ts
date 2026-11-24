/**
 * Client-side image compression and safe landing-page image snippet utilities.
 * Converts large mobile/Canva images into lightweight raster Data URLs on HTML5 Canvas
 * so uploads stay fast and never exceed storage quotas.
 */

export interface CompressImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  maxDataUrlLength?: number;
}

const DEFAULT_MAX_DATA_URL_LENGTH = 1_400_000; // ~1 MB binary equivalent

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Gagal membaca file gambar.'));
      }
    };
    reader.onerror = () => reject(new Error('File gambar tidak dapat dibaca.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Format gambar tidak didukung oleh browser. Gunakan JPG, PNG, atau WebP.'));
    img.src = src;
  });
}

export async function compressImageFile(file: File, options: CompressImageOptions = {}): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Pilih file gambar yang valid (JPG, PNG, WebP, atau GIF).');
  }

  const maxWidth = options.maxWidth ?? 1280;
  const maxHeight = options.maxHeight ?? 1280;
  const initialQuality = options.quality ?? 0.84;
  const maxDataUrlLength = options.maxDataUrlLength ?? DEFAULT_MAX_DATA_URL_LENGTH;

  // Preserve small animated GIFs directly when within cap
  if (file.type === 'image/gif' && file.size <= 750_000) {
    const rawGif = await readFileAsDataUrl(file);
    if (rawGif.length <= maxDataUrlLength) return rawGif;
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImageElement(objectUrl);
    const srcW = img.naturalWidth || img.width || 800;
    const srcH = img.naturalHeight || img.height || 600;

    let scale = Math.min(1, maxWidth / srcW, maxHeight / srcH);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Browser tidak mendukung pemrosesan gambar.');
    }

    // Prefer WebP when supported for best size/quality, else JPEG
    const webpTest = canvas.toDataURL('image/webp');
    const targetMime = webpTest.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';

    const qualitySteps = [initialQuality, Math.max(0.55, initialQuality - 0.14), 0.56];
    let bestDataUrl = '';

    for (let scaleAttempt = 0; scaleAttempt < 3; scaleAttempt++) {
      const targetW = Math.max(120, Math.round(srcW * scale));
      const targetH = Math.max(120, Math.round(srcH * scale));
      canvas.width = targetW;
      canvas.height = targetH;

      // Fill warm cream background in case source PNG had transparent pixels
      ctx.fillStyle = '#FAF6F0';
      ctx.fillRect(0, 0, targetW, targetH);
      ctx.drawImage(img, 0, 0, targetW, targetH);

      for (const q of qualitySteps) {
        const candidate = canvas.toDataURL(targetMime, q);
        bestDataUrl = candidate;
        if (candidate.length <= maxDataUrlLength) {
          return candidate;
        }
      }

      scale *= 0.72;
    }

    if (bestDataUrl && bestDataUrl.length <= maxDataUrlLength) {
      return bestDataUrl;
    }

    throw new Error('Ukuran gambar masih terlalu besar setelah kompresi. Silakan gunakan Link URL gambar (https://...).');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function buildLandingImageSnippet(src: string, alt = 'Gambar Landing Page'): string {
  const safeSrc = escapeHtmlAttr(src.trim());
  const safeAlt = escapeHtmlAttr(alt.trim() || 'Gambar Landing Page');
  return `\n<div style="margin:14px 0;">\n  <img src="${safeSrc}" alt="${safeAlt}" style="width:100%;max-height:420px;object-fit:cover;border-radius:12px;display:block;" />\n</div>`;
}

export function isValidCompleteHttpUrl(value: string): boolean {
  const s = value.trim();
  if (!s) return false;
  try {
    const parsed = new URL(s);
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

export function isSaveableMediaOrEmpty(value?: string | null): boolean {
  if (!value) return true;
  const s = value.trim();
  if (!s) return true;
  if (s.startsWith('data:image/') || s.startsWith('/assets/') || s.startsWith('/src/assets/')) {
    return true;
  }
  return isValidCompleteHttpUrl(s);
}
