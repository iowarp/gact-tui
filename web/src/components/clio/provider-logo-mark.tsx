import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { cn } from '@/lib/utils';

/**
 * A provider's logo on an 18px rounded square: the leading mark of a provider
 * row in the model picker and its provider bar. `null` provider: an empty
 * slot of the same width, which indents a family's servers under its name.
 */
export function ProviderLogoMark({
  provider,
  className,
}: {
  provider: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[18px] shrink-0 place-items-center rounded-[5px]',
        provider && 'bg-muted text-foreground',
        className,
      )}
      data-slot="provider-logo-mark"
    >
      {provider ? <ModelSelectorLogo className="size-3" provider={provider} /> : null}
    </span>
  );
}
