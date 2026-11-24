import React from 'react';

export type SocialPlatformId =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'shopee'
  | 'website'
  | 'whatsapp';

export function normalizeSocialUrl(platform: SocialPlatformId, raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.toString();
      }
    } catch {
      return null;
    }
    return null;
  }

  const handle = trimmed.replace(/^@+/, '');
  if (!handle) return null;

  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${encodeURIComponent(handle)}`;
    case 'tiktok':
      return `https://tiktok.com/@${encodeURIComponent(handle)}`;
    case 'youtube':
      return `https://youtube.com/@${encodeURIComponent(handle)}`;
    case 'twitter':
      return `https://x.com/${encodeURIComponent(handle)}`;
    case 'shopee':
      return `https://shopee.co.id/${encodeURIComponent(handle)}`;
    case 'whatsapp': {
      const digits = handle.replace(/[^0-9]/g, '');
      if (!digits) return null;
      const formatted = digits.startsWith('0') ? `62${digits.slice(1)}` : digits;
      return `https://wa.me/${formatted}`;
    }
    case 'website':
      return `https://${handle}`;
  }
}

export function SocialPlatformLogo({
  platform,
  className = 'w-4 h-4',
}: {
  platform: SocialPlatformId;
  className?: string;
}) {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="2" />
          <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M14.5 3.5v10.7a3.6 3.6 0 1 1-3-3.55V8.1a6.2 6.2 0 1 0 5.6 6.17V8.4a7.3 7.3 0 0 0 4.4 1.45V7.1a4.7 4.7 0 0 1-4.4-3.6H14.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect x="2" y="5" width="20" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
          <path d="M10 9.2L15.5 12 10 14.8V9.2Z" fill="currentColor" />
        </svg>
      );
    case 'twitter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M4 4l6.8 9.1L4.3 20H6.9l5.1-5.5L16.1 20H20l-7.1-9.5L19.1 4h-2.5l-4.7 5.1L8.1 4H4Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'shopee':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M5 8.5h14l-1.1 11.5H6.1L5 8.5Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M8.5 8.5a3.5 3.5 0 0 1 7 0" stroke="currentColor" strokeWidth="2" />
          <path
            d="M14.2 12.2c-.3-.6-1-.9-1.9-.9-1.1 0-1.9.6-1.9 1.4 0 .9.8 1.2 2 1.5 1.3.3 2.1.7 2.1 1.7 0 1-1 1.7-2.4 1.7-1.1 0-2-.4-2.5-1.1"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.3 20.7l4.4-1.1A8.8 8.8 0 1 0 12 3.2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9.4 8.7c-.2-.4-.4-.4-.7-.4h-.6c-.2 0-.6.1-.8.4-.3.3-1 1-1 2.4s1.1 2.8 1.2 3c.2.2 2.1 3.3 5.2 4.5 2.5 1 3 .8 3.6.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.7-.4l-1.8-.9c-.3-.1-.5-.2-.8.2l-.7.9c-.2.2-.4.2-.7.1-.3-.2-1.4-.5-2.6-1.6-1-.9-1.6-2-1.8-2.3-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.4.3-.6 0-.2 0-.4-.1-.6l-.8-1.8Z"
            fill="currentColor"
          />
        </svg>
      );
    case 'website':
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
          <ellipse cx="12" cy="12" rx="4" ry="9" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.5 9.5h17M3.5 14.5h17" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

export const SOCIAL_PLATFORM_META: Array<{
  id: SocialPlatformId;
  field: 'social_instagram' | 'social_tiktok' | 'social_youtube' | 'social_twitter' | 'social_shopee' | 'social_website';
  label: string;
  placeholder: string;
  chipColor: string;
}> = [
  {
    id: 'instagram',
    field: 'social_instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/nama atau @nama',
    chipColor: 'bg-[#F8EAEF] text-[#9E2B57] border-[#E7B6C8]',
  },
  {
    id: 'tiktok',
    field: 'social_tiktok',
    label: 'TikTok',
    placeholder: 'https://tiktok.com/@nama atau @nama',
    chipColor: 'bg-[#EFEFEF] text-[#222222] border-[#3D2C24]/20',
  },
  {
    id: 'youtube',
    field: 'social_youtube',
    label: 'YouTube',
    placeholder: 'https://youtube.com/@channel',
    chipColor: 'bg-[#FDECEC] text-[#B92B27] border-[#F2B8B5]',
  },
  {
    id: 'twitter',
    field: 'social_twitter',
    label: 'X / Twitter',
    placeholder: 'https://x.com/username',
    chipColor: 'bg-[#ECEFF3] text-[#1F2937] border-[#CBD5E1]',
  },
  {
    id: 'shopee',
    field: 'social_shopee',
    label: 'Shopee',
    placeholder: 'https://shopee.co.id/namatoko',
    chipColor: 'bg-[#FEF0E8] text-[#C2410C] border-[#F6C4A6]',
  },
  {
    id: 'website',
    field: 'social_website',
    label: 'Website',
    placeholder: 'https://domainanda.com',
    chipColor: 'bg-[#EFF5F1] text-[#3E6251] border-[#6B8E7B]/40',
  },
];
