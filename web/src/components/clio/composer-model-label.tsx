import type { ComponentProps } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';

/** Keep both names visible, with the full selection on hover or keyboard focus. */
export function ComposerModelButton({
  option,
  placeholder = 'Choose model',
  children,
  ...props
}: ComponentProps<typeof Button> & { option?: ClioModelOption; placeholder?: string }) {
  const fullName = option
    ? `${option.providerName} / ${option.label}${option.label === option.id ? '' : ` (${option.id})`}`
    : placeholder;
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button {...props} aria-description={option ? fullName : undefined}>
            {option ? (
              <>
                <ModelSelectorLogo provider={providerLogoId(option.providerId)} />
                <span
                  className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1 text-left"
                  data-slot="model-choice-label"
                >
                  <span className="truncate" data-slot="model-choice-provider">
                    {option.providerName}
                  </span>
                  <span aria-hidden="true"> / </span>
                  <span className="truncate" data-slot="model-choice-model">
                    {compactModelName(option.providerId, option.id, option.label)}
                  </span>
                </span>
              </>
            ) : (
              <span className="truncate">{placeholder}</span>
            )}
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="break-words">{fullName}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function compactModelName(provider: string, modelId: string, label: string): string {
  if (provider === 'codex') {
    const familyName = modelId.match(/(?:^|[-_.])(luna|sol|terra)$/i)?.[1];
    if (familyName)
      return `${familyName.charAt(0).toUpperCase()}${familyName.slice(1).toLowerCase()}`;
  }
  if (provider === 'claude_code' && /sonnet/i.test(modelId)) return 'Sonnet';
  return label;
}
