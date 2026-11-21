import type { PendingInteraction, PendingInteractionResponse } from '@clio/core/v3';
import { Fragment, useId, useRef, type ReactNode } from 'react';
import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  LogOutIcon,
  NotebookTextIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live-store';
import { AskAnsweredRow, AskButton, AskKeyChip, AskSection } from './ask-card';
import { askKeyAttributes } from './ask-card-keys';
import { useAttentionDraft } from './attention-drafts';
import { respondFromControl } from './interaction-control';
import { planApprovalOption, planModeLabel } from './plan-mode-label';
import { MenuRow } from './primitives/menu-row';
import { SplitButton } from './primitives/split-button';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';
import { ph, t } from '@lingui/core/macro';

/** Approve choices: the confirmation policy to run in, then older cards' modes. */
const APPROVALS: readonly string[] = SESSION_APPROVAL_OPTIONS.map((option) => option.value);
const LEGACY_MODES = ['auto', 'interactive'];
const MODES = [...APPROVALS, ...LEGACY_MODES, 'exit_only'];
const KNOWN_OPTIONS = new Set([...MODES, 'reject', 'clear_context']);
const KNOWN_ACTIONS = new Set(['answer', 'cancel']);
/** One 30px line per row, as in the composer's confirmation menu. */
const MENU_ITEM =
  'min-h-[30px] py-0 text-menu [&_[data-slot=dropdown-menu-radio-item-indicator]_svg]:size-[13px]! [&_[data-slot=dropdown-menu-radio-item-indicator]_svg]:text-accent-foreground!';

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
    ? { icon: CheckIcon, label: t`Plan ready`, tone: 'text-primary' }
    : status === 'truncated'
      ? {
          icon: TriangleAlertIcon,
          label: t`Plan truncated`,
          tone: 'text-warning',
          title: t`Only part of the plan reached this review. Execution needs the complete plan.`,
        }
      : status === 'unavailable'
        ? {
            icon: CircleAlertIcon,
            label: t`Plan unavailable`,
            tone: 'text-destructive',
            title: plan?.plan_content_error || t`The saved plan could not be loaded.`,
          }
        : { icon: LoaderCircleIcon, label: t`Plan still writing…`, tone: 'text-muted-foreground' };
  const Icon = state.icon;
  return (
    <span
      className={cn(
        'mr-1.5 inline-flex shrink-0 items-center gap-[7px] text-menu',
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
 * The Execute menu: the confirmation policies the plan can run in, named and
 * drawn as in the composer, with Bypass checks set apart; older cards'
 * Auto-execute and Interactive; then Exit Plan mode only.
 */
function PlanModeMenu({
  modes,
  value,
  recommended,
  onChange,
}: {
  modes: readonly string[];
  value: string;
  recommended?: string;
  onChange: (value: string) => void;
}) {
  const approvals = modes.filter((mode) => planApprovalOption(mode));
  const recommendedTag =
    recommended && modes.includes(recommended) ? (
      <span className="shrink-0 text-label text-muted-foreground">{t`Recommended`}</span>
    ) : null;
  return (
    <DropdownMenuRadioGroup onValueChange={onChange} value={value}>
      {approvals.length ? (
        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-caption font-normal text-muted-foreground">
          {t`Confirmation policy`}
        </DropdownMenuLabel>
      ) : null}
      {modes.map((mode, index) => {
        const approval = planApprovalOption(mode);
        const bypass = mode === 'bypass';
        const exit = mode === 'exit_only';
        const Icon = approval?.icon ?? (exit && approvals.length ? LogOutIcon : undefined);
        return (
          <Fragment key={mode}>
            {(bypass || exit) && index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuRadioItem
              className={cn(
                MENU_ITEM,
                bypass && 'focus:bg-destructive/10 dark:focus:bg-destructive/20',
              )}
              value={mode}
            >
              <MenuRow
                description={approval?.description}
                icon={Icon ? <Icon className={bypass ? 'text-destructive' : undefined} /> : null}
                label={planModeLabel(mode)}
              />
              {mode === recommended ? recommendedTag : null}
            </DropdownMenuRadioItem>
          </Fragment>
        );
      })}
    </DropdownMenuRadioGroup>
  );
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
  const modes = MODES.filter((value) => values.includes(value));
  const runModes = modes.filter((value) => value !== 'exit_only');
  const plan = interaction.payload?.plan_exit;
  const recommended = plan?.recommended_mode;
  // The plan runs in the conversation's own confirmation policy unless the person picks another.
  const prior = useLiveStore(
    (state) => state.entities.sessions[interaction.owner_session_id]?.approval_mode,
  );
  const defaultMode =
    runModes.find((value) => value === prior) ??
    modes.find((value) => value === recommended) ??
    runModes.find((value) => value === 'ask' || value === 'interactive') ??
    runModes.find((value) => value !== 'bypass') ??
    modes[0] ??
    '';
  // Empty until the person picks, so the default follows the conversation once it loads.
  const [draftMode, setMode] = useAttentionDraft(`${id}:plan-mode`, '');
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
        aria-label={t`Plan decision`}
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
              'aria-label': exitOnly ? t`Leave Plan mode` : t`Execute plan`,
              // Stacked, the label takes the first line; when the mode chip and ↵
              // don't fit beside it they wrap to the right of a second line.
              className: '@max-[420px]/ask:flex-auto @max-[420px]/ask:justify-start',
              title: canExecute
                ? undefined
                : t`Execution needs the complete plan. Request changes, or choose Exit Plan mode only.`,
            }}
            label={exitOnly ? t`Leave Plan mode` : t`Execute`}
            leading={<AskKeyChip askKey={String(executeNumber)} />}
            menuClassName="w-[24rem] max-w-[calc(100vw-1rem)]"
            menuDisabled={disabled || modes.length < 2}
            menuLabel={t`Execution mode, ${ph({ mode: planModeLabel(mode) })}`}
            menuValue={planModeLabel(mode)}
            onClick={() => respond(false)}
            trailing={<AskKeyChip askKey="Enter" />}
            variant="default"
            wrap
          >
            <PlanModeMenu modes={modes} onChange={setMode} recommended={recommended} value={mode} />
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
            {t`Request changes`}
          </AskButton>
        ) : null}
        {unknown.map((value) => (
          <AskButton disabled key={value} title={t`This client cannot offer "${value}" yet.`}>
            {value}
          </AskButton>
        ))}
        {canClear ? (
          <label
            className="ml-auto inline-flex shrink-0 cursor-pointer items-center gap-[7px] text-meta text-muted-foreground has-disabled:cursor-default has-disabled:opacity-50 @max-[420px]/ask:ml-0 @max-[420px]/ask:px-2.5 @max-[420px]/ask:whitespace-normal"
            data-slot="plan-clear-context"
          >
            <Checkbox
              {...askKeyAttributes(['c'])}
              checked={clearContext}
              disabled={disabled}
              onCheckedChange={(value) => setClearContext(value === true)}
            />
            {t`Clear context first`}
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
              {t`What should change?`}
            </label>
            <Input
              autoComplete="off"
              className="h-[34px] min-w-0 flex-1 rounded-[7px] px-2.5 text-menu placeholder:text-faint focus-visible:ring-0 md:text-menu"
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
              placeholder={t`What should change?`}
              ref={inputRef}
              value={feedback}
            />
            <AskButton className="h-[34px]" disabled={disabled || !note} primary type="submit">
              {t`Send`}
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

/** Once decided, the plan folds into one row: "Approved in Workspace edits  context cleared". */
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
  const cleared = selected.includes('clear_context');
  const note = answerNote(interaction);
  const [verb, detail, tone]: [string, string | undefined, 'ok' | 'neutral'] =
    decision === 'reject'
      ? [t`Changes requested`, note, 'neutral']
      : decision === 'exit_only'
        ? [t`Left Plan mode`, cleared ? t`not executed, context cleared` : t`not executed`, 'ok']
        : decision
          ? [
              t`Approved in ${ph({ mode: planModeLabel(decision) })}`,
              cleared ? t`context cleared` : undefined,
              'ok',
            ]
          : interaction.status === 'cancelled'
            ? [t`Plan review cancelled`, undefined, 'neutral']
            : interaction.status === 'expired'
              ? [t`Plan review expired`, undefined, 'neutral']
              : [t`Plan decision recorded`, undefined, 'neutral'];
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
