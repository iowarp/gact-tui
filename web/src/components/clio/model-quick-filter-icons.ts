import {
  BrainIcon,
  CircleDollarSignIcon,
  CpuIcon,
  EyeIcon,
  GiftIcon,
  GlobeIcon,
  ScrollTextIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { ScheduleIcon } from '@/lib/icon-vocabulary';
import type { QuickFilterId } from '@/lib/model-quick-filters';

/** The quick filters' glyphs, shared by row 2 and the Filters rows' sliders. */
export const QUICK_FILTER_ICONS: Record<QuickFilterId, LucideIcon> = {
  tools: WrenchIcon,
  vision: EyeIcon,
  reasoning: BrainIcon,
  web: GlobeIcon,
  free: GiftIcon,
  context: ScrollTextIcon,
  cost: CircleDollarSignIcon,
  size: CpuIcon,
  recent: ScheduleIcon,
};
