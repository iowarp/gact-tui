import { ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProviderLogoMark } from './provider-logo-mark';
import { providerGroupStatus, type ProviderFamilyNodeData } from './model-picker-model';
import { ProviderEyeToggle } from './provider-eye-toggle';
import { ProviderHeartbeat } from './provider-heartbeat';
import { t } from '@lingui/core/macro';

/** Inline expansion keeps server choices in the provider column on both layouts. */
export function ProviderFamilyRow({
  data,
  hidden,
  eyeAsStaticElement,
  onToggleVisibility,
}: {
  data: ProviderFamilyNodeData;
  hidden: boolean;
  eyeAsStaticElement: boolean;
  onToggleVisibility?: () => void;
}) {
  return (
    <>
      <ProviderLogoMark provider="argonne" />
      <span className="min-w-0 flex-1 truncate text-start">{data.group.name}</span>
      <span
        className="shrink-0 text-caption text-muted-foreground"
        data-slot="provider-row-status"
        title={data.group.detail}
      >
        {providerGroupStatus(data.group).label}
      </span>
      {onToggleVisibility ? (
        <ProviderEyeToggle
          asStaticElement={eyeAsStaticElement}
          group={data.group}
          hidden={hidden}
          onToggle={onToggleVisibility}
        />
      ) : null}
      <ProviderHeartbeat group={data.group} />
      <ChevronDownIcon
        aria-hidden="true"
        className={cn(
          'size-4 shrink-0 text-muted-foreground',
          !data.expanded && '-rotate-90 rtl:rotate-90',
        )}
      />
      <span className="sr-only">{data.expanded ? t`Expanded` : t`Collapsed`}</span>
    </>
  );
}
