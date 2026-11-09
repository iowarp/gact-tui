import type { ComponentProps } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';

/**
 * Keep both names visible, with the full selection on hover or keyboard focus.
 * The `text` appearance is the composer row's bare `Provider / model` button:
 * a narrow composer drops the provider, a narrower one keeps only the logo.
 */
export function ComposerModelButton({
  option,
  placeholder = 'Choose model',
  appearance = 'pill',
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  option?: ClioModelOption;
  placeholder?: string;
  appearance?: 'pill' | 'text';
}) {
  const text = appearance === 'text';
  const fullName = option
    ? `${option.providerName} / ${option.label}${option.label === option.id ? '' : ` (${option.id})`}`
    : placeholder;
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            {...props}
            aria-description={option ? fullName : undefined}
            className={cn(
              text &&
                'h-[26px] min-w-0 shrink gap-1.5 rounded-[6px] px-1.5 text-[12px] font-normal text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-hover',
              className,
            )}
          >
            {option ? (
              <>
                <ModelSelectorLogo
                  className={text ? 'size-3.5 rounded-none bg-transparent' : undefined}
                  provider={providerLogoId(option.providerId)}
                />
                {/* The provider takes only its own width; when both names overflow they
                    shrink in proportion, so a long provider never hides the model. */}
                <span
                  className="flex min-w-0 flex-1 items-center gap-1 text-left"
                  data-slot="model-choice-label"
                >
                  <span
                    className={cn(
                      'max-w-32 min-w-0 truncate',
                      text && '@max-[560px]/composer:hidden',
                    )}
                    data-slot="model-choice-provider"
                  >
                    {option.providerName}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn('shrink-0', text && '@max-[560px]/composer:hidden')}
                  >
                    {' / '}
                  </span>
                  <span
                    className={cn('min-w-0 grow truncate', text && '@max-[420px]/composer:hidden')}
                    data-slot="model-choice-model"
                  >
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
