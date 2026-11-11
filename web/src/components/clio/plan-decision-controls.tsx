import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { useId, useRef, type ReactNode } from 'react';
import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  NotebookTextIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { AskAnsweredRow, AskButton, AskKeyChip, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { useAttentionDraft } from './attention-drafts';
import { respondFromControl } from './interaction-control';
import { planModeLabel } from './plan-mode-label';
import { SplitButton } from './primitives/split-button';

const MODES = ['auto', 'interactive', 'exit_only'];
const KNOWN_OPTIONS = new Set([...MODES, 'reject', 'clear_context']);
const KNOWN_ACTIONS = new Set(['answer', 'cancel']);

type PlanExit = NonNullable<NonNullable<PendingInteraction['payload']>['plan_exit']>;

/** A plan only executes once all of it could be read. */
function planComplete(plan: PlanExit | undefined): boolean {
  return plan?.plan_content_status === 'complete' && Boolean(plan.plan_content?.trim());
}

/** "Plan ready", or why it is not: still writing, cut short, unavailable. */
function PlanReadiness({ plan }: { plan: PlanExit | undefined }) {
  const status = plan?.plan_content_status;
  const ready = planComplete(plan);
  const state: { icon: LucideIcon; label: string; tone: string; title?: string } = ready
    ? { icon: CheckIcon, label: 'Plan ready', tone: 'text-primary' }
    : status === 'truncated'
      ? {
          icon: TriangleAlertIcon,
          label: 'Plan truncated',
          tone: 'text-warning',
          title: 'Only part of the plan reached this review. Execution needs the complete plan.',
        }
      : status === 'unavailable'
        ? {
            icon: CircleAlertIcon,
            label: 'Plan unavailable',
            tone: 'text-destructive',
            title: plan?.plan_content_error || 'The saved plan could not be loaded.',
          }
        : { icon: LoaderCircleIcon, label: 'Plan still writing…', tone: 'text-muted-foreground' };
  const Icon = state.icon;
  return (
    <span
      className={cn(
        'mr-1.5 inline-flex shrink-0 items-center gap-[7px] text-[12.5px]',
        ready ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
      data-plan-readiness={ready ? 'complete' : (status ?? 'writing')}
      title={state.title}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'size-3.5 shrink-0',
          state.tone,
          Icon === LoaderCircleIcon && 'motion-safe:animate-spin',
        )}
      />
      {state.label}
    </span>
  );
}

function optionValue(option: { value?: string; label: string }) {
  return option.value || option.label;
}

/**
 * The decision under the plan: Execute in a mode (the mode reads inside the
 * filled button), Request changes with a one-line note, and Clear context
 * first. Nothing executes until a button is pressed.
 */
export function PlanDecisionControls({
  interaction,
  disabled,
  onResponse,
}: {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
}) {
  const id = interaction.id;
  const options = interaction.payload?.options ?? [];
  const values = options.map(optionValue);
  const modes = values.filter((value) => MODES.includes(value));
  const plan = interaction.payload?.plan_exit;
  const recommended = plan?.recommended_mode;
  const defaultMode =
    modes.find((value) => value === recommended) ??
    modes.find((value) => value === 'interactive') ??
    modes[0] ??
    '';
  const [draftMode, setMode] = useAttentionDraft(`${id}:plan-mode`, defaultMode);
  const mode = modes.includes(draftMode) ? draftMode : defaultMode;
  const [clearContext, setClearContext] = useAttentionDraft(`${id}:plan-clear-context`, false);
  const [feedback, setFeedback] = useAttentionDraft(`${id}:plan-feedback`, '');
  const [changesOpen, setChangesOpen] = useAttentionDraft(`${id}:plan-changes-open`, false);
  const requestRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const complete = planComplete(plan);
  const exitOnly = mode === 'exit_only';
  const canExecute = Boolean(mode) && (exitOnly || complete);
  const canReject = values.includes('reject');
  const canClear = values.includes('clear_context');
  const unknown = [
    ...values.filter((value) => !KNOWN_OPTIONS.has(value)),
    ...(interaction.actions ?? []).filter((action) => !KNOWN_ACTIONS.has(action)),
  ];
  const note = feedback.trim();
  const respond = (reject: boolean) =>
    respondFromControl(
      onResponse(interaction, {
        action: 'answer',
        answer: (reject || changesOpen) && note ? note : undefined,
        selected_options: reject ? ['reject'] : [mode, ...(clearContext ? ['clear_context'] : [])],
      }),
    );
  let number = 0;
  const executeNumber = modes.length ? ++number : 0;
  const rejectNumber = canReject ? ++number : 0;

  return (
    <>
      <div
        aria-hidden="true"
        className="mt-3 ml-[25px] border-t border-border @max-[420px]/ask:ml-0"
      />
      <AskSection
        aria-label="Plan decision"
        className="mt-2.5 flex flex-wrap items-center gap-2 whitespace-nowrap @max-[420px]/ask:flex-col @max-[420px]/ask:items-stretch"
        data-slot="plan-decision-controls"
        role="group"
      >
        <PlanReadiness plan={plan} />
        {modes.length ? (
          <SplitButton
            disabled={disabled || !canExecute}
            faceProps={{
              ...askKeyAttributes([String(executeNumber), 'Enter']),
              'aria-label': exitOnly ? 'Leave Plan mode' : 'Execute plan',
              // Stacked, the label fills; the mode chip and ↵ sit at the right edge.
              className: '@max-[420px]/ask:flex-1 @max-[420px]/ask:justify-start',
              title: canExecute
                ? undefined
                : 'Execution needs the complete plan. Request changes, or choose Exit Plan mode only.',
            }}
            label={exitOnly ? 'Leave Plan mode' : 'Execute'}
            leading={<AskKeyChip askKey={String(executeNumber)} />}
            menuDisabled={disabled || modes.length < 2}
            menuLabel={`Execution mode, ${planModeLabel(mode)}`}
            menuValue={planModeLabel(mode)}
            onClick={() => respond(false)}
            trailing={<AskKeyChip askKey="Enter" />}
            variant="default"
          >
            <DropdownMenuRadioGroup onValueChange={setMode} value={mode}>
              {modes.map((value) => (
                <DropdownMenuRadioItem className="text-[12.5px]" key={value} value={value}>
                  {planModeLabel(value)}
                  {value === recommended ? (
                    <span className="text-[11.5px] text-muted-foreground">Recommended</span>
                  ) : null}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </SplitButton>
        ) : null}
        {canReject ? (
          <AskButton
            aria-expanded={changesOpen}
            disabled={disabled}
            number={rejectNumber}
            onClick={() => {
              setChangesOpen(true);
              // The note field mounts on this click; focus it once it exists.
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            ref={requestRef}
          >
            Request changes
          </AskButton>
        ) : null}
        {unknown.map((value) => (
          <AskButton disabled key={value} title={`This client cannot offer "${value}" yet.`}>
            {value}
          </AskButton>
        ))}
        {canClear ? (
          <label
            className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-[7px] text-[12px] text-muted-foreground has-disabled:cursor-default has-disabled:opacity-50 @max-[420px]/ask:ml-0 @max-[420px]/ask:px-2.5"
            data-slot="plan-clear-context"
          >
            <Checkbox
              {...askKeyAttributes(['c'])}
              checked={clearContext}
              disabled={disabled}
              onCheckedChange={(value) => setClearContext(value === true)}
            />
            Clear context first
            <AskKeyChip askKey="c" />
          </label>
        ) : null}
      </AskSection>
      {canReject && changesOpen ? (
        <AskSection className="mt-2.5" data-slot="plan-feedback">
          <form
            className="flex min-w-0 items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault();
              if (note && !disabled) respond(true);
            }}
          >
            <label className="sr-only" htmlFor={inputId}>
              What should change?
            </label>
            <Input
              autoComplete="off"
              className="h-[34px] min-w-0 flex-1 rounded-[7px] px-2.5 text-[12.5px] placeholder:text-faint focus-visible:ring-0 md:text-[12.5px]"
              disabled={disabled}
              id={inputId}
              onChange={(event) => setFeedback(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                event.stopPropagation();
                setChangesOpen(false);
                requestRef.current?.focus();
              }}
              placeholder="What should change?"
              ref={inputRef}
              value={feedback}
            />
            <AskButton className="h-[34px]" disabled={disabled || !note} primary type="submit">
              Send
            </AskButton>
          </form>
        </AskSection>
      ) : null}
    </>
  );
}

function selectedOptions(interaction: PendingInteraction): string[] {
  // Agents record the answer either in `answer_metadata` or at the payload's top level.
  const payload = interaction.payload as
    | (PendingInteraction['payload'] & { selected_options?: unknown })
    | undefined;
  const raw = payload?.answer_metadata?.selected_options ?? payload?.selected_options;
  return Array.isArray(raw)
    ? raw.filter((value): value is string => typeof value === 'string')
    : [];
}

function answerNote(interaction: PendingInteraction): string | undefined {
  const payload = interaction.payload as
    | (PendingInteraction['payload'] & { answer?: unknown })
    | undefined;
  const note = payload?.answer_metadata?.answer ?? payload?.answer;
  return typeof note === 'string' && note.trim() ? note : undefined;
}

/** Once decided, the plan folds into one row: "Plan approved  Interactive, context cleared". */
export function PlanDecision({
  interaction,
  actions,
  open,
  onOpenChange,
  className,
}: {
  interaction: PendingInteraction;
  /** Hover actions: copy the plan, open it in the right pocket. */
  actions?: ReactNode;
  /** With `onOpenChange`, the chevron shows the plan that was decided. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const selected = selectedOptions(interaction);
  const decision = selected.find((value) => value !== 'clear_context');
  const cleared = selected.includes('clear_context') ? 'context cleared' : undefined;
  const note = answerNote(interaction);
  const [verb, detail, tone]: [string, string | undefined, 'ok' | 'neutral'] =
    decision === 'reject'
      ? ['Changes requested', note, 'neutral']
      : decision === 'exit_only'
        ? ['Left Plan mode', ['not executed', cleared].filter(Boolean).join(', '), 'ok']
        : decision
          ? ['Plan approved', [planModeLabel(decision), cleared].filter(Boolean).join(', '), 'ok']
          : interaction.status === 'cancelled'
            ? ['Plan review cancelled', undefined, 'neutral']
            : interaction.status === 'expired'
              ? ['Plan review expired', undefined, 'neutral']
              : ['Plan decision recorded', undefined, 'neutral'];
  return (
    <AskAnsweredRow
      actions={actions}
      className={className}
      data-plan-decision={decision || interaction.status}
      detail={detail}
      icon={NotebookTextIcon}
      onOpenChange={onOpenChange}
      open={open}
      title={detail}
      tone={tone}
      verb={verb}
    />
  );
}
