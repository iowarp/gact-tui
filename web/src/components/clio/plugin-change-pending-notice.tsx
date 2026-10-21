import type { PromptBasis } from '@clio/core/v3';
import { SyringeIcon } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/**
 * A plugin change applied as an injection: the agent was told, but its system
 * prompt still carries the plugins it had before. The next compaction joins
 * the change to the prompt; Compact now runs that compaction.
 */
export function PluginChangePendingNotice({
  basis,
  compacting,
  onCompact,
}: {
  basis: PromptBasis;
  compacting: boolean;
  /** Absent when the conversation cannot be changed from here (a defined subagent). */
  onCompact?: () => void;
}) {
  return (
    <Alert aria-label="Plugin changes waiting for compaction" role="region">
      <SyringeIcon aria-hidden="true" />
      <AlertTitle>Sent to the agent as an injection</AlertTitle>
      <AlertDescription className="grid gap-1.5">
        <p className="mb-0!">
          These changes were sent as an injection. They join the system prompt at the next
          compaction.
        </p>
        <dl className="grid gap-0.5 text-xs">
          {basis.added.length ? (
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-medium text-foreground">Added</dt>
              <dd>{basis.added.join(', ')}</dd>
            </div>
          ) : null}
          {basis.removed.length ? (
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-medium text-foreground">Removed</dt>
              <dd>{basis.removed.join(', ')}</dd>
            </div>
          ) : null}
        </dl>
        {onCompact ? (
          <div>
            <Button disabled={compacting} onClick={onCompact} size="xs" variant="outline">
              {compacting ? 'Compacting…' : 'Compact now'}
            </Button>
          </div>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
