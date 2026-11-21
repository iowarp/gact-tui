import type {
  PendingInteraction,
  PendingInteractionResponse,
  SpotterAvailability,
} from '@clio/core/v3';
import { Fragment, useId, useRef, useState, type ReactNode } from 'react';
import {
  CheckIcon,
  CircleAlertIcon,
  LoaderCircleIcon,
  LogOutIcon,
  NotebookTextIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { cn } from '@/lib/utils';
import { useHasConnection } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { approvalOptionViews } from './approval-option-availability';
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
const LEGACY_MODES = ['interactive', 'auto'];
/** The agent recommends an older posture; the service runs it as this policy. */
const RECOMMENDED_POLICY: Record<string, string> = { interactive: 'ask', auto: 'auto-edits' };
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
  unavailable,
  onChange,
}: {
  modes: readonly string[];
  value: string;
  recommended?: string;
  /** Policies the service cannot honour here, with its reason. */
  unavailable: ReadonlyMap<string, { description: string; detail: string }>;
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
        const off = unavailable.get(mode);
        return (
          <Fragment key={mode}>
            {(bypass || exit) && index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuRadioItem
              className={cn(
                MENU_ITEM,
                bypass && 'focus:bg-destructive/10 dark:focus:bg-destructive/20',
              )}
              disabled={Boolean(off)}
              title={off?.detail || undefined}
              value={mode}
            >
              <MenuRow
                detail={off?.description ?? approval?.description}
                icon={Icon ? <Icon className={bypass ? 'text-destructive' : undefined} /> : null}
                // Bypass asks before it is chosen, as in the composer.
                label={bypass && approval ? `${planModeLabel(mode)}…` : planModeLabel(mode)}
                wrapDetail
              />
              {mode === recommended ? recommendedTag : null}
            </DropdownMenuRadioItem>
          </Fragment>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

type PlanDecisionControlsProps = {
  interaction: PendingInteraction;
  disabled?: boolean;
  onResponse: (
    interaction: PendingInteraction,
    response: PendingInteractionResponse,
  ) => Promise<void>;
  /** What the service reports about SPOTTER review; read from the service when omitted. */
  spotterAvailability?: SpotterAvailability;
};

/**
 * The decision under the plan: Execute in a mode (the mode reads inside the
 * filled button), Request changes with a one-line note, and Clear context
 * first. Nothing executes until a button is pressed.
 */
export function PlanDecisionControls(props: PlanDecisionControlsProps) {
  const offersSpotter = (props.interaction.payload?.options ?? []).some(
    (option) => optionValue(option) === 'spotter-ai',
  );
  // A bare card (no connection, as in a test) cannot ask the service.
  const connected = useHasConnection();
  return offersSpotter && connected && !props.spotterAvailability ? (
    <SpotterAwarePlanDecisionControls {...props} />
  ) : (
    <PlanDecisionControlsView {...props} />
  );
}

/** SPOTTER review is offered as the composer offers it: disabled where it cannot be armed. */
function SpotterAwarePlanDecisionControls(props: PlanDecisionControlsProps) {
  const workspaceId = useLiveStore(
    (state) => state.entities.sessions[props.interaction.owner_session_id]?.workspace_id ?? '',
  );
  const spotterAvailability = useSpotterAvailability(workspaceId);
  return <PlanDecisionControlsView {...props} spotterAvailability={spotterAvailability} />;
}

function PlanDecisionControlsView({
  interaction,
  disabled,
  onResponse,
  spotterAvailability,
}: PlanDecisionControlsProps) {
  const id = interaction.id;
  const options = interaction.payload?.options ?? [];
  const values = options.map(optionValue);
  const unavailable = new Map(
    approvalOptionViews(SESSION_APPROVAL_OPTIONS, spotterAvailability)
      .filter((option) => option.disabled)
      .map((option) => [
        option.value as string,
        { description: option.description, detail: option.unavailableDetail },
      ]),
  );
  const modes = MODES.filter((value) => values.includes(value));
  const runModes = modes.filter((value) => value !== 'exit_only' && !unavailable.has(value));
  const plan = interaction.payload?.plan_exit;
  const hint = plan?.recommended_mode;
  // Shown beside the row it means; on an older card that is the mode itself.
  const recommended =
    hint && !modes.includes(hint) && modes.includes(RECOMMENDED_POLICY[hint] ?? '')
      ? RECOMMENDED_POLICY[hint]
      : hint;
  // The plan runs in the conversation's own confirmation policy unless the person picks another.
  const prior = useLiveStore(
    (state) => state.entities.sessions[interaction.owner_session_id]?.approval_mode,
  );
  // The card starts in the mode the conversation had before planning (the service's
  // default_option, else the session's own). The agent's recommendation only picks between
  // an older card's Interactive and Auto-execute; it never chooses Bypass for the person.
  const defaultMode =
    runModes.find((value) => value === plan?.default_option) ??
    runModes.find((value) => value === prior) ??
    runModes.find((value) => LEGACY_MODES.includes(value) && value === hint) ??
    runModes.find((value) => value === 'ask' || value === 'interactive') ??
    runModes.find((value) => value !== 'bypass') ??
    modes.find((value) => !unavailable.has(value)) ??
    '';
  // Empty until the person picks, so the default follows the conversation once it loads.
  const [draftMode, setMode] = useAttentionDraft(`${id}:plan-mode`, '');
  const mode = modes.includes(draftMode) && !unavailable.has(draftMode) ? draftMode : defaultMode;
  const [confirmBypass, setConfirmBypass] = useState(false);
  const executeRef = useRef<HTMLButtonElement>(null);
  const confirmedRef = useRef(false);
  const chooseMode = (value: string) => {
    if (unavailable.has(value)) return;
    // Bypass checks is confirmed first, with the composer's own question.
    if (value === 'bypass' && planApprovalOption(value) && value !== mode) {
      setConfirmBypass(true);
      return;
    }
    setMode(value);
  };
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
              ref: executeRef,
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
            // Policy rows carry a description line; older cards' modes fit their words.
            menuClassName={
              modes.some((value) => planApprovalOption(value))
                ? 'w-[24rem] max-w-[calc(100vw-1rem)]'
                : undefined
            }
            menuDisabled={disabled || modes.length < 2}
            menuLabel={t`Execution mode, ${ph({ mode: planModeLabel(mode) })}`}
            menuValue={planModeLabel(mode)}
            onClick={() => respond(false)}
            trailing={<AskKeyChip askKey="Enter" />}
            variant="default"
            wrap
          >
            <PlanModeMenu
              modes={modes}
              onChange={chooseMode}
              recommended={recommended}
              unavailable={unavailable}
              value={mode}
            />
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
      <AlertDialog onOpenChange={setConfirmBypass} open={confirmBypass}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Confirming returns to Execute, now in Bypass checks; keeping asking
            // returns to the mode menu's button.
            if (!confirmedRef.current) return;
            confirmedRef.current = false;
            event.preventDefault();
            executeRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Bypass protected-action checks?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The agent may perform supported actions without asking first. Workspace boundaries and unavailable capabilities still apply, but individual changes will not wait for review.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep asking`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirmedRef.current = true;
                setMode('bypass');
              }}
              variant="destructive"
            >
              {t`Bypass checks`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

/**
 * "Approved in Workspace edits, context cleared" in a narrow row: "context cleared"
 * gives way first, then the lead-in, so the mode stays whole in any word order. The
 * full phrase is on hover.
 */
function ModePhrase({ phrase, mode }: { phrase: string; mode: string }) {
  const at = phrase.indexOf(mode);
  if (at < 0) {
    return (
      <span className="block truncate" title={phrase}>
        {phrase}
      </span>
    );
  }
  const lead = phrase.slice(0, at);
  const rest = phrase.slice(at + mode.length);
  // The lead-in and mode never shrink, only cap at the row's width, so the rest
  // collapses to nothing before the lead-in loses a pixel. Proportional shrink
  // would take a sliver from the lead-in early and show its ellipsis.
  return (
    <span data-slot="plan-mode-phrase" className="flex min-w-0" title={phrase}>
      <span className="flex max-w-full shrink-0">
        {lead ? (
          <span data-slot="plan-mode-lead" className={cn(PHRASE_PART, 'shrink')}>
            {lead}
          </span>
        ) : null}
        <span data-slot="plan-mode-name" className={cn(PHRASE_PART, 'max-w-full shrink-0')}>
          {mode}
        </span>
      </span>
      {rest ? (
        <span data-slot="plan-mode-rest" className={cn(PHRASE_PART, 'shrink')}>
          {rest}
        </span>
      ) : null}
    </span>
  );
}

// `whitespace-pre`, not `truncate`: the lead-in keeps its trailing space.
const PHRASE_PART = 'min-w-0 overflow-hidden text-ellipsis whitespace-pre';

/** Once decided, the plan folds into one row: "Approved in Workspace edits, context cleared". */
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
  const mode = decision ? planModeLabel(decision) : '';
  const [verb, detail, tone, outcome]: [
    string,
    string | undefined,
    'ok' | 'neutral',
    string | undefined,
  ] =
    decision === 'reject'
      ? [t`Changes requested`, note, 'neutral', undefined]
      : decision === 'exit_only'
        ? [
            t`Left Plan mode`,
            cleared ? t`not executed, context cleared` : t`not executed`,
            'ok',
            undefined,
          ]
        : decision
          ? [
              cleared
                ? t`Approved in ${ph({ mode })}, context cleared`
                : t`Approved in ${ph({ mode })}`,
              undefined,
              'ok',
              undefined,
            ]
          : interaction.status === 'cancelled'
            ? [t`Plan review cancelled`, undefined, 'neutral', undefined]
            : interaction.status === 'expired'
              ? [t`Plan review expired`, undefined, 'neutral', undefined]
              : [t`Plan decision recorded`, undefined, 'neutral', undefined];
  return (
    <AskAnsweredRow
      actions={actions}
      className={className}
      data-plan-decision={decision || interaction.status}
      detail={detail}
      icon={NotebookTextIcon}
      label={mode ? <ModePhrase mode={mode} phrase={verb} /> : undefined}
      onOpenChange={onOpenChange}
      open={open}
      outcome={outcome}
      title={detail}
      tone={tone}
      verb={verb}
    />
  );
}
