import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import type { ConflictAnswer, FoundConflict } from './managed-service-target-utils';

/** Explain the existing agent and the consequences of each choice before any change. */
export function RemoteAgentConflict({
  found,
  label,
  onChoice,
}: {
  found: FoundConflict;
  label: string;
  onChoice: (choice: ConflictAnswer) => void;
}) {
  const buttonClass = 'h-auto min-h-8 max-w-full whitespace-normal text-left';
  const stopped = found.health === 'stopped';
  const outdated = Boolean(
    found.owner && found.targetVersion && found.targetVersion !== found.installedVersion,
  );
  return (
    <div
      className="grid min-w-0 gap-3 rounded-xl border bg-card p-4"
      role="alert"
      aria-live="assertive"
    >
      <p className="text-sm">
        {found.health === 'healthy' ? (
          <>
            {vocab.agent} {found.installedVersion} is already running on {label}
            {found.pid ? ` (pid ${found.pid})` : ''}.
          </>
        ) : stopped ? (
          <>
            {vocab.agent} {found.installedVersion} is installed on {label} but not running.
          </>
        ) : (
          <>
            {vocab.agent} on {label} isn&apos;t answering{found.pid ? ` (pid ${found.pid})` : ''}{' '}
            &mdash; Replace it?
          </>
        )}
      </p>
      <p className="text-sm text-muted-foreground">
        Existing agent: {found.installedVersion}. This app: {found.targetVersion || 'not reported'}.
        {stopped
          ? ' Starting it keeps its version and data.'
          : ' Reconnecting keeps the existing process and its lifecycle unchanged.'}
      </p>
      {found.owner ? (
        <p className="break-all text-xs text-muted-foreground">
          Installation: {found.owner}. Port: {found.port ?? 17800}.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {stopped
          ? 'Update installs this app’s version in the same place, then starts it. Starting a new one leaves this installation alone and uses the next port with a separate installation.'
          : 'Update restarts the existing installation at the target version. Replace stops the existing process and installs at the selected location. Starting another leaves it running and uses the next port with a separate installation.'}
      </p>
      <div className="flex min-w-0 flex-wrap gap-2">
        {found.health === 'healthy' || stopped ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('connect')}
            type="button"
            variant={stopped && !outdated ? 'default' : 'outline'}
          >
            {stopped
              ? `Start it and connect (${found.installedVersion})`
              : `Reconnect to the running ${vocab.agent} (${found.installedVersion})`}
          </Button>
        ) : null}
        {outdated ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('update')}
            type="button"
            variant={stopped ? 'default' : 'outline'}
          >
            {stopped ? 'Update and connect' : 'Reconnect and update'}
          </Button>
        ) : null}
        {stopped ? null : (
          <Button className={buttonClass} onClick={() => onChoice('replace')} type="button">
            Stop and replace
          </Button>
        )}
        {found.owner ? (
          <Button
            className={buttonClass}
            onClick={() => onChoice('new')}
            type="button"
            variant="outline"
          >
            {stopped ? 'Start a new one' : 'Leave it running and start another'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
