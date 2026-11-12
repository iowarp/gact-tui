import { CircleAlertIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { type ClioModelOption, compactModelName, isVendorApi } from '@/lib/model-options';
import { modelRouteName, providerLogoId } from '@/lib/provider-presentation';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import { HeldKeyBadge } from './primitives/key-chip';
import { TOOLTIP_KEY } from './primitives/tooltip-key';

/**
 * The route and the model, with the full selection on hover or keyboard focus.
 * The route is named only when it isn't the model maker's own API (codex / luna 6.1,
 * but luna 6.1 through OpenAI). The `text` appearance is the composer row's bare
 * button: the route drops when it doesn't fit beside the model, and under 270px
 * only the logo stays.
 */
export function ComposerModelButton({
  option,
  placeholder = 'Choose a model',
  problem,
  appearance = 'pill',
  shortcut,
  className,
  children,
  ...props
}: ComponentProps<typeof Button> & {
  option?: ClioModelOption;
  placeholder?: string;
  /** Why no model is shown, as a short word and its sentence for the tooltip. */
  problem?: { label: string; detail: string };
  appearance?: 'pill' | 'text';
  /** Catalog id of the key that opens the picker: its tooltip and held-key badge show it. */
  shortcut?: string;
}) {
  const text = appearance === 'text';
  const presentation = useShortcutPresentation(shortcut);
  const route = option && !isVendorApi(option.providerId, option.id);
  const fullName = option
    ? `${option.providerName} / ${option.label}${option.label === option.id ? '' : ` (${option.id})`}`
    : (problem?.detail ?? 'Choose the model this conversation uses');
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            {...props}
            aria-description={option || problem ? fullName : undefined}
            aria-keyshortcuts={presentation?.aria}
            className={cn(
              shortcut && 'relative',
              text &&
                'h-[26px] min-w-0 shrink gap-1.5 rounded-[6px] px-1.5 text-meta font-normal text-muted-foreground hover:bg-hover hover:text-foreground aria-expanded:bg-hover',
              className,
            )}
          >
            {option ? (
              <>
                <ModelSelectorLogo
                  className={text ? 'size-3.5 rounded-none bg-transparent' : undefined}
                  provider={providerLogoId(option.providerId)}
                />
                {/* One line: the model sits first and the route wraps off the line
                    (clipped) when both don't fit, so a short route stays at narrow
                    widths and a long one never squeezes the model. Order keeps the
                    reading order route → model for assistive technology. */}
                <span
                  className={cn(
                    'flex min-w-0 flex-1 items-center text-left',
                    text
                      ? 'h-4 flex-row-reverse flex-wrap justify-end overflow-hidden leading-4'
                      : 'gap-1',
                  )}
                  data-slot="model-choice-label"
                >
                  {route ? (
                    <span
                      className={cn(
                        'min-w-0',
                        text
                          ? 'order-2 shrink-0 whitespace-pre @max-[270px]/composer:hidden'
                          : 'flex max-w-32 items-center gap-1',
                      )}
                    >
                      <span
                        className={cn(!text && 'min-w-0 truncate')}
                        data-slot="model-choice-provider"
                      >
                        {modelRouteName(option.providerId, option.providerName)}
                      </span>
                      <span aria-hidden="true">{' / '}</span>
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      'min-w-0 grow truncate',
                      text && 'order-1 grow-0 @max-[270px]/composer:hidden',
                    )}
                    data-slot="model-choice-model"
                  >
                    {compactModelName(option.id, option.label)}
                  </span>
                </span>
              </>
            ) : problem ? (
              <>
                <CircleAlertIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-destructive"
                />
                <span className="truncate">{problem.label}</span>
              </>
            ) : (
              <span className="truncate">{placeholder}</span>
            )}
            {children}
            {shortcut ? <HeldKeyBadge id={shortcut} side="above-icon" /> : null}
          </Button>
        </TooltipTrigger>
        <TooltipContent className="gap-2 break-words">
          <span>{fullName}</span>
          {presentation ? <kbd className={TOOLTIP_KEY}>{presentation.text}</kbd> : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
