import type { LanguageModelPreset, ProviderCatalogEntry } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  providerConnectionLabel,
  providerCredentialStateLabel,
} from '@/lib/provider-availability';
import { formatFreshness, type ProviderGroup } from './model-picker-model';

interface SettingsProviderDetailsSheetProps {
  group: ProviderGroup | undefined;
  preset: LanguageModelPreset;
  catalogEntry: ProviderCatalogEntry | undefined;
}

/**
 * The ONE place a provider's technical facts appear: the address, what the
 * service last reported, when, and the raw reason -- for when something
 * breaks and someone needs to say exactly what. Opened from a quiet link.
 */
export function SettingsProviderDetailsSheet({
  group,
  preset,
  catalogEntry,
}: SettingsProviderDetailsSheetProps) {
  const facts: Array<[string, string | undefined]> = [
    ['Provider id', preset.id],
    ['Endpoint', catalogEntry?.endpoint || group?.endpoint || preset.api_base],
    ['Catalog health', catalogEntry?.health],
    ['Connection', catalogEntry ? providerConnectionLabel(catalogEntry.connectivity) : undefined],
    ['Credentials', catalogEntry ? providerCredentialStateLabel(preset, catalogEntry.auth) : undefined],
    ['Configuration state', preset.status],
    ['Last checked', group?.freshness ? formatFreshness(group.freshness) : undefined],
    ['Catalog source', catalogEntry?.freshness.source],
    ['Models reported', catalogEntry ? String(catalogEntry.models.length) : undefined],
    ['Raw reason', catalogEntry?.failure || preset.status_message || undefined],
  ];
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button className="h-auto px-0 text-xs text-muted-foreground" size="sm" type="button" variant="link">
          Technical details
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-md" data-slot="provider-details-sheet">
        <SheetHeader>
          <SheetTitle>{preset.label}: technical details</SheetTitle>
          <SheetDescription>What the connected service last reported, for troubleshooting.</SheetDescription>
        </SheetHeader>
        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 px-4 text-sm">
          {facts
            .filter((fact): fact is [string, string] => Boolean(fact[1]))
            .map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="min-w-0 font-mono text-xs break-all">{value}</dd>
              </div>
            ))}
        </dl>
      </SheetContent>
    </Sheet>
  );
}
