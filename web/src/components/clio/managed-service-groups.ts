import { ActivityIcon, CpuIcon, GlobeIcon, PlugIcon } from 'lucide-react';

/** The Services tab's groups, in display order, keyed by service category. */
export const SERVICE_GROUPS = [
  { id: 'model_runtime', label: 'Inference', icon: CpuIcon },
  { id: 'scientific_service', label: 'Web research', icon: GlobeIcon },
  { id: 'remote_access', label: 'Remote execution', icon: PlugIcon },
  { id: 'monitoring', label: 'Monitoring and provenance', icon: ActivityIcon },
] as const;

/** Column widths every Services list shares, so status and actions line up. */
export const SERVICE_COLUMNS = { status: 112, meta: 80, hover: 52, pinned: true } as const;
