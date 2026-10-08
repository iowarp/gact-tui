import type { ContextStrategyInfo } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  contextDraftError,
  formatTokens,
  type ContextDraft,
  type EffectiveContext,
} from './context-control-model';

export interface ContextControlFitToGpu {
  /** Only when the service says Fit to GPU can be computed here; otherwise it is not shown. */
  available: boolean;
  strategies: ContextStrategyInfo[];
  defaultStrategy?: string;
  /** The value Fit to GPU computes (with the selected strategy), when known. */
  value?: number;
}

export interface ContextControlProps {
  /** Unique per page: the input and its messages are labelled from it. */
  id: string;
  label?: string;
  draft: ContextDraft;
  onDraft: (next: ContextDraft) => void;
  minimum: number;
  /** The model's own maximum; Max sets it and a typed value may not exceed it. */
  maximum?: number;
  maximumReason?: string;
  /** The engine's own upper bound, used for validation while the model's maximum is unknown. */
  ceiling?: number;
  /** Whether a Max choice is offered at all (a deployment engine may not take one). */
  allowMax?: boolean;
  fitToGpu?: ContextControlFitToGpu;
  /** What an untouched control means (CLIO's default for this engine or model). */
  defaultDescription?: string;
  /** The context in force after the last deploy or save, and why. */
  effective?: EffectiveContext;
  disabled?: boolean;
}

/**
 * The one context control for a managed deployment and for a bound model's
 * working context: a number, a Max button and -- only where CLIO can compute
 * it -- a Fit-to-GPU strategy selector. Unsupported choices are not shown.
 */
export function ContextControl({
  id,
  label = 'Context length',
  draft,
  onDraft,
  minimum,
  maximum,
  maximumReason,
  ceiling,
  allowMax = true,
  fitToGpu,
  defaultDescription,
  effective,
  disabled = false,
}: ContextControlProps) {
  const inputId = `${id}-tokens`;
  const fit = fitToGpu?.available && fitToGpu.strategies.length ? fitToGpu : undefined;
  const error = contextDraftError(draft, { minimum, maximum: maximum ?? ceiling });
  const strategy =
    draft.choice === 'fit_to_gpu'
      ? draft.strategy || fit?.defaultStrategy || fit?.strategies[0]?.id || ''
      : '';
  const strategyLabel = fit?.strategies.find((row) => row.id === strategy)?.label;
  const shown =
    draft.choice === 'number'
      ? draft.tokens
      : draft.choice === 'max' && maximum !== undefined
        ? String(maximum)
        : draft.choice === 'fit_to_gpu' && fit?.value !== undefined
          ? String(fit.value)
          : '';
  const bound = maximum ?? ceiling;
  const upTo = bound !== undefined ? ` and ${formatTokens(bound)}` : '';
  const fitTokens = fit?.value !== undefined ? ` (${formatTokens(fit.value)} tokens)` : '';
  const summary =
    draft.choice === 'max'
      ? `Max: the model’s maximum${maximum !== undefined ? ` (${formatTokens(maximum)})` : ''}.`
      : draft.choice === 'fit_to_gpu'
        ? `Fit to GPU${strategyLabel ? `: ${strategyLabel}` : ''}${fitTokens}.`
        : draft.choice === 'number'
          ? `Between ${formatTokens(minimum)}${upTo} tokens.`
          : defaultDescription;
  return (
    <Field data-slot="context-control">
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-describedby={`${id}-summary${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? true : undefined}
          className="h-7 w-36 tabular-nums"
          disabled={disabled}
          id={inputId}
          inputMode="numeric"
          max={maximum ?? ceiling}
          min={minimum}
          onChange={(event) =>
            onDraft({ choice: 'number', tokens: event.target.value, strategy: '' })
          }
          placeholder={draft.choice === 'fit_to_gpu' ? 'Fit to GPU' : 'Tokens'}
          step={1}
          type="number"
          value={shown}
        />
        {allowMax ? (
          <Button
            aria-pressed={draft.choice === 'max'}
            disabled={disabled}
            onClick={() => onDraft({ choice: 'max', tokens: '', strategy: '' })}
            size="sm"
            title={maximumReason || undefined}
            type="button"
            variant={draft.choice === 'max' ? 'default' : 'outline'}
          >
            Max
          </Button>
        ) : null}
        {fit ? (
          <Select
            disabled={disabled}
            onValueChange={(value) =>
              onDraft({ choice: 'fit_to_gpu', tokens: '', strategy: value })
            }
            value={strategy}
          >
            <SelectTrigger aria-label="Fit to GPU" className="w-auto min-w-40" size="sm">
              <SelectValue placeholder="Fit to GPU" />
            </SelectTrigger>
            <SelectContent>
              {fit.strategies.map((row) => (
                <SelectItem key={row.id} title={row.description || undefined} value={row.id}>
                  Fit to GPU · {row.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {summary ? <FieldDescription id={`${id}-summary`}>{summary}</FieldDescription> : null}
      {error ? (
        <p className="text-xs text-destructive" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : null}
      {effective ? (
        <p className="text-xs text-muted-foreground" data-slot="context-effective" role="status">
          <span className="font-medium text-foreground">
            In force:{' '}
            {effective.length !== undefined
              ? `${formatTokens(effective.length)} tokens`
              : 'the engine’s own default'}
          </span>
          {effective.reason ? ` · ${effective.reason}` : null}
        </p>
      ) : null}
    </Field>
  );
}
