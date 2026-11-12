import type { MessageBehavior, ReasoningEffort, SpotterAvailability } from '@clio/core/v3';
import type { LucideIcon } from 'lucide-react';
import { Fragment, useRef, useState, type ReactNode } from 'react';
import { HelpIcon } from '@/lib/icon-vocabulary';
import { REASONING_EFFORT_LABELS } from '@/lib/reasoning-levels';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { approvalOptionViews } from './approval-option-availability';
import { IconButton } from './primitives/icon-button';
import { MenuRow } from './primitives/menu-row';
import { SESSION_APPROVAL_OPTIONS, SESSION_MODE_OPTIONS } from './session-behavior-options';

type BehaviorMenu = 'approval' | 'effort' | 'mode';

const DEFAULT_EFFORT = 'model-default';

/** How many of the three reasoning bars a level fills. */
const EFFORT_BARS: Record<ReasoningEffort, number> = {
  off: 0,
  minimal: 1,
  low: 1,
  medium: 2,
  high: 3,
  xhigh: 3,
  max: 3,
  ultra: 3,
};

const MENU_LABEL = 'px-2 pt-1.5 pb-1 text-caption font-normal text-muted-foreground';
/** One 30px line per row: 12.5px name, 11.5px muted description, 13px accent check. */
const MENU_ITEM =
  'min-h-[30px] py-0 text-menu [&_[data-slot=dropdown-menu-radio-item-indicator]_svg]:size-[13px]! [&_[data-slot=dropdown-menu-radio-item-indicator]_svg]:text-accent-foreground! [&_[data-slot=menu-row]_span[title]]:text-label';

interface ClioComposerBehaviorControlsProps {
  behavior: MessageBehavior;
  disabled?: boolean;
  /** The model choice, placed on the right of the row before Send. */
  modelControl: ReactNode;
  /** Optional compact session evidence, placed just before the model. */
  beforeModel?: ReactNode;
  onChange: (behavior: MessageBehavior) => void;
  /**
   * Move focus back to the composer's editor. Used after a choice, and when a
   * menu opened from the keyboard shortcut is dismissed, so typing resumes.
   */
  onReturnFocus?: () => void;
  /**
   * The thinking levels the selected model offers (from the provider catalog).
   * Empty hides the control: there is nothing a person could choose.
   */
  reasoningLevels: readonly ReasoningEffort[];
  /**
   * The model's thinking levels are not known yet (connecting, or the catalog
   * is loading). The effort control holds its place, disabled, so the row does
   * not shift when they arrive.
   */
  reasoningPending?: boolean;
  /** What the control shows when no level was picked (it sends nothing then). */
  defaultEffortLabel?: string;
  /**
   * A reasoning effort the service reported that this build has no name for.
   * Named on the control rather than replaced with a recognized value, so the
   * person is never shown an effort nobody selected.
   */
  unrecognizedEffort?: string;
  /** What the service reports about arming SPOTTER review here (undefined: unknown). */
  spotterAvailability?: SpotterAvailability;
  /**
   * The SPOTTER model choice. Shown only while SPOTTER review is the policy and
   * the service reports it can be armed here.
   */
  spotterModelControl?: ReactNode;
}

/**
 * The composer row's behavior controls: confirmation policy and reasoning as bare
 * icons on the left, then the model and the mode, as words, on the right. One menu opens at a
 * time. Rendered as a fragment so every control sits directly in the composer's
 * single toolbar row.
 */
