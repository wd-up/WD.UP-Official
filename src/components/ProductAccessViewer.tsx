import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link2,
  Video,
} from 'lucide-react';
import { fetchProductAccessBlob, formatRupiah } from '../lib/api';
import type { ProductAddon } from '../types/wdup';

interface ProductAccessViewerProps {
  productId: string;
  accessType?: string;
  accessUrl?: string;
  accessFileName?: string;
  hasAccessFile?: boolean;
  deliveryContent?: string;
  selectedAddons?: ProductAddon[];
}

export function ProductAccessViewer({
  productId,
  accessType = 'link',
  accessUrl = '',
  accessFileName = '',
  hasAccessFile = false,
  deliveryContent = '',
  selectedAddons = [],
}: ProductAccessViewerProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMime, setPreviewMime] = useState<string>('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const safeHttpUrl = accessUrl && /^https?:\/\//i.test(accessUrl) ? accessUrl : '';

  const handleOpenPreview = async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      return;
    }
    setLoadingFile(true);
    setError('');
    try {
      const { blobUrl, mime } = await fetchProductAccessBlob(productId, false);
      setPreviewUrl(blobUrl);
      setPreviewMime(mime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuka file produk.');
    } finally {
      setLoadingFile(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    try {
      const { blobUrl } = await fetchProductAccessBlob(productId, true);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = accessFileName || `wdup-produk-${productId}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh file produk.');
    } finally {
      setDownloading(false);
    }
  };

  const typeLabel: Record<string, { label: string; Icon: React.ComponentType<{ className?: string }> }> = {
    pdf: { label: 'File PDF', Icon: FileText },
    image: { label: 'Gambar', Icon: ImageIcon },
    video: { label: 'Video', Icon: Video },
    link: { label: 'Link Akses', Icon: Link2 },
  };
  const info = typeLabel[accessType] || typeLabel.link;
  const TypeIcon = info.Icon;

  return (
    <div className="p-3 rounded-xl bg-[#6B8E7B]/12 border border-[#6B8E7B]/35 space-y-2 text-xs">
      <div className="flex items-center justify-between gap-2 text-[#527362] font-semibold">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Akses Produk Terbuka ({info.label})</span>
        </span>
        <TypeIcon className="w-3.5 h-3.5 shrink-0" />
      </div>

      {deliveryContent && (
        <p className="text-[#3D2C24] leading-relaxed whitespace-pre-line">{deliveryContent}</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {safeHttpUrl && (
          <a
            href={safeHttpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-lg bg-[#3D2C24] text-[#FAF6F0] font-semibold inline-flex items-center gap-1.5 hover:bg-[#2A1D17]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Buka {info.label}</span>
          </a>
        )}

        {hasAccessFile && (
          <>
            <button
              type="button"
              onClick={handleOpenPreview}
              disabled={loadingFile}
              className="px-3 py-1.5 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <TypeIcon className="w-3.5 h-3.5" />
              <span>
                {loadingFile ? 'Memuat...' : previewUrl ? 'Tutup Pratinjau' : `Lihat ${info.label}`}
              </span>
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="px-3 py-1.5 rounded-lg bg-white border border-[#3D2C24]/15 text-[#3D2C24] font-semibold inline-flex items-center gap-1.5 cursor-pointer hover:bg-[#FAF6F0]"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{downloading ? 'Mengunduh...' : accessFileName ? `Unduh (${accessFileName})` : 'Unduh File'}</span>
            </button>
          </>
        )}
      </div>

      {error && <p className="text-[#E07A5F] font-medium">{error}</p>}

      {previewUrl && (
        <div className="pt-2">
          {previewMime.startsWith('image/') ? (
            <img src={previewUrl} alt={accessFileName || 'Akses Gambar'} className="max-h-72 rounded-xl border border-[#3D2C24]/15 object-contain bg-white" />
          ) : previewMime.startsWith('video/') ? (
            <video src={previewUrl} controls className="w-full max-h-72 rounded-xl bg-black" />
          ) : (
            <iframe
              src={previewUrl}
              title={accessFileName || 'Dokumen PDF'}
              className="w-full h-80 rounded-xl border border-[#3D2C24]/15 bg-white"
            />
          )}
        </div>
      )}

      {selectedAddons.length > 0 && (
        <div className="pt-2 mt-1 border-t border-[#6B8E7B]/25 space-y-1.5">
          <p className="text-[11px] font-semibold text-[#527362]">
            Akses Add-On Tambahan ({selectedAddons.length}):
          </p>
          <div className="space-y-1.5">
            {selectedAddons.map((addon, idx) => {
              const safeAddonUrl = addon.link && /^https?:\/\//i.test(addon.link) ? addon.link : '';
              return (
                <div
                  key={addon.id || idx}
                  className="p-2 rounded-lg bg-white border border-[#3D2C24]/10 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <p className="font-semibold text-[#3D2C24]">{addon.title}</p>
                    <p className="text-[10px] font-mono text-[#6E5A50]">
                      {addon.price > 0 ? formatRupiah(addon.price) : 'Bonus Add-On'}
                    </p>
                  </div>
                  {safeAddonUrl ? (
                    <a
                      href={safeAddonUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-[#6B8E7B] hover:bg-[#527362] text-white text-[11px] font-semibold inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Buka Add-On</span>
                    </a>
                  ) : (
                    <span className="text-[10px] text-[#6E5A50]">Tersedia di catatan akses</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
