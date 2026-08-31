import type { MessageBehavior } from '@clio/core/v3';
import { SlidersHorizontalIcon } from 'lucide-react';
import type { ReactNode } from 'react';
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

interface ClioComposerBehaviorControlsProps {
  behavior: MessageBehavior;
  disabled?: boolean;
  modelControl: ReactNode;
  onChange: (behavior: MessageBehavior) => void;
}

/** ReUI Button Group composition for per-message behavior controls. */
export function ClioComposerBehaviorControls({
  behavior,
  disabled,
  modelControl,
  onChange,
}: ClioComposerBehaviorControlsProps) {
  const selectedMode =
    SESSION_MODE_OPTIONS.find(
      (option) => toExecutionMode(option.value) === behavior.execution_mode,
    ) ?? SESSION_MODE_OPTIONS[0];
  const selectedApproval =
    SESSION_APPROVAL_OPTIONS.find((option) => option.value === behavior.confirmation_policy) ??
    SESSION_APPROVAL_OPTIONS[0];
  const ModeIcon = selectedMode.icon;
  const ApprovalIcon = selectedApproval.icon;

  return (
    <ButtonGroup
      aria-label="Message behavior"
      className="h-7 max-w-full [&>[data-slot=button]]:h-7"
    >
      {modelControl}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Reasoning effort: ${behavior.reasoning_effort}`}
            disabled={disabled}
            size="icon-sm"
            title={`Reasoning effort: ${behavior.reasoning_effort}`}
            type="button"
            variant="outline"
          >
            <SlidersHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Reasoning effort</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(reasoning_effort) =>
              onChange({
                ...behavior,
                reasoning_effort: reasoning_effort as MessageBehavior['reasoning_effort'],
              })
            }
            value={behavior.reasoning_effort}
          >
            {['off', 'low', 'medium', 'high', 'xhigh'].map((value) => (
              <DropdownMenuRadioItem className="capitalize" key={value} value={value}>
                {value === 'xhigh' ? 'Extra high' : value}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label={`Execution mode: ${selectedMode.label}`}
            disabled={disabled}
            size="icon-sm"
            title={`Execution mode: ${selectedMode.label}`}
            type="button"
            variant="outline"
          >
            <ModeIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Execution mode</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(value) =>
              onChange({
                ...behavior,
                execution_mode: toExecutionMode(value),
              })
            }
            value={fromExecutionMode(behavior.execution_mode)}
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
            aria-label={`Confirmation policy: ${selectedApproval.label}`}
            disabled={disabled}
            size="icon-sm"
            title={`Confirmation policy: ${selectedApproval.label}`}
            type="button"
            variant="outline"
          >
            <ApprovalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <DropdownMenuLabel>Confirmation policy</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            onValueChange={(confirmation_policy) =>
              onChange({
                ...behavior,
                confirmation_policy: confirmation_policy as MessageBehavior['confirmation_policy'],
              })
            }
            value={behavior.confirmation_policy}
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

function toExecutionMode(value: string): MessageBehavior['execution_mode'] {
  if (value === 'plan') return 'plan';
  if (value === 'architect') return 'deep_research';
  return 'execute';
}

function fromExecutionMode(value: MessageBehavior['execution_mode']): string {
  if (value === 'plan') return 'plan';
  if (value === 'deep_research') return 'architect';
  return 'edit';
}