export function ClioComposerBehaviorControls({
  behavior,
  disabled,
  modelControl,
  beforeModel,
  onChange,
  onReturnFocus,
  reasoningLevels,
  reasoningPending = false,
  defaultEffortLabel = 'Model default',
  unrecognizedEffort,
  spotterAvailability,
  spotterModelControl,
}: ClioComposerBehaviorControlsProps) {
  const approvalOptions = approvalOptionViews(SESSION_APPROVAL_OPTIONS, spotterAvailability);
  // Once an effort is chosen here the reported value is answered, so the
  // control stops naming it.
  const [effortChosen, setEffortChosen] = useState(false);
  const [openMenu, setOpenMenu] = useState<BehaviorMenu>();
  const [confirmBypass, setConfirmBypass] = useState(false);
  // Whether the closing menu hands focus to the editor rather than its trigger:
  // after a choice or Escape, or when the menu was opened by the shortcut from the editor.
  const toEditor = useRef(false);
  const setMenuOpen = (menu: BehaviorMenu, open: boolean) => {
    if (open) toEditor.current = false;
    setOpenMenu((current) => (open ? menu : current === menu ? undefined : current));
  };
  const chose = () => {
    toEditor.current = true;
  };
  const closeFocus = (event: Event) => {
    if (!toEditor.current || !onReturnFocus) return;
    event.preventDefault();
    toEditor.current = false;
    onReturnFocus();
  };
  const unknownEffort = effortChosen ? undefined : unrecognizedEffort;
  const selectedMode = SESSION_MODE_OPTIONS.find(
    (option) => toExecutionMode(option.value) === behavior.execution_mode,
  );
  const selectedApproval = SESSION_APPROVAL_OPTIONS.find(
    (option) => option.value === behavior.confirmation_policy,
  );
  const effortLabel = unknownEffort
    ? unknownLabel(unknownEffort)
    : behavior.reasoning_effort
      ? REASONING_EFFORT_LABELS[behavior.reasoning_effort]
      : defaultEffortLabel;
  const modeLabel = selectedMode?.label ?? unknownLabel(behavior.execution_mode);
  const approvalLabel = selectedApproval?.label ?? unknownLabel(behavior.confirmation_policy);
  const ModeIcon: LucideIcon = selectedMode?.icon ?? HelpIcon;
  const ApprovalIcon: LucideIcon = selectedApproval?.icon ?? HelpIcon;

  // Ctrl/⌘ Shift M opens the mode menu, and each further press moves to the next mode.
  useShortcut(
    'mode',
    () => {
      if (openMenu !== 'mode') {
        toEditor.current = true;
        setOpenMenu('mode');
        return;
      }
      const index = SESSION_MODE_OPTIONS.findIndex(
        (option) => option.value === selectedMode?.value,
      );
      const next = SESSION_MODE_OPTIONS[(index + 1) % SESSION_MODE_OPTIONS.length]!;
      onChange({ ...behavior, execution_mode: toExecutionMode(next.value) });
    },
    { enabled: !disabled },
  );

  return (
    <>
      <DropdownMenu
        onOpenChange={(open) => setMenuOpen('approval', open)}
        open={openMenu === 'approval'}
      >
        <DropdownMenuTrigger asChild>
          <IconButton
            className={cn(
              'aria-expanded:bg-hover',
              behavior.confirmation_policy === 'bypass'
                ? 'text-destructive hover:text-destructive'
                : selectedApproval && selectedApproval.value !== 'ask'
                  ? 'text-accent-foreground hover:text-accent-foreground'
                  : undefined,
            )}
            data-tour="confirmation-policy"
            disabled={disabled}
            icon={<ApprovalIcon />}
            label={`Confirmation policy: ${approvalLabel}`}
            size="toolbar"
            tooltipSide="top"
            type="button"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[24rem] max-w-[calc(100vw-1rem)]"
          collisionPadding={8}
          onCloseAutoFocus={closeFocus}
          onEscapeKeyDown={chose}
          side="top"
        >
          <DropdownMenuLabel className={MENU_LABEL}>Confirmation policy</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const option = approvalOptions.find((candidate) => candidate.value === value);
              if (!option || option.disabled) return;
              if (option.value === 'bypass') {
                setConfirmBypass(true);
                return;
              }
              chose();
              onChange({ ...behavior, confirmation_policy: option.value });
            }}
            value={selectedApproval?.value ?? ''}
          >
            {approvalOptions.map((option) => {
              const bypass = option.value === 'bypass';
              const Icon = option.icon;
              return (
                <Fragment key={option.value}>
                  {bypass ? <DropdownMenuSeparator /> : null}
                  <DropdownMenuRadioItem
                    className={cn(
                      MENU_ITEM,
                      bypass && 'focus:bg-destructive/10 dark:focus:bg-destructive/20',
                    )}
                    disabled={option.disabled}
                    title={option.unavailableDetail || undefined}
                    value={option.value}
                  >
                    <MenuRow
                      description={option.description}
                      icon={<Icon className={bypass ? 'text-destructive' : undefined} />}
                      label={bypass ? `${option.label}…` : option.label}
                    />
                  </DropdownMenuRadioItem>
                </Fragment>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {reasoningLevels.length ? (
        <DropdownMenu
          onOpenChange={(open) => setMenuOpen('effort', open)}
          open={openMenu === 'effort'}
        >
          <DropdownMenuTrigger asChild>
            <IconButton
              className="aria-expanded:bg-hover"
              data-tour="reasoning-effort"
              disabled={disabled}
              icon={
                <ReasoningBars
                  filled={
                    unknownEffort || !behavior.reasoning_effort
                      ? 0
                      : EFFORT_BARS[behavior.reasoning_effort]
                  }
                />
              }
              label={`Reasoning effort: ${effortLabel}`}
              size="toolbar"
              tooltipSide="top"
              type="button"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            collisionPadding={8}
            onCloseAutoFocus={closeFocus}
            onEscapeKeyDown={chose}
            side="top"
          >
            <DropdownMenuLabel className={MENU_LABEL}>Reasoning effort</DropdownMenuLabel>
            {unknownEffort ? (
              <p className="px-2 pb-1.5 text-xs text-muted-foreground">
                The service reported “{unknownEffort}”, which this build has no setting for. Choose
                one to send with this message.
              </p>
            ) : null}
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                chose();
                if (value === DEFAULT_EFFORT) {
                  setEffortChosen(true);
                  onChange({ ...behavior, reasoning_effort: undefined });
                  return;
                }
                const effort = reasoningLevels.find((candidate) => candidate === value);
                if (!effort) return;
                setEffortChosen(true);
                onChange({ ...behavior, reasoning_effort: effort });
              }}
              value={unknownEffort ? '' : (behavior.reasoning_effort ?? DEFAULT_EFFORT)}
            >
              <DropdownMenuRadioItem className={MENU_ITEM} value={DEFAULT_EFFORT}>
                <MenuRow icon={<ReasoningBars filled={0} />} label={defaultEffortLabel} />
              </DropdownMenuRadioItem>
              {reasoningLevels.map((value) => (
                <DropdownMenuRadioItem className={MENU_ITEM} key={value} value={value}>
                  <MenuRow
                    icon={<ReasoningBars filled={EFFORT_BARS[value]} />}
                    label={REASONING_EFFORT_LABELS[value]}
                  />
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : reasoningPending ? (
        <IconButton
          disabled
          icon={<ReasoningBars filled={0} />}
          label="Reasoning effort"
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
      {spotterModelControl &&
      behavior.confirmation_policy === 'spotter-ai' &&
      spotterAvailability?.available
        ? spotterModelControl
        : null}
      {/* A narrow row has no slack to right-align into: the model stays put after
          the reasoning control while a wait status appears or the route name loads. */}
      <span aria-hidden="true" className="min-w-0 flex-1 @max-[440px]/composer:hidden" />
      {beforeModel}
      {modelControl}
      {/* The mode is a word beside the model (spec v10); a fifth-width row keeps its icon. */}
      <DropdownMenu onOpenChange={(open) => setMenuOpen('mode', open)} open={openMenu === 'mode'}>
        <DropdownMenuTrigger asChild>
          <IconButton
            className={cn(
              'h-[26px] w-auto shrink-0 gap-1.5 px-1.5 text-meta font-normal aria-expanded:bg-hover @max-[300px]/composer:w-[26px] @max-[300px]/composer:px-0 [&_svg:not([class*=size-])]:size-3.5',
              selectedMode &&
                selectedMode.value !== 'edit' &&
                'text-accent-foreground hover:text-accent-foreground',
            )}
            data-slot="composer-mode"
            disabled={disabled}
            icon={
              <>
                <ModeIcon />
                <span className="@max-[300px]/composer:hidden" data-slot="composer-mode-label">
                  {modeLabel}
                </span>
              </>
            }
            label={`Mode: ${modeLabel}`}
            shortcut="mode"
            shortcutSide="above-icon"
            size="toolbar"
            tooltipSide="top"
            type="button"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-[21rem]"
          collisionPadding={8}
          onCloseAutoFocus={closeFocus}
          onEscapeKeyDown={chose}
          side="top"
        >
          <DropdownMenuLabel className={MENU_LABEL}>Mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const option = SESSION_MODE_OPTIONS.find((candidate) => candidate.value === value);
              chose();
              if (option) onChange({ ...behavior, execution_mode: toExecutionMode(option.value) });
            }}
            value={selectedMode?.value ?? ''}
          >
            {SESSION_MODE_OPTIONS.map((option) => {
              const Icon = option.icon;
              return (
                <DropdownMenuRadioItem
                  className={MENU_ITEM}
                  key={option.value}
                  value={option.value}
                >
                  <MenuRow description={option.description} icon={<Icon />} label={option.label} />
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog onOpenChange={setConfirmBypass} open={confirmBypass}>
        <AlertDialogContent
          onCloseAutoFocus={(event) => {
            // Confirming is a choice: typing resumes in the editor. Keeping asking
            // returns to the policy control.
            if (!toEditor.current || !onReturnFocus) return;
            closeFocus(event);
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Bypass protected-action checks?</AlertDialogTitle>
            <AlertDialogDescription>
              The agent may perform supported actions without asking first. Workspace boundaries and
              unavailable capabilities still apply, but individual changes will not wait for review.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep asking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                chose();
                onChange({ ...behavior, confirmation_policy: 'bypass' });
              }}
              variant="destructive"
            >
              Bypass checks
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Three rising bars filled up to the reasoning level; the model's default
 * draws the outlines only.
 */
export function ReasoningBars({ filled }: { filled: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[11px] shrink-0 items-end gap-[2px]"
      data-filled={filled}
      data-slot="reasoning-bars"
    >
      {[5, 8, 11].map((height, index) => (
        <span
          className={cn(
            'w-[3px] rounded-[1px] border border-current',
            index < filled && 'bg-current',
          )}
          key={height}
          style={{ height }}
        />
      ))}
    </span>
  );
}

/** Name a value the message contract does not define, rather than replacing it. */
function unknownLabel(value: string): string {
  return `Unknown (${value})`;
}

function toExecutionMode(
  value: (typeof SESSION_MODE_OPTIONS)[number]['value'],
): MessageBehavior['execution_mode'] {
  if (value === 'plan') return 'plan';
  if (value === 'architect') return 'deep_research';
  return 'execute';
}
