import type { ComponentProps } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type ClioModelOption, compactModelName } from '@/lib/model-options';
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
                {/* The provider takes only its own width; when both names overflow they
                    shrink in proportion, so a long provider never hides the model. */}
                <span
                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  data-slot="model-choice-label"
                >
                  <span className="min-w-0 max-w-32 truncate" data-slot="model-choice-provider">
                    {option.providerName}
                  </span>
                  <span aria-hidden="true" className="shrink-0">
                    {' / '}
                  </span>
                  <span className="min-w-0 grow truncate" data-slot="model-choice-model">
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
