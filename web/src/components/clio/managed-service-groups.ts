import { ActivityIcon, CpuIcon, FlaskConicalIcon, PlugIcon } from 'lucide-react';
import { t } from '@lingui/core/macro';

/** The Services tab's groups, in display order, keyed by service category. */
export const SERVICE_GROUPS = [
  { id: 'model_runtime', label: t`Inference`, icon: CpuIcon },
  { id: 'scientific_service', label: t`Scientific services`, icon: FlaskConicalIcon },
  { id: 'remote_access', label: t`Remote execution`, icon: PlugIcon },
  { id: 'monitoring', label: t`Monitoring and provenance`, icon: ActivityIcon },
] as const;

/** Column widths every Services list shares, so status and actions line up. */
export const SERVICE_COLUMNS = { status: 112, meta: 80, hover: 52, pinned: true } as const;
