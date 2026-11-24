import React from 'react';
import { Code2, ExternalLink, X } from 'lucide-react';

function buildSandboxedDocument(rawHtml: string): string {
  const trimmed = rawHtml.trim();
  const referrerMeta = '<meta name="referrer" content="no-referrer">';
  const baseStyles = `<style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; color: #3D2C24; background: #FAF6F0; line-height: 1.55; }
    img { max-width: 100%; height: auto; display: block; border-radius: 10px; }
  </style>`;
  if (/<html[\s>]/i.test(trimmed)) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(/<head([^>]*)>/i, `<head$1>${referrerMeta}`);
    }
    return trimmed;
  }
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${referrerMeta}${baseStyles}</head><body>${trimmed}</body></html>`;
}

export function SandboxedHtmlFrame({
  html,
  title,
  heightClass = 'h-72 sm:h-80',
}: {
  html: string;
  title: string;
  heightClass?: string;
}) {
  if (!html?.trim()) return null;
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={buildSandboxedDocument(html)}
      className={`w-full ${heightClass} rounded-xl border border-[#3D2C24]/12 bg-[#FAF6F0]`}
    />
  );
}

export function SandboxedLandingModal({
  open,
  onClose,
  title,
  html,
  externalUrl,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  html?: string;
  externalUrl?: string;
}) {
  if (!open) return null;
  const hasValidExternal = Boolean(externalUrl && /^https?:\/\//i.test(externalUrl));

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#3D2C24]/55 backdrop-blur-sm p-4">
      <div className="w-full max-w-3xl bg-[#FAF6F0] rounded-2xl border border-[#3D2C24]/15 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between gap-2 px-4 py-3 bg-white border-b border-[#3D2C24]/10">
          <div className="flex items-center gap-2 min-w-0">
            <Code2 className="w-4 h-4 text-[#527362] shrink-0" />
            <h3 className="text-xs sm:text-sm font-semibold text-[#3D2C24] truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasValidExternal && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 rounded-lg bg-[#F2EAE0] hover:bg-[#E7DDD0] text-[11px] font-semibold text-[#3D2C24] inline-flex items-center gap-1"
              >
                <span>Buka Tautan</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full hover:bg-[#F2EAE0] flex items-center justify-center cursor-pointer"
              aria-label="Tutup landing page"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="p-3 sm:p-4 overflow-y-auto space-y-3">
          {html?.trim() ? (
            <SandboxedHtmlFrame html={html} title={title} heightClass="h-[62vh]" />
          ) : hasValidExternal ? (
            <div className="p-6 text-center space-y-3 bg-white rounded-xl border border-[#3D2C24]/10">
              <p className="text-xs text-[#6E5A50]">Halaman ini menggunakan tautan landing page eksternal.</p>
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#3D2C24] text-[#FAF6F0] text-xs font-semibold"
              >
                <span>Buka Landing Page Eksternal</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Safely renders structured plain text descriptions with **bold** highlights and `- ` bullet lists
 * using React elements only (no raw HTML injection).
 */
export function FormattedDescription({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);

  const renderInlineBold = (line: string) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        return (
          <strong key={idx} className="font-semibold text-[#3D2C24]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  return (
    <div className="text-xs text-[#3D2C24]/85 leading-relaxed space-y-1">
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1">
              <span className="text-[#527362] font-bold mt-0.5">•</span>
              <span>{renderInlineBold(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineBold(rawLine)}</p>;
      })}
    </div>
  );
}
