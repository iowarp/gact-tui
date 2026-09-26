import { BoxIcon } from 'lucide-react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Badge } from '@/components/reui/badge';
import { IconTile } from '@/components/reui/icon-tile';
import { Button } from '@/components/ui/button';
import { isBaselineTag, modelCapabilityTagsFromOption } from '@/lib/model-capability-tags';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import { ModelCapabilityTags } from './model-capability-tags';
import { ClioModelPicker } from './model-picker';
import { providerGroupStatus, type ProviderGroup } from './model-picker-model';

interface SettingsDefaultModelCardProps {
  providerId: string | undefined;
  providerName: string | undefined;
  /** The configured model id, shown when the catalog has no row for it yet. */
  modelId: string | undefined;
  option: ClioModelOption | undefined;
  group: ProviderGroup | undefined;
  options: readonly ClioModelOption[];
  catalogStatus: 'error' | 'loading' | 'ready';
  onRetryCatalog: (providerId?: string) => void;
  onChange: (choice: ClioModelOption) => void;
  busy: boolean;
}

/**
 * The default model, as one card: its logo, name, provider, capability tags
 * and whether its provider works right now -- with Change opening the SAME
 * model picker the composer uses (where a provider is set up, too).
 */
export function SettingsDefaultModelCard({
  providerId,
  providerName,
  modelId,
  option,
  group,
  options,
  catalogStatus,
  onRetryCatalog,
  onChange,
  busy,
}: SettingsDefaultModelCardProps) {
  const tags = option ? modelCapabilityTagsFromOption(option).filter((tag) => !isBaselineTag(tag)) : [];
  const working = group?.health === 'healthy' || group?.health === 'checking';
  const name = option?.label ?? modelId;
  return (
    <div className="flex items-start gap-4" data-slot="default-model-card">
      <IconTile aria-hidden="true" size="xl" variant="frame">
        {providerId ? (
          <ModelSelectorLogo className="size-7" provider={providerLogoId(providerId)} />
        ) : (
          <BoxIcon className="text-muted-foreground" />
        )}
      </IconTile>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="truncate text-lg font-semibold" data-slot="default-model-name">
            {name || 'No model chosen yet'}
          </p>
          <p className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
            <span className="truncate">{providerName ?? 'Choose a model to start new work with'}</span>
            {group ? (
              <Badge
                data-slot="default-model-status"
                radius="full"
                size="sm"
                variant={working ? 'success-light' : 'warning-light'}
              >
                {working ? 'Working' : providerGroupStatus(group).label}
              </Badge>
            ) : null}
          </p>
        </div>
        <ModelCapabilityTags tags={tags} />
      </div>
      <ClioModelPicker
        catalogStatus={catalogStatus}
        model={option?.id ?? modelId}
        onChange={onChange}
        onRetryCatalog={onRetryCatalog}
        options={options}
        provider={providerId}
        title="Choose the default model"
        trigger={
          <Button disabled={busy} variant="outline">
            {name ? 'Change' : 'Choose'}
          </Button>
        }
      />
    </div>
  );
}
