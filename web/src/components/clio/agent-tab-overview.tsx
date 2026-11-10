import { BotIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { AgentTabSectionLabel } from './agent-tab-run-settings';
import {
  AGENT_USE_LABELS,
  CHANGED_FOR_CONVERSATION,
  type AgentUseKind,
  type AgentUseValue,
} from './agent-tab-values';
import { KeyValueGrid, KeyValueRowButton } from './primitives/key-value-grid';

const USE_ORDER: readonly AgentUseKind[] = ['tools', 'subagents', 'skills', 'instructions'];

/**
 * The Agent tab's one header line: whose agent this is, how a change reads,
 * and, once this conversation differs from its setup, the way back to it.
 */
export function AgentTabHeader({
  title,
  reset,
  actions,
  className,
  titleShown = true,
  legend = true,
}: {
  title: string;
  /** Off when the host (a detail pane) already names the agent. */
  titleShown?: boolean;
  /**
   * The "Changed settings are teal" note. A detail pane shows it only once
   * something changed, so an untouched preview's actions start the line.
   */
  legend?: boolean;
  /** Shown only when something differs from the setup. */
  reset?: { label: string; description: string; disabled: boolean; onReset: () => void };
  /** Further header actions, after the reset. */
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex min-h-9 min-w-0 items-center gap-2 px-3.5 pt-2.5 pb-2 text-[12px] whitespace-nowrap text-muted-foreground',
        className,
      )}
    >
      {titleShown ? (
        <>
          <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <h2 className="min-w-0 truncate font-medium text-foreground" title={title}>
            {title}
          </h2>
        </>
      ) : null}
      {/* Notes fold first: in a narrow tab the title and actions keep the line. */}
      {legend ? (
        <span className="ml-auto min-w-0 truncate text-[11px] text-faint @max-[24rem]/agent-tab:hidden">
          Changed settings are teal
        </span>
      ) : null}
      {reset ? (
        <Button
          aria-description={reset.description}
          className="-my-1 shrink-0"
          disabled={reset.disabled}
          onClick={reset.onReset}
          size="xs"
          title={reset.description}
          variant="ghost"
        >
          <RetryIcon aria-hidden="true" /> {reset.label}
        </Button>
      ) : null}
      {actions}
    </header>
  );
}

/** "What it can use": one row per kind, each opening its own view. */
export function AgentUseRows({
  values,
  onOpen,
}: {
  values: Record<AgentUseKind, AgentUseValue>;
  onOpen: (kind: AgentUseKind) => void;
}) {
  return (
    <section aria-labelledby="agent-what-it-can-use">
      <AgentTabSectionLabel id="agent-what-it-can-use">What it can use</AgentTabSectionLabel>
      <KeyValueGrid
        aria-label="What it can use"
        items={USE_ORDER.map((kind) => {
          const { text, changed } = values[kind];
          const label = AGENT_USE_LABELS[kind];
          return {
            label,
            title: text,
            value: (
              <KeyValueRowButton
                aria-label={`${label}: ${text}${changed ? `, ${CHANGED_FOR_CONVERSATION}` : ''}`}
                changed={changed}
                changedLabel={CHANGED_FOR_CONVERSATION}
                chevron="right"
                data-agent-use={kind}
                onClick={() => onOpen(kind)}
              >
                {text}
              </KeyValueRowButton>
            ),
          };
        })}
        variant="rows"
      />
    </section>
  );
}

/** The closing text action: keep this agent as a setup to start from later. */
export function SaveAsSetupLink({
  label,
  disabled,
  disabledReason,
  onSave,
}: {
  label: string;
  disabled: boolean;
  disabledReason?: string;
  onSave: () => void;
}) {
  return (
    <div className="px-3.5 pt-3.5 pb-3">
      <button
        aria-description={disabled ? disabledReason : undefined}
        aria-disabled={disabled || undefined}
        className={cn(
          'max-w-full truncate rounded-[4px] text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          disabled ? 'cursor-default text-muted-foreground' : 'text-changed hover:underline',
        )}
        onClick={disabled ? undefined : onSave}
        title={disabled ? disabledReason : undefined}
        type="button"
      >
        {label}
      </button>
    </div>
  );
}
