import type { ModelChoice } from '@clio/core/v3';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { MODEL_CHOICE_SOURCE } from '@/lib/flow-run-usage';
import { providerLogoId } from '@/lib/provider-presentation';
import { t } from '@lingui/core/macro';

/**
 * The model a child runs on, with its provider's logo; hovering names why it
 * runs there (named for the call, a preference, the caller's model, or the
 * person's own pick) and any step down from a preferred model.
 */
export function SubagentModel({ choice }: { choice: ModelChoice }) {
  const provider = choice.ran.provider_id ?? '';
  const model = choice.ran.model_id ?? '';
  if (!model) return null;
  const why = MODEL_CHOICE_SOURCE[choice.source] ?? choice.source;
  const ref = provider ? `${provider}/${model}` : model;
  const effort = choice.effort;
  const runsOn = why
    ? effort
      ? t`Runs on ${ref}: ${why}, ${effort} effort.`
      : t`Runs on ${ref}: ${why}.`
    : effort
      ? t`Runs on ${ref}, ${effort} effort.`
      : t`Runs on ${ref}.`;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex min-w-0 shrink items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            data-slot="subagent-model"
          >
            {provider ? (
              <ModelSelectorLogo className="size-3 shrink-0" provider={providerLogoId(provider)} />
            ) : null}
            {/* A dated snapshot id reads as its model; the hover keeps the full id. */}
            <span className="truncate">{model.replace(/-\d{8}$/u, '')}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p>{runsOn}</p>
          {choice.reasons.length ? (
            <ul className="mt-1 list-disc pl-4">
              {choice.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
