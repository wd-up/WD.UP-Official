import type React from 'react';
import {
  Award,
  BookOpen,
  Briefcase,
  Compass,
  Crown,
  Feather,
  Flame,
  Gem,
  Heart,
  Leaf,
  Lightbulb,
  Rocket,
  Smile,
  Sparkles,
  Star,
  Sun,
  Target,
  TrendingUp,
} from 'lucide-react';

export interface PillarIconOption {
  name: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}

export const PILLAR_ICON_OPTIONS: PillarIconOption[] = [
  { name: 'Heart', label: 'Hati', Icon: Heart },
  { name: 'TrendingUp', label: 'Bertumbuh', Icon: TrendingUp },
  { name: 'Sparkles', label: 'Kilau', Icon: Sparkles },
  { name: 'Briefcase', label: 'Karier', Icon: Briefcase },
  { name: 'Sun', label: 'Matahari', Icon: Sun },
  { name: 'Leaf', label: 'Daun', Icon: Leaf },
  { name: 'Star', label: 'Bintang', Icon: Star },
  { name: 'Crown', label: 'Mahkota', Icon: Crown },
  { name: 'Gem', label: 'Permata', Icon: Gem },
  { name: 'Lightbulb', label: 'Ide', Icon: Lightbulb },
  { name: 'Rocket', label: 'Roket', Icon: Rocket },
  { name: 'Target', label: 'Target', Icon: Target },
  { name: 'Compass', label: 'Kompas', Icon: Compass },
  { name: 'BookOpen', label: 'Buku', Icon: BookOpen },
  { name: 'Award', label: 'Prestasi', Icon: Award },
  { name: 'Flame', label: 'Semangat', Icon: Flame },
  { name: 'Feather', label: 'Kreatif', Icon: Feather },
  { name: 'Smile', label: 'Senyum', Icon: Smile },
];

const FALLBACK_BY_TITLE: Record<string, string> = {
  'Self Love': 'Heart',
  'Self Growth': 'TrendingUp',
  'Self Development': 'Sparkles',
  'Digital Career': 'Briefcase',
};

export function resolvePillarIcon(iconName?: string, title?: string): React.ComponentType<{ className?: string }> {
  const target = (iconName && iconName.trim()) || (title ? FALLBACK_BY_TITLE[title] : '') || 'Sparkles';
  return PILLAR_ICON_OPTIONS.find((opt) => opt.name === target)?.Icon || Sparkles;
}
