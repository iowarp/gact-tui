import type { MessageBehavior } from '@clio/core/v3';
import { CircleHelpIcon, SlidersHorizontalIcon, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SESSION_APPROVAL_OPTIONS, SESSION_MODE_OPTIONS } from './session-behavior-options';

const REASONING_EFFORTS = ['off', 'low', 'medium', 'high', 'xhigh'] as const;

interface ClioComposerBehaviorControlsProps {
  behavior: MessageBehavior;
  disabled?: boolean;
  modelControl: ReactNode;
  onChange: (behavior: MessageBehavior) => void;
  /**
   * A reasoning effort the service reported that this build has no name for.
   * Named on the control rather than replaced with a recognized value, so the
   * person is never shown an effort nobody selected.
   */
  unrecognizedEffort?: string;
}

/** ReUI Button Group composition for per-message behavior controls. */
export function ClioComposerBehaviorControls({
  behavior,
  disabled,
  modelControl,
  onChange,
  unrecognizedEffort,
}: ClioComposerBehaviorControlsProps) {
  // Once an effort is chosen here the reported value is answered, so the
  // control stops naming it.
  const [effortChosen, setEffortChosen] = useState(false);
  const unknownEffort = effortChosen ? undefined : unrecognizedEffort;
  const selectedMode = SESSION_MODE_OPTIONS.find(
    (option) => toExecutionMode(option.value) === behavior.execution_mode,
  );
  const selectedApproval = SESSION_APPROVAL_OPTIONS.find(
    (option) => option.value === behavior.confirmation_policy,
  );
  const effortLabel = unknownEffort
    ? unknownLabel(unknownEffort)
    : reasoningEffortLabel(behavior.reasoning_effort);
  const modeLabel = selectedMode?.label ?? unknownLabel(behavior.execution_mode);
  const approvalLabel = selectedApproval?.label ?? unknownLabel(behavior.confirmation_policy);
  const ModeIcon: LucideIcon = selectedMode?.icon ?? CircleHelpIcon;
  const ApprovalIcon: LucideIcon = selectedApproval?.icon ?? CircleHelpIcon;

  return (
    <ButtonGroup
      aria-label="Message behavior"
      className="h-7 max-w-full [&>[data-slot=button]]:h-7"
    >
      {modelControl}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Reasoning effort: ${effortLabel}`}
            className="gap-1.5 px-2"
            disabled={disabled}
            size="sm"
            title={`Reasoning effort: ${effortLabel}`}
            type="button"
            variant="outline"
          >
            <SlidersHorizontalIcon />
            <span className={unknownEffort ? 'hidden lg:inline' : 'hidden capitalize lg:inline'}>
              {effortLabel}
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
          {unknownEffort ? (
            <p className="px-2 pb-1.5 text-xs text-muted-foreground">
              The service reported “{unknownEffort}”, which this build has no setting for. Choose
              one to send with this message.
            </p>
          ) : null}
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const effort = REASONING_EFFORTS.find((candidate) => candidate === value);
              if (!effort) return;
              setEffortChosen(true);
              onChange({ ...behavior, reasoning_effort: effort });
            }}
            value={unknownEffort ? '' : behavior.reasoning_effort}
          >
            {REASONING_EFFORTS.map((value) => (
              <DropdownMenuRadioItem className="capitalize" key={value} value={value}>
                {reasoningEffortLabel(value)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Execution mode: ${modeLabel}`}
            className="gap-1.5 px-2"
            disabled={disabled}
            size="sm"
            title={`Execution mode: ${modeLabel}`}
            type="button"
            variant="outline"
          >
            <ModeIcon />
            <span className="hidden lg:inline">{modeLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Execution mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const option = SESSION_MODE_OPTIONS.find((candidate) => candidate.value === value);
              if (option) onChange({ ...behavior, execution_mode: toExecutionMode(option.value) });
            }}
            value={selectedMode?.value ?? ''}
          >
            {SESSION_MODE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <option.icon className="size-4" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Confirmation policy: ${approvalLabel}`}
            className="gap-1.5 px-2"
            disabled={disabled}
            size="sm"
            title={`Confirmation policy: ${approvalLabel}`}
            type="button"
            variant="outline"
          >
            <ApprovalIcon />
            <span className="hidden lg:inline">{approvalLabel}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Confirmation policy</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) => {
              const option = SESSION_APPROVAL_OPTIONS.find(
                (candidate) => candidate.value === value,
              );
              if (option) onChange({ ...behavior, confirmation_policy: option.value });
            }}
            value={selectedApproval?.value ?? ''}
          >
            {SESSION_APPROVAL_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <option.icon className="size-4" />
                <span>
                  <span className="block font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  );
}

/** Name a value the message contract does not define, rather than replacing it. */
function unknownLabel(value: string): string {
  return `Unknown (${value})`;
}

function reasoningEffortLabel(value: MessageBehavior['reasoning_effort']): string {
  return value === 'xhigh' ? 'Extra high' : value;
}

function toExecutionMode(
  value: (typeof SESSION_MODE_OPTIONS)[number]['value'],
): MessageBehavior['execution_mode'] {
  if (value === 'plan') return 'plan';
  if (value === 'architect') return 'deep_research';
  return 'execute';
}
